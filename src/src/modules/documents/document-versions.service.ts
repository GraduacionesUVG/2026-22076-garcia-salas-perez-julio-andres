import type {
  DocumentVersionCreateInput,
  DocumentVersionListQuery,
  DocumentVersionRestoreInput,
} from "./document-versions.schema";
import {
  DocumentVersionsRepo,
  type ProjectDocumentVersionListRow,
  type ProjectDocumentVersionRow,
} from "./document-versions.repo";
import type { ProjectDocumentRow } from "./documents.repo";

function makeServiceError(message: string, status = 400) {
  const error: any = new Error(message);
  error.status = status;
  return error;
}

function normalizeVersionEventPayload(
  version: ProjectDocumentVersionRow
): Record<string, unknown> {
  return {
    version_id: version.id,
    version_number: version.version_number,
    document_id: version.document_id,
    label: version.label,
    trigger_type: version.trigger_type,
    snapshot_revision: version.snapshot_revision,
    snapshot_word_count: version.snapshot_word_count,
    snapshot_character_count: version.snapshot_character_count,
  };
}

function normalizeRestoredDocumentPayload(params: {
  document: ProjectDocumentRow;
  version: ProjectDocumentVersionRow;
  backupVersion?: ProjectDocumentVersionRow | null;
}) {
  const { document, version, backupVersion = null } = params;

  return {
    document_id: document.id,
    restored_revision: document.revision,
    restored_from_version_id: version.id,
    restored_from_version_number: version.version_number,
    backup_version_id: backupVersion?.id ?? null,
    backup_version_number: backupVersion?.version_number ?? null,
  };
}

export class DocumentVersionsService {
  constructor(private readonly repo: DocumentVersionsRepo) {}

  async listByDocument(params: {
    projectId: string;
    documentId: string;
    query: DocumentVersionListQuery;
  }): Promise<ProjectDocumentVersionListRow[] | null> {
    const document = await this.repo.getDocumentById({
      projectId: params.projectId,
      documentId: params.documentId,
    });

    if (!document) {
      return null;
    }

    return this.repo.listByDocument(params);
  }

  async getById(params: {
    projectId: string;
    documentId: string;
    versionId: string;
  }): Promise<ProjectDocumentVersionRow | null> {
    const document = await this.repo.getDocumentById({
      projectId: params.projectId,
      documentId: params.documentId,
    });

    if (!document) {
      return null;
    }

    return this.repo.getById(params);
  }

  async create(params: {
    projectId: string;
    documentId: string;
    input: DocumentVersionCreateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentVersionRow | null> {
    const document = await this.repo.getDocumentById({
      projectId: params.projectId,
      documentId: params.documentId,
    });

    if (!document) {
      return null;
    }

    const version = await this.repo.createFromDocument({
      document,
      input: params.input,
      actorUserId: params.actorUserId,
    });

    await this.repo.createEvent({
      projectId: params.projectId,
      documentId: params.documentId,
      eventType: "document_version_created",
      actorUserId: params.actorUserId,
      payload: normalizeVersionEventPayload(version),
    });

    return version;
  }

  async restore(params: {
    projectId: string;
    documentId: string;
    versionId: string;
    input: DocumentVersionRestoreInput;
    actorUserId: string;
  }): Promise<ProjectDocumentRow | null> {
    const currentDocument = await this.repo.getDocumentById({
      projectId: params.projectId,
      documentId: params.documentId,
    });

    if (!currentDocument) {
      return null;
    }

    if (currentDocument.revision !== params.input.base_revision) {
      throw makeServiceError("DOCUMENT_REVISION_CONFLICT", 409);
    }

    const version = await this.repo.getById({
      projectId: params.projectId,
      documentId: params.documentId,
      versionId: params.versionId,
    });

    if (!version) {
      throw makeServiceError("DOCUMENT_VERSION_NOT_FOUND", 404);
    }

    const restoredDocument = await this.repo.restoreDocumentFromVersion({
      projectId: params.projectId,
      documentId: params.documentId,
      version,
      baseRevision: params.input.base_revision,
      actorUserId: params.actorUserId,
    });

    if (!restoredDocument) {
      throw makeServiceError("DOCUMENT_REVISION_CONFLICT", 409);
    }

    const backupVersion = await this.repo.createFromDocument({
      document: currentDocument,
      input: {
        label: `Backup antes de restaurar versión ${version.version_number}`,
        trigger_type: "before_restore",
      },
      actorUserId: params.actorUserId,
    });

    await this.repo.createEvent({
      projectId: params.projectId,
      documentId: params.documentId,
      eventType: "document_version_created",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeVersionEventPayload(backupVersion),
        reason: "backup_before_restore",
      },
    });

    await this.repo.createEvent({
      projectId: params.projectId,
      documentId: params.documentId,
      eventType: "document_version_restored",
      actorUserId: params.actorUserId,
      payload: normalizeRestoredDocumentPayload({
        document: restoredDocument,
        version,
        backupVersion,
      }),
    });

    return restoredDocument;
  }
}
