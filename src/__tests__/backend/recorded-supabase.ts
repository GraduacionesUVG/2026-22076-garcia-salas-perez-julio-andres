import { createClient } from '@supabase/supabase-js';

export type RecordedDbRequest = { method: string; url: URL; body: unknown };
export type SyntheticDbResponse = { status: number; body: unknown; headers?: Record<string, string> };
// Instantiate the installed SDK generic: bare ReturnType<typeof createClient>
// erases its default database schema and infers never for insert payloads.
type RecordedDatabase = { public: {
  Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }>;
  Views: Record<string, never>;
  Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
} };
type RecordedClient = ReturnType<typeof createClient<RecordedDatabase, 'public'>>;

export function createRecordedSupabase(responses: readonly SyntheticDbResponse[]): {
  client: RecordedClient;
  requests: RecordedDbRequest[];
  assertDrained(): void;
} {
  const requests: RecordedDbRequest[] = [];
  const queue = [...responses];
  let consumed = 0;
  let unexpected: Error | undefined;
  const fetchRecorded: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const rawBody = await request.text();
    let body: unknown = null;
    if (rawBody) {
      try { body = JSON.parse(rawBody); } catch { body = rawBody; }
    }
    requests.push({ method: request.method, url: new URL(request.url), body });
    const fixture = queue[consumed];
    if (!fixture) {
      // The SDK may catch transport rejections or retry them. Keep a sticky
      // failure so neither behavior can make an overrun appear drained.
      unexpected ??= new Error(`Unexpected Supabase request: ${request.method} ${request.url}`);
      throw unexpected;
    }
    consumed += 1;
    const headers = new Headers(fixture.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    const noBody = request.method === 'HEAD' || [204, 205, 304].includes(fixture.status);
    return new Response(noBody ? null : JSON.stringify(fixture.body), { status: fixture.status, headers });
  };
  const client = createClient<RecordedDatabase, 'public'>('https://recorded-supabase.invalid', 'synthetic-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchRecorded },
  });
  return {
    client,
    requests,
    assertDrained() {
      if (unexpected) throw unexpected;
      const remaining = queue.length - consumed;
      if (remaining) throw new Error(`${remaining} unconsumed Supabase responses`);
    },
  };
}
