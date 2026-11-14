jest.mock("@/src/modules/projects/project.guard", () => ({ requireProjectRole: jest.fn() }));

import { createClient } from "@supabase/supabase-js";
import { GET as memosGET } from "@/app/api/projects/[id]/analysis/memos/route";
import { GET as insightsGET } from "@/app/api/projects/[id]/analysis/insights/route";
import { requireProjectRole } from "@/src/modules/projects/project.guard";

const projectId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: projectId }) };

describe.each([
  { name: "memos", GET: memosGET }, { name: "insights", GET: insightsGET },
])("$name tag HTTP contract", ({ name, GET }) => {
  it("accepts a trimmed tag and sends the exact membership predicate to the SDK", async () => {
    let observed: URL | undefined;
    const supabase = createClient("https://synthetic.invalid", "synthetic-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input) => {
        observed = new URL(String(input));
        return new Response("[]", { headers: { "content-type": "application/json" } });
      } },
    });
    jest.mocked(requireProjectRole).mockResolvedValue({ supabase, user: { id: "synthetic-user", email: null } } as never);
    const response = await GET(new Request(`https://app.example.test/api/projects/${projectId}/analysis/${name}?tag=%20rare-tag%20`), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, [name]: [] });
    expect(observed?.searchParams.get("tags")).toBe('cs.{"rare-tag"}');
  });

  it.each(["", "  ", "x".repeat(81)])("rejects invalid tag %p before accessing data", async (tag) => {
    const response = await GET(new Request(`https://app.example.test/api/projects/${projectId}/analysis/${name}?${new URLSearchParams({ tag })}`), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "VALIDATION_ERROR" });
    expect(requireProjectRole).not.toHaveBeenCalled();
  });
});
