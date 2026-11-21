import * as codes from '@/app/api/projects/[id]/analysis/codes/route';
import * as code from '@/app/api/projects/[id]/analysis/codes/[codeId]/route';
import * as assignments from '@/app/api/projects/[id]/analysis/segments/[segmentId]/codes/route';
import * as assignment from '@/app/api/projects/[id]/analysis/segments/[segmentId]/codes/[segmentCodeId]/route';
import { AnalysisCodesService } from '@/src/modules/analysis/analysis-codes.service';
import { AnalysisSegmentCodesService } from '@/src/modules/analysis/analysis-segment-codes.service';
import { requireProjectRole } from '@/src/modules/projects/project.guard';

jest.mock('@/src/modules/projects/project.guard', () => ({ requireProjectRole: jest.fn() }));
const guard = jest.mocked(requireProjectRole);
const P = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const S = '33333333-3333-4333-8333-333333333333';
const A = '44444444-4444-4444-8444-444444444444';
const U = '55555555-5555-4555-8555-555555555555';
const codeRow = { id: C, project_id: P, name: 'Community', description: '', definition: '', inclusion_criteria: '', exclusion_criteria: '', parent_code_id: null, color: '#0f766e', position: 0, is_active: true, metadata: {}, revision: 1, created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null, created_by: U, updated_by: U };
const assignmentRow = { id: A, project_id: P, segment_id: S, code_id: C, analytic_note: 'Note', is_quote: true, quote_label: 'Voice', metadata: {}, revision: 1, created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null, created_by: U, updated_by: U };
type Handler = (request: Request, ctx: { params: Promise<{ id: string; codeId: string; segmentId: string; segmentCodeId: string }> }) => Promise<Response>;
const cases = [
  { name: 'code list', handler: codes.GET, method: 'GET', key: 'codes', result: [codeRow], service: 'listByProject', family: 'codes', body: undefined, expected: [P, { include_deleted: false, limit: 100, offset: 0 }] },
  { name: 'code create', handler: codes.POST, method: 'POST', key: 'code', result: codeRow, service: 'create', family: 'codes', body: { name: ' Community ', position: '2', parent_code_id: null, metadata: { x: 1 } }, expected: [{ projectId: P, actorUserId: U, input: { name: 'Community', color: '#0f766e', position: 2, parent_code_id: null, metadata: { x: 1 } } }] },
  { name: 'code detail', handler: code.GET, method: 'GET', key: 'code', result: codeRow, service: 'getById', family: 'codes', body: undefined, expected: [{ projectId: P, codeId: C }] },
  { name: 'code patch', handler: code.PATCH, method: 'PATCH', key: 'code', result: codeRow, service: 'update', family: 'codes', body: { base_revision: '0', name: ' Community ', parent_code_id: null }, expected: [{ projectId: P, codeId: C, actorUserId: U, input: { base_revision: 0, name: 'Community', parent_code_id: null } }] },
  { name: 'code delete', handler: code.DELETE, method: 'DELETE', key: 'code', result: codeRow, service: 'softDelete', family: 'codes', body: undefined, expected: [{ projectId: P, codeId: C, actorUserId: U }] },
  { name: 'assignment list', handler: assignments.GET, method: 'GET', key: 'segment_codes', result: [assignmentRow], service: 'listBySegment', family: 'assignments', body: undefined, expected: [{ projectId: P, segmentId: S, query: { include_deleted: false, limit: 100, offset: 0 } }] },
  { name: 'assignment create', handler: assignments.POST, method: 'POST', key: 'segment_code', result: assignmentRow, service: 'create', family: 'assignments', body: { code_id: C, analytic_note: ' Note ', quote_label: ' Voice ' }, expected: [{ projectId: P, segmentId: S, actorUserId: U, input: { code_id: C, analytic_note: 'Note', quote_label: 'Voice', is_quote: false } }] },
  { name: 'assignment patch', handler: assignment.PATCH, method: 'PATCH', key: 'segment_code', result: assignmentRow, service: 'update', family: 'assignments', body: { base_revision: '0', analytic_note: ' Note ', is_quote: true, quote_label: ' Voice ' }, expected: [{ projectId: P, segmentId: S, segmentCodeId: A, actorUserId: U, input: { base_revision: 0, analytic_note: 'Note', is_quote: true, quote_label: 'Voice' } }] },
  { name: 'assignment delete', handler: assignment.DELETE, method: 'DELETE', key: 'segment_code', result: assignmentRow, service: 'softDelete', family: 'assignments', body: undefined, expected: [{ projectId: P, segmentId: S, segmentCodeId: A, actorUserId: U }] },
] as const;
function context(overrides: Record<string, string> = {}) { return { params: Promise.resolve({ id: P, codeId: C, segmentId: S, segmentCodeId: A, ...overrides }) }; }
function request(method: string, body?: unknown, query = '') { return new Request(`https://local.invalid/api?${query}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
function serviceSpy(testCase: typeof cases[number]) {
  // Only the service boundary is replaced; route schemas, validation order and exported handlers are real.
  if (testCase.family === 'codes') {
    switch (testCase.service) {
      case 'listByProject': return jest.spyOn(AnalysisCodesService.prototype, 'listByProject').mockResolvedValue([codeRow]);
      case 'getById': return jest.spyOn(AnalysisCodesService.prototype, 'getById').mockResolvedValue(codeRow);
      case 'create': return jest.spyOn(AnalysisCodesService.prototype, 'create').mockResolvedValue(codeRow);
      case 'update': return jest.spyOn(AnalysisCodesService.prototype, 'update').mockResolvedValue(codeRow);
      case 'softDelete': return jest.spyOn(AnalysisCodesService.prototype, 'softDelete').mockResolvedValue(codeRow);
    }
  }
  switch (testCase.service) {
    case 'listBySegment': return jest.spyOn(AnalysisSegmentCodesService.prototype, 'listBySegment').mockResolvedValue([assignmentRow]);
    case 'create': return jest.spyOn(AnalysisSegmentCodesService.prototype, 'create').mockResolvedValue(assignmentRow);
    case 'update': return jest.spyOn(AnalysisSegmentCodesService.prototype, 'update').mockResolvedValue(assignmentRow);
    case 'softDelete': return jest.spyOn(AnalysisSegmentCodesService.prototype, 'softDelete').mockResolvedValue(assignmentRow);
  }
}
beforeEach(() => { guard.mockResolvedValue({ supabase: {}, user: { id: U }, role: 'editor' } as never); });
afterEach(() => { jest.restoreAllMocks(); });

describe('analysis codebook exported handler contracts (stats excluded)', () => {
  it.each(cases)('$name returns actual row(s), parsed arguments and exact role policy', async testCase => {
    const spy = serviceSpy(testCase);
    const response = await (testCase.handler as Handler)(request(testCase.method, testCase.body), context());
    expect(response.status).toBe(testCase.method === 'POST' ? 201 : 200);
    expect(await response.json()).toEqual({ ok: true, [testCase.key]: testCase.result });
    expect(spy.mock.calls).toEqual([testCase.expected]);
    expect(guard.mock.calls).toEqual([[P, testCase.method === 'GET' ? ['owner', 'editor', 'viewer'] : ['owner', 'editor']]]);
  });
  it.each(cases)('$name rejects invalid project before authorization or service', async testCase => {
    const spy = serviceSpy(testCase);
    const response = await (testCase.handler as Handler)(request(testCase.method, testCase.body), context({ id: 'bad' }));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: 'INVALID_PROJECT_ID' });
    expect(guard).not.toHaveBeenCalled(); expect(spy).not.toHaveBeenCalled();
  });
  for (const status of [401, 403]) {
    it.each(cases)(`$name preserves authorization denial ${status} with no service call`, async testCase => {
      const spy = serviceSpy(testCase);
      guard.mockRejectedValue({ status, message: status === 401 ? 'Unauthorized' : 'Forbidden' });
      const response = await (testCase.handler as Handler)(request(testCase.method, testCase.body), context());
      expect(response.status).toBe(status); expect(await response.json()).toEqual({ ok: false, error: status === 401 ? 'Unauthorized' : 'Forbidden' });
      expect(spy).not.toHaveBeenCalled();
    });
  }
  it.each(cases)('$name masks dependency diagnostics as server error', async testCase => {
    const spy = serviceSpy(testCase).mockRejectedValue({ status: 502, message: 'private provider detail' });
    const response = await (testCase.handler as Handler)(request(testCase.method, testCase.body), context());
    // Code routes mask explicit 5xx; assignment routes normalize recognized provider failures.
    expect(response.status).toBe(testCase.family === 'codes' ? 502 : 503);
    expect(await response.json()).toEqual({ ok: false, error: testCase.family === 'codes' ? 'Server error' : 'DEPENDENCY_UNAVAILABLE' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it.each(cases.filter(c => !['code list', 'code create'].includes(c.name)))('$name maps missing service child to 404', async testCase => {
    serviceSpy(testCase).mockResolvedValue(null as never);
    const response = await (testCase.handler as Handler)(request(testCase.method, testCase.body), context());
    expect(response.status).toBe(404); expect(await response.json()).toEqual({ ok: false, error: testCase.family === 'codes' ? 'CODE_NOT_FOUND' : 'SEGMENT_CODE_NOT_FOUND' });
  });
  it.each(cases.filter(c => c.method === 'PATCH' || c.method === 'POST'))('$name rejects malformed JSON and primitive/unknown bodies before service', async testCase => {
    const spy = serviceSpy(testCase);
    const broken = await (testCase.handler as Handler)(new Request('https://local.invalid', { method: testCase.method, body: '{' }), context());
    expect(broken.status).toBe(400); expect(await broken.json()).toEqual({ ok: false, error: 'Invalid JSON body' });
    for (const body of [null, 42, {}, { ...testCase.body, extra: true }]) {
      const response = await (testCase.handler as Handler)(request(testCase.method, body), context());
      expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ ok: false, error: 'VALIDATION_ERROR', details: { formErrors: expect.any(Array), fieldErrors: expect.any(Object) } });
    }
    expect(spy).not.toHaveBeenCalled();
  });
  it.each(cases.filter(c => c.name.startsWith('code ') && !['code list', 'code create'].includes(c.name)))('$name rejects invalid code ID before auth', async testCase => {
    const spy = serviceSpy(testCase);
    const response = await (testCase.handler as Handler)(request(testCase.method, testCase.body), context({ codeId: 'bad' }));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: 'Invalid code id' });
    expect(guard).not.toHaveBeenCalled(); expect(spy).not.toHaveBeenCalled();
  });
  it.each(cases.filter(c => c.family === 'assignments'))('$name rejects invalid segment ID before auth', async testCase => {
    const spy = serviceSpy(testCase);
    const response = await (testCase.handler as Handler)(request(testCase.method, testCase.body), context({ segmentId: 'bad' }));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: 'Invalid segment id' });
    expect(guard).not.toHaveBeenCalled(); expect(spy).not.toHaveBeenCalled();
  });
  it.each(cases.filter(c => c.name === 'assignment patch' || c.name === 'assignment delete'))('$name rejects invalid assignment ID before auth', async testCase => {
    const spy = serviceSpy(testCase);
    const response = await (testCase.handler as Handler)(request(testCase.method, testCase.body), context({ segmentCodeId: 'bad' }));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: 'Invalid segment code id' });
    expect(guard).not.toHaveBeenCalled(); expect(spy).not.toHaveBeenCalled();
  });
  it('parses code list search, parent, boolean, pagination exactly', async () => {
    const spy = jest.spyOn(AnalysisCodesService.prototype, 'listByProject').mockResolvedValue([codeRow]);
    const response = await codes.GET(request('GET', undefined, `search=%20Caf%C3%A9%20&parent_code_id=${C}&include_deleted=1&offset=7&limit=2`), context());
    expect(await response.json()).toEqual({ ok: true, codes: [codeRow] });
    expect(spy.mock.calls).toEqual([[P, { search: 'Café', parent_code_id: C, include_deleted: true, offset: 7, limit: 2 }]]);
  });
  it('parses assignment list filters and pagination exactly', async () => {
    const spy = jest.spyOn(AnalysisSegmentCodesService.prototype, 'listBySegment').mockResolvedValue([assignmentRow]);
    const response = await assignments.GET(request('GET', undefined, `code_id=${C}&include_deleted=true&offset=9&limit=4`), context());
    expect(await response.json()).toEqual({ ok: true, segment_codes: [assignmentRow] });
    expect(spy.mock.calls).toEqual([[{ projectId: P, segmentId: S, query: { code_id: C, include_deleted: true, offset: 9, limit: 4 } }]]);
  });
  it.each([codes.GET, assignments.GET])('rejects extreme pagination and unknown query keys before authorization', async handler => {
    for (const query of ['limit=201', 'offset=-1', 'include_deleted=maybe', 'unknown=x']) {
      const response = await (handler as Handler)(request('GET', undefined, query), context());
      expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ ok: false, error: 'VALIDATION_ERROR' });
    }
    expect(guard).not.toHaveBeenCalled();
  });
  it.each([
    ['code create', { code: '23505' }, 409, 'CODE_ALREADY_EXISTS'],
    ['code create', { message: 'CODE_ALREADY_EXISTS' }, 409, 'CODE_ALREADY_EXISTS'],
    ['code create', { message: 'CODE_PARENT_CYCLE' }, 409, 'CODE_PARENT_CYCLE'],
    ['code create', { message: 'CODE_NOT_FOUND' }, 404, 'CODE_NOT_FOUND'],
    ['code patch', { message: 'CODE_REVISION_CONFLICT' }, 409, 'CODE_REVISION_CONFLICT'],
    ['code patch', { message: 'CODE_PARENT_CYCLE' }, 409, 'CODE_PARENT_CYCLE'],
    ['code patch', { message: 'CODE_ALREADY_EXISTS' }, 409, 'CODE_ALREADY_EXISTS'],
    ['code patch', { message: 'CODE_NOT_FOUND' }, 404, 'CODE_NOT_FOUND'],
    ['code delete', { message: 'CODE_HAS_ACTIVE_CHILDREN' }, 409, 'CODE_HAS_ACTIVE_CHILDREN'],
    ['code delete', { message: 'CODE_HAS_ACTIVE_ASSIGNMENTS' }, 409, 'CODE_HAS_ACTIVE_ASSIGNMENTS'],
    ['assignment create', { code: '23505' }, 409, 'SEGMENT_CODE_ALREADY_EXISTS'],
    ['assignment create', { status: 404, message: 'CODE_NOT_FOUND' }, 404, 'CODE_NOT_FOUND'],
    ['assignment patch', { status: 409, message: 'SEGMENT_CODE_REVISION_CONFLICT' }, 409, 'SEGMENT_CODE_REVISION_CONFLICT'],
  ])('maps %s domain rejection to exact contract', async (name, error, status, message) => {
    const testCase = cases.find(c => c.name === name)!;
    const spy = serviceSpy(testCase).mockRejectedValue(error);
    const response = await (testCase.handler as Handler)(request(testCase.method, testCase.body), context());
    expect(response.status).toBe(status); expect(await response.json()).toEqual({ ok: false, error: message });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
