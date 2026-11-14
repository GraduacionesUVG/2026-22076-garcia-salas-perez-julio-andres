import { withDependencyErrors } from "@/src/modules/security/dependency-errors";
import type {
  InsightCreateInput,
  InsightLinkCreateInput,
  InsightListQuery,
  InsightUpdateInput,
} from "./analysis-insights.schema";
import {
  AnalysisInsightsRepo,
  type ProjectInsightLinkRow,
  type ProjectInsightRow,
} from "./analysis-insights.repo";

function makeServiceError(message: string, status = 400) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function normalizeInsightEventPayload(
  insight: ProjectInsightRow
): Record<string, unknown> {
  return {
    insight_id: insight.id,
    title: insight.title,
    insight_type: insight.insight_type,
    confidence: insight.confidence,
    status: insight.status,
    tags: insight.tags,
    revision: insight.revision,
  };
}

function normalizeInsightLinkEventPayload(
  link: ProjectInsightLinkRow
): Record<string, unknown> {
  return {
    insight_link_id: link.id,
    insight_id: link.insight_id,
    link_type: link.link_type,
    document_id: link.document_id,
    segment_id: link.segment_id,
    code_id: link.code_id,
    memo_id: link.memo_id,
    participant_id: link.participant_id,
  };
}

function getChangedInsightFields(params: {
  before: ProjectInsightRow;
  after: ProjectInsightRow;
}) {
  const { before, after } = params;
  const fields: Array<keyof ProjectInsightRow> = [
    "title",
    "summary",
    "interpretation",
    "insight_type",
    "confidence",
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

function getTargetId(input: InsightLinkCreateInput) {
  if (input.link_type === "document") return input.document_id;
  if (input.link_type === "segment") return input.segment_id;
  if (input.link_type === "code") return input.code_id;
  if (input.link_type === "memo") return input.memo_id;
  return input.participant_id;
}

export class AnalysisInsightsService {
  constructor(private readonly repo: AnalysisInsightsRepo) {}

  async listByProject(
    projectId: string,
    query: InsightListQuery
  ): Promise<ProjectInsightRow[]> {
    return withDependencyErrors(() => this.repo.listByProject(projectId, query));
  }

  async getById(params: {
    projectId: string;
    insightId: string;
  }): Promise<ProjectInsightRow | null> {
    return withDependencyErrors(() => this.repo.getById(params));
  }

  async create(params: {
    projectId: string;
    input: InsightCreateInput;
    actorUserId: string;
  }): Promise<ProjectInsightRow> {
    const insight = await withDependencyErrors(() => this.repo.create(params));

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      insightId: insight.id,
      entityType: "insight",
      eventType: "insight_created",
      actorUserId: params.actorUserId,
      payload: normalizeInsightEventPayload(insight),
    }));

    return insight;
  }

  async update(params: {
    projectId: string;
    insightId: string;
    input: InsightUpdateInput;
    actorUserId: string;
  }): Promise<ProjectInsightRow | null> {
    const current = await withDependencyErrors(() => this.repo.getById({
      projectId: params.projectId,
      insightId: params.insightId,
    }));

    if (!current) {
      return null;
    }

    if (current.revision !== params.input.base_revision) {
      throw makeServiceError("INSIGHT_REVISION_CONFLICT", 409);
    }

    const updated = await withDependencyErrors(() => this.repo.update(params));

    if (!updated) {
      throw makeServiceError("INSIGHT_REVISION_CONFLICT", 409);
    }

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      insightId: updated.id,
      entityType: "insight",
      eventType: "insight_updated",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeInsightEventPayload(updated),
        changed_fields: getChangedInsightFields({
          before: current,
          after: updated,
        }),
      },
    }));

    return updated;
  }

  async softDelete(params: {
    projectId: string;
    insightId: string;
    actorUserId: string;
  }): Promise<ProjectInsightRow | null> {
    const insight = await withDependencyErrors(() => this.repo.softDelete(params));

    if (!insight) {
      return null;
    }

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      insightId: insight.id,
      entityType: "insight",
      eventType: "insight_soft_deleted",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeInsightEventPayload(insight),
        deleted: true,
      },
    }));

    return insight;
  }

  async listLinks(params: {
    projectId: string;
    insightId: string;
  }): Promise<ProjectInsightLinkRow[] | null> {
    const insight = await withDependencyErrors(() => this.repo.getById(params));

    if (!insight) {
      return null;
    }

    return withDependencyErrors(() => this.repo.listLinks(params));
  }

  async listLinksByProject(projectId: string): Promise<ProjectInsightLinkRow[]> {
    return withDependencyErrors(() => this.repo.listLinksByProject(projectId));
  }

  async createLink(params: {
    projectId: string;
    insightId: string;
    input: InsightLinkCreateInput;
    actorUserId: string;
  }): Promise<ProjectInsightLinkRow | null> {
    const insight = await withDependencyErrors(() => this.repo.getById({
      projectId: params.projectId,
      insightId: params.insightId,
    }));

    if (!insight) {
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
      insightId: link.id,
      entityType: "insight_link",
      eventType: "insight_link_created",
      actorUserId: params.actorUserId,
      payload: normalizeInsightLinkEventPayload(link),
    }));

    return link;
  }

  async deleteLink(params: {
    projectId: string;
    insightId: string;
    linkId: string;
    actorUserId: string;
  }): Promise<ProjectInsightLinkRow | null> {
    const link = await withDependencyErrors(() => this.repo.deleteLink(params));

    if (!link) {
      return null;
    }

    await withDependencyErrors(() => this.repo.createEvent({
      projectId: params.projectId,
      insightId: link.id,
      entityType: "insight_link",
      eventType: "insight_link_deleted",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeInsightLinkEventPayload(link),
        deleted: true,
      },
    }));

    return link;
  }
}
