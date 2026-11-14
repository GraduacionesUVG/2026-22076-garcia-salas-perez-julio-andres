import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type {
  DocumentSourceCreateInput,
  DocumentSourceListQuery,
  DocumentSourceUpdateInput,
} from "./document-sources.schema";

export type ProjectDocumentSourceRow = {
  id: string;
  project_id: string;
  code: string;
  label: string;
  description: string;
  is_default: boolean;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

const DOCUMENT_SOURCE_SELECT = `
  id,
  project_id,
  code,
  label,
  description,
  is_default,
  is_active,
  position,
  created_at,
  updated_at,
  deleted_at,
  created_by,
  updated_by
`;

function getSourcePatch(input: DocumentSourceUpdateInput) {
  const patch: Record<string, unknown> = {};

  if (input.code !== undefined) patch.code = input.code;
  if (input.label !== undefined) patch.label = input.label;
  if (input.description !== undefined) patch.description = input.description;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.position !== undefined) patch.position = input.position;

  return patch;
}

export class DocumentSourcesRepo {
  constructor(private readonly db: ServerSupabase) {}

  async listByProject(
    projectId: string,
    query: DocumentSourceListQuery
  ): Promise<ProjectDocumentSourceRow[]> {
    let request = this.db
      .from("project_document_sources")
      .select(DOCUMENT_SOURCE_SELECT)
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("label", { ascending: true })
      .range(query.offset, query.offset + query.limit - 1);

    if (!query.include_deleted) {
      request = request.is("deleted_at", null);
    }

    if (query.active !== undefined) {
      request = request.eq("is_active", query.active);
    }

    if (query.search) {
      request = request.ilike("label", `%${query.search}%`);
    }

    const { data, error } = await request;

    if (error) throw error;

    return (data as ProjectDocumentSourceRow[] | null) ?? [];
  }

  async getById(params: {
    projectId: string;
    sourceId: string;
    includeDeleted?: boolean;
  }): Promise<ProjectDocumentSourceRow | null> {
    const { projectId, sourceId, includeDeleted = false } = params;

    let request = this.db
      .from("project_document_sources")
      .select(DOCUMENT_SOURCE_SELECT)
      .eq("project_id", projectId)
      .eq("id", sourceId);

    if (!includeDeleted) {
      request = request.is("deleted_at", null);
    }

    const { data, error } = await request.maybeSingle();

    if (error) throw error;

    return (data as ProjectDocumentSourceRow | null) ?? null;
  }

  async create(params: {
    projectId: string;
    input: DocumentSourceCreateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentSourceRow> {
    const { projectId, input, actorUserId } = params;

    const { data, error } = await this.db
      .from("project_document_sources")
      .insert({
        project_id: projectId,
        code: input.code,
        label: input.label,
        description: input.description ?? "",
        is_default: false,
        is_active: input.is_active ?? true,
        position: input.position ?? 100,
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .select(DOCUMENT_SOURCE_SELECT)
      .single();

    if (error) throw error;

    return data as ProjectDocumentSourceRow;
  }

  async update(params: {
    projectId: string;
    sourceId: string;
    input: DocumentSourceUpdateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentSourceRow | null> {
    const { projectId, sourceId, input, actorUserId } = params;

    const patch = getSourcePatch(input);

    const { data, error } = await this.db
      .from("project_document_sources")
      .update({
        ...patch,
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", sourceId)
      .is("deleted_at", null)
      .select(DOCUMENT_SOURCE_SELECT)
      .maybeSingle();

    if (error) throw error;

    return (data as ProjectDocumentSourceRow | null) ?? null;
  }

  async softDelete(params: {
    projectId: string;
    sourceId: string;
    actorUserId: string;
  }): Promise<ProjectDocumentSourceRow | null> {
    const { projectId, sourceId, actorUserId } = params;

    const { data, error } = await this.db
      .from("project_document_sources")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", sourceId)
      .is("deleted_at", null)
      .select(DOCUMENT_SOURCE_SELECT)
      .maybeSingle();

    if (error) throw error;

    return (data as ProjectDocumentSourceRow | null) ?? null;
  }

  async createEvent(params: {
    projectId: string;
    eventType: "source_created" | "source_updated";
    actorUserId: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const { projectId, eventType, actorUserId, payload = {} } = params;

    const { error } = await this.db.from("project_document_events").insert({
      project_id: projectId,
      event_type: eventType,
      event_payload: payload,
      created_by: actorUserId,
    });

    if (error) throw error;
  }
}