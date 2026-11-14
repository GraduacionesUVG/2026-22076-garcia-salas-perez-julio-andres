import { withDependencyErrors } from "@/src/modules/security/dependency-errors";
import type {
  DocumentCreateInput,
  DocumentListQuery,
  DocumentUpdateInput,
} from "./documents.schema";
import {
  DocumentsRepo,
  type ProjectDocumentListRow,
  type ProjectDocumentRow,
  type ProjectDocumentStatsRow,
} from "./documents.repo";
import {
  getChangedDocumentFields,
  getDocumentContentPreview,
} from "./documents.text";

function makeServiceError(message: string, status = 400) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function normalizeDocumentEventPayload(
  document: ProjectDocumentRow
): Record<string, unknown> {
  return {
    document_id: document.id,
    title: document.title,
    document_type: document.document_type,
    source_id: document.source_id,
    participant_id: document.participant_id,
    status: document.status,
    word_count: document.word_count,
    character_count: document.character_count,
    revision: document.revision,
  };
}

function incrementGroup(
  groups: Record<string, { key: string; count: number; word_count: number; character_count: number }>,
  key: string | null,
  row: ProjectDocumentStatsRow
) {
  const safeKey = key ?? "unassigned";

  if (!groups[safeKey]) {
    groups[safeKey] = {
      key: safeKey,
      count: 0,
      word_count: 0,
      character_count: 0,
    };
  }

  groups[safeKey].count += 1;
  groups[safeKey].word_count += row.word_count ?? 0;
  groups[safeKey].character_count += row.character_count ?? 0;
}

function buildStats(rows: ProjectDocumentStatsRow[]) {
  const activeRows = rows.filter((row) => row.deleted_at === null);
  const deletedRows = rows.filter((row) => row.deleted_at !== null);

  const byType: Record<string, { key: string; count: number; word_count: number; character_count: number }> = {};
  const byStatus: Record<string, { key: string; count: number; word_count: number; character_count: number }> = {};
  const bySource: Record<string, { key: string; count: number; word_count: number; character_count: number }> = {};
  const byParticipant: Record<string, { key: string; count: number; word_count: number; character_count: number }> = {};

  let totalWords = 0;
  let totalCharacters = 0;

  for (const row of activeRows) {
    totalWords += row.word_count ?? 0;
    totalCharacters += row.character_count ?? 0;

    incrementGroup(byType, row.document_type, row);
    incrementGroup(byStatus, row.status, row);
    incrementGroup(bySource, row.source_id, row);
    incrementGroup(byParticipant, row.participant_id, row);
  }

  return {
    total_documents: activeRows.length,
    deleted_documents: deletedRows.length,
    total_words: totalWords,
    total_characters: totalCharacters,
    average_words_per_document:
      activeRows.length > 0 ? Math.round(totalWords / activeRows.length) : 0,
    average_characters_per_document:
      activeRows.length > 0 ? Math.round(totalCharacters / activeRows.length) : 0,
    by_type: Object.values(byType),
    by_status: Object.values(byStatus),
    by_source: Object.values(bySource),
    by_participant: Object.values(byParticipant),
  };
}

export class DocumentsService {
  constructor(private readonly repo: DocumentsRepo) {}

  async listByProject(
    projectId: string,
    query: DocumentListQuery
  ): Promise<ProjectDocumentListRow[]> {
    return withDependencyErrors(() => this.repo.listByProject(projectId, query));
  }

  async listTrashByProject(
    projectId: string,
    query: DocumentListQuery
  ): Promise<ProjectDocumentListRow[]> {
    return withDependencyErrors(() => this.repo.listDeletedByProject(projectId, query));
  }

  async getStats(projectId: string) {
    const rows = await withDependencyErrors(() => this.repo.getStatsRows(projectId));
    return buildStats(rows);
  }

  async getById(params: {
    projectId: string;
    documentId: string;
  }): Promise<ProjectDocumentRow | null> {
    return withDependencyErrors(() => this.repo.getById({
      projectId: params.projectId,
      documentId: params.documentId,
    }));
  }

  async create(params: {
    projectId: string;
    input: DocumentCreateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentRow> {
    const document = await withDependencyErrors(() => this.repo.create(params));

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      documentId: document.id,
      eventType: "document_created",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeDocumentEventPayload(document),
        content_preview: getDocumentContentPreview(document.content),
      },
    }));

    return document;
  }

  async duplicate(params: {
    projectId: string;
    documentId: string;
    actorUserId: string;
  }): Promise<ProjectDocumentRow | null> {
    const original = await withDependencyErrors(() => this.repo.getById({
      projectId: params.projectId,
      documentId: params.documentId,
    }));

    if (!original) return null;

    const document = await withDependencyErrors(() => this.repo.create({
      projectId: params.projectId,
      actorUserId: params.actorUserId,
      input: {
        title: `${original.title} (copia)`,
        content: original.content,
        document_type: original.document_type,
        source_id: original.source_id,
        participant_id: original.participant_id,
        interview_date: original.interview_date,
        field_date: original.field_date,
        location: original.location,
        language: original.language,
        notes: original.notes,
        metadata: {
          ...(original.metadata ?? {}),
          duplicated_from_document_id: original.id,
        },
        status: original.status,
      },
    }));

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      documentId: document.id,
      eventType: "document_duplicated",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeDocumentEventPayload(document),
        duplicated_from_document_id: original.id,
      },
    }));

    return document;
  }

  async update(params: {
    projectId: string;
    documentId: string;
    input: DocumentUpdateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentRow | null> {
    const current = await withDependencyErrors(() => this.repo.getById({
      projectId: params.projectId,
      documentId: params.documentId,
    }));

    if (!current) {
      return null;
    }

    if (current.revision !== params.input.base_revision) {
      throw makeServiceError("DOCUMENT_REVISION_CONFLICT", 409);
    }

    if (
      params.input.content !== undefined &&
      params.input.content !== current.content &&
      (await withDependencyErrors(() => this.repo.hasActiveSegments({
        projectId: params.projectId,
        documentId: params.documentId,
      })))
    ) {
      throw makeServiceError("DOCUMENT_HAS_ACTIVE_SEGMENTS", 409);
    }

    const updated = await withDependencyErrors(() => this.repo.update(params));

    if (!updated) {
      throw makeServiceError("DOCUMENT_REVISION_CONFLICT", 409);
    }

    const changedFields = getChangedDocumentFields({
      before: current,
      after: updated,
    });

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      documentId: updated.id,
      eventType: "document_updated",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeDocumentEventPayload(updated),
        changed_fields: changedFields,
        content_changed: changedFields.includes("content"),
      },
    }));

    return updated;
  }

  async softDelete(params: {
    projectId: string;
    documentId: string;
    actorUserId: string;
  }): Promise<ProjectDocumentRow | null> {
    const document = await withDependencyErrors(() => this.repo.softDelete(params));

    if (!document) {
      return null;
    }

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      documentId: document.id,
      eventType: "document_soft_deleted",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeDocumentEventPayload(document),
        deleted: true,
      },
    }));

    return document;
  }

  async restore(params: {
    projectId: string;
    documentId: string;
    actorUserId: string;
  }): Promise<ProjectDocumentRow | null> {
    const document = await withDependencyErrors(() => this.repo.restore(params));

    if (!document) {
      return null;
    }

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      documentId: document.id,
      eventType: "document_restored",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeDocumentEventPayload(document),
        restored: true,
      },
    }));

    return document;
  }
}
