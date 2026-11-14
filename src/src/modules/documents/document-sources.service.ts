import type {
  DocumentSourceCreateInput,
  DocumentSourceListQuery,
  DocumentSourceUpdateInput,
} from "./document-sources.schema";
import {
  DocumentSourcesRepo,
  type ProjectDocumentSourceRow,
} from "./document-sources.repo";

function makeServiceError(message: string, status = 400) {
  const error: any = new Error(message);
  error.status = status;
  return error;
}

function normalizeSourceEventPayload(
  source: ProjectDocumentSourceRow
): Record<string, unknown> {
  return {
    source_id: source.id,
    code: source.code,
    label: source.label,
    is_default: source.is_default,
    is_active: source.is_active,
  };
}

export class DocumentSourcesService {
  constructor(private readonly repo: DocumentSourcesRepo) {}

  async listByProject(
    projectId: string,
    query: DocumentSourceListQuery
  ): Promise<ProjectDocumentSourceRow[]> {
    return this.repo.listByProject(projectId, query);
  }

  async getById(params: {
    projectId: string;
    sourceId: string;
  }): Promise<ProjectDocumentSourceRow | null> {
    return this.repo.getById({
      projectId: params.projectId,
      sourceId: params.sourceId,
    });
  }

  async create(params: {
    projectId: string;
    input: DocumentSourceCreateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentSourceRow> {
    const source = await this.repo.create(params);

    await this.repo.createEvent({
      projectId: params.projectId,
      eventType: "source_created",
      actorUserId: params.actorUserId,
      payload: normalizeSourceEventPayload(source),
    });

    return source;
  }

  async update(params: {
    projectId: string;
    sourceId: string;
    input: DocumentSourceUpdateInput;
    actorUserId: string;
  }): Promise<ProjectDocumentSourceRow | null> {
    const current = await this.repo.getById({
      projectId: params.projectId,
      sourceId: params.sourceId,
    });

    if (!current) {
      return null;
    }

    if (
      current.is_default &&
      params.input.code !== undefined &&
      params.input.code !== current.code
    ) {
      throw makeServiceError("DEFAULT_SOURCE_CODE_CANNOT_BE_CHANGED", 409);
    }

    const source = await this.repo.update(params);

    if (!source) return null;

    await this.repo.createEvent({
      projectId: params.projectId,
      eventType: "source_updated",
      actorUserId: params.actorUserId,
      payload: normalizeSourceEventPayload(source),
    });

    return source;
  }

  async softDelete(params: {
    projectId: string;
    sourceId: string;
    actorUserId: string;
  }): Promise<ProjectDocumentSourceRow | null> {
    const current = await this.repo.getById({
      projectId: params.projectId,
      sourceId: params.sourceId,
    });

    if (!current) {
      return null;
    }

    if (current.is_default) {
      throw makeServiceError("DEFAULT_SOURCE_CANNOT_BE_DELETED", 409);
    }

    const source = await this.repo.softDelete(params);

    if (!source) return null;

    await this.repo.createEvent({
      projectId: params.projectId,
      eventType: "source_updated",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeSourceEventPayload(source),
        deleted: true,
      },
    });

    return source;
  }
}