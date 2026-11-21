import {
  SUPABASE_FAILURE_CASES,
  captureRejection,
  expectSafeDependencyFailure,
  freshProviderFailure,
} from "@/__tests__/backend/supabase-failure-cases";
import { AnalysisMemosService } from "@/src/modules/analysis/analysis-memos.service";

describe("AnalysisMemosService successful and rejected mutations", () => {
 it.each([false, true])("soft delete missing=%s returns exact domain row and audits only success", async missing => {
  const deleted = { ...memo, deleted_at: "2026-10-04T12:00:00Z" };
  const repo = makeRepo({ softDelete: jest.fn().mockResolvedValue(missing ? null : deleted) });
  const params = { projectId: "project-distinct", memoId: memo.id, actorUserId: "actor-distinct" };
  expect(await new AnalysisMemosService(repo as never).softDelete(params)).toEqual(missing ? null : deleted);
  expect(repo.softDelete).toHaveBeenCalledWith(params);
  if (missing) expect(repo.createEvent).not.toHaveBeenCalled();
  else expect(repo.createEvent).toHaveBeenCalledWith({ projectId: params.projectId, memoId: deleted.id, entityType: "memo", eventType: "memo_soft_deleted", actorUserId: params.actorUserId, payload: { memo_id: deleted.id, title: deleted.title, memo_type: deleted.memo_type,  status: deleted.status, tags: deleted.tags, revision: deleted.revision, deleted: true } });
 });
 it("returns a distinctive created row and exact creation audit", async () => {
  const created = { ...memo, title: "Distinct created memo", tags: ["audit-tag"], revision: 0 };
  const repo = makeRepo({ create: jest.fn().mockResolvedValue(created) });
  const service = new AnalysisMemosService(repo as never);
  const params: Parameters<AnalysisMemosService["create"]>[0] = { projectId: "project-distinct", actorUserId: "actor-distinct", input: { title: created.title, memo_type: "analytic", status: "draft" } };
  expect(await service.create(params)).toEqual(created);
  expect(repo.create).toHaveBeenCalledWith(params);
  expect(repo.createEvent).toHaveBeenCalledWith({ projectId: params.projectId, memoId: created.id, entityType: "memo", eventType: "memo_created", actorUserId: params.actorUserId, payload: { memo_id: created.id, title: created.title, memo_type: created.memo_type, status: created.status, tags: created.tags, revision: 0 } });
 });
 it("updates revision zero and records independently expected changed fields", async () => {
  const updated = { ...memo, body: "", tags: ["changed"], metadata: { verified: true }, revision: 1 };
  const repo = makeRepo({ getById: jest.fn().mockResolvedValue(memo), update: jest.fn().mockResolvedValue(updated) });
  const service = new AnalysisMemosService(repo as never);
  const params: Parameters<AnalysisMemosService["update"]>[0] = { projectId: "project-distinct", memoId: memo.id, actorUserId: "actor-distinct", input: { base_revision: 0, body: "", tags: ["changed"], metadata: { verified: true } } };
  expect(await service.update(params)).toEqual(updated); expect(repo.update).toHaveBeenCalledWith(params);
  expect(repo.createEvent).toHaveBeenCalledWith({ projectId: params.projectId, memoId: updated.id, entityType: "memo", eventType: "memo_updated", actorUserId: params.actorUserId, payload: { memo_id: updated.id, title: updated.title, memo_type: updated.memo_type, status: updated.status, tags: updated.tags, revision: 1, changed_fields: ["body", "tags", "metadata"] } });
 });
 it("returns null for a missing update and does not write or audit", async () => {
  const repo = makeRepo({ getById: jest.fn().mockResolvedValue(null) });
  const service = new AnalysisMemosService(repo as never);
  expect(await service.update({ projectId: "project-distinct", memoId: memo.id, actorUserId: "actor-distinct", input: { base_revision: 0, title: "missing" } })).toBeNull();
  expect(repo.update).not.toHaveBeenCalled(); expect(repo.createEvent).not.toHaveBeenCalled();
 });
 it("rejects an already stale revision before write or audit", async () => {
  const repo = makeRepo({ getById: jest.fn().mockResolvedValue({ ...memo, revision: 3 }) });
  const service = new AnalysisMemosService(repo as never);
  await expect(service.update({ projectId: "project-distinct", memoId: memo.id, actorUserId: "actor-distinct", input: { base_revision: 0, title: "stale" } })).rejects.toMatchObject({ status: 409, message: "MEMO_REVISION_CONFLICT" });
  expect(repo.update).not.toHaveBeenCalled(); expect(repo.createEvent).not.toHaveBeenCalled();
 });
});


const memo = {
  id: "memo-1",
  project_id: "project-1",
  title: "Memo",
  body: "Cuerpo",
  memo_type: "analytic",
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

describe("AnalysisMemosService dependency failures", () => {
  it.each(SUPABASE_FAILURE_CASES)(
    "RED: translates $name before creating a memo audit event",
    async (failureCase) => {
      const repo = makeRepo({
        create: jest.fn().mockRejectedValue(freshProviderFailure(failureCase)),
      });
      const service = new AnalysisMemosService(repo as never);

      const observed = await captureRejection(
        service.create({
          projectId: "project-1",
          actorUserId: "user-1",
          input: {
            title: "Memo",
            memo_type: "analytic",
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
      getById: jest.fn().mockResolvedValue(memo),
      update: jest.fn().mockResolvedValue(null),
    });
    const service = new AnalysisMemosService(repo as never);

    await expect(
      service.update({
        projectId: "project-1",
        memoId: "memo-1",
        actorUserId: "user-1",
        input: { base_revision: 0, title: "Nuevo título" },
      })
    ).rejects.toMatchObject({ status: 409, message: "MEMO_REVISION_CONFLICT" });
    expect(repo.createEvent).not.toHaveBeenCalled();
  });

  it("treats a malformed memo row without a revision as a conflict", async () => {
    const repo = makeRepo({
      getById: jest.fn().mockResolvedValue({ ...memo, revision: undefined }),
    });
    const service = new AnalysisMemosService(repo as never);

    await expect(
      service.update({
        projectId: "project-1",
        memoId: "memo-1",
        actorUserId: "user-1",
        input: { base_revision: 0, title: "Nuevo título" },
      })
    ).rejects.toMatchObject({ status: 409, message: "MEMO_REVISION_CONFLICT" });
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.createEvent).not.toHaveBeenCalled();
  });

  it("RED: stops safely after a dependency failure between the memo read and write", async () => {
    const failureCase = SUPABASE_FAILURE_CASES[0];
    const repo = makeRepo({
      getById: jest.fn().mockResolvedValue(memo),
      update: jest.fn().mockRejectedValue(freshProviderFailure(failureCase)),
    });
    const service = new AnalysisMemosService(repo as never);

    const observed = await captureRejection(
      service.update({
        projectId: "project-1",
        memoId: "memo-1",
        actorUserId: "user-1",
        input: { base_revision: 0, title: "Nuevo título" },
      })
    );

    expectSafeDependencyFailure(observed, failureCase);
    expect(repo.getById).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.createEvent).not.toHaveBeenCalled();
  });
});
