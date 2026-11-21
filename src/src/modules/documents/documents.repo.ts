import { withDependencyResult } from "@/src/modules/security/dependency-errors";
import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type {
  DocumentCreateInput,
  DocumentListQuery,
  DocumentUpdateInput,
} from "./documents.schema";

export type ProjectDocumentType =
  | "interview"
  | "focus_group"
  | "field_note"
  | "observation"
  | "diary"
  | "archival_document"
  | "open_text"
  | "other";

export type ProjectDocumentStatus =
  | "draft"
  | "transcribed"
  | "cleaned"
  | "reviewed"
  | "ready_for_coding"
  | "archived";

export type ProjectDocumentRow = {
  id: string;
  project_id: string;
  title: string;
  content: string;
  document_type: ProjectDocumentType;
  source_id: string | null;
  participant_id: string | null;
  interview_date: string | null;
  field_date: string | null;
  location: string;
  language: string;
  notes: string;
  metadata: Record<string, unknown>;
  status: ProjectDocumentStatus;
  character_count: number;
  word_count: number;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

export type ProjectDocumentListRow = Omit<ProjectDocumentRow, "content">;

export type ProjectDocumentStatsRow = {
  id: string;
  project_id: string;
  document_type: ProjectDocumentType;
  source_id: string | null;
  participant_id: string | null;
  status: ProjectDocumentStatus;
  character_count: number;
  word_count: number;
  deleted_at: string | null;
};

const DOCUMENT_SELECT = `
  id,
  project_id,
  title,
  content,
  document_type,
  source_id,
  participant_id,
  interview_date,
  field_date,
  location,
  language,
  notes,
  metadata,
  status,
  character_count,
  word_count,
  revision,
  created_at,
  updated_at,
  deleted_at,
  created_by,
  updated_by
`;

const DOCUMENT_LIST_SELECT = `
  id,
  project_id,
  title,
  document_type,
  source_id,
  participant_id,
  interview_date,
  field_date,
  location,
  language,
  notes,
  metadata,
  status,
  character_count,
  word_count,
  revision,
  created_at,
  updated_at,
  deleted_at,
  created_by,
  updated_by
`;

const DOCUMENT_STATS_SELECT = `
  id,
  project_id,
  document_type,
  source_id,
  participant_id,
  status,
  character_count,
  word_count,
  deleted_at
`;

function normalizeSearchText(value: string) {
  return value
    .replace(/[,%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildDocumentSearchFilter(search?: string | null) {
  const normalized = normalizeSearchText(String(search ?? ""));

  if (!normalized) return null;

  const pattern = `%${normalized}%`;
  return [
    `title.ilike.${pattern}`,
    `content.ilike.${pattern}`,
    `notes.ilike.${pattern}`,
    `location.ilike.${pattern}`,
  ].join(",");
}

function getCreatePayload(params: {
  projectId: string;
  input: DocumentCreateInput;
  actorUserId: string;
}) {
  const { projectId, input, actorUserId } = params;

  return {
    project_id: projectId,
    title: input.title,
    content: input.content ?? "",
    document_type: input.document_type ?? "interview",
    source_id: input.source_id ?? null,
    participant_id: input.participant_id ?? null,
    interview_date: input.interview_date ?? null,
    field_date: input.field_date ?? null,
    location: input.location ?? "",
    language: input.language ?? "es",
    notes: input.notes ?? "",
    metadata: input.metadata ?? {},
    status: input.status ?? "draft",
    created_by: actorUserId,
    updated_by: actorUserId,
  };
}

function getUpdatePatch(input: DocumentUpdateInput) {
  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.content !== undefined) patch.content = input.content;
  if (input.document_type !== undefined) patch.document_type = input.document_type;
  if (input.source_id !== undefined) patch.source_id = input.source_id;
  if (input.participant_id !== undefined) patch.participant_id = input.participant_id;
  if (input.interview_date !== undefined) patch.interview_date = input.interview_date;
  if (input.field_date !== undefined) patch.field_date = input.field_date;
  if (input.location !== undefined) patch.location = input.location;
  if (input.language !== undefined) patch.language = input.language;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.metadata !== undefined) patch.metadata = input.metadata;
  if (input.status !== undefined) patch.status = input.status;

  return patch;
}

export class DocumentsRepo {
  constructor(private readonly db: ServerSupabase) {}

  async hasActiveSegments(params: {
    projectId: string;
    documentId: string;
  }): Promise<boolean> {
    const { count, error } = await withDependencyResult(() => this.db
      .from("project_document_segments")
      .select("id", { count: "exact", head: true })
      .eq("project_id", params.projectId)
      .eq("document_id", params.documentId)
      .is("deleted_at", null));

    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async listByProject(
    projectId: string,
    query: DocumentListQuery
  ): Promise<ProjectDocumentListRow[]> {
    let request = this.db
      .from("project_documents")
      .select(DOCUMENT_LIST_SELECT)
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (!query.include_deleted) {
      request = request.is("deleted_at", null);
    }

    const searchFilter = buildDocumentSearchFilter(query.search);

    if (searchFilter) {
      request = request.or(searchFilter);
    }

    if (query.document_type) {
      request = request.eq("document_type", query.document_type);
    }

    if (query.status) {
      request = request.eq("status", query.status);
    }

    if (query.source_id) {
      request = request.eq("source_id", query.source_id);
    }

    if (query.participant_id) {
      request = request.eq("participant_id", query.participant_id);
    }

    const { data, error } = await withDependencyResult(() => request);

    if (error) throw error;

    return (data as ProjectDocumentListRow[] | null) ?? [];
  }

  async listDeletedByProject(
    projectId: string,
    query: DocumentListQuery
  ): Promise<ProjectDocumentListRow[]> {
    let request = this.db
      .from("project_documents")
      .select(DOCUMENT_LIST_SELECT)
      .eq("project_id", projectId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .order("id", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    const searchFilter = buildDocumentSearchFilter(query.search);

    if (searchFilter) {
      request = request.or(searchFilter);
    }

    if (query.document_type) {
      request = request.eq("document_type", query.document_type);
    }

    if (query.status) {
      request = request.eq("status", query.status);
    }

    if (query.source_id) {
      request = request.eq("source_id", query.source_id);
    }

    if (query.participant_id) {
      request = request.eq("participant_id", query.participant_id);
    }

    const { data, error } = await withDependencyResult(() => request);

    if (error) throw error;

    return (data as ProjectDocumentListRow[] | null) ?? [];
  }

  async getById(params: {
    projectId: string;
    documentId: string;
    includeDeleted?: boolean;
  }): Promise<ProjectDocumentRow | null> {
    const { projectId, documentId, includeDeleted = false } = params;

    let request = this.db
      .from("project_documents")
      .select(DOCUMENT_SELECT)
      .eq("project_id", projectId)
      .eq("id", documentId);

    if (!includeDeleted) {
      request = request.is("deleted_at", null);
    }

    const { data, error } = await withDependencyResult(() => request.maybeSingle());

    if (error) throw error;

    return (data as ProjectDocumentRow | null) ?? null;
  }

  async create(params: {
    projectId: string;
    input: DocumentCreateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentRow> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_documents")
      .insert(getCreatePayload(params))
      .select(DOCUMENT_SELECT)
      .single());

    if (error) throw error;

    return data as ProjectDocumentRow;
  }

  async update(params: {
    projectId: string;
    documentId: string;
    input: DocumentUpdateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentRow | null> {
    const { projectId, documentId, input, actorUserId } = params;

    const patch = getUpdatePatch(input);

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_documents")
      .update({
        ...patch,
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", documentId)
      .eq("revision", input.base_revision)
      .is("deleted_at", null)
      .select(DOCUMENT_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectDocumentRow | null) ?? null;
  }

  async softDelete(params: {
    projectId: string;
    documentId: string;
    actorUserId: string;
  }): Promise<ProjectDocumentRow | null> {
    const { projectId, documentId, actorUserId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_documents")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", documentId)
      .is("deleted_at", null)
      .select(DOCUMENT_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectDocumentRow | null) ?? null;
  }

  async restore(params: {
    projectId: string;
    documentId: string;
    actorUserId: string;
  }): Promise<ProjectDocumentRow | null> {
    const { projectId, documentId, actorUserId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_documents")
      .update({
        deleted_at: null,
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", documentId)
      .not("deleted_at", "is", null)
      .select(DOCUMENT_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectDocumentRow | null) ?? null;
  }

  async getStatsRows(projectId: string): Promise<ProjectDocumentStatsRow[]> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_documents")
      .select(DOCUMENT_STATS_SELECT)
      .eq("project_id", projectId));

    if (error) throw error;

    return (data as ProjectDocumentStatsRow[] | null) ?? [];
  }

  async createEvent(params: {
    projectId: string;
    documentId?: string | null;
    eventType:
      | "document_created"
      | "document_updated"
      | "document_duplicated"
      | "document_soft_deleted"
      | "document_restored";
    actorUserId: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const {
      projectId,
      documentId = null,
      eventType,
      actorUserId,
      payload = {},
    } = params;

    const { error } = await withDependencyResult(() => this.db.from("project_document_events").insert({
      project_id: projectId,
      document_id: documentId,
      event_type: eventType,
      event_payload: payload,
      created_by: actorUserId,
    }));

    if (error) throw error;
  }
}
