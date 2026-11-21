import {
  SUPABASE_FAILURE_CASES,
  captureRejection,
  expectSafeDependencyFailure,
  freshProviderFailure,
} from "@/__tests__/backend/supabase-failure-cases";
import { AnalysisSegmentCodesService } from "@/src/modules/analysis/analysis-segment-codes.service";

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    getSegmentById: jest.fn(),
    codeExists: jest.fn(),
    listBySegment: jest.fn(),
    getById: jest.fn(),
    getBySegmentAndCode: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    createEvent: jest.fn(),
    ...overrides,
  };
}

describe("AnalysisSegmentCodesService dependency failures", () => {
  it.each(SUPABASE_FAILURE_CASES)(
    "RED: translates $name before resolving codes or creating assignments",
    async (failureCase) => {
      const repo = makeRepo({
        getSegmentById: jest
          .fn()
          .mockRejectedValue(freshProviderFailure(failureCase)),
      });
      const service = new AnalysisSegmentCodesService(repo as never);

      const observed = await captureRejection(
        service.create({
          projectId: "project-1",
          segmentId: "segment-1",
          actorUserId: "user-1",
          input: { code_id: "code-1", is_quote: false },
        })
      );

      expectSafeDependencyFailure(observed, failureCase);
      expect(repo.codeExists).not.toHaveBeenCalled();
      expect(repo.getBySegmentAndCode).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.createEvent).not.toHaveBeenCalled();
    }
  );

  it("returns a stable duplicate conflict without creating or auditing an assignment", async () => {
    const repo = makeRepo({
      getSegmentById: jest.fn().mockResolvedValue({
        id: "segment-1",
        project_id: "project-1",
        deleted_at: null,
      }),
      codeExists: jest.fn().mockResolvedValue(true),
      getBySegmentAndCode: jest.fn().mockResolvedValue({ id: "assignment-1" }),
    });
    const service = new AnalysisSegmentCodesService(repo as never);

    await expect(
      service.create({
        projectId: "project-1",
        segmentId: "segment-1",
        actorUserId: "user-1",
        input: { code_id: "code-1", is_quote: false },
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "SEGMENT_CODE_ALREADY_EXISTS",
    });
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.createEvent).not.toHaveBeenCalled();
  });
});

describe('AnalysisSegmentCodesService assignment lifecycle', () => {
  const row = { id: 'assignment-A', project_id: 'project-P', segment_id: 'segment-S', code_id: 'code-C', analytic_note: '', is_quote: false, quote_label: '', metadata: {}, revision: 0, created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null, created_by: 'actor-U', updated_by: 'actor-U' };
  const scope = { projectId: 'project-P', segmentId: 'segment-S', segmentCodeId: 'assignment-A', actorUserId: 'actor-U' };
  function ready(overrides: Record<string, unknown> = {}) {
    return makeRepo({ getSegmentById: jest.fn().mockResolvedValue({ id: 'segment-S', project_id: 'project-P', deleted_at: null }), codeExists: jest.fn().mockResolvedValue(true), getBySegmentAndCode: jest.fn().mockResolvedValue(null), getById: jest.fn().mockResolvedValue(row), create: jest.fn().mockResolvedValue(row), update: jest.fn().mockResolvedValue({ ...row, analytic_note: 'Note', is_quote: true, quote_label: 'Voice', revision: 1 }), softDelete: jest.fn().mockResolvedValue({ ...row, deleted_at: '2026-02-03' }), createEvent: jest.fn().mockResolvedValue(undefined), ...overrides });
  }
  it('lists only after project-scoped segment resolution', async () => {
    const repo = ready({ listBySegment: jest.fn().mockResolvedValue([row]) });
    const params = { ...scope, query: { include_deleted: false, limit: 2, offset: 3 } };
    expect(await new AnalysisSegmentCodesService(repo as never).listBySegment(params)).toEqual([row]);
    expect(repo.getSegmentById).toHaveBeenCalledWith({ projectId: 'project-P', segmentId: 'segment-S' });
    expect(repo.listBySegment).toHaveBeenCalledWith(params);
  });
  it.each(['list', 'create'])('missing/foreign segment returns null before %s effects', async method => {
    const repo = ready({ getSegmentById: jest.fn().mockResolvedValue(null) });
    const service = new AnalysisSegmentCodesService(repo as never);
    expect(await (method === 'list' ? service.listBySegment({ ...scope, query: { include_deleted: false, limit: 2, offset: 0 } }) : service.create({ ...scope, input: { code_id: 'code-C', is_quote: false } }))).toBeNull();
    expect(repo.listBySegment).not.toHaveBeenCalled(); expect(repo.codeExists).not.toHaveBeenCalled(); expect(repo.create).not.toHaveBeenCalled(); expect(repo.createEvent).not.toHaveBeenCalled();
  });
  it('rejects a missing/foreign code before duplicate lookup or insert', async () => {
    const repo = ready({ codeExists: jest.fn().mockResolvedValue(false) });
    await expect(new AnalysisSegmentCodesService(repo as never).create({ ...scope, input: { code_id: 'code-C', is_quote: false } })).rejects.toMatchObject({ status: 404, message: 'CODE_NOT_FOUND' });
    expect(repo.codeExists).toHaveBeenCalledWith({ projectId: 'project-P', codeId: 'code-C' });
    expect(repo.getBySegmentAndCode).not.toHaveBeenCalled(); expect(repo.create).not.toHaveBeenCalled(); expect(repo.createEvent).not.toHaveBeenCalled();
  });
  it('creates and audits the actual assignment identities', async () => {
    const repo = ready();
    const params = { ...scope, input: { code_id: 'code-C', is_quote: false } };
    expect(await new AnalysisSegmentCodesService(repo as never).create(params)).toEqual(row);
    expect(repo.getBySegmentAndCode).toHaveBeenCalledWith({ projectId: 'project-P', segmentId: 'segment-S', codeId: 'code-C' });
    expect(repo.create).toHaveBeenCalledWith(params);
    expect(repo.createEvent).toHaveBeenCalledWith({ projectId: 'project-P', segmentCodeId: 'assignment-A', eventType: 'segment_code_created', actorUserId: 'actor-U', payload: { segment_code_id: 'assignment-A', segment_id: 'segment-S', code_id: 'code-C', is_quote: false, quote_label: '', revision: 0 } });
  });
  it.each([null, { ...row, segment_id: 'other-segment' }])('does not update missing or mismatched assignment: %j', async current => {
    const repo = ready({ getById: jest.fn().mockResolvedValue(current) });
    expect(await new AnalysisSegmentCodesService(repo as never).update({ ...scope, input: { base_revision: 0, is_quote: true } })).toBeNull();
    expect(repo.update).not.toHaveBeenCalled(); expect(repo.createEvent).not.toHaveBeenCalled();
  });
  it.each(['stale', 'write-race'])('rejects %s revision without audit or retry', async kind => {
    const repo = ready(kind === 'stale' ? { getById: jest.fn().mockResolvedValue({ ...row, revision: 1 }) } : { update: jest.fn().mockResolvedValue(null) });
    await expect(new AnalysisSegmentCodesService(repo as never).update({ ...scope, input: { base_revision: 0, is_quote: true } })).rejects.toMatchObject({ status: 409, message: 'SEGMENT_CODE_REVISION_CONFLICT' });
    expect(repo.update).toHaveBeenCalledTimes(kind === 'stale' ? 0 : 1); expect(repo.createEvent).not.toHaveBeenCalled();
  });
  it('updates revision zero and audits note/quote changes only', async () => {
    const repo = ready();
    const params = { ...scope, input: { base_revision: 0, analytic_note: 'Note', is_quote: true, quote_label: 'Voice' } };
    expect(await new AnalysisSegmentCodesService(repo as never).update(params)).toEqual({ ...row, analytic_note: 'Note', is_quote: true, quote_label: 'Voice', revision: 1 });
    expect(repo.update).toHaveBeenCalledWith(params);
    expect(repo.createEvent).toHaveBeenCalledWith({ projectId: 'project-P', segmentCodeId: 'assignment-A', eventType: 'segment_code_updated', actorUserId: 'actor-U', payload: { segment_code_id: 'assignment-A', segment_id: 'segment-S', code_id: 'code-C', is_quote: true, quote_label: 'Voice', revision: 1, changed_fields: ['analytic_note', 'is_quote', 'quote_label'] } });
  });
  it.each([null, { ...row, deleted_at: '2026-02-03' }])('deletion emits event only for a returned assignment: %j', async deleted => {
    const repo = ready({ softDelete: jest.fn().mockResolvedValue(deleted) });
    expect(await new AnalysisSegmentCodesService(repo as never).softDelete(scope)).toEqual(deleted);
    expect(repo.softDelete).toHaveBeenCalledWith(scope);
    if (!deleted) expect(repo.createEvent).not.toHaveBeenCalled();
    else expect(repo.createEvent).toHaveBeenCalledWith({ projectId: 'project-P', segmentCodeId: 'assignment-A', eventType: 'segment_code_soft_deleted', actorUserId: 'actor-U', payload: { segment_code_id: 'assignment-A', segment_id: 'segment-S', code_id: 'code-C', is_quote: false, quote_label: '', revision: 0, deleted: true } });
  });
  it('translates a failed assignment write without retry or success audit', async () => {
    const repo = ready({ create: jest.fn().mockRejectedValue({ code: 'ETIMEDOUT', message: 'private' }) });
    await expect(new AnalysisSegmentCodesService(repo as never).create({ ...scope, input: { code_id: 'code-C', is_quote: false } })).rejects.toMatchObject({ status: 503, message: 'DEPENDENCY_UNAVAILABLE' });
    expect(repo.create).toHaveBeenCalledTimes(1); expect(repo.createEvent).not.toHaveBeenCalled();
  });
});
