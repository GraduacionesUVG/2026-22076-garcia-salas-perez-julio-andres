import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type {
  CodeCreateInput,
  CodeListQuery,
  CodeUpdateInput,
} from "./analysis-codes.schema";

export type ProjectCodeRow = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  definition: string | null;
  inclusion_criteria: string | null;
  exclusion_criteria: string | null;
  parent_code_id: string | null;
  color: string;
  position: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

const CODE_SELECT = `
  id,
  project_id,
  name,
  description,
  definition,
  inclusion_criteria,
  exclusion_criteria,
  parent_code_id,
  color,
  position,
  is_active,
  metadata,
  revision,
  created_at,
  updated_at,
  deleted_at,
  created_by,
  updated_by
`;

function encodeDatabaseText(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function getCreatePayload(params: {
  projectId: string;
  input: CodeCreateInput;
  actorUserId: string;
}) {
  const { projectId, input, actorUserId } = params;

  return {
    project_id: projectId,
    name: input.name,
    description: input.description ?? "",
    definition: input.definition ?? "",
    inclusion_criteria: input.inclusion_criteria ?? "",
    exclusion_criteria: input.exclusion_criteria ?? "",
    parent_code_id: input.parent_code_id ?? null,
    color: input.color ?? "#0f766e",
    position: input.position ?? 0,
    metadata: input.metadata ?? {},
    created_by: actorUserId,
    updated_by: actorUserId,
  };
}

function getUpdatePatch(input: CodeUpdateInput) {
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.definition !== undefined) patch.definition = input.definition;
  if (input.inclusion_criteria !== undefined) {
    patch.inclusion_criteria = input.inclusion_criteria;
  }
  if (input.exclusion_criteria !== undefined) {
    patch.exclusion_criteria = input.exclusion_criteria;
  }
  if (input.parent_code_id !== undefined) patch.parent_code_id = input.parent_code_id;
  if (input.color !== undefined) patch.color = input.color;
  if (input.position !== undefined) patch.position = input.position;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  return patch;
}

export class AnalysisCodesRepo {
  constructor(private readonly db: ServerSupabase) {}

  async getDeletionBlockers(params: {
    projectId: string;
    codeId: string;
  }): Promise<{ activeChildren: number; activeAssignments: number }> {
    const [children, assignments] = await Promise.all([
      this.db.from("project_codes").select("id", { count: "exact", head: true })
        .eq("project_id", params.projectId).eq("parent_code_id", params.codeId)
        .is("deleted_at", null),
      this.db.from("project_segment_codes").select("id", { count: "exact", head: true })
        .eq("project_id", params.projectId).eq("code_id", params.codeId)
        .is("deleted_at", null),
    ]);

    if (children.error) throw children.error;
    if (assignments.error) throw assignments.error;
    return {
      activeChildren: children.count ?? 0,
      activeAssignments: assignments.count ?? 0,
    };
  }

  async listByProject(
    projectId: string,
    query: CodeListQuery
  ): Promise<ProjectCodeRow[]> {
    if (query.search) {
      const { data, error } = await this.db.rpc("search_project_codes_safe", {
        p_project_id: projectId,
        p_search_b64: encodeDatabaseText(query.search),
        p_include_deleted: query.include_deleted,
        p_parent_code_id: query.parent_code_id ?? null,
        p_limit: query.limit,
        p_offset: query.offset,
      });

      if (error) throw error;
      return (data as ProjectCodeRow[] | null) ?? [];
    }

    let request = this.db
      .from("project_codes")
      .select(CODE_SELECT)
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("name", { ascending: true })
      .range(query.offset, query.offset + query.limit - 1);

    if (!query.include_deleted) {
      request = request.is("deleted_at", null);
    }

    if (query.parent_code_id) {
      request = request.eq("parent_code_id", query.parent_code_id);
    }

    const { data, error } = await request;

    if (error) throw error;

    return (data as ProjectCodeRow[] | null) ?? [];
  }

  async getById(params: {
    projectId: string;
    codeId: string;
    includeDeleted?: boolean;
  }): Promise<ProjectCodeRow | null> {
    const { projectId, codeId, includeDeleted = false } = params;

    let request = this.db
      .from("project_codes")
      .select(CODE_SELECT)
      .eq("project_id", projectId)
      .eq("id", codeId);

    if (!includeDeleted) {
      request = request.is("deleted_at", null);
    }

    const { data, error } = await request.maybeSingle();

    if (error) throw error;

    return (data as ProjectCodeRow | null) ?? null;
  }

  async getActiveByName(params: {
    projectId: string;
    name: string;
    excludeCodeId?: string;
  }): Promise<ProjectCodeRow | null> {
    const { data, error } = await this.db
      .rpc("find_project_code_by_name_safe", {
        p_project_id: params.projectId,
        p_name_b64: encodeDatabaseText(params.name),
        p_exclude_code_id: params.excludeCodeId ?? null,
      })
      .maybeSingle();

    if (error) throw error;

    return (data as ProjectCodeRow | null) ?? null;
  }

  async create(params: {
    projectId: string;
    input: CodeCreateInput;
    actorUserId: string;
  }): Promise<ProjectCodeRow> {
    const payload = getCreatePayload(params);
    const { data, error } = await this.db
      .rpc("create_project_code_safe", {
        p_project_id: payload.project_id,
        p_name_b64: encodeDatabaseText(payload.name),
        p_description_b64: encodeDatabaseText(payload.description),
        p_definition_b64: encodeDatabaseText(payload.definition),
        p_inclusion_b64: encodeDatabaseText(payload.inclusion_criteria),
        p_exclusion_b64: encodeDatabaseText(payload.exclusion_criteria),
        p_parent_code_id: payload.parent_code_id,
        p_color: payload.color,
        p_position: payload.position,
        p_metadata: payload.metadata,
      })
      .single();

    if (error) throw error;

    return data as ProjectCodeRow;
  }

  async update(params: {
    projectId: string;
    codeId: string;
    input: CodeUpdateInput;
    actorUserId: string;
  }): Promise<ProjectCodeRow | null> {
    const { projectId, codeId, input, actorUserId } = params;

    const { data, error } = await this.db
      .from("project_codes")
      .update({
        ...getUpdatePatch(input),
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", codeId)
      .eq("revision", input.base_revision)
      .is("deleted_at", null)
      .select(CODE_SELECT)
      .maybeSingle();

    if (error) throw error;

    return (data as ProjectCodeRow | null) ?? null;
  }

  async softDelete(params: {
    projectId: string;
    codeId: string;
    actorUserId: string;
  }): Promise<ProjectCodeRow | null> {
    const { projectId, codeId, actorUserId } = params;

    const { data, error } = await this.db
      .from("project_codes")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", codeId)
      .is("deleted_at", null)
      .select(CODE_SELECT)
      .maybeSingle();

    if (error) throw error;

    return (data as ProjectCodeRow | null) ?? null;
  }

  async createEvent(params: {
    projectId: string;
    codeId?: string | null;
    eventType: "code_created" | "code_updated" | "code_soft_deleted";
    actorUserId: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const {
      projectId,
      codeId = null,
      eventType,
      actorUserId,
      payload = {},
    } = params;

    const { error } = await this.db.from("project_analysis_events").insert({
      project_id: projectId,
      entity_type: "code",
      entity_id: codeId,
      event_type: eventType,
      event_payload: payload,
      created_by: actorUserId,
    });

    if (error) throw error;
  }
}
