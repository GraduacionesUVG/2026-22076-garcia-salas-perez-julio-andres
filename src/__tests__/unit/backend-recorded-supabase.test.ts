import { createRecordedSupabase } from '../backend/recorded-supabase';

describe('recorded Supabase transport', () => {
  let outbound: jest.SpyInstance;
  beforeEach(() => {
    outbound = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Real network is forbidden');
    });
  });
  afterEach(() => {
    try {
      expect(outbound).not.toHaveBeenCalled();
    } finally {
      outbound.mockRestore();
    }
  });

  test('records_the_installed_sdk_request', async () => {
    const db = createRecordedSupabase([{ status: 200, body: [{ id: 'row-1' }] }]);
    const result = await db.client.from('records').insert({ project_id: 'project-1', name: 'A' }).select('id');
    expect(result.data).toEqual([{ id: 'row-1' }]);
    expect(db.requests).toHaveLength(1);
    expect(db.requests[0].method).toBe('POST');
    expect(db.requests[0].url.origin).toBe('https://recorded-supabase.invalid');
    expect(db.requests[0].url.pathname).toBe('/rest/v1/records');
    expect(db.requests[0].url.searchParams.get('select')).toBe('id');
    expect(db.requests[0].body).toEqual({ project_id: 'project-1', name: 'A' });
    db.assertDrained();
  });

  test('rejects_an_extra_request_without_network', async () => {
    const db = createRecordedSupabase([]);
    await expect(db.client.from('records').select().throwOnError()).rejects.toThrow(/Unexpected.*request/i);
    expect(db.requests.length).toBeGreaterThanOrEqual(1);
    expect(() => db.assertDrained()).toThrow(/Unexpected.*request/i);
  });

  test('asserts_all_responses_consumed', async () => {
    const db = createRecordedSupabase([{ status: 200, body: [] }, { status: 200, body: [] }]);
    expect(() => db.assertDrained()).toThrow(/2.*unconsumed/i);
    await db.client.from('records').select();
    expect(() => db.assertDrained()).toThrow(/1.*unconsumed/i);
    await db.client.from('records').select();
    expect(() => db.assertDrained()).not.toThrow();
    expect(db.requests.map(request => request.body)).toEqual([null, null]);
  });

  test('preserves_error_status_body_and_count_headers', async () => {
    const db = createRecordedSupabase([
      { status: 403, body: { code: '42501', message: 'denied', details: 'synthetic details', hint: 'synthetic hint' } },
      { status: 206, body: [{ id: 'row-1' }], headers: { 'Content-Range': '0-0/7' } },
      { status: 204, body: null },
    ]);
    const denied = await db.client.from('records').select();
    expect(denied.status).toBe(403);
    expect(denied.error).toEqual({ code: '42501', message: 'denied', details: 'synthetic details', hint: 'synthetic hint' });
    const counted = await db.client.from('records').select('id', { count: 'exact' });
    expect(counted.status).toBe(206);
    expect(counted.count).toBe(7);
    expect(counted.data).toEqual([{ id: 'row-1' }]);
    expect((await db.client.from('records').delete()).status).toBe(204);
    db.assertDrained();
  });

  test('does_not_silently_accept_extra_requests_after_a_valid_response', async () => {
    const db = createRecordedSupabase([{ status: 200, body: [] }]);
    await db.client.from('records').select();
    const extra = await db.client.from('records').select();
    expect(extra.error).not.toBeNull();
    expect(() => db.assertDrained()).toThrow(/Unexpected.*request/i);
  });
});
