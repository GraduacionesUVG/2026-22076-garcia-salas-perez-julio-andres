import { withDependencyErrors } from "@/src/modules/security/dependency-errors";
import type {
  DocumentSegmentCreateInput,
  DocumentSegmentListQuery,
  DocumentSegmentUpdateInput,
} from "./document-segments.schema";
import {
  DocumentSegmentsRepo,
  type ProjectDocumentForSegmentRow,
  type ProjectDocumentSegmentRow,
} from "./document-segments.repo";

function makeServiceError(message: string, status = 400) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function normalizeSegmentEventPayload(
  segment: ProjectDocumentSegmentRow
): Record<string, unknown> {
  return {
    segment_id: segment.id,
    document_id: segment.document_id,
    start_char: segment.start_char,
    end_char: segment.end_char,
    revision: segment.revision,
    selected_text_length: segment.selected_text.length,
  };
}

function getChangedSegmentFields(params: {
  before: ProjectDocumentSegmentRow;
  after: ProjectDocumentSegmentRow;
}) {
  const { before, after } = params;

  const fields: Array<keyof ProjectDocumentSegmentRow> = [
    "start_char",
    "end_char",
    "selected_text",
    "note",
    "deleted_at",
  ];

  return fields.filter((field) => {
    return (
      JSON.stringify(before[field] ?? null) !==
      JSON.stringify(after[field] ?? null)
    );
  });
}

function getDocumentSlice(params: {
  document: ProjectDocumentForSegmentRow;
  startChar: number;
  endChar: number;
}) {
  return params.document.content.slice(params.startChar, params.endChar);
}

function validateSegmentAgainstDocument(params: {
  document: ProjectDocumentForSegmentRow;
  baseDocumentRevision: number;
  startChar: number;
  endChar: number;
  selectedText: string;
}) {
  const {
    document,
    baseDocumentRevision,
    startChar,
    endChar,
    selectedText,
  } = params;

  if (document.revision !== baseDocumentRevision) {
    throw makeServiceError("DOCUMENT_REVISION_CONFLICT", 409);
  }

  if (endChar > document.content.length) {
    throw makeServiceError("SEGMENT_RANGE_OUTSIDE_DOCUMENT", 400);
  }

  if (endChar <= startChar) {
    throw makeServiceError("INVALID_SEGMENT_RANGE", 400);
  }

  const actualText = getDocumentSlice({
    document,
    startChar,
    endChar,
  });

  if (actualText !== selectedText) {
    throw makeServiceError("SELECTED_TEXT_DOES_NOT_MATCH_DOCUMENT", 400);
  }
}

function isChangingRange(input: DocumentSegmentUpdateInput) {
  return (
    input.start_char !== undefined ||
    input.end_char !== undefined ||
    input.selected_text !== undefined
  );
}

export class DocumentSegmentsService {
  constructor(private readonly repo: DocumentSegmentsRepo) {}

  async listByDocument(params: {
    projectId: string;
    documentId: string;
    query: DocumentSegmentListQuery;
  }): Promise<ProjectDocumentSegmentRow[] | null> {
    const document = await withDependencyErrors(() => this.repo.getDocumentById({
      projectId: params.projectId,
      documentId: params.documentId,
    }));

    if (!document) {
      return null;
    }

    return withDependencyErrors(() => this.repo.listByDocument(params));
  }

  async getById(params: {
    projectId: string;
    documentId: string;
    segmentId: string;
  }): Promise<ProjectDocumentSegmentRow | null> {
    const document = await withDependencyErrors(() => this.repo.getDocumentById({
      projectId: params.projectId,
      documentId: params.documentId,
    }));

    if (!document) {
      return null;
    }

    return withDependencyErrors(() => this.repo.getById({
      projectId: params.projectId,
      documentId: params.documentId,
      segmentId: params.segmentId,
    }));
  }

  async create(params: {
    projectId: string;
    documentId: string;
    input: DocumentSegmentCreateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentSegmentRow | null> {
    const document = await withDependencyErrors(() => this.repo.getDocumentById({
      projectId: params.projectId,
      documentId: params.documentId,
    }));

    if (!document) {
      return null;
    }

    validateSegmentAgainstDocument({
      document,
      baseDocumentRevision: params.input.base_document_revision,
      startChar: params.input.start_char,
      endChar: params.input.end_char,
      selectedText: params.input.selected_text,
    });

    const segment = await withDependencyErrors(() => this.repo.create(params));

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      documentId: params.documentId,
      segmentId: segment.id,
      eventType: "segment_created",
      actorUserId: params.actorUserId,
      payload: normalizeSegmentEventPayload(segment),
    }));

    return segment;
  }

  async update(params: {
    projectId: string;
    documentId: string;
    segmentId: string;
    input: DocumentSegmentUpdateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentSegmentRow | null> {
    const document = await withDependencyErrors(() => this.repo.getDocumentById({
      projectId: params.projectId,
      documentId: params.documentId,
    }));

    if (!document) {
      return null;
    }

    const currentSegment = await withDependencyErrors(() => this.repo.getById({
      projectId: params.projectId,
      documentId: params.documentId,
      segmentId: params.segmentId,
    }));

    if (!currentSegment) {
      return null;
    }

    if (currentSegment.revision !== params.input.base_revision) {
      throw makeServiceError("SEGMENT_REVISION_CONFLICT", 409);
    }

    if (isChangingRange(params.input)) {
      const nextStartChar = params.input.start_char ?? currentSegment.start_char;
      const nextEndChar = params.input.end_char ?? currentSegment.end_char;
      const nextSelectedText =
        params.input.selected_text ?? currentSegment.selected_text;

      validateSegmentAgainstDocument({
        document,
        baseDocumentRevision: params.input.base_document_revision ?? -1,
        startChar: nextStartChar,
        endChar: nextEndChar,
        selectedText: nextSelectedText,
      });
    }

    const updatedSegment = await withDependencyErrors(() => this.repo.update(params));

    if (!updatedSegment) {
      throw makeServiceError("SEGMENT_REVISION_CONFLICT", 409);
    }

    const changedFields = getChangedSegmentFields({
      before: currentSegment,
      after: updatedSegment,
    });

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      documentId: params.documentId,
      segmentId: updatedSegment.id,
      eventType: "segment_updated",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeSegmentEventPayload(updatedSegment),
        changed_fields: changedFields,
      },
    }));

    return updatedSegment;
  }

  async softDelete(params: {
    projectId: string;
    documentId: string;
    segmentId: string;
    actorUserId: string;
  }): Promise<ProjectDocumentSegmentRow | null> {
    const document = await withDependencyErrors(() => this.repo.getDocumentById({
      projectId: params.projectId,
      documentId: params.documentId,
    }));

    if (!document) {
      return null;
    }

    const segment = await withDependencyErrors(() => this.repo.softDelete(params));

    if (!segment) {
      return null;
    }

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      documentId: params.documentId,
      segmentId: segment.id,
      eventType: "segment_deleted",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeSegmentEventPayload(segment),
        deleted: true,
      },
    }));

    return segment;
  }
}
