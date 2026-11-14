import { withDependencyResult } from "@/src/modules/security/dependency-errors";
import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type {
  SegmentCodeCreateInput,
  SegmentCodeListQuery,
  SegmentCodeUpdateInput,
} from "./analysis-segment-codes.schema";

export type ProjectSegmentCodeRow = {
  id: string;
  project_id: string;
  segment_id: string;
  code_id: string;
  analytic_note: string;
  is_quote: boolean;
  quote_label: string;
  metadata: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

export type ProjectSegmentExistsRow = {
  id: string;
  project_id: string;
  deleted_at: string | null;
};

const SEGMENT_CODE_SELECT = `
  id,
  project_id,
  segment_id,
  code_id,
  analytic_note,
  is_quote,
  quote_label,
  metadata,
  revision,
  created_at,
  updated_at,
  deleted_at,
  created_by,
  updated_by
`;

const SEGMENT_EXISTS_SELECT = `
  id,
  project_id,
  deleted_at
`;

function getCreatePayload(params: {
  projectId: string;
  segmentId: string;
  input: SegmentCodeCreateInput;
  actorUserId: string;
}) {
  const { projectId, segmentId, input, actorUserId } = params;

  return {
    project_id: projectId,
    segment_id: segmentId,
    code_id: input.code_id,
    analytic_note: input.analytic_note ?? "",
    is_quote: input.is_quote ?? false,
    quote_label: input.quote_label ?? "",
    metadata: input.metadata ?? {},
    created_by: actorUserId,
    updated_by: actorUserId,
  };
}

function getUpdatePatch(input: SegmentCodeUpdateInput) {
  const patch: Record<string, unknown> = {};

  if (input.analytic_note !== undefined) patch.analytic_note = input.analytic_note;
  if (input.is_quote !== undefined) patch.is_quote = input.is_quote;
  if (input.quote_label !== undefined) patch.quote_label = input.quote_label;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  return patch;
}

export class AnalysisSegmentCodesRepo {
  constructor(private readonly db: ServerSupabase) {}

  async getSegmentById(params: {
    projectId: string;
    segmentId: string;
    includeDeleted?: boolean;
  }): Promise<ProjectSegmentExistsRow | null> {
    const { projectId, segmentId, includeDeleted = false } = params;

    let request = this.db
      .from("project_document_segments")
      .select(SEGMENT_EXISTS_SELECT)
      .eq("project_id", projectId)
      .eq("id", segmentId);

    if (!includeDeleted) {
      request = request.is("deleted_at", null);
    }

    const { data, error } = await withDependencyResult(() => request.maybeSingle());

    if (error) throw error;

    return (data as ProjectSegmentExistsRow | null) ?? null;
  }

  async codeExists(params: {
    projectId: string;
    codeId: string;
  }): Promise<boolean> {
    const { projectId, codeId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_codes")
      .select("id")
      .eq("project_id", projectId)
      .eq("id", codeId)
      .is("deleted_at", null)
      .maybeSingle());

    if (error) throw error;

    return Boolean(data);
  }

  async listBySegment(params: {
    projectId: string;
    segmentId: string;
    query: SegmentCodeListQuery;
  }): Promise<ProjectSegmentCodeRow[]> {
    const { projectId, segmentId, query } = params;

    let request = this.db
      .from("project_segment_codes")
      .select(SEGMENT_CODE_SELECT)
      .eq("project_id", projectId)
      .eq("segment_id", segmentId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (!query.include_deleted) {
      request = request.is("deleted_at", null);
    }

    if (query.code_id) {
      request = request.eq("code_id", query.code_id);
    }

    const { data, error } = await withDependencyResult(() => request);

    if (error) throw error;

    return (data as ProjectSegmentCodeRow[] | null) ?? [];
  }

  async getById(params: {
    projectId: string;
    segmentCodeId: string;
    includeDeleted?: boolean;
  }): Promise<ProjectSegmentCodeRow | null> {
    const { projectId, segmentCodeId, includeDeleted = false } = params;

    let request = this.db
      .from("project_segment_codes")
      .select(SEGMENT_CODE_SELECT)
      .eq("project_id", projectId)
      .eq("id", segmentCodeId);

    if (!includeDeleted) {
      request = request.is("deleted_at", null);
    }

    const { data, error } = await withDependencyResult(() => request.maybeSingle());

    if (error) throw error;

    return (data as ProjectSegmentCodeRow | null) ?? null;
  }

  async getBySegmentAndCode(params: {
    projectId: string;
    segmentId: string;
    codeId: string;
  }): Promise<ProjectSegmentCodeRow | null> {
    const { projectId, segmentId, codeId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_segment_codes")
      .select(SEGMENT_CODE_SELECT)
      .eq("project_id", projectId)
      .eq("segment_id", segmentId)
      .eq("code_id", codeId)
      .is("deleted_at", null)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectSegmentCodeRow | null) ?? null;
  }

  async create(params: {
    projectId: string;
    segmentId: string;
    input: SegmentCodeCreateInput;
    actorUserId: string;
  }): Promise<ProjectSegmentCodeRow> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_segment_codes")
      .insert(getCreatePayload(params))
      .select(SEGMENT_CODE_SELECT)
      .single());

    if (error) throw error;

    return data as ProjectSegmentCodeRow;
  }

  async update(params: {
    projectId: string;
    segmentId: string;
    segmentCodeId: string;
    input: SegmentCodeUpdateInput;
    actorUserId: string;
  }): Promise<ProjectSegmentCodeRow | null> {
    const { projectId, segmentId, segmentCodeId, input, actorUserId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_segment_codes")
      .update({
        ...getUpdatePatch(input),
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("segment_id", segmentId)
      .eq("id", segmentCodeId)
      .eq("revision", input.base_revision)
      .is("deleted_at", null)
      .select(SEGMENT_CODE_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectSegmentCodeRow | null) ?? null;
  }

  async softDelete(params: {
    projectId: string;
    segmentId: string;
    segmentCodeId: string;
    actorUserId: string;
  }): Promise<ProjectSegmentCodeRow | null> {
    const { projectId, segmentId, segmentCodeId, actorUserId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_segment_codes")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("segment_id", segmentId)
      .eq("id", segmentCodeId)
      .is("deleted_at", null)
      .select(SEGMENT_CODE_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectSegmentCodeRow | null) ?? null;
  }

  async createEvent(params: {
    projectId: string;
    segmentCodeId?: string | null;
    eventType:
      | "segment_code_created"
      | "segment_code_updated"
      | "segment_code_soft_deleted";
    actorUserId: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const {
      projectId,
      segmentCodeId = null,
      eventType,
      actorUserId,
      payload = {},
    } = params;

    const { error } = await withDependencyResult(() => this.db.from("project_analysis_events").insert({
      project_id: projectId,
      entity_type: "segment_code",
      entity_id: segmentCodeId,
      event_type: eventType,
      event_payload: payload,
      created_by: actorUserId,
    }));

    if (error) throw error;
  }
}
