import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type { ProjectDocumentRow } from "./documents.repo";
import type {
  DocumentVersionCreateInput,
  DocumentVersionListQuery,
} from "./document-versions.schema";

export type ProjectDocumentVersionRow = {
  id: string;
  project_id: string;
  document_id: string;
  version_number: number;
  label: string | null;

  snapshot_title: string;
  snapshot_content: string;
  snapshot_document_type: string;
  snapshot_source_id: string | null;
  snapshot_participant_id: string | null;
  snapshot_interview_date: string | null;
  snapshot_field_date: string | null;
  snapshot_location: string;
  snapshot_language: string;
  snapshot_notes: string;
  snapshot_metadata: Record<string, unknown>;
  snapshot_status: string;
  snapshot_character_count: number;
  snapshot_word_count: number;
  snapshot_revision: number;

  trigger_type:
    | "manual"
    | "auto_checkpoint"
    | "before_restore"
    | "restore_backup";

  content_hash: string | null;
  created_by: string | null;
  created_at: string;
};

export type ProjectDocumentVersionListRow = Omit<
  ProjectDocumentVersionRow,
  "snapshot_content"
>;

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

const VERSION_SELECT = `
  id,
  project_id,
  document_id,
  version_number,
  label,
  snapshot_title,
  snapshot_content,
  snapshot_document_type,
  snapshot_source_id,
  snapshot_participant_id,
  snapshot_interview_date,
  snapshot_field_date,
  snapshot_location,
  snapshot_language,
  snapshot_notes,
  snapshot_metadata,
  snapshot_status,
  snapshot_character_count,
  snapshot_word_count,
  snapshot_revision,
  trigger_type,
  content_hash,
  created_by,
  created_at
`;

const VERSION_LIST_SELECT = `
  id,
  project_id,
  document_id,
  version_number,
  label,
  snapshot_title,
  snapshot_document_type,
  snapshot_source_id,
  snapshot_participant_id,
  snapshot_interview_date,
  snapshot_field_date,
  snapshot_location,
  snapshot_language,
  snapshot_notes,
  snapshot_metadata,
  snapshot_status,
  snapshot_character_count,
  snapshot_word_count,
  snapshot_revision,
  trigger_type,
  content_hash,
  created_by,
  created_at
`;

function getVersionInsertPayload(params: {
  document: ProjectDocumentRow;
  input: DocumentVersionCreateInput;
  actorUserId: string;
}) {
  const { document, input, actorUserId } = params;

  return {
    project_id: document.project_id,
    document_id: document.id,

    label: input.label ?? null,

    snapshot_title: document.title,
    snapshot_content: document.content,
    snapshot_document_type: document.document_type,
    snapshot_source_id: document.source_id,
    snapshot_participant_id: document.participant_id,
    snapshot_interview_date: document.interview_date,
    snapshot_field_date: document.field_date,
    snapshot_location: document.location,
    snapshot_language: document.language,
    snapshot_notes: document.notes,
    snapshot_metadata: document.metadata ?? {},
    snapshot_status: document.status,
    snapshot_character_count: document.character_count,
    snapshot_word_count: document.word_count,
    snapshot_revision: document.revision,

    trigger_type: input.trigger_type ?? "manual",
    content_hash: null,

    created_by: actorUserId,
  };
}

function getRestorePatch(params: {
  version: ProjectDocumentVersionRow;
  actorUserId: string;
}) {
  const { version, actorUserId } = params;

  return {
    title: version.snapshot_title,
    content: version.snapshot_content,
    document_type: version.snapshot_document_type,
    source_id: version.snapshot_source_id,
    participant_id: version.snapshot_participant_id,
    interview_date: version.snapshot_interview_date,
    field_date: version.snapshot_field_date,
    location: version.snapshot_location,
    language: version.snapshot_language,
    notes: version.snapshot_notes,
    metadata: version.snapshot_metadata ?? {},
    status: version.snapshot_status,
    updated_by: actorUserId,
  };
}

export class DocumentVersionsRepo {
  constructor(private readonly db: ServerSupabase) {}

  async getDocumentById(params: {
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

    const { data, error } = await request.maybeSingle();

    if (error) throw error;

    return (data as ProjectDocumentRow | null) ?? null;
  }

  async listByDocument(params: {
    projectId: string;
    documentId: string;
    query: DocumentVersionListQuery;
  }): Promise<ProjectDocumentVersionListRow[]> {
    const { projectId, documentId, query } = params;

    const { data, error } = await this.db
      .from("project_document_versions")
      .select(VERSION_LIST_SELECT)
      .eq("project_id", projectId)
      .eq("document_id", documentId)
      .order("version_number", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (error) throw error;

    return (data as ProjectDocumentVersionListRow[] | null) ?? [];
  }

  async getById(params: {
    projectId: string;
    documentId: string;
    versionId: string;
  }): Promise<ProjectDocumentVersionRow | null> {
    const { projectId, documentId, versionId } = params;

    const { data, error } = await this.db
      .from("project_document_versions")
      .select(VERSION_SELECT)
      .eq("project_id", projectId)
      .eq("document_id", documentId)
      .eq("id", versionId)
      .maybeSingle();

    if (error) throw error;

    return (data as ProjectDocumentVersionRow | null) ?? null;
  }

  async createFromDocument(params: {
    document: ProjectDocumentRow;
    input: DocumentVersionCreateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentVersionRow> {
    const { data, error } = await this.db
      .from("project_document_versions")
      .insert(getVersionInsertPayload(params))
      .select(VERSION_SELECT)
      .single();

    if (error) throw error;

    return data as ProjectDocumentVersionRow;
  }

  async restoreDocumentFromVersion(params: {
    projectId: string;
    documentId: string;
    version: ProjectDocumentVersionRow;
    baseRevision: number;
    actorUserId: string;
  }): Promise<ProjectDocumentRow | null> {
    const { projectId, documentId, version, baseRevision, actorUserId } =
      params;

    const { data, error } = await this.db
      .from("project_documents")
      .update(getRestorePatch({ version, actorUserId }))
      .eq("project_id", projectId)
      .eq("id", documentId)
      .eq("revision", baseRevision)
      .is("deleted_at", null)
      .select(DOCUMENT_SELECT)
      .maybeSingle();

    if (error) throw error;

    return (data as ProjectDocumentRow | null) ?? null;
  }

  async createEvent(params: {
    projectId: string;
    documentId: string;
    eventType: "document_version_created" | "document_version_restored";
    actorUserId: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const {
      projectId,
      documentId,
      eventType,
      actorUserId,
      payload = {},
    } = params;

    const { error } = await this.db.from("project_document_events").insert({
      project_id: projectId,
      document_id: documentId,
      event_type: eventType,
      event_payload: payload,
      created_by: actorUserId,
    });

    if (error) throw error;
  }
}