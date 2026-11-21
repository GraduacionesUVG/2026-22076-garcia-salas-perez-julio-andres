import { ParticipantCreateSchema, ParticipantUpdateSchema } from '@/src/modules/participants/participants.schema';
import { ParticipantsRepo } from '@/src/modules/participants/participants.repo';
import { ParticipantsService } from '@/src/modules/participants/participants.service';
import { GET, PATCH, DELETE } from '@/app/api/projects/[id]/participants/[participantId]/route';
import { requireProjectRole } from '@/src/modules/projects/project.guard';

jest.mock('@/src/modules/projects/project.guard', () => ({ requireProjectRole: jest.fn() }));
const project = '00000000-0000-4000-8000-000000000001';
const participantId = '00000000-0000-4000-8000-000000000002';
const actor = '00000000-0000-4000-8000-000000000003';
const current = { id: participantId, project_id: project, alias: 'P01', display_name: null,
  notes: 'winner', attributes: { subsample: 'urban' }, status: 'active', revision: 1,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
  deleted_at: null, created_by: actor, updated_by: actor };
const ctx = { params: Promise.resolve({ id: project, participantId }) };
const params = { projectId: project, participantId, actorUserId: actor };
type Result = { data: unknown; error: unknown; status?: number };

// Only the external SDK boundary is doubled; repo, service, schema and HTTP mapping run unchanged.
function setup(results: Array<Result | Error>) {
  const requests: Array<{ table: string; calls: Array<[string, ...unknown[]]> }> = [];
  const db = { from: (table: string) => {
    const request = { table, calls: [] as Array<[string, ...unknown[]]> };
    requests.push(request);
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'not', 'order', 'range', 'ilike', 'update', 'insert']) {
      chain[method] = (...args: unknown[]) => { request.calls.push([method, ...args]); return chain; };
    }
    const resolve = () => {
      const result = results.shift();
      if (!result) throw new Error('Unexpected SDK operation');
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    };
    chain.single = resolve; chain.maybeSingle = resolve;
    chain.then = (ok: (value: Result) => unknown, fail: (reason: unknown) => unknown) => resolve().then(ok, fail);
    return chain;
  } };
  jest.mocked(requireProjectRole).mockResolvedValue({ supabase: db, user: { id: actor } } as never);
  return { repo: new ParticipantsRepo(db as never), requests };
}
const success = (data: unknown): Result => ({ data, error: null, status: 200 });
const patch = (body: unknown) => PATCH(new Request('http://local', { method: 'PATCH', body: JSON.stringify(body) }), ctx);

describe('participant revision contract', () => {
  it.each([false,true])('list scopes pagination, optional search/status and deleted visibility %p',async include_deleted=>{
    const {repo,requests}=setup([success([current])]);
    expect(await repo.listByProject(project,{include_deleted,limit:5,offset:10,status:'inactive',search:'P01'})).toEqual([current]);
    expect(requests[0].calls).toEqual(expect.arrayContaining([['eq','project_id',project],['range',10,14],['eq','status','inactive'],['ilike','alias','%P01%']]));
    expect(requests[0].calls.some(call=>call[0]==='is')).toBe(!include_deleted);
  });
  it('list defaults absent SDK data to empty and preserves deleted reads when requested',async()=>{
    const {repo,requests}=setup([success(null),success(current)]);
    expect(await repo.listByProject(project,{include_deleted:true,limit:1,offset:0})).toEqual([]);
    expect(await repo.getById({...params,includeDeleted:true})).toEqual(current);
    expect(requests.every(request=>!request.calls.some(call=>call[0]==='is'))).toBe(true);
  });
  it('aggregates document stats without counting orphan rows and chooses latest nonnull date',async()=>{
    const {repo,requests}=setup([success([{participant_id:null,updated_at:'2026-12-01'},{participant_id:'p1',updated_at:null},{participant_id:'p1',updated_at:'2026-01-03'},{participant_id:'p1',updated_at:'2026-01-01'},{participant_id:'p1',updated_at:'2026-01-04'},{participant_id:'p2',updated_at:null}])]);
    expect(Array.from((await repo.getDocumentStatsByParticipant(project)).entries())).toEqual([['p1',{linked_document_count:4,last_document_at:'2026-01-04'}],['p2',{linked_document_count:1,last_document_at:null}]]);
    expect(requests[0].calls).toEqual(expect.arrayContaining([['eq','project_id',project],['is','deleted_at',null],['not','participant_id','is',null]]));
  });
  it('creates explicit metadata fields with actor identity and updates display name without revision leakage',async()=>{
    const {repo,requests}=setup([success(current),success(current),success(null)]);
    expect(await repo.create({projectId:project,actorUserId:actor,input:{alias:'P02',display_name:'Ana',notes:'note',attributes:{age:25},status:'inactive'}})).toEqual(current);
    expect(requests[0].calls).toContainEqual(['insert',{project_id:project,alias:'P02',display_name:'Ana',notes:'note',attributes:{age:25},status:'inactive',created_by:actor,updated_by:actor}]);
    await repo.update({...params,input:{display_name:null}}); expect(requests[1].calls).toContainEqual(['update',{display_name:null,updated_by:actor}]);
    await repo.createEvent({projectId:project,actorUserId:actor,eventType:'participant_created'}); expect(requests[2].calls).toContainEqual(['insert',{project_id:project,event_type:'participant_created',created_by:actor,event_payload:{}}]);
  });
  it('accepts explicit zero and max safe revisions with a real edit; preserves legacy clients', () => {
    expect(ParticipantUpdateSchema.parse({ base_revision: 0, notes: ' next ' })).toEqual({ base_revision: 0, notes: 'next' });
    expect(ParticipantUpdateSchema.safeParse({ base_revision: Number.MAX_SAFE_INTEGER, status: 'archived' }).success).toBe(true);
    expect(ParticipantUpdateSchema.parse({ notes: 'legacy' })).toEqual({ notes: 'legacy' });
  });
  it.each([-1, 0.5, '0', null, Number.MAX_SAFE_INTEGER + 1, Infinity])('rejects invalid revision %p', base_revision => {
    expect(ParticipantUpdateSchema.safeParse({ base_revision, notes: 'edit' }).success).toBe(false);
  });
  it.each([{}, { base_revision: 0 }, { revision: 0, notes: 'edit' }])('rejects non-edit or caller-controlled revision %j', value => {
    expect(ParticipantUpdateSchema.safeParse(value).success).toBe(false);
  });
  it('rejects caller revision on create', () => {
    expect(ParticipantCreateSchema.safeParse({ alias: 'P01', revision: 10 }).success).toBe(false);
  });
  it('returns persisted create revision and selects revision on reads', async () => {
    const { repo, requests } = setup([success({ ...current, revision: 0 }), success(current)]);
    expect(await repo.create({ projectId: project, actorUserId: actor, input: { alias: 'P01' } })).toMatchObject({ revision: 0 });
    expect(await repo.getById(params)).toMatchObject({ revision: 1 });
    for (const request of requests) expect(request.calls.find(([key]) => key === 'select')?.[1]).toMatch(/\brevision\b/);
  });
  it('uses one atomic project/id/live/revision predicate without writing the client revision', async () => {
    const { repo, requests } = setup([success(current)]);
    expect(await repo.update({ ...params, input: { base_revision: 0, notes: 'winner' } } as never)).toEqual(current);
    expect(requests).toHaveLength(1);
    expect(requests[0].calls).toEqual(expect.arrayContaining([
      ['update', { notes: 'winner', updated_by: actor }], ['eq', 'project_id', project],
      ['eq', 'id', participantId], ['is', 'deleted_at', null], ['eq', 'revision', 0],
    ]));
  });
  it('returns 409 latest same-project state and emits no event for stale writes', async () => {
    const { requests } = setup([success(null), success(current)]);
    const response = await patch({ base_revision: 0, notes: 'stale' });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: 'PARTICIPANT_REVISION_CONFLICT', latest_participant: current });
    expect(requests.map(r => r.table)).toEqual(['project_participants', 'project_participants']);
    expect(requests[1].calls).toEqual(expect.arrayContaining([
      ['eq', 'project_id', project], ['eq', 'id', participantId], ['is', 'deleted_at', null],
    ]));
    expect(requests[1].calls.some(([method]) => method === 'update' || method === 'insert')).toBe(false);
  });
  it('returns 404, not a conflict or event, for absent/foreign/deleted rows', async () => {
    const { requests } = setup([success(null), success(null)]);
    expect((await patch({ base_revision: 0, notes: 'stale' })).status).toBe(404);
    expect(requests.every(r => r.table === 'project_participants')).toBe(true);
  });
  it('successful explicit PATCH returns the increment and emits one event', async () => {
    const { requests } = setup([success(current), success(null)]);
    const response = await patch({ base_revision: 0, notes: 'winner' });
    expect(response.status).toBe(200);
    expect((await response.json()).participant).toEqual(current);
    expect(requests.filter(r => r.table === 'project_document_events')).toHaveLength(1);
    expect(requests[1].calls).toContainEqual(['insert', {
      project_id: project, event_type: 'participant_updated', created_by: actor,
      event_payload: { participant_id: participantId, alias: 'P01', status: 'active' },
    }]);
  });
  it.each([{ base_revision: 0 }, { base_revision: -1, notes: 'edit' }, { base_revision: '0', notes: 'edit' }])('HTTP rejects invalid revision payload without a database operation %j', async body => {
    const { requests } = setup([]);
    expect((await patch(body)).status).toBe(400);
    expect(requests).toEqual([]);
  });
  it('keeps legacy updates without revision predicate, returning the persisted increment and one event', async () => {
    const { requests } = setup([success(current), success(null)]);
    const response = await patch({ attributes: { subsample: 'urban' }, status: 'inactive' });
    expect(response.status).toBe(200);
    expect((await response.json()).participant.revision).toBe(1);
    expect(requests[0].calls).toContainEqual(['update', { attributes: { subsample: 'urban' }, status: 'inactive', updated_by: actor }]);
    expect(requests[0].calls).not.toContainEqual(['eq', 'revision', 0]);
    expect(requests.filter(r => r.table === 'project_document_events')).toHaveLength(1);
  });
  it('independent GET exposes persisted revision and metadata', async () => {
    setup([success(current), success([])]);
    const response = await GET(new Request('http://local'), ctx);
    expect(response.status).toBe(200);
    expect((await response.json()).participant).toMatchObject({ revision: 1, notes: 'winner', attributes: { subsample: 'urban' }, linked_document_count: 0 });
  });
  it('soft delete returns database increment and still scopes nondeleted row', async () => {
    const { requests } = setup([success({ ...current, revision: 2, deleted_at: '2026-01-03T00:00:00Z' }), success(null)]);
    const response = await DELETE(new Request('http://local'), ctx);
    expect(response.status).toBe(200);
    expect((await response.json()).participant.revision).toBe(2);
    expect(requests[0].calls).toContainEqual(['is', 'deleted_at', null]);
  });
  it('preserves duplicate alias mapping', async () => {
    setup([{ data: null, error: { code: '23505', message: 'provider detail' }, status: 409 }]);
    const response = await patch({ alias: 'duplicate', base_revision: 1 });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: 'PARTICIPANT_ALIAS_ALREADY_EXISTS' });
  });
  it('denies viewer before writing', async () => {
    const { requests } = setup([]);
    jest.mocked(requireProjectRole).mockRejectedValueOnce(Object.assign(new Error('FORBIDDEN'), { status: 403 }));
    expect((await patch({ base_revision: 0, notes: 'denied' })).status).toBe(403);
    expect(requests).toEqual([]);
    expect(requireProjectRole).toHaveBeenLastCalledWith(project, ['owner', 'editor']);
  });
  it.each([
    { method: 'GET', handler: GET, roles: ['owner', 'editor', 'viewer'] },
    { method: 'DELETE', handler: DELETE, roles: ['owner', 'editor'] },
  ])('$method denies project access before participant read or mutation', async ({ method, handler, roles }) => {
    const { requests } = setup([]);
    const read = jest.spyOn(ParticipantsService.prototype, 'getById');
    const remove = jest.spyOn(ParticipantsService.prototype, 'softDelete');
    try {
      jest.mocked(requireProjectRole).mockRejectedValueOnce(Object.assign(new Error('FORBIDDEN'), { status: 403 }));
      const response = await handler(new Request('http://local', { method }), ctx);
      expect(requireProjectRole).toHaveBeenLastCalledWith(project, roles);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, error: 'FORBIDDEN' });
      expect(read).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(requests).toEqual([]);
    } finally {
      read.mockRestore();
      remove.mockRestore();
    }
  });
  it.each([
    { data: null, error: { message: 'secret gateway body' }, status: 502 },
    Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }),
  ])('redacts transient update failures without event or retry', async failure => {
    const { requests } = setup([failure]);
    const response = await patch({ notes: 'attempt' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: 'DEPENDENCY_UNAVAILABLE' });
    expect(requests).toHaveLength(1);
  });
  it('redacts stale-read dependency failures without event', async () => {
    const { requests } = setup([success(null), { data: null, error: { message: 'private' }, status: 503 }]);
    const response = await patch({ notes: 'attempt', base_revision: 0 });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: 'DEPENDENCY_UNAVAILABLE' });
    expect(requests.map(r => r.table)).toEqual(['project_participants', 'project_participants']);
  });
  it('does not emit an event on failed conditional service update', async () => {
    const { repo, requests } = setup([success(null), success(current)]);
    await expect(new ParticipantsService(repo).update({ ...params, input: { notes: 'stale', base_revision: 0 } } as never)).rejects.toMatchObject({ status: 409 });
    expect(requests.every(r => r.table === 'project_participants')).toBe(true);
  });
  const boundaryCalls: Array<[string, (repo: ParticipantsRepo) => Promise<unknown>]> = [
    ['list', repo => repo.listByProject(project, { include_deleted: false, limit: 50, offset: 0 })],
    ['stats', repo => repo.getDocumentStatsByParticipant(project)],
    ['get', repo => repo.getById(params)],
    ['create', repo => repo.create({ ...params, input: { alias: 'P01' } })],
    ['update', repo => repo.update({ ...params, input: { notes: 'edit' } })],
    ['soft delete', repo => repo.softDelete(params)],
    ['event', repo => repo.createEvent({ projectId: project, actorUserId: actor, eventType: 'participant_updated' })],
  ];
  it.each(boundaryCalls)('normalizes SDK envelope failures at the %s boundary', async (_name, call) => {
    const { repo, requests } = setup([{ data: null, error: { message: 'provider-private-body' }, status: 502 }]);
    await expect(call(repo)).rejects.toMatchObject({ status: 503, message: 'DEPENDENCY_UNAVAILABLE' });
    expect(requests).toHaveLength(1);
  });
  it('keeps SQL authorization errors distinct from dependency unavailability', async () => {
    setup([{ data: null, error: { code: '42501', message: 'permission denied' }, status: 403 }]);
    expect((await patch({ notes: 'blocked' })).status).toBe(403);
  });
});
