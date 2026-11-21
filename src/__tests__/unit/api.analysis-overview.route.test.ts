jest.mock("@/src/modules/projects/project.guard", () => ({ requireProjectRole: jest.fn() }));
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { AnalysisOverviewService } from "@/src/modules/analysis/analysis-overview.service";
import { GET as overview } from "@/app/api/projects/[id]/analysis/overview/route";
import { GET as dashboard } from "@/app/api/projects/[id]/analysis/dashboard/route";
import { GET as patterns } from "@/app/api/projects/[id]/analysis/document-patterns/route";
import { GET as relationships } from "@/app/api/projects/[id]/analysis/relationships/route";
import { GET as segments } from "@/app/api/projects/[id]/analysis/segments/route";
import { GET as uncoded } from "@/app/api/projects/[id]/analysis/segments/uncoded/route";
import { GET as stats } from "@/app/api/projects/[id]/analysis/codes/stats/route";

const project = "18181818-1818-4181-8181-181818181818";
const document = "29292929-2929-4292-8292-292929292929";
const cases = [
  { name: "overview", GET: overview, method: "getOverview", value: { project_id: project, segments_count: 37 }, body: (v: unknown) => ({ ok: true, overview: v }), paged: false },
  { name: "dashboard", GET: dashboard, method: "getDashboardSnapshot", value: { overview: { project_id: project }, stats: [{ code_id: "distinct-code", quotes_count: 19 }] }, body: (v: object) => ({ ok: true, ...v }), paged: false },
  { name: "document-patterns", GET: patterns, method: "getDocumentPatterns", value: { documents: [{ id: document }], patterns: [{ code_id: "pattern-code", total_segments: 23 }] }, body: (v: object) => ({ ok: true, ...v }), paged: true },
  { name: "relationships", GET: relationships, method: "getCodeRelationships", value: [{ source_code_id: "alpha", target_code_id: "beta", shared_segment_count: 17 }], body: (v: unknown) => ({ ok: true, relationships: v }), paged: true },
  { name: "segments", GET: segments, method: "getCodingSegments", value: { segments: [{ id: "segment-distinct" }], total: 41, counts: { all: 43, coded: 41, uncoded: 2 } }, body: (v: object) => ({ ok: true, ...v }), paged: true },
  { name: "segments/uncoded", GET: uncoded, method: "getUncodedSegments", value: [{ id: "uncoded-distinct", document_id: document }], body: (v: unknown) => ({ ok: true, segments: v }), paged: true },
  { name: "codes/stats", GET: stats, method: "getCodeUsageStats", value: [{ code_id: "stats-distinct", quotes_count: 29 }], body: (v: unknown) => ({ ok: true, stats: v }), paged: true },
] as const;

describe.each(cases)("analysis $name actual handler", ({ GET, method, value, body, paged, name }) => {
  const invoke = (query = "", id = project) => GET(new Request(`https://offline.invalid/api/projects/${id}/analysis/${name}${query}`), { params: Promise.resolve({ id }) });
  afterEach(() => jest.restoreAllMocks());
  beforeEach(() => jest.mocked(requireProjectRole).mockResolvedValue({ supabase: {}, user: { id: "user-distinct" } } as never));

  it("returns distinctive data and forwards the exact parsed project, query and role list", async () => {
    const spy = jest.spyOn(AnalysisOverviewService.prototype, method).mockResolvedValue(value as never);
    const query = name === "segments" ? `?status=coded&search=%20CAF%C3%89%20&document_id=${document}&limit=7&offset=3` : paged ? "?limit=7&offset=3" : "";
    const response = await invoke(query);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body(value as never));
    expect(requireProjectRole).toHaveBeenCalledWith(project, ["owner", "editor", "viewer"]);
    expect(spy.mock.calls).toEqual([paged ? [project, name === "segments" ? { status: "coded", search: "CAFÉ", document_id: document, limit: 7, offset: 3 } : { limit: 7, offset: 3 }] : [project]]);
  });
  it("rejects an invalid project before authorization or service access", async () => {
    const spy = jest.spyOn(AnalysisOverviewService.prototype, method);
    const response = await invoke("?limit=0", "wrong-project");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "INVALID_PROJECT_ID" });
    expect(requireProjectRole).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });
  it("does not claim partial success when aggregation rejects", async () => {
    jest.spyOn(AnalysisOverviewService.prototype, method).mockRejectedValue(Object.assign(new Error("Synthetic dependency unavailable"), { status: 503 }));
    const response = await invoke();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Synthetic dependency unavailable" });
  });
  it("preserves denied access status without service effects", async () => {
    const spy = jest.spyOn(AnalysisOverviewService.prototype, method);
    jest.mocked(requireProjectRole).mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    const response = await invoke();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "Forbidden" });
    expect(spy).not.toHaveBeenCalled();
  });
  if (paged) it.each(["?limit=0", "?limit=201", "?offset=-1", "?unknown=x"])("rejects %s before authorization", async (query) => {
    const response = await invoke(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "VALIDATION_ERROR" });
    expect(requireProjectRole).not.toHaveBeenCalled();
  });
});
