import { withDependencyResult } from "@/src/modules/security/dependency-errors";
import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type {
  DocumentSegmentCreateInput,
  DocumentSegmentListQuery,
  DocumentSegmentUpdateInput,
} from "./document-segments.schema";

export type ProjectDocumentForSegmentRow = {
  id: string;
  project_id: string;
  content: string;
  revision: number;
  deleted_at: string | null;
};

export type ProjectDocumentSegmentRow = {
  id: string;
  project_id: string;
  document_id: string;
  start_char: number;
  end_char: number;
  selected_text: string;
  note: string;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

const DOCUMENT_FOR_SEGMENT_SELECT = `
  id,
  project_id,
  content,
  revision,
  deleted_at
`;

const SEGMENT_SELECT = `
  id,
  project_id,
  document_id,
  start_char,
  end_char,
  selected_text,
  note,
  revision,
  created_at,
  updated_at,
  deleted_at,
  created_by,
  updated_by
`;

function getCreatePayload(params: {
  projectId: string;
  documentId: string;
  input: DocumentSegmentCreateInput;
  actorUserId: string;
}) {
  const { projectId, documentId, input, actorUserId } = params;

  return {
    project_id: projectId,
    document_id: documentId,
    start_char: input.start_char,
    end_char: input.end_char,
    selected_text: input.selected_text,
    // Legacy column retained for database compatibility; titles are no longer
    // accepted by the public segment contract.
    label: "",
    note: input.note ?? "",
    created_by: actorUserId,
    updated_by: actorUserId,
  };
}

function getUpdatePatch(input: DocumentSegmentUpdateInput) {
  const patch: Record<string, unknown> = {};

  if (input.start_char !== undefined) patch.start_char = input.start_char;
  if (input.end_char !== undefined) patch.end_char = input.end_char;
  if (input.selected_text !== undefined) patch.selected_text = input.selected_text;
  if (input.note !== undefined) patch.note = input.note;

  return patch;
}

export class DocumentSegmentsRepo {
  constructor(private readonly db: ServerSupabase) {}

  async getDocumentById(params: {
    projectId: string;
    documentId: string;
    includeDeleted?: boolean;
  }): Promise<ProjectDocumentForSegmentRow | null> {
    const { projectId, documentId, includeDeleted = false } = params;

    let request = this.db
      .from("project_documents")
      .select(DOCUMENT_FOR_SEGMENT_SELECT)
      .eq("project_id", projectId)
      .eq("id", documentId);

    if (!includeDeleted) {
      request = request.is("deleted_at", null);
    }

    const { data, error } = await withDependencyResult(() => request.maybeSingle());

    if (error) throw error;

    return (data as ProjectDocumentForSegmentRow | null) ?? null;
  }

  async listByDocument(params: {
    projectId: string;
    documentId: string;
    query: DocumentSegmentListQuery;
  }): Promise<ProjectDocumentSegmentRow[]> {
    const { projectId, documentId, query } = params;

    let request = this.db
      .from("project_document_segments")
      .select(SEGMENT_SELECT)
      .eq("project_id", projectId)
      .eq("document_id", documentId)
      .order("start_char", { ascending: true })
      .order("created_at", { ascending: true })
      .range(query.offset, query.offset + query.limit - 1);

    if (!query.include_deleted) {
      request = request.is("deleted_at", null);
    }

    if (query.search) {
      request = request.or(
        `note.ilike.%${query.search}%,selected_text.ilike.%${query.search}%`
      );
    }

    const { data, error } = await withDependencyResult(() => request);

    if (error) throw error;

    return (data as ProjectDocumentSegmentRow[] | null) ?? [];
  }

  async getById(params: {
    projectId: string;
    documentId: string;
    segmentId: string;
    includeDeleted?: boolean;
  }): Promise<ProjectDocumentSegmentRow | null> {
    const { projectId, documentId, segmentId, includeDeleted = false } = params;

    let request = this.db
      .from("project_document_segments")
      .select(SEGMENT_SELECT)
      .eq("project_id", projectId)
      .eq("document_id", documentId)
      .eq("id", segmentId);

    if (!includeDeleted) {
      request = request.is("deleted_at", null);
    }

    const { data, error } = await withDependencyResult(() => request.maybeSingle());

    if (error) throw error;

    return (data as ProjectDocumentSegmentRow | null) ?? null;
  }

  async create(params: {
    projectId: string;
    documentId: string;
    input: DocumentSegmentCreateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentSegmentRow> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_document_segments")
      .insert(getCreatePayload(params))
      .select(SEGMENT_SELECT)
      .single());

    if (error) throw error;

    return data as ProjectDocumentSegmentRow;
  }

  async update(params: {
    projectId: string;
    documentId: string;
    segmentId: string;
    input: DocumentSegmentUpdateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentSegmentRow | null> {
    const { projectId, documentId, segmentId, input, actorUserId } = params;

    const patch = getUpdatePatch(input);

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_document_segments")
      .update({
        ...patch,
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("document_id", documentId)
      .eq("id", segmentId)
      .eq("revision", input.base_revision)
      .is("deleted_at", null)
      .select(SEGMENT_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectDocumentSegmentRow | null) ?? null;
  }

  async softDelete(params: {
    projectId: string;
    documentId: string;
    segmentId: string;
    actorUserId: string;
  }): Promise<ProjectDocumentSegmentRow | null> {
    const { projectId, documentId, segmentId, actorUserId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_document_segments")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("document_id", documentId)
      .eq("id", segmentId)
      .is("deleted_at", null)
      .select(SEGMENT_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectDocumentSegmentRow | null) ?? null;
  }

  async createEvent(params: {
    projectId: string;
    documentId: string;
    segmentId?: string | null;
    eventType: "segment_created" | "segment_updated" | "segment_deleted";
    actorUserId: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const {
      projectId,
      documentId,
      segmentId = null,
      eventType,
      actorUserId,
      payload = {},
    } = params;

    const { error } = await withDependencyResult(() => this.db.from("project_document_events").insert({
      project_id: projectId,
      document_id: documentId,
      segment_id: segmentId,
      event_type: eventType,
      event_payload: payload,
      created_by: actorUserId,
    }));

    if (error) throw error;
  }
}
