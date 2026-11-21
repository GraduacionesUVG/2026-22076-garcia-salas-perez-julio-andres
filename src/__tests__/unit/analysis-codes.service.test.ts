import { AnalysisCodesService } from "@/src/modules/analysis/analysis-codes.service";

function makeCode(overrides: Record<string, unknown> = {}) {
  return {
    id: "code-1",
    project_id: "project-1",
    name: "Codigo base",
    description: null,
    definition: null,
    inclusion_criteria: null,
    exclusion_criteria: null,
    parent_code_id: null,
    color: "#0f766e",
    position: 0,
    is_active: true,
    metadata: {},
    revision: 1,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_by: 'user-1',
    updated_by: 'user-1',
    ...overrides,
  };
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    getById: jest.fn().mockImplementation(async ({ codeId }) => {
      if (codeId === "code-1") return makeCode({ id: "code-1" });
      if (codeId === "child-1") {
        return makeCode({
          id: "child-1",
          name: "Codigo hijo",
          parent_code_id: "code-1",
        });
      }
      return null;
    }),
    getActiveByName: jest.fn().mockResolvedValue(null),
    listByProject: jest.fn().mockResolvedValue([
      makeCode({ id: "code-1", parent_code_id: null }),
      makeCode({ id: "child-1", parent_code_id: "code-1" }),
    ]),
    update: jest.fn().mockResolvedValue(makeCode({ parent_code_id: "child-1" })),
    getDeletionBlockers: jest.fn().mockResolvedValue({
      activeChildren: 0,
      activeAssignments: 0,
    }),
    softDelete: jest.fn().mockResolvedValue(makeCode({ deleted_at: "2026-01-02T00:00:00.000Z" })),
    createEvent: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(makeCode()),
    ...overrides,
  };
}

describe("AnalysisCodesService", () => {
  it("rejects moving a code under one of its descendants", async () => {
    const repo = makeRepo();
    const service = new AnalysisCodesService(repo as never);

    await expect(
      service.update({
        projectId: "project-1",
        codeId: "code-1",
        actorUserId: "user-1",
        input: {
          name: "Codigo base",
          parent_code_id: "child-1",
          position: 0,
          base_revision: 1,
        },
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "CODE_PARENT_CYCLE",
    });

    expect(repo.update).not.toHaveBeenCalled();
  });

  it("allows moving a code to root when revision is current", async () => {
    const repo = makeRepo({
      getById: jest.fn().mockResolvedValue(makeCode({ parent_code_id: "child-1" })),
      update: jest.fn().mockResolvedValue(makeCode({ parent_code_id: null })),
    });
    const service = new AnalysisCodesService(repo as never);

    const updated = await service.update({
      projectId: "project-1",
      codeId: "code-1",
      actorUserId: "user-1",
      input: {
        parent_code_id: null,
        position: 0,
        base_revision: 1,
      },
    });

    expect(repo.listByProject).not.toHaveBeenCalled();
    expect(updated?.parent_code_id).toBeNull();
  });

  it.each([
    [{ activeChildren: 1, activeAssignments: 0 }, "CODE_HAS_ACTIVE_CHILDREN"],
    [{ activeChildren: 0, activeAssignments: 1 }, "CODE_HAS_ACTIVE_ASSIGNMENTS"],
  ])("rejects deletion when active code dependencies remain", async (blockers, message) => {
    const repo = makeRepo({
      getDeletionBlockers: jest.fn().mockResolvedValue(blockers),
    });
    const service = new AnalysisCodesService(repo as never);

    await expect(
      service.softDelete({
        projectId: "project-1",
        codeId: "code-1",
        actorUserId: "user-1",
      })
    ).rejects.toMatchObject({ status: 409, message });
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});

describe('AnalysisCodesService missing mutation contracts', () => {
  const scope = { projectId: 'project-1', codeId: 'code-1', actorUserId: 'user-1' };
  it('returns the project list and scoped detail repository outcomes', async () => {
    const repo = makeRepo();
    const service = new AnalysisCodesService(repo as never);
    const query = { include_deleted: true, limit: 3, offset: 7, search: 'Community' };
    expect(await service.listByProject('project-1', query)).toEqual([makeCode({ id: 'code-1', parent_code_id: null }), makeCode({ id: 'child-1', parent_code_id: 'code-1' })]);
    expect(repo.listByProject).toHaveBeenCalledWith('project-1', query);
    expect(await service.getById({ projectId: 'project-1', codeId: 'code-1' })).toEqual(makeCode());
    expect(repo.getById).toHaveBeenCalledWith({ projectId: 'project-1', codeId: 'code-1' });
  });
  it('permits an unrelated parent while terminating traversal through existing cycles', async () => {
    const repo = makeRepo({
      getById: jest.fn().mockImplementation(async ({ codeId }) => makeCode({ id: codeId })),
      listByProject: jest.fn().mockResolvedValue([makeCode({ id: 'child-1', parent_code_id: 'code-1' }), makeCode({ id: 'grandchild', parent_code_id: 'child-1' }), makeCode({ id: 'child-1', parent_code_id: 'grandchild' })]),
      update: jest.fn().mockResolvedValue(makeCode({ parent_code_id: 'unrelated-parent' })),
    });
    const params = { ...scope, input: { base_revision: 1, parent_code_id: 'unrelated-parent' } };
    expect(await new AnalysisCodesService(repo as never).update(params)).toEqual(makeCode({ parent_code_id: 'unrelated-parent' }));
    expect(repo.listByProject).toHaveBeenCalledWith('project-1', { limit: 1000, offset: 0, include_deleted: false });
    expect(repo.update).toHaveBeenCalledWith(params);
    expect(repo.createEvent).toHaveBeenCalledTimes(1);
  });
  it('creates a child with project-scoped parent lookup and normalized event', async () => {
    const repo = makeRepo();
    const params = { projectId: 'project-1', actorUserId: 'user-1', input: { name: 'New', parent_code_id: 'child-1' } };
    expect(await new AnalysisCodesService(repo as never).create(params)).toEqual(makeCode());
    expect(repo.getById).toHaveBeenCalledWith({ projectId: 'project-1', codeId: 'child-1' });
    expect(repo.create).toHaveBeenCalledWith(params);
    expect(repo.createEvent).toHaveBeenCalledWith({ projectId: 'project-1', codeId: 'code-1', eventType: 'code_created', actorUserId: 'user-1', payload: { code_id: 'code-1', name: 'Codigo base', parent_code_id: null, color: '#0f766e', position: 0, is_active: true, revision: 1 } });
  });
  it.each([['duplicate', 'CODE_ALREADY_EXISTS', 409], ['missing parent', 'CODE_NOT_FOUND', 404]])('rejects create with %s before mutation/audit', async (kind, message, status) => {
    const repo = makeRepo(kind === 'duplicate' ? { getActiveByName: jest.fn().mockResolvedValue(makeCode()) } : { getById: jest.fn().mockResolvedValue(null) });
    await expect(new AnalysisCodesService(repo as never).create({ projectId: 'project-1', actorUserId: 'user-1', input: { name: 'New', parent_code_id: 'foreign-parent' } })).rejects.toMatchObject({ message, status });
    expect(repo.create).not.toHaveBeenCalled(); expect(repo.createEvent).not.toHaveBeenCalled();
  });
  it.each(['self', 'missing', 'stale', 'duplicate', 'write-race'])('rejects %s update without success audit', async kind => {
    const repo = makeRepo({ update: jest.fn().mockResolvedValue(null) });
    if (kind === 'stale') repo.getById.mockResolvedValue(makeCode({ revision: 2 }));
    if (kind === 'duplicate') repo.getActiveByName.mockResolvedValue(makeCode({ id: 'other-code' }));
    const input = { base_revision: 1, ...(kind === 'self' ? { parent_code_id: 'code-1' } : kind === 'missing' ? { parent_code_id: 'foreign-parent' } : { name: 'New' }) };
    await expect(new AnalysisCodesService(repo as never).update({ ...scope, input })).rejects.toMatchObject({ status: kind === 'self' || kind === 'missing' ? 404 : 409, message: kind === 'self' || kind === 'missing' ? 'CODE_NOT_FOUND' : kind === 'duplicate' ? 'CODE_ALREADY_EXISTS' : 'CODE_REVISION_CONFLICT' });
    expect(repo.update).toHaveBeenCalledTimes(kind === 'write-race' ? 1 : 0);
    expect(repo.createEvent).not.toHaveBeenCalled();
  });
  it('updates revision zero and audits only changed fields', async () => {
    const repo = makeRepo({ getById: jest.fn().mockResolvedValue(makeCode({ revision: 0 })), update: jest.fn().mockResolvedValue(makeCode({ revision: 1, name: 'New', metadata: { a: 1 } })) });
    const params = { ...scope, input: { base_revision: 0, name: 'New', metadata: { a: 1 } } };
    expect(await new AnalysisCodesService(repo as never).update(params)).toEqual(makeCode({ name: 'New', metadata: { a: 1 } }));
    expect(repo.update).toHaveBeenCalledWith(params);
    expect(repo.createEvent).toHaveBeenCalledWith({ projectId: 'project-1', codeId: 'code-1', eventType: 'code_updated', actorUserId: 'user-1', payload: { code_id: 'code-1', name: 'New', parent_code_id: null, color: '#0f766e', position: 0, is_active: true, revision: 1, changed_fields: ['name', 'metadata'] } });
  });
  it.each(['update', 'softDelete'])('returns missing %s without audit', async method => {
    const repo = makeRepo({ getById: jest.fn().mockResolvedValue(null), softDelete: jest.fn().mockResolvedValue(null) });
    const service = new AnalysisCodesService(repo as never);
    expect(await (method === 'update' ? service.update({ ...scope, input: { base_revision: 0, name: 'New' } }) : service.softDelete(scope))).toBeNull();
    expect(repo.createEvent).not.toHaveBeenCalled();
  });
  it('audits successful deletion once', async () => {
    const repo = makeRepo();
    expect(await new AnalysisCodesService(repo as never).softDelete(scope)).toEqual(makeCode({ deleted_at: '2026-01-02T00:00:00.000Z' }));
    expect(repo.softDelete).toHaveBeenCalledWith(scope);
    expect(repo.createEvent).toHaveBeenCalledWith({ projectId: 'project-1', codeId: 'code-1', eventType: 'code_soft_deleted', actorUserId: 'user-1', payload: { code_id: 'code-1', name: 'Codigo base', parent_code_id: null, color: '#0f766e', position: 0, is_active: true, revision: 1, deleted: true } });
  });
  it('propagates failed write without retry or event', async () => {
    const failure = new Error('write failed');
    const repo = makeRepo({ create: jest.fn().mockRejectedValue(failure) });
    await expect(new AnalysisCodesService(repo as never).create({ projectId: 'project-1', actorUserId: 'user-1', input: { name: 'New' } })).rejects.toBe(failure);
    expect(repo.create).toHaveBeenCalledTimes(1); expect(repo.createEvent).not.toHaveBeenCalled();
  });
});
