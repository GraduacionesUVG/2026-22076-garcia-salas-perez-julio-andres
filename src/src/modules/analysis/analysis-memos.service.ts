import { withDependencyErrors } from "@/src/modules/security/dependency-errors";
import type {
  MemoCreateInput,
  MemoLinkCreateInput,
  MemoListQuery,
  MemoUpdateInput,
} from "./analysis-memos.schema";
import {
  AnalysisMemosRepo,
  type ProjectMemoLinkRow,
  type ProjectMemoRow,
} from "./analysis-memos.repo";

function makeServiceError(message: string, status = 400) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function normalizeMemoEventPayload(memo: ProjectMemoRow): Record<string, unknown> {
  return {
    memo_id: memo.id,
    title: memo.title,
    memo_type: memo.memo_type,
    status: memo.status,
    tags: memo.tags,
    revision: memo.revision,
  };
}

function normalizeMemoLinkEventPayload(
  link: ProjectMemoLinkRow
): Record<string, unknown> {
  return {
    memo_link_id: link.id,
    memo_id: link.memo_id,
    link_type: link.link_type,
    document_id: link.document_id,
    segment_id: link.segment_id,
    code_id: link.code_id,
    participant_id: link.participant_id,
  };
}

function getChangedMemoFields(params: {
  before: ProjectMemoRow;
  after: ProjectMemoRow;
}) {
  const { before, after } = params;
  const fields: Array<keyof ProjectMemoRow> = [
    "title",
    "body",
    "memo_type",
    "status",
    "tags",
    "metadata",
    "deleted_at",
  ];

  return fields.filter(
    (field) =>
      JSON.stringify(before[field] ?? null) !==
      JSON.stringify(after[field] ?? null)
  );
}

function getTargetId(input: MemoLinkCreateInput) {
  if (input.link_type === "document") return input.document_id;
  if (input.link_type === "segment") return input.segment_id;
  if (input.link_type === "code") return input.code_id;
  return input.participant_id;
}

export class AnalysisMemosService {
  constructor(private readonly repo: AnalysisMemosRepo) {}

  async listByProject(
    projectId: string,
    query: MemoListQuery
  ): Promise<ProjectMemoRow[]> {
    return withDependencyErrors(() => this.repo.listByProject(projectId, query));
  }

  async getById(params: {
    projectId: string;
    memoId: string;
  }): Promise<ProjectMemoRow | null> {
    return withDependencyErrors(() => this.repo.getById(params));
  }

  async create(params: {
    projectId: string;
    input: MemoCreateInput;
    actorUserId: string;
  }): Promise<ProjectMemoRow> {
    const memo = await withDependencyErrors(() => this.repo.create(params));

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      memoId: memo.id,
      entityType: "memo",
      eventType: "memo_created",
      actorUserId: params.actorUserId,
      payload: normalizeMemoEventPayload(memo),
    }));

    return memo;
  }

  async update(params: {
    projectId: string;
    memoId: string;
    input: MemoUpdateInput;
    actorUserId: string;
  }): Promise<ProjectMemoRow | null> {
    const current = await withDependencyErrors(() => this.repo.getById({
      projectId: params.projectId,
      memoId: params.memoId,
    }));

    if (!current) {
      return null;
    }

    if (current.revision !== params.input.base_revision) {
      throw makeServiceError("MEMO_REVISION_CONFLICT", 409);
    }

    const updated = await withDependencyErrors(() => this.repo.update(params));

    if (!updated) {
      throw makeServiceError("MEMO_REVISION_CONFLICT", 409);
    }

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      memoId: updated.id,
      entityType: "memo",
      eventType: "memo_updated",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeMemoEventPayload(updated),
        changed_fields: getChangedMemoFields({
          before: current,
          after: updated,
        }),
      },
    }));

    return updated;
  }

  async softDelete(params: {
    projectId: string;
    memoId: string;
    actorUserId: string;
  }): Promise<ProjectMemoRow | null> {
    const memo = await withDependencyErrors(() => this.repo.softDelete(params));

    if (!memo) {
      return null;
    }

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      memoId: memo.id,
      entityType: "memo",
      eventType: "memo_soft_deleted",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeMemoEventPayload(memo),
        deleted: true,
      },
    }));

    return memo;
  }

  async listLinks(params: {
    projectId: string;
    memoId: string;
  }): Promise<ProjectMemoLinkRow[] | null> {
    const memo = await withDependencyErrors(() => this.repo.getById(params));

    if (!memo) {
      return null;
    }

    return withDependencyErrors(() => this.repo.listLinks(params));
  }

  async createLink(params: {
    projectId: string;
    memoId: string;
    input: MemoLinkCreateInput;
    actorUserId: string;
  }): Promise<ProjectMemoLinkRow | null> {
    const memo = await withDependencyErrors(() => this.repo.getById({
      projectId: params.projectId,
      memoId: params.memoId,
    }));

    if (!memo) {
      return null;
    }

    const targetId = getTargetId(params.input);

    if (!targetId) {
      throw makeServiceError("INVALID_LINK_TARGET", 400);
    }

    const targetExists = await withDependencyErrors(() => this.repo.targetExists({
      projectId: params.projectId,
      linkType: params.input.link_type,
      targetId,
    }));

    if (!targetExists) {
      throw makeServiceError("INVALID_LINK_TARGET", 400);
    }

    const link = await withDependencyErrors(() => this.repo.createLink(params));

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      memoId: link.id,
      entityType: "memo_link",
      eventType: "memo_link_created",
      actorUserId: params.actorUserId,
      payload: normalizeMemoLinkEventPayload(link),
    }));

    return link;
  }

  async deleteLink(params: {
    projectId: string;
    memoId: string;
    linkId: string;
    actorUserId: string;
  }): Promise<ProjectMemoLinkRow | null> {
    const link = await withDependencyErrors(() => this.repo.deleteLink(params));

    if (!link) {
      return null;
    }

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      memoId: link.id,
      entityType: "memo_link",
      eventType: "memo_link_deleted",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeMemoLinkEventPayload(link),
        deleted: true,
      },
    }));

    return link;
  }
}
