import { AnalysisCodesRepo } from '@/src/modules/analysis/analysis-codes.repo';
import { createRecordedSupabase } from '@/__tests__/backend/recorded-supabase';

const row = { id: 'code-A', project_id: 'project-P', name: 'Café', description: '', definition: '', inclusion_criteria: '', exclusion_criteria: '', parent_code_id: null, color: '#0f766e', position: 0, is_active: true, metadata: {}, revision: 0, created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null, created_by: 'actor-U', updated_by: 'actor-U' };
function fixture(body: unknown, status = 200) {
  const db = createRecordedSupabase([{ status, body }]);
  return { db, repo: new AnalysisCodesRepo(db.client as never) };
}
const scope = { projectId: 'project-P', codeId: 'code-A', actorUserId: 'actor-U' };

describe('AnalysisCodesRepo recorded SDK contracts', () => {
  it.each([false, true])('lists ordered children with pagination and include_deleted=%s', async include_deleted => {
    const { db, repo } = fixture([row]);
    try {
      expect(await repo.listByProject('project-P', { limit: 3, offset: 7, include_deleted, parent_code_id: 'parent-B' })).toEqual([row]);
      const query = db.requests[0].url.searchParams;
      expect(db.requests[0].url.pathname).toBe('/rest/v1/project_codes');
      expect(query.get('project_id')).toBe('eq.project-P');
      expect(query.get('parent_code_id')).toBe('eq.parent-B');
      expect(query.get('order')).toBe('position.asc,name.asc');
      expect(query.get('offset')).toBe('7'); expect(query.get('limit')).toBe('3');
      expect(query.get('deleted_at')).toBe(include_deleted ? null : 'is.null');
    } finally { db.assertDrained(); }
  });
  it('encodes hostile Unicode search as RPC data, never as filter syntax', async () => {
    const { db, repo } = fixture([row]);
    try {
      expect(await repo.listByProject('project-P', { search: 'Café,%', limit: 2, offset: 4, include_deleted: true })).toEqual([row]);
      expect(db.requests[0].url.pathname).toBe('/rest/v1/rpc/search_project_codes_safe');
      expect(db.requests[0].body).toEqual({ p_project_id: 'project-P', p_search_b64: 'Q2Fmw6ksJQ==', p_include_deleted: true, p_parent_code_id: null, p_limit: 2, p_offset: 4 });
    } finally { db.assertDrained(); }
  });
  it('uses safe duplicate-name lookup with excluded ID', async () => {
    const { db, repo } = fixture(row);
    try {
      expect(await repo.getActiveByName({ projectId: 'project-P', name: 'Café', excludeCodeId: 'code-A' })).toEqual(row);
      expect(db.requests[0].body).toEqual({ p_project_id: 'project-P', p_name_b64: 'Q2Fmw6k=', p_exclude_code_id: 'code-A' });
    } finally { db.assertDrained(); }
  });
  it.each([false, true])('gets child only inside project scope (includeDeleted=%s)', async includeDeleted => {
    const { db, repo } = fixture(null);
    try {
      expect(await repo.getById({ ...scope, includeDeleted })).toBeNull();
      expect(db.requests[0].url.searchParams.get('id')).toBe('eq.code-A');
      expect(db.requests[0].url.searchParams.get('project_id')).toBe('eq.project-P');
      expect(db.requests[0].url.searchParams.get('deleted_at')).toBe(includeDeleted ? null : 'is.null');
    } finally { db.assertDrained(); }
  });
  it('creates via encoded RPC with literal default payload', async () => {
    const { db, repo } = fixture(row);
    try {
      expect(await repo.create({ projectId: 'project-P', actorUserId: 'actor-U', input: { name: 'Café' } })).toEqual(row);
      expect(db.requests[0].body).toEqual({ p_project_id: 'project-P', p_name_b64: 'Q2Fmw6k=', p_description_b64: '', p_definition_b64: '', p_inclusion_b64: '', p_exclusion_b64: '', p_parent_code_id: null, p_color: '#0f766e', p_position: 0, p_metadata: {} });
    } finally { db.assertDrained(); }
  });
  it('updates all editable fields without writing base_revision, guarded by revision zero', async () => {
    const { db, repo } = fixture(row);
    const input = { base_revision: 0, name: 'Renamed', description: null, definition: 'Def', inclusion_criteria: 'In', exclusion_criteria: 'Out', parent_code_id: null, color: '#fff', position: 2, is_active: false, metadata: { x: 1 } };
    try {
      expect(await repo.update({ ...scope, input })).toEqual(row);
      expect(db.requests[0].method).toBe('PATCH');
      expect(db.requests[0].body).toEqual({ name: 'Renamed', description: null, definition: 'Def', inclusion_criteria: 'In', exclusion_criteria: 'Out', parent_code_id: null, color: '#fff', position: 2, is_active: false, metadata: { x: 1 }, updated_by: 'actor-U' });
      expect(Object.fromEntries(db.requests[0].url.searchParams)).toMatchObject({ project_id: 'eq.project-P', id: 'eq.code-A', revision: 'eq.0', deleted_at: 'is.null' });
    } finally { db.assertDrained(); }
  });
  it('soft deletes with scoped predicate and audit actor', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-03T00:00:00Z'));
    const { db, repo } = fixture({ ...row, deleted_at: '2026-02-03T00:00:00.000Z' });
    try {
      expect(await repo.softDelete(scope)).toMatchObject({ id: 'code-A', deleted_at: '2026-02-03T00:00:00.000Z' });
      expect(db.requests[0].body).toEqual({ deleted_at: '2026-02-03T00:00:00.000Z', updated_by: 'actor-U' });
      expect(Object.fromEntries(db.requests[0].url.searchParams)).toMatchObject({ project_id: 'eq.project-P', id: 'eq.code-A', deleted_at: 'is.null' });
    } finally { db.assertDrained(); jest.useRealTimers(); }
  });
  it('counts both active deletion blockers with project predicates', async () => {
    const db = createRecordedSupabase([{ status: 200, body: null, headers: { 'content-range': '0-1/2' } }, { status: 200, body: null, headers: { 'content-range': '0-2/3' } }]);
    try {
      expect(await new AnalysisCodesRepo(db.client as never).getDeletionBlockers(scope)).toEqual({ activeChildren: 2, activeAssignments: 3 });
      expect(db.requests.map(r => r.method)).toEqual(['HEAD', 'HEAD']);
      expect(Object.fromEntries(db.requests[0].url.searchParams)).toEqual({ select: 'id', project_id: 'eq.project-P', parent_code_id: 'eq.code-A', deleted_at: 'is.null' });
      expect(Object.fromEntries(db.requests[1].url.searchParams)).toEqual({ select: 'id', project_id: 'eq.project-P', code_id: 'eq.code-A', deleted_at: 'is.null' });
    } finally { db.assertDrained(); }
  });
  it('writes default audit entity and payload', async () => {
    const { db, repo } = fixture(null, 201);
    try {
      await repo.createEvent({ projectId: 'project-P', actorUserId: 'actor-U', eventType: 'code_created' });
      expect(db.requests[0].body).toEqual({ project_id: 'project-P', entity_type: 'code', entity_id: null, event_type: 'code_created', event_payload: {}, created_by: 'actor-U' });
    } finally { db.assertDrained(); }
  });
  it('treats null search/list/name and raced write results as empty or missing', async () => {
    const db = createRecordedSupabase(Array.from({ length: 5 }, () => ({ status: 200, body: null })));
    const repo = new AnalysisCodesRepo(db.client as never);
    try {
      expect(await repo.listByProject('project-P', { limit: 2, offset: 0, include_deleted: false })).toEqual([]);
      expect(await repo.listByProject('project-P', { search: 'x', limit: 2, offset: 0, include_deleted: false, parent_code_id: 'parent-B' })).toEqual([]);
      expect(await repo.getActiveByName({ projectId: 'project-P', name: 'x' })).toBeNull();
      expect(await repo.update({ ...scope, input: { base_revision: 0, name: 'x' } })).toBeNull();
      expect(await repo.softDelete(scope)).toBeNull();
      expect(db.requests[1].body).toEqual({ p_project_id: 'project-P', p_search_b64: 'eA==', p_include_deleted: false, p_parent_code_id: 'parent-B', p_limit: 2, p_offset: 0 });
      expect(db.requests[2].body).toEqual({ p_project_id: 'project-P', p_name_b64: 'eA==', p_exclude_code_id: null });
    } finally { db.assertDrained(); }
  });
  it.each([0, 1])('propagates blocker response error at query %s without writes', async failed => {
    const db = createRecordedSupabase([0, 1].map(index => ({ status: index === failed ? 403 : 200, body: index === failed ? { code: '42501', message: 'denied' } : null })));
    try {
      // HEAD carries no JSON error body: the installed SDK exposes its empty-message error.
      await expect(new AnalysisCodesRepo(db.client as never).getDeletionBlockers(scope)).rejects.toEqual({ message: '' });
      expect(db.requests.map(r => r.method)).toEqual(['HEAD', 'HEAD']);
    } finally { db.assertDrained(); }
  });
  it('defaults absent blocker counts to zero', async () => {
    const db = createRecordedSupabase([{ status: 200, body: null }, { status: 200, body: null }]);
    try { expect(await new AnalysisCodesRepo(db.client as never).getDeletionBlockers(scope)).toEqual({ activeChildren: 0, activeAssignments: 0 }); }
    finally { db.assertDrained(); }
  });
  it.each(['list', 'get', 'name', 'create', 'update', 'delete', 'event'])('propagates response errors without retry: %s', async method => {
    const { db, repo } = fixture({ code: '42501', message: 'denied', details: null, hint: null }, 403);
    try {
      const operations: Record<string, () => Promise<unknown>> = { list: () => repo.listByProject('project-P', { limit: 1, offset: 0, include_deleted: false }), get: () => repo.getById(scope), name: () => repo.getActiveByName({ projectId: 'project-P', name: 'n' }), create: () => repo.create({ ...scope, input: { name: 'n' } }), update: () => repo.update({ ...scope, input: { base_revision: 0, name: 'n' } }), delete: () => repo.softDelete(scope), event: () => repo.createEvent({ ...scope, eventType: 'code_updated' }) };
      await expect(operations[method]()).rejects.toMatchObject({ code: '42501' });
      expect(db.requests).toHaveLength(1);
    } finally { db.assertDrained(); }
  });
});
