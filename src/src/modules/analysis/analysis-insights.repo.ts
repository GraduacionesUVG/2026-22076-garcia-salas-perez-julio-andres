import { withDependencyResult } from "@/src/modules/security/dependency-errors";
import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import { singleTagArrayLiteral } from "./analysis-tags";
import type {
  InsightCreateInput,
  InsightLinkCreateInput,
  InsightListQuery,
  InsightUpdateInput,
} from "./analysis-insights.schema";

export type ProjectInsightRow = {
  id: string;
  project_id: string;
  title: string;
  summary: string;
  interpretation: string;
  insight_type: string;
  confidence: string;
  status: string;
  tags: string[];
  metadata: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

export type ProjectInsightLinkRow = {
  id: string;
  project_id: string;
  insight_id: string;
  link_type: string;
  document_id: string | null;
  segment_id: string | null;
  code_id: string | null;
  memo_id: string | null;
  participant_id: string | null;
  created_at: string;
  created_by: string | null;
  target_label?: string | null;
};

const LINK_CONTEXT = [
  { type: "document", field: "document_id", table: "project_documents", fields: ["title"] },
  { type: "segment", field: "segment_id", table: "project_document_segments", fields: ["selected_text"] },
  { type: "code", field: "code_id", table: "project_codes", fields: ["name"] },
  { type: "memo", field: "memo_id", table: "project_memos", fields: ["title"] },
  { type: "participant", field: "participant_id", table: "project_participants", fields: ["display_name", "alias"] },
] as const;

const INSIGHT_SELECT = `
  id,
  project_id,
  title,
  summary,
  interpretation,
  insight_type,
  confidence,
  status,
  tags,
  metadata,
  revision,
  created_at,
  updated_at,
  deleted_at,
  created_by,
  updated_by
`;

const INSIGHT_LINK_SELECT = `
  id,
  project_id,
  insight_id,
  link_type,
  document_id,
  segment_id,
  code_id,
  memo_id,
  participant_id,
  created_at,
  created_by
`;

function getCreatePayload(params: {
  projectId: string;
  input: InsightCreateInput;
  actorUserId: string;
}) {
  const { projectId, input, actorUserId } = params;

  return {
    project_id: projectId,
    title: input.title,
    summary: input.summary ?? "",
    interpretation: input.interpretation ?? "",
    insight_type: input.insight_type ?? "pattern",
    confidence: input.confidence ?? "medium",
    status: input.status ?? "draft",
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    created_by: actorUserId,
    updated_by: actorUserId,
  };
}

function getUpdatePatch(input: InsightUpdateInput) {
  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.summary !== undefined) patch.summary = input.summary;
  if (input.interpretation !== undefined) patch.interpretation = input.interpretation;
  if (input.insight_type !== undefined) patch.insight_type = input.insight_type;
  if (input.confidence !== undefined) patch.confidence = input.confidence;
  if (input.status !== undefined) patch.status = input.status;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  return patch;
}

function getLinkPayload(params: {
  projectId: string;
  insightId: string;
  input: InsightLinkCreateInput;
  actorUserId: string;
}) {
  const { projectId, insightId, input, actorUserId } = params;

  return {
    project_id: projectId,
    insight_id: insightId,
    link_type: input.link_type,
    document_id: input.document_id ?? null,
    segment_id: input.segment_id ?? null,
    code_id: input.code_id ?? null,
    memo_id: input.memo_id ?? null,
    participant_id: input.participant_id ?? null,
    created_by: actorUserId,
  };
}

export class AnalysisInsightsRepo {
  constructor(private readonly db: ServerSupabase) {}

  private async withTargetLabels(projectId: string, links: ProjectInsightLinkRow[]) {
    const labels = new Map<string, string>();
    // One bounded read per resource type and 100 unique IDs, never one per link.
    await Promise.all(LINK_CONTEXT.map(async context => {
      const ids = [...new Set(links.filter(link => link.link_type === context.type).map(link => link[context.field]).filter((id): id is string => typeof id === "string" && Boolean(id)))];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error } = await withDependencyResult(() => this.db
          .from(context.table)
          .select(["id", ...context.fields].join(","))
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .in("id", ids.slice(offset, offset + 100))
          .returns<Record<string, unknown>[]>());
        if (error) throw error;
        for (const row of data ?? []) {
          const label = context.fields.map(field => row[field]).find(value => typeof value === "string" && value.trim());
          if (typeof row.id === "string" && typeof label === "string") {
            labels.set(`${context.type}:${row.id}`, context.type === "segment" ? label.trim().slice(0, 240) : label.trim());
          }
        }
      }
    }));
    return links.map(link => {
      const context = LINK_CONTEXT.find(item => item.type === link.link_type);
      return { ...link, target_label: context ? labels.get(`${context.type}:${link[context.field]}`) ?? null : null };
    });
  }

  async listByProject(
    projectId: string,
    query: InsightListQuery
  ): Promise<ProjectInsightRow[]> {
    let request = this.db
      .from("project_insights")
      .select(INSIGHT_SELECT)
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false });

    if (!query.include_deleted) {
      request = request.is("deleted_at", null);
    }

    if (query.search) {
      request = request.or(
        `title.ilike.%${query.search}%,summary.ilike.%${query.search}%,interpretation.ilike.%${query.search}%`
      );
    }

    if (query.insight_type) {
      request = request.eq("insight_type", query.insight_type);
    }

    if (query.status) {
      request = request.eq("status", query.status);
    }

    if (query.confidence) {
      request = request.eq("confidence", query.confidence);
    }

    if (query.tag !== undefined) {
      request = request.contains("tags", singleTagArrayLiteral(query.tag));
    }

    request = request.range(query.offset, query.offset + query.limit - 1);

    const { data, error } = await withDependencyResult(() => request);

    if (error) throw error;

    return (data as ProjectInsightRow[] | null) ?? [];
  }

  async getById(params: {
    projectId: string;
    insightId: string;
    includeDeleted?: boolean;
  }): Promise<ProjectInsightRow | null> {
    const { projectId, insightId, includeDeleted = false } = params;

    let request = this.db
      .from("project_insights")
      .select(INSIGHT_SELECT)
      .eq("project_id", projectId)
      .eq("id", insightId);

    if (!includeDeleted) {
      request = request.is("deleted_at", null);
    }

    const { data, error } = await withDependencyResult(() => request.maybeSingle());

    if (error) throw error;

    return (data as ProjectInsightRow | null) ?? null;
  }

  async create(params: {
    projectId: string;
    input: InsightCreateInput;
    actorUserId: string;
  }): Promise<ProjectInsightRow> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_insights")
      .insert(getCreatePayload(params))
      .select(INSIGHT_SELECT)
      .single());

    if (error) throw error;

    return data as ProjectInsightRow;
  }

  async update(params: {
    projectId: string;
    insightId: string;
    input: InsightUpdateInput;
    actorUserId: string;
  }): Promise<ProjectInsightRow | null> {
    const { projectId, insightId, input, actorUserId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_insights")
      .update({
        ...getUpdatePatch(input),
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", insightId)
      .eq("revision", input.base_revision)
      .is("deleted_at", null)
      .select(INSIGHT_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectInsightRow | null) ?? null;
  }

  async softDelete(params: {
    projectId: string;
    insightId: string;
    actorUserId: string;
  }): Promise<ProjectInsightRow | null> {
    const { projectId, insightId, actorUserId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_insights")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", insightId)
      .is("deleted_at", null)
      .select(INSIGHT_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectInsightRow | null) ?? null;
  }

  async listLinks(params: {
    projectId: string;
    insightId: string;
  }): Promise<ProjectInsightLinkRow[]> {
    const { projectId, insightId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_insight_links")
      .select(INSIGHT_LINK_SELECT)
      .eq("project_id", projectId)
      .eq("insight_id", insightId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }));

    if (error) throw error;

    return this.withTargetLabels(projectId, (data as ProjectInsightLinkRow[] | null) ?? []);
  }

  async listLinksByProject(projectId: string): Promise<ProjectInsightLinkRow[]> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_insight_links")
      .select(INSIGHT_LINK_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }));

    if (error) throw error;

    return this.withTargetLabels(projectId, (data as ProjectInsightLinkRow[] | null) ?? []);
  }

  async createLink(params: {
    projectId: string;
    insightId: string;
    input: InsightLinkCreateInput;
    actorUserId: string;
  }): Promise<ProjectInsightLinkRow> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_insight_links")
      .insert(getLinkPayload(params))
      .select(INSIGHT_LINK_SELECT)
      .single());

    if (error) throw error;

    return data as ProjectInsightLinkRow;
  }

  async getLinkById(params: {
    projectId: string;
    insightId: string;
    linkId: string;
  }): Promise<ProjectInsightLinkRow | null> {
    const { projectId, insightId, linkId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_insight_links")
      .select(INSIGHT_LINK_SELECT)
      .eq("project_id", projectId)
      .eq("insight_id", insightId)
      .eq("id", linkId)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectInsightLinkRow | null) ?? null;
  }

  async deleteLink(params: {
    projectId: string;
    insightId: string;
    linkId: string;
  }): Promise<ProjectInsightLinkRow | null> {
    const { projectId, insightId, linkId } = params;

    const current = await this.getLinkById(params);

    if (!current) {
      return null;
    }

    const { error } = await withDependencyResult(() => this.db
      .from("project_insight_links")
      .delete()
      .eq("project_id", projectId)
      .eq("insight_id", insightId)
      .eq("id", linkId));

    if (error) throw error;

    return current;
  }

  async targetExists(params: {
    projectId: string;
    linkType: InsightLinkCreateInput["link_type"];
    targetId: string;
  }): Promise<boolean> {
    const { projectId, linkType, targetId } = params;

    const tableByType = {
      document: "project_documents",
      segment: "project_document_segments",
      code: "project_codes",
      memo: "project_memos",
      participant: "project_participants",
    } as const;

    const { data, error } = await withDependencyResult(() => this.db
      .from(tableByType[linkType])
      .select("id")
      .eq("project_id", projectId)
      .eq("id", targetId)
      .is("deleted_at", null)
      .maybeSingle());

    if (error) throw error;

    return Boolean(data);
  }

  async createEvent(params: {
    projectId: string;
    insightId?: string | null;
    entityType: "insight" | "insight_link";
    eventType:
      | "insight_created"
      | "insight_updated"
      | "insight_soft_deleted"
      | "insight_link_created"
      | "insight_link_deleted";
    actorUserId: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const {
      projectId,
      insightId = null,
      entityType,
      eventType,
      actorUserId,
      payload = {},
    } = params;

    const { error } = await withDependencyResult(() => this.db.from("project_analysis_events").insert({
      project_id: projectId,
      entity_type: entityType,
      entity_id: insightId,
      event_type: eventType,
      event_payload: payload,
      created_by: actorUserId,
    }));

    if (error) throw error;
  }
}
