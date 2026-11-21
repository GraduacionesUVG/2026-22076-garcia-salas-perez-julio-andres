import { AnalysisSegmentCodesRepo } from '@/src/modules/analysis/analysis-segment-codes.repo';
import { createRecordedSupabase } from '@/__tests__/backend/recorded-supabase';

const row = { id: 'assignment-A', project_id: 'project-P', segment_id: 'segment-S', code_id: 'code-C', analytic_note: 'Note', is_quote: true, quote_label: 'Voice', metadata: { source: 'local' }, revision: 0, created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null, created_by: 'actor-U', updated_by: 'actor-U' };
const scope = { projectId: 'project-P', segmentId: 'segment-S', segmentCodeId: 'assignment-A', actorUserId: 'actor-U' };
function fixture(body: unknown, status = 200) {
  const db = createRecordedSupabase([{ status, body }]);
  return { db, repo: new AnalysisSegmentCodesRepo(db.client as never) };
}
describe('AnalysisSegmentCodesRepo recorded SDK contracts', () => {
  it.each([false, true])('lists filtered assignments with include_deleted=%s', async include_deleted => {
    const { db, repo } = fixture([row]);
    try {
      expect(await repo.listBySegment({ ...scope, query: { code_id: 'code-C', include_deleted, limit: 4, offset: 9 } })).toEqual([row]);
      expect(Object.fromEntries(db.requests[0].url.searchParams)).toMatchObject({ project_id: 'eq.project-P', segment_id: 'eq.segment-S', code_id: 'eq.code-C', order: 'created_at.desc,id.desc', offset: '9', limit: '4' });
      expect(db.requests[0].url.searchParams.get('deleted_at')).toBe(include_deleted ? null : 'is.null');
    } finally { db.assertDrained(); }
  });
  it.each([false, true])('gets segment and assignment only in project scope (includeDeleted=%s)', async includeDeleted => {
    const db = createRecordedSupabase([{ status: 200, body: { id: 'segment-S', project_id: 'project-P', deleted_at: null } }, { status: 200, body: row }]);
    const repo = new AnalysisSegmentCodesRepo(db.client as never);
    try {
      expect(await repo.getSegmentById({ ...scope, includeDeleted })).toEqual({ id: 'segment-S', project_id: 'project-P', deleted_at: null });
      expect(await repo.getById({ ...scope, includeDeleted })).toEqual(row);
      expect(db.requests.map(r => r.url.searchParams.get('id'))).toEqual(['eq.segment-S', 'eq.assignment-A']);
      for (const request of db.requests) {
        expect(request.url.searchParams.get('project_id')).toBe('eq.project-P');
        expect(request.url.searchParams.get('deleted_at')).toBe(includeDeleted ? null : 'is.null');
      }
    } finally { db.assertDrained(); }
  });
  it.each([null, { id: 'code-C' }])('checks active code existence without losing project scope: %j', async body => {
    const { db, repo } = fixture(body);
    try {
      expect(await repo.codeExists({ projectId: 'project-P', codeId: 'code-C' })).toBe(body !== null);
      expect(Object.fromEntries(db.requests[0].url.searchParams)).toEqual({ select: 'id', project_id: 'eq.project-P', id: 'eq.code-C', deleted_at: 'is.null' });
    } finally { db.assertDrained(); }
  });
  it('queries duplicates by all three identity predicates', async () => {
    const { db, repo } = fixture(row);
    try {
      expect(await repo.getBySegmentAndCode({ ...scope, codeId: 'code-C' })).toEqual(row);
      expect(Object.fromEntries(db.requests[0].url.searchParams)).toMatchObject({ project_id: 'eq.project-P', segment_id: 'eq.segment-S', code_id: 'eq.code-C', deleted_at: 'is.null' });
    } finally { db.assertDrained(); }
  });
  it('inserts literal defaults and actor instead of undefined fields', async () => {
    const { db, repo } = fixture(row, 201);
    try {
      expect(await repo.create({ ...scope, input: { code_id: 'code-C', is_quote: false } })).toEqual(row);
      expect(db.requests[0].body).toEqual({ project_id: 'project-P', segment_id: 'segment-S', code_id: 'code-C', analytic_note: '', is_quote: false, quote_label: '', metadata: {}, created_by: 'actor-U', updated_by: 'actor-U' });
      expect(db.requests[0].method).toBe('POST');
    } finally { db.assertDrained(); }
  });
  it('patches quote and note guarded by project, segment, assignment and revision zero', async () => {
    const { db, repo } = fixture(row);
    try {
      expect(await repo.update({ ...scope, input: { base_revision: 0, analytic_note: 'Note', is_quote: true, quote_label: 'Voice', metadata: { source: 'local' } } })).toEqual(row);
      expect(db.requests[0].body).toEqual({ analytic_note: 'Note', is_quote: true, quote_label: 'Voice', metadata: { source: 'local' }, updated_by: 'actor-U' });
      expect(Object.fromEntries(db.requests[0].url.searchParams)).toMatchObject({ project_id: 'eq.project-P', segment_id: 'eq.segment-S', id: 'eq.assignment-A', revision: 'eq.0', deleted_at: 'is.null' });
    } finally { db.assertDrained(); }
  });
  it('deletes only matching active assignment and retains audit actor', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-03T00:00:00Z'));
    const { db, repo } = fixture({ ...row, deleted_at: '2026-02-03T00:00:00.000Z' });
    try {
      expect(await repo.softDelete(scope)).toMatchObject({ id: 'assignment-A', deleted_at: '2026-02-03T00:00:00.000Z' });
      expect(db.requests[0].body).toEqual({ deleted_at: '2026-02-03T00:00:00.000Z', updated_by: 'actor-U' });
      expect(Object.fromEntries(db.requests[0].url.searchParams)).toMatchObject({ project_id: 'eq.project-P', segment_id: 'eq.segment-S', id: 'eq.assignment-A', deleted_at: 'is.null' });
    } finally { db.assertDrained(); jest.useRealTimers(); }
  });
  it('records assignment event payload without rewriting it', async () => {
    const { db, repo } = fixture(null, 201);
    try {
      await repo.createEvent({ ...scope, eventType: 'segment_code_updated', payload: { changed_fields: ['analytic_note'] } });
      expect(db.requests[0].body).toEqual({ project_id: 'project-P', entity_type: 'segment_code', entity_id: 'assignment-A', event_type: 'segment_code_updated', event_payload: { changed_fields: ['analytic_note'] }, created_by: 'actor-U' });
    } finally { db.assertDrained(); }
  });
  it('maps null child/list/write responses without inventing rows', async () => {
    const db = createRecordedSupabase(Array.from({ length: 6 }, () => ({ status: 200, body: null })));
    const repo = new AnalysisSegmentCodesRepo(db.client as never);
    try {
      expect(await repo.getSegmentById(scope)).toBeNull();
      expect(await repo.listBySegment({ ...scope, query: { limit: 2, offset: 0, include_deleted: false } })).toEqual([]);
      expect(await repo.getById(scope)).toBeNull();
      expect(await repo.getBySegmentAndCode({ ...scope, codeId: 'code-C' })).toBeNull();
      expect(await repo.update({ ...scope, input: { base_revision: 0, is_quote: false } })).toBeNull();
      expect(await repo.softDelete(scope)).toBeNull();
      expect(db.requests[1].url.searchParams.has('code_id')).toBe(false);
      expect(db.requests[4].body).toEqual({ is_quote: false, updated_by: 'actor-U' });
    } finally { db.assertDrained(); }
  });
  it('redacts recognized provider failure on writes and does not retry', async () => {
    const { db, repo } = fixture({ message: 'private gateway detail' }, 502);
    try {
      await expect(repo.create({ ...scope, input: { code_id: 'code-C', is_quote: false } })).rejects.toMatchObject({ status: 503, message: 'DEPENDENCY_UNAVAILABLE' });
      expect(db.requests).toHaveLength(1);
    } finally { db.assertDrained(); }
  });
  it.each(['segment', 'code', 'list', 'get', 'duplicate', 'create', 'update', 'delete', 'event'])('propagates SDK response error without retry: %s', async method => {
    const { db, repo } = fixture({ code: '42501', message: 'private denied', details: null, hint: null }, 403);
    try {
      const operations: Record<string, () => Promise<unknown>> = { segment: () => repo.getSegmentById(scope), code: () => repo.codeExists({ projectId: 'project-P', codeId: 'code-C' }), list: () => repo.listBySegment({ ...scope, query: { limit: 1, offset: 0, include_deleted: false } }), get: () => repo.getById(scope), duplicate: () => repo.getBySegmentAndCode({ ...scope, codeId: 'code-C' }), create: () => repo.create({ ...scope, input: { code_id: 'code-C', is_quote: false } }), update: () => repo.update({ ...scope, input: { base_revision: 0, is_quote: false } }), delete: () => repo.softDelete(scope), event: () => repo.createEvent({ ...scope, eventType: 'segment_code_updated' }) };
      await expect(operations[method]()).rejects.toMatchObject({ status: 403, code: '42501', message: 'private denied' });
      expect(db.requests).toHaveLength(1);
    } finally { db.assertDrained(); }
  });
});
