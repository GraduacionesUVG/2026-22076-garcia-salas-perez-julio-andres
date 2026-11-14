import { AnalysisOverviewRepo } from "@/src/modules/analysis/analysis-overview.repo";
import { createRecordedSupabase } from "../backend/recorded-supabase";

describe("overview installed SDK transport", () => {
  it("uses exact overview RPC body and returns its distinctive result", async () => {
    const value = { project_id: "distinct-project", segments_count: 31 };
    const db = createRecordedSupabase([{ status: 200, body: value }]);
    expect(await new AnalysisOverviewRepo(db.client as never).getOverview("distinct-project")).toEqual(value);
    expect(db.requests[0]).toMatchObject({ method: "POST", body: { input_project_id: "distinct-project" } });
    expect(db.requests[0].url.pathname).toBe("/rest/v1/rpc/get_project_analysis_overview");
    db.assertDrained();
  });
  it.each([
    ["getCodesByIds", "project_codes"], ["getSegmentsByIds", "project_document_segments"],
    ["getDocumentsByIds", "project_documents"], ["getParticipantsByIds", "project_participants"],
  ] as const)("%s batches exact IDs with project and soft-delete predicates", async (method, table) => {
    const db = createRecordedSupabase([{ status: 200, body: [{ id: "child-distinct" }] }]);
    const repo = new AnalysisOverviewRepo(db.client as never);
    expect(await repo[method]("project-distinct", ["child-distinct", "second-distinct"])).toEqual([{ id: "child-distinct" }]);
    expect(db.requests).toHaveLength(1);
    const url = db.requests[0].url;
    expect(url.pathname).toBe(`/rest/v1/${table}`);
    expect(url.searchParams.get("project_id")).toBe("eq.project-distinct");
    expect(url.searchParams.get("deleted_at")).toBe("is.null");
    expect(url.searchParams.get("id")).toBe("in.(child-distinct,second-distinct)");
    expect(await repo[method]("project-distinct", [])).toEqual([]);
    expect(db.requests).toHaveLength(1);
    db.assertDrained();
  });
  it("normalizes uncoded IDs without leaking label or mutating the response fixture", async () => {
    const row = { project_id: "project-distinct", segment_id: "segment-distinct", label: "legacy", note: "evidence" };
    const db = createRecordedSupabase([{ status: 200, body: [row] }]);
    expect(await new AnalysisOverviewRepo(db.client as never).getUncodedSegments("project-distinct", { limit: 7, offset: 3 })).toEqual([{ project_id: "project-distinct", segment_id: "segment-distinct", id: "segment-distinct", note: "evidence" }]);
    expect(db.requests[0].url.searchParams.get("offset")).toBe("3");
    expect(db.requests[0].url.searchParams.get("limit")).toBe("7");
    expect(row.label).toBe("legacy");
    db.assertDrained();
  });
  it.each(["getCodeUsageStats", "getUncodedSegments", "listCodesForDashboard"] as const)("%s preserves provider error instead of returning empty success", async method => {
    const db = createRecordedSupabase([{ status: 400, body: { code: "SYNTHETIC", message: "offline failure" } }]);
    await expect(new AnalysisOverviewRepo(db.client as never)[method]("project-distinct", { limit: 7, offset: 3 })).rejects.toMatchObject({ code: "SYNTHETIC", message: "offline failure" });
    db.assertDrained();
  });
});

describe("AnalysisOverviewRepo", () => {
  it("loads overview counts through the optimized dashboard RPC", async () => {
    const db = {
      rpc: jest.fn().mockResolvedValue({
        data: {
          project_id: "project-1",
          documents_count: 1,
          segments_count: 2,
          codes_count: 3,
          coded_segments_count: 4,
          quotes_count: 5,
          memos_count: 6,
          insights_count: 7,
          uncoded_segments_count: 8,
        },
        error: null,
      }),
      from: jest.fn(),
    };
    const repo = new AnalysisOverviewRepo(db as never);

    const overview = await repo.getOverview("project-1");

    expect(db.rpc).toHaveBeenCalledWith("get_project_analysis_overview", {
      input_project_id: "project-1",
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(overview).toMatchObject({
      project_id: "project-1",
      uncoded_segments_count: 8,
    });
  });

  it("loads active segment rows for the coding queue", async () => {
    const range = jest.fn().mockResolvedValue({
      data: [{ id: "segment-1", document_id: "document-1" }],
      error: null,
    });
    const secondOrder = jest.fn().mockReturnValue({ range });
    const firstOrder = jest.fn().mockReturnValue({ order: secondOrder });
    const is = jest.fn().mockReturnValue({ order: firstOrder });
    const eq = jest.fn().mockReturnValue({ is });
    const select = jest.fn().mockReturnValue({ eq });
    const db = {
      from: jest.fn().mockReturnValue({ select }),
      rpc: jest.fn(),
    };
    const repo = new AnalysisOverviewRepo(db as never);

    const segments = await repo.listSegmentsForCoding("project-1");

    expect(db.from).toHaveBeenCalledWith("project_document_segments");
    expect(eq).toHaveBeenCalledWith("project_id", "project-1");
    expect(is).toHaveBeenCalledWith("deleted_at", null);
    expect(firstOrder).toHaveBeenCalledWith("document_id", { ascending: true });
    expect(secondOrder).toHaveBeenCalledWith("start_char", { ascending: true });
    expect(range).toHaveBeenCalledWith(0, 4999);
    expect(segments).toEqual([
      { id: "segment-1", document_id: "document-1" },
    ]);
  });
});
