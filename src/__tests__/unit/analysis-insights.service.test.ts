import {
  SUPABASE_FAILURE_CASES,
  captureRejection,
  expectSafeDependencyFailure,
  freshProviderFailure,
} from "@/__tests__/backend/supabase-failure-cases";
import { AnalysisInsightsService } from "@/src/modules/analysis/analysis-insights.service";

describe("AnalysisInsightsService successful and rejected mutations", () => {
 it.each([false, true])("soft delete missing=%s returns exact domain row and audits only success", async missing => {
  const deleted = { ...insight, deleted_at: "2026-10-04T12:00:00Z" };
  const repo = makeRepo({ softDelete: jest.fn().mockResolvedValue(missing ? null : deleted) });
  const params = { projectId: "project-distinct", insightId: insight.id, actorUserId: "actor-distinct" };
  expect(await new AnalysisInsightsService(repo as never).softDelete(params)).toEqual(missing ? null : deleted);
  expect(repo.softDelete).toHaveBeenCalledWith(params);
  if (missing) expect(repo.createEvent).not.toHaveBeenCalled();
  else expect(repo.createEvent).toHaveBeenCalledWith({ projectId: params.projectId, insightId: deleted.id, entityType: "insight", eventType: "insight_soft_deleted", actorUserId: params.actorUserId, payload: { insight_id: deleted.id, title: deleted.title, insight_type: deleted.insight_type, confidence: deleted.confidence, status: deleted.status, tags: deleted.tags, revision: deleted.revision, deleted: true } });
 });
 it("returns a distinctive created row and exact creation audit", async () => {
  const created = { ...insight, title: "Distinct created insight", tags: ["audit-tag"], revision: 0 };
  const repo = makeRepo({ create: jest.fn().mockResolvedValue(created) });
  const service = new AnalysisInsightsService(repo as never);
  const params: Parameters<AnalysisInsightsService["create"]>[0] = { projectId: "project-distinct", actorUserId: "actor-distinct", input: { title: created.title, insight_type: "pattern", confidence: "high", status: "draft" } };
  expect(await service.create(params)).toEqual(created);
  expect(repo.create).toHaveBeenCalledWith(params);
  expect(repo.createEvent).toHaveBeenCalledWith({ projectId: params.projectId, insightId: created.id, entityType: "insight", eventType: "insight_created", actorUserId: params.actorUserId, payload: { insight_id: created.id, title: created.title, insight_type: created.insight_type, confidence: created.confidence, status: created.status, tags: created.tags, revision: 0 } });
 });
 it("updates revision zero and records independently expected changed fields", async () => {
  const updated = { ...insight, summary: "", interpretation: "new interpretation", tags: ["changed"], metadata: { verified: true }, revision: 1 };
  const repo = makeRepo({ getById: jest.fn().mockResolvedValue(insight), update: jest.fn().mockResolvedValue(updated) });
  const service = new AnalysisInsightsService(repo as never);
  const params: Parameters<AnalysisInsightsService["update"]>[0] = { projectId: "project-distinct", insightId: insight.id, actorUserId: "actor-distinct", input: { base_revision: 0, summary: "", interpretation: "new interpretation", tags: ["changed"], metadata: { verified: true } } };
  expect(await service.update(params)).toEqual(updated); expect(repo.update).toHaveBeenCalledWith(params);
  expect(repo.createEvent).toHaveBeenCalledWith({ projectId: params.projectId, insightId: updated.id, entityType: "insight", eventType: "insight_updated", actorUserId: params.actorUserId, payload: { insight_id: updated.id, title: updated.title, insight_type: updated.insight_type, confidence: updated.confidence, status: updated.status, tags: updated.tags, revision: 1, changed_fields: ["summary", "interpretation", "tags", "metadata"] } });
 });
 it("returns null for a missing update and does not write or audit", async () => {
  const repo = makeRepo({ getById: jest.fn().mockResolvedValue(null) });
  const service = new AnalysisInsightsService(repo as never);
  expect(await service.update({ projectId: "project-distinct", insightId: insight.id, actorUserId: "actor-distinct", input: { base_revision: 0, title: "missing" } })).toBeNull();
  expect(repo.update).not.toHaveBeenCalled(); expect(repo.createEvent).not.toHaveBeenCalled();
 });
 it("rejects an already stale revision before write or audit", async () => {
  const repo = makeRepo({ getById: jest.fn().mockResolvedValue({ ...insight, revision: 3 }) });
  const service = new AnalysisInsightsService(repo as never);
  await expect(service.update({ projectId: "project-distinct", insightId: insight.id, actorUserId: "actor-distinct", input: { base_revision: 0, title: "stale" } })).rejects.toMatchObject({ status: 409, message: "INSIGHT_REVISION_CONFLICT" });
  expect(repo.update).not.toHaveBeenCalled(); expect(repo.createEvent).not.toHaveBeenCalled();
 });
});


const insight = {
  id: "insight-1",
  project_id: "project-1",
  title: "Hallazgo",
  summary: "Resumen",
  interpretation: "Interpretación",
  insight_type: "pattern",
  confidence: "medium",
  status: "draft",
  tags: [],
  metadata: {},
  revision: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  created_by: "user-1",
  updated_by: "user-1",
};

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    listByProject: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    createEvent: jest.fn(),
    listLinks: jest.fn(),
    targetExists: jest.fn(),
    createLink: jest.fn(),
    deleteLink: jest.fn(),
    ...overrides,
  };
}

describe("AnalysisInsightsService dependency failures", () => {
  it.each(SUPABASE_FAILURE_CASES)(
    "RED: translates $name before creating an insight audit event",
    async (failureCase) => {
      const repo = makeRepo({
        create: jest.fn().mockRejectedValue(freshProviderFailure(failureCase)),
      });
      const service = new AnalysisInsightsService(repo as never);

      const observed = await captureRejection(
        service.create({
          projectId: "project-1",
          actorUserId: "user-1",
          input: {
            title: "Hallazgo",
            insight_type: "pattern",
            confidence: "medium",
            status: "draft",
          },
        })
      );

      expectSafeDependencyFailure(observed, failureCase);
      expect(repo.createEvent).not.toHaveBeenCalled();
    }
  );

  it("does not emit an update event when the conditional write loses its revision", async () => {
    const repo = makeRepo({
      getById: jest.fn().mockResolvedValue(insight),
      update: jest.fn().mockResolvedValue(null),
    });
    const service = new AnalysisInsightsService(repo as never);

    await expect(
      service.update({
        projectId: "project-1",
        insightId: "insight-1",
        actorUserId: "user-1",
        input: { base_revision: 0, title: "Nuevo hallazgo" },
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "INSIGHT_REVISION_CONFLICT",
    });
    expect(repo.createEvent).not.toHaveBeenCalled();
  });
});
