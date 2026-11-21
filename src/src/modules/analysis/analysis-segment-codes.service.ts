import { withDependencyErrors } from "@/src/modules/security/dependency-errors";
import type {
  SegmentCodeCreateInput,
  SegmentCodeListQuery,
  SegmentCodeUpdateInput,
} from "./analysis-segment-codes.schema";
import {
  AnalysisSegmentCodesRepo,
  type ProjectSegmentCodeRow,
} from "./analysis-segment-codes.repo";

function makeServiceError(message: string, status = 400) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function normalizeSegmentCodeEventPayload(
  segmentCode: ProjectSegmentCodeRow
): Record<string, unknown> {
  return {
    segment_code_id: segmentCode.id,
    segment_id: segmentCode.segment_id,
    code_id: segmentCode.code_id,
    is_quote: segmentCode.is_quote,
    quote_label: segmentCode.quote_label,
    revision: segmentCode.revision,
  };
}

function getChangedSegmentCodeFields(params: {
  before: ProjectSegmentCodeRow;
  after: ProjectSegmentCodeRow;
}) {
  const { before, after } = params;
  const fields: Array<keyof ProjectSegmentCodeRow> = [
    "analytic_note",
    "is_quote",
    "quote_label",
    "metadata",
    "deleted_at",
  ];

  return fields.filter(
    (field) =>
      JSON.stringify(before[field] ?? null) !==
      JSON.stringify(after[field] ?? null)
  );
}

export class AnalysisSegmentCodesService {
  constructor(private readonly repo: AnalysisSegmentCodesRepo) {}

  async listBySegment(params: {
    projectId: string;
    segmentId: string;
    query: SegmentCodeListQuery;
  }): Promise<ProjectSegmentCodeRow[] | null> {
    const segment = await withDependencyErrors(() => this.repo.getSegmentById({
      projectId: params.projectId,
      segmentId: params.segmentId,
    }));

    if (!segment) {
      return null;
    }

    return withDependencyErrors(() => this.repo.listBySegment(params));
  }

  async create(params: {
    projectId: string;
    segmentId: string;
    input: SegmentCodeCreateInput;
    actorUserId: string;
  }): Promise<ProjectSegmentCodeRow | null> {
    const segment = await withDependencyErrors(() => this.repo.getSegmentById({
      projectId: params.projectId,
      segmentId: params.segmentId,
    }));

    if (!segment) {
      return null;
    }

    const codeExists = await withDependencyErrors(() => this.repo.codeExists({
      projectId: params.projectId,
      codeId: params.input.code_id,
    }));

    if (!codeExists) {
      throw makeServiceError("CODE_NOT_FOUND", 404);
    }

    const existing = await withDependencyErrors(() => this.repo.getBySegmentAndCode({
      projectId: params.projectId,
      segmentId: params.segmentId,
      codeId: params.input.code_id,
    }));

    if (existing) {
      throw makeServiceError("SEGMENT_CODE_ALREADY_EXISTS", 409);
    }

    const segmentCode = await withDependencyErrors(() => this.repo.create(params));

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      segmentCodeId: segmentCode.id,
      eventType: "segment_code_created",
      actorUserId: params.actorUserId,
      payload: normalizeSegmentCodeEventPayload(segmentCode),
    }));

    return segmentCode;
  }

  async update(params: {
    projectId: string;
    segmentId: string;
    segmentCodeId: string;
    input: SegmentCodeUpdateInput;
    actorUserId: string;
  }): Promise<ProjectSegmentCodeRow | null> {
    const current = await withDependencyErrors(() => this.repo.getById({
      projectId: params.projectId,
      segmentCodeId: params.segmentCodeId,
    }));

    if (!current || current.segment_id !== params.segmentId) {
      return null;
    }

    if (current.revision !== params.input.base_revision) {
      throw makeServiceError("SEGMENT_CODE_REVISION_CONFLICT", 409);
    }

    const updated = await withDependencyErrors(() => this.repo.update(params));

    if (!updated) {
      throw makeServiceError("SEGMENT_CODE_REVISION_CONFLICT", 409);
    }

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      segmentCodeId: updated.id,
      eventType: "segment_code_updated",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeSegmentCodeEventPayload(updated),
        changed_fields: getChangedSegmentCodeFields({
          before: current,
          after: updated,
        }),
      },
    }));

    return updated;
  }

  async softDelete(params: {
    projectId: string;
    segmentId: string;
    segmentCodeId: string;
    actorUserId: string;
  }): Promise<ProjectSegmentCodeRow | null> {
    const segmentCode = await withDependencyErrors(() => this.repo.softDelete(params));

    if (!segmentCode) {
      return null;
    }

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      segmentCodeId: segmentCode.id,
      eventType: "segment_code_soft_deleted",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeSegmentCodeEventPayload(segmentCode),
        deleted: true,
      },
    }));

    return segmentCode;
  }
}
