import { createClient } from "@supabase/supabase-js";
import { AnalysisMemosRepo } from "@/src/modules/analysis/analysis-memos.repo";
import { AnalysisInsightsRepo } from "@/src/modules/analysis/analysis-insights.repo";
import { MemoCreateSchema, MemoListQuerySchema } from "@/src/modules/analysis/analysis-memos.schema";
import { InsightCreateSchema, InsightListQuerySchema } from "@/src/modules/analysis/analysis-insights.schema";
import { TAG_FILTER_CASES } from "@/__tests__/backend/tag-filter-fixtures";

const projectId = "11111111-1111-4111-8111-111111111111";
const subjects = [
  { name: "memos", table: "project_memos", Repo: AnalysisMemosRepo, schema: MemoListQuerySchema,
    createSchema: MemoCreateSchema, filters: { memo_type: "analytic" } },
  { name: "insights", table: "project_insights", Repo: AnalysisInsightsRepo, schema: InsightListQuerySchema,
    createSchema: InsightCreateSchema, filters: { insight_type: "pattern", confidence: "high" } },
] as const;

describe.each(subjects)("$name exact tag SDK boundary", (subject) => {
  it.each(TAG_FILTER_CASES)("filters one exact $tag before pagination, preserving predicates", async ({ tag, literal }) => {
    const matching = {
      project_id: projectId, tags: [tag], status: "draft", deleted_at: null,
      memo_type: "analytic", insight_type: "pattern", confidence: "high",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const rows = [
      { ...matching, id: "99", tags: ["unrelated"] },
      { ...matching, id: "98", tags: ["alpha", "beta"] },
      { ...matching, id: "97", tags: [`prefix-${tag}`] },
      { ...matching, id: "96", project_id: "other" },
      { ...matching, id: "95", status: "confirmed" },
      { ...matching, id: "94", deleted_at: "2026-01-02T00:00:00Z" },
      { ...matching, id: "93", memo_type: "field", insight_type: "other" },
      { ...matching, id: "92", confidence: "low" },
      { ...matching, id: "03" }, { ...matching, id: "02" }, { ...matching, id: "01" },
    ];
    let observed: URL | undefined;
    const db = createClient("https://synthetic.invalid", "synthetic-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input) => {
        const url = new URL(String(input));
        observed = url;
        const params = url.searchParams;
        // Only this independently specified single-element literal is accepted.
        const filtered = rows.filter((row) =>
          params.get("tags") === `cs.${literal}` && row.tags.includes(tag) &&
          params.get("project_id") === `eq.${row.project_id}` &&
          params.get("status") === `eq.${row.status}` &&
          (params.get("deleted_at") !== "is.null" || row.deleted_at === null) &&
          (!params.has("memo_type") || params.get("memo_type") === `eq.${row.memo_type}`) &&
          (!params.has("insight_type") || params.get("insight_type") === `eq.${row.insight_type}`) &&
          (!params.has("confidence") || params.get("confidence") === `eq.${row.confidence}`)
        ).sort((a, b) => b.id.localeCompare(a.id));
        const offset = Number(params.get("offset"));
        const limit = Number(params.get("limit"));
        return new Response(JSON.stringify(filtered.slice(offset, offset + limit)), {
          status: 200, headers: { "content-type": "application/json" },
        });
      } },
    });
    const query = { ...subject.schema.parse({ ...subject.filters, status: "draft", offset: "1", limit: "1" }), tag };
    const result = await new subject.Repo(db).listByProject(projectId, query as never);
    expect(observed?.pathname).toBe(`/rest/v1/${subject.table}`);
    expect(observed?.searchParams.getAll("tags")).toEqual([`cs.${literal}`]);
    expect(observed?.searchParams.has("or")).toBe(false);
    expect(observed?.searchParams.get("order")).toBe("updated_at.desc,id.desc");
    expect(result.map((row) => row.id)).toEqual([subject.name === "memos" ? "03" : "02"]);
  });

  it("accepts optional trimmed tags including the stored-tag punctuation/control domain", () => {
    expect(subject.schema.parse({}).tag).toBeUndefined();
    expect(subject.schema.parse({ tag: " rare-tag " }).tag).toBe("rare-tag");
    expect(subject.schema.parse({ tag: "x".repeat(80) }).tag).toHaveLength(80);
    for (const { tag } of TAG_FILTER_CASES) {
      expect(subject.createSchema.safeParse({ title: "Synthetic", tags: [tag] }).success).toBe(true);
      expect(subject.schema.parse({ tag }).tag).toBe(tag);
    }
  });

  it.each(["", "  ", "x".repeat(81), 42, null, ["rare-tag"]])("rejects invalid tag %p", (tag) => {
    expect(subject.schema.safeParse({ tag }).success).toBe(false);
  });

  it("keeps no-tag and include-deleted behavior", async () => {
    let observed: URL | undefined;
    const db = createClient("https://synthetic.invalid", "synthetic-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input) => {
        observed = new URL(String(input));
        return new Response("[]", { headers: { "content-type": "application/json" } });
      } },
    });
    await new subject.Repo(db).listByProject(projectId, subject.schema.parse({ include_deleted: "true" }) as never);
    expect(observed?.searchParams.has("tags")).toBe(false);
    expect(observed?.searchParams.has("deleted_at")).toBe(false);
    expect(observed?.searchParams.get("project_id")).toBe(`eq.${projectId}`);
  });

  it("keeps search separate from an injection-looking tag when including deleted rows", async () => {
    let observed: URL | undefined;
    const db = createClient("https://synthetic.invalid", "synthetic-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input) => {
        observed = new URL(String(input));
        return new Response("[]", { headers: { "content-type": "application/json" } });
      } },
    });
    const query = subject.schema.parse({ search: "needle", tag: "],status.eq.confirmed", include_deleted: "true" });
    await new subject.Repo(db).listByProject(projectId, query as never);
    expect(observed?.searchParams.get("or")).toBe(subject.name === "memos"
      ? "(title.ilike.%needle%,body.ilike.%needle%)"
      : "(title.ilike.%needle%,summary.ilike.%needle%,interpretation.ilike.%needle%)");
    expect(observed?.searchParams.getAll("tags")).toEqual(['cs.{"],status.eq.confirmed"}']);
    expect(observed?.searchParams.has("status")).toBe(false);
    expect(observed?.searchParams.has("deleted_at")).toBe(false);
  });
});
