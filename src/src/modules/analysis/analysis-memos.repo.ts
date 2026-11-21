import { withDependencyResult } from "@/src/modules/security/dependency-errors";
import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import { singleTagArrayLiteral } from "./analysis-tags";
import type {
  MemoCreateInput,
  MemoLinkCreateInput,
  MemoListQuery,
  MemoUpdateInput,
} from "./analysis-memos.schema";

export type ProjectMemoRow = {
  id: string;
  project_id: string;
  title: string;
  body: string;
  memo_type: string;
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

export type ProjectMemoLinkRow = {
  id: string;
  project_id: string;
  memo_id: string;
  link_type: string;
  document_id: string | null;
  segment_id: string | null;
  code_id: string | null;
  participant_id: string | null;
  created_at: string;
  created_by: string | null;
};

const MEMO_SELECT = `
  id,
  project_id,
  title,
  body,
  memo_type,
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

const MEMO_LINK_SELECT = `
  id,
  project_id,
  memo_id,
  link_type,
  document_id,
  segment_id,
  code_id,
  participant_id,
  created_at,
  created_by
`;

function getCreatePayload(params: {
  projectId: string;
  input: MemoCreateInput;
  actorUserId: string;
}) {
  const { projectId, input, actorUserId } = params;

  return {
    project_id: projectId,
    title: input.title,
    body: input.body ?? "",
    memo_type: input.memo_type ?? "analytic",
    status: input.status ?? "draft",
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    created_by: actorUserId,
    updated_by: actorUserId,
  };
}

function getUpdatePatch(input: MemoUpdateInput) {
  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.body !== undefined) patch.body = input.body;
  if (input.memo_type !== undefined) patch.memo_type = input.memo_type;
  if (input.status !== undefined) patch.status = input.status;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  return patch;
}

function getLinkPayload(params: {
  projectId: string;
  memoId: string;
  input: MemoLinkCreateInput;
  actorUserId: string;
}) {
  const { projectId, memoId, input, actorUserId } = params;

  return {
    project_id: projectId,
    memo_id: memoId,
    link_type: input.link_type,
    document_id: input.document_id ?? null,
    segment_id: input.segment_id ?? null,
    code_id: input.code_id ?? null,
    participant_id: input.participant_id ?? null,
    created_by: actorUserId,
  };
}

export class AnalysisMemosRepo {
  constructor(private readonly db: ServerSupabase) {}

  async listByProject(
    projectId: string,
    query: MemoListQuery
  ): Promise<ProjectMemoRow[]> {
    let request = this.db
      .from("project_memos")
      .select(MEMO_SELECT)
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false });

    if (!query.include_deleted) {
      request = request.is("deleted_at", null);
    }

    if (query.search) {
      request = request.or(`title.ilike.%${query.search}%,body.ilike.%${query.search}%`);
    }

    if (query.memo_type) {
      request = request.eq("memo_type", query.memo_type);
    }

    if (query.status) {
      request = request.eq("status", query.status);
    }

    if (query.tag !== undefined) {
      request = request.contains("tags", singleTagArrayLiteral(query.tag));
    }

    request = request.range(query.offset, query.offset + query.limit - 1);

    const { data, error } = await withDependencyResult(() => request);

    if (error) throw error;

    return (data as ProjectMemoRow[] | null) ?? [];
  }

  async getById(params: {
    projectId: string;
    memoId: string;
    includeDeleted?: boolean;
  }): Promise<ProjectMemoRow | null> {
    const { projectId, memoId, includeDeleted = false } = params;

    let request = this.db
      .from("project_memos")
      .select(MEMO_SELECT)
      .eq("project_id", projectId)
      .eq("id", memoId);

    if (!includeDeleted) {
      request = request.is("deleted_at", null);
    }

    const { data, error } = await withDependencyResult(() => request.maybeSingle());

    if (error) throw error;

    return (data as ProjectMemoRow | null) ?? null;
  }

  async create(params: {
    projectId: string;
    input: MemoCreateInput;
    actorUserId: string;
  }): Promise<ProjectMemoRow> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_memos")
      .insert(getCreatePayload(params))
      .select(MEMO_SELECT)
      .single());

    if (error) throw error;

    return data as ProjectMemoRow;
  }

  async update(params: {
    projectId: string;
    memoId: string;
    input: MemoUpdateInput;
    actorUserId: string;
  }): Promise<ProjectMemoRow | null> {
    const { projectId, memoId, input, actorUserId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_memos")
      .update({
        ...getUpdatePatch(input),
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", memoId)
      .eq("revision", input.base_revision)
      .is("deleted_at", null)
      .select(MEMO_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectMemoRow | null) ?? null;
  }

  async softDelete(params: {
    projectId: string;
    memoId: string;
    actorUserId: string;
  }): Promise<ProjectMemoRow | null> {
    const { projectId, memoId, actorUserId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_memos")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", memoId)
      .is("deleted_at", null)
      .select(MEMO_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectMemoRow | null) ?? null;
  }

  async listLinks(params: {
    projectId: string;
    memoId: string;
  }): Promise<ProjectMemoLinkRow[]> {
    const { projectId, memoId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_memo_links")
      .select(MEMO_LINK_SELECT)
      .eq("project_id", projectId)
      .eq("memo_id", memoId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }));

    if (error) throw error;

    return (data as ProjectMemoLinkRow[] | null) ?? [];
  }

  async createLink(params: {
    projectId: string;
    memoId: string;
    input: MemoLinkCreateInput;
    actorUserId: string;
  }): Promise<ProjectMemoLinkRow> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_memo_links")
      .insert(getLinkPayload(params))
      .select(MEMO_LINK_SELECT)
      .single());

    if (error) throw error;

    return data as ProjectMemoLinkRow;
  }

  async getLinkById(params: {
    projectId: string;
    memoId: string;
    linkId: string;
  }): Promise<ProjectMemoLinkRow | null> {
    const { projectId, memoId, linkId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_memo_links")
      .select(MEMO_LINK_SELECT)
      .eq("project_id", projectId)
      .eq("memo_id", memoId)
      .eq("id", linkId)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectMemoLinkRow | null) ?? null;
  }

  async deleteLink(params: {
    projectId: string;
    memoId: string;
    linkId: string;
  }): Promise<ProjectMemoLinkRow | null> {
    const { projectId, memoId, linkId } = params;

    const current = await this.getLinkById(params);

    if (!current) {
      return null;
    }

    const { error } = await withDependencyResult(() => this.db
      .from("project_memo_links")
      .delete()
      .eq("project_id", projectId)
      .eq("memo_id", memoId)
      .eq("id", linkId));

    if (error) throw error;

    return current;
  }

  async targetExists(params: {
    projectId: string;
    linkType: MemoLinkCreateInput["link_type"];
    targetId: string;
  }): Promise<boolean> {
    const { projectId, linkType, targetId } = params;

    const tableByType = {
      document: "project_documents",
      segment: "project_document_segments",
      code: "project_codes",
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
    memoId?: string | null;
    entityType: "memo" | "memo_link";
    eventType:
      | "memo_created"
      | "memo_updated"
      | "memo_soft_deleted"
      | "memo_link_created"
      | "memo_link_deleted";
    actorUserId: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const {
      projectId,
      memoId = null,
      entityType,
      eventType,
      actorUserId,
      payload = {},
    } = params;

    const { error } = await withDependencyResult(() => this.db.from("project_analysis_events").insert({
      project_id: projectId,
      entity_type: entityType,
      entity_id: memoId,
      event_type: eventType,
      event_payload: payload,
      created_by: actorUserId,
    }));

    if (error) throw error;
  }
}
