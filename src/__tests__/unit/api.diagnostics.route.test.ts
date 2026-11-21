import { GET as health } from '@/app/api/health/route';
import { GET as ping } from '@/app/api/supabase-ping/route';
import { GET as debug } from '@/app/api/debug/auth/route';
import { GET as admin } from '@/app/api/admin/users/route';
import { POST as refresh } from '@/app/api/auth/refresh/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { createRecordedSupabase } from '../backend/recorded-supabase';
import { supabaseServer } from '@/src/lib/supabase/server';
import { getOptionalSession, requireSession } from '@/src/modules/auth/auth.guard';
jest.mock('@/src/lib/supabase/server', () => ({ supabaseServer: jest.fn() }));
jest.mock('@/src/modules/auth/auth.guard', () => ({ getOptionalSession: jest.fn(), requireSession: jest.fn() }));
const userId = '7292a8e3-36d1-4cb1-8702-c05112d66e49';
const savedToken = process.env.INTERNAL_DIAGNOSTICS_TOKEN;
const savedLocal = process.env.ENABLE_LOCAL_DIAGNOSTICS;
const request = (allowed = true) => new Request('http://localhost/api/health', { headers: allowed ? { 'x-internal-diagnostics-token': 'offline-diagnostic-token' } : {} });
beforeEach(() => { jest.resetAllMocks(); process.env.INTERNAL_DIAGNOSTICS_TOKEN = 'offline-diagnostic-token'; delete process.env.ENABLE_LOCAL_DIAGNOSTICS; });
afterAll(() => { if (savedToken === undefined) delete process.env.INTERNAL_DIAGNOSTICS_TOKEN; else process.env.INTERNAL_DIAGNOSTICS_TOKEN = savedToken; if (savedLocal === undefined) delete process.env.ENABLE_LOCAL_DIAGNOSTICS; else process.env.ENABLE_LOCAL_DIAGNOSTICS = savedLocal; });
describe('actual diagnostic handlers with offline installed SDK', () => {
  it('logout reports provider rejection without claiming session ended', async () => { (supabaseServer as jest.Mock).mockResolvedValue({ auth: { signOut: jest.fn().mockResolvedValue({ error: { message: 'logout rejected' } }) } }); const response = await logout(); expect(response.status).toBe(500); expect(await response.json()).toEqual({ ok: false, error: 'logout rejected' }); });
  it.each([[health, { ok: true }], [ping, { ok: false, error: 'Not found' }], [debug, { ok: false, error: 'Not found' }]])('does not consult providers for denied diagnostics %#', async (handler, body) => {
    const response = await handler(request(false)); expect(response.status).toBe(handler === health ? 200 : 404); expect(await response.json()).toEqual(body); expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate'); expect(supabaseServer).not.toHaveBeenCalled(); expect(getOptionalSession).not.toHaveBeenCalled();
  });
  it.each([[health, { ok: true, checks: { app: 'ok', database: 'ok' } }], [ping, { ok: true, database: 'reachable' }]])('executes allowed database HEAD probe %#', async (handler, body) => {
    const db = createRecordedSupabase([{ status: 200, body: null, headers: { 'content-range': '0-0/1' } }]); (supabaseServer as jest.Mock).mockResolvedValue(db.client);
    const response = await handler(request()); expect(response.status).toBe(200); expect(await response.json()).toEqual(body); expect(db.requests).toHaveLength(1); expect(db.requests[0].method).toBe('HEAD'); expect(db.requests[0].url.pathname).toBe('/rest/v1/profiles'); expect(db.requests[0].url.searchParams.get('select')).toBe('id'); expect(db.requests[0].url.searchParams.get('limit')).toBe('1'); db.assertDrained();
  });
  it.each([health, ping])('redacts provider detail from failed probe %#', async handler => {
    const db = createRecordedSupabase([{ status: 403, body: { message: 'private-provider-detail', code: '42501' } }]); (supabaseServer as jest.Mock).mockResolvedValue(db.client);
    const response = await handler(request()); expect(response.status).toBe(503); expect(await response.json()).toEqual({ ok: false, error: 'Internal diagnostics check failed' }); db.assertDrained();
  });
  it.each([health, ping])('safely handles construction failure %#', async handler => { (supabaseServer as jest.Mock).mockRejectedValue(new Error('secret')); const response = await handler(request()); expect(response.status).toBe(503); expect(await response.json()).toEqual({ ok: false, error: 'Internal diagnostics check failed' }); });
  it.each([['julio@example.invalid', 'ju***@example.invalid'], ['invalid', '***'], [null, null]])('masks allowed auth email %s', async (email, masked) => { (getOptionalSession as jest.Mock).mockResolvedValue({ user: { id: userId, email } }); const response = await debug(request()); expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, authenticated: true, user: { id: userId, email: masked } }); });
  it('reports absence of session without fabricated identity', async () => { (getOptionalSession as jest.Mock).mockResolvedValue({ user: null }); expect(await (await debug(request())).json()).toEqual({ ok: true, authenticated: false, user: null }); });
  it('redacts auth diagnostic failure', async () => { (getOptionalSession as jest.Mock).mockRejectedValue(new Error('secret')); const response = await debug(request()); expect(response.status).toBe(500); expect(await response.json()).toEqual({ ok: false, error: 'Could not read auth diagnostics' }); });
  it('lists admin users using ordered SDK requests', async () => {
    const users = [{ id: userId, full_name: 'Ángela', role: 'admin', created_at: '2026-10-04' }]; const db = createRecordedSupabase([{ status: 200, body: { id: userId, role: 'admin' } }, { status: 200, body: users }]); (requireSession as jest.Mock).mockResolvedValue({ user: { id: userId }, supabase: db.client });
    const response = await admin(); expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, users }); expect(db.requests[0].url.searchParams.get('id')).toBe(`eq.${userId}`); expect(db.requests[1].url.searchParams.get('order')).toBe('created_at.desc'); db.assertDrained();
  });
  it.each([['user', 403, 'FORBIDDEN'], [null, 401, 'UNAUTHORIZED']])('rejects nonadmin profile %s', async (role, status, error) => { const db = createRecordedSupabase([{ status: 200, body: role ? { id: userId, role } : null }]); (requireSession as jest.Mock).mockResolvedValue({ user: { id: userId }, supabase: db.client }); const response = await admin(); expect(response.status).toBe(status); expect(await response.json()).toEqual({ ok: false, error }); expect(db.requests).toHaveLength(1); db.assertDrained(); });
  it.each([null, { user: { id: userId } }])('refresh returns actual session presence %#', async session => { (supabaseServer as jest.Mock).mockResolvedValue({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session }, error: null }) } }); const response = await refresh(); expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, hasSession: Boolean(session), userId: session ? userId : null }); });
  it('refresh preserves auth rejection contract', async () => { (supabaseServer as jest.Mock).mockResolvedValue({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: { message: 'session expired' } }) } }); const response = await refresh(); expect(response.status).toBe(401); expect(await response.json()).toEqual({ ok: false, error: 'session expired' }); });
});
