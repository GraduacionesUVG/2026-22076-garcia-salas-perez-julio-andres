import { AnalysisOverviewService } from "@/src/modules/analysis/analysis-overview.service";

function fixture(size = 3) {
  const segments = Array.from({ length: size }, (_, i) => ({ id: `s${i}`, project_id: "project-distinct", document_id: `d${i}`, note: i === 1 ? "Café" : "", selected_text: `Evidence ${i}`, start_char: i * 10, end_char: i * 10 + 9 }));
  return {
    listSegmentsForCoding: jest.fn().mockResolvedValue(segments),
    getSegmentCodeAssignments: jest.fn().mockResolvedValue([{ segment_id: "s0", code_id: "b" }, { segment_id: "s0", code_id: "a" }, { segment_id: "s0", code_id: "a" }]),
    getSegmentsByIds: jest.fn().mockResolvedValue(segments),
    getDocumentsByIds: jest.fn().mockResolvedValue(segments.map((s, i) => ({ id: s.document_id, title: `Document ${i}`, document_type: "interview", participant_id: "participant-distinct" }))),
    getParticipantsByIds: jest.fn().mockResolvedValue([{ id: "participant-distinct", alias: "Alias", display_name: null, attributes: {} }]),
    getCodesByIds: jest.fn().mockResolvedValue([{ id: "a", name: "Alpha", color: "red", position: 2, is_active: true }, { id: "b", name: "Beta", color: "blue", position: 1, is_active: true }]),
    getOverview: jest.fn().mockResolvedValue({ project_id: "project-distinct" }),
    getCodeUsageStats: jest.fn().mockResolvedValue([{ code_id: "a", quotes_count: 11 }]),
    getUncodedSegments: jest.fn().mockResolvedValue([{ id: "s1" }]),
    listCodesForDashboard: jest.fn().mockResolvedValue([]),
    getInsightsForDashboard: jest.fn().mockResolvedValue([]),
  };
}
const query = { status: "all" as const, limit: 100, offset: 0 };
describe("overview service domain invariants", () => {
  it("BUG: duplicate assignments must not inflate document pattern evidence counts", async () => {
    const repo = fixture();
    const result = await new AnalysisOverviewService(repo as never).getDocumentPatterns("project-distinct", { limit: 10, offset: 0 });
    expect(result.patterns.find(p => p.code_id === "a")).toMatchObject({ document_count: 1, total_segments: 1, documents: [{ document_id: "d0", segment_count: 1 }] });
  });
  it.each([false, true])("merges duplicate quote flags independent of ordering (first=%s)", async first => {
    const repo = fixture();
    const assignments = [
      { segment_id: "s0", code_id: "a", is_quote: first },
      { segment_id: "s0", code_id: "a", is_quote: !first },
      { segment_id: "s1", code_id: "a", is_quote: false },
    ];
    const original = structuredClone(assignments);
    repo.getSegmentCodeAssignments.mockResolvedValue(assignments);
    const result = await new AnalysisOverviewService(repo as never).getDocumentPatterns("project-distinct", { limit: 10, offset: 0 });
    expect(result.patterns[0]).toMatchObject({ total_segments: 2, document_count: 2, quote_count: 1 });
    expect(result.patterns[0].documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ document_id: "d0", segment_count: 1, quote_count: 1 }),
      expect.objectContaining({ document_id: "d1", segment_count: 1, quote_count: 0 }),
    ]));
    expect(assignments).toEqual(original);
  });
  it.each(["none", "all"])("handles %s coded rows without changing source evidence", async state => {
    const repo = fixture();
    repo.getSegmentCodeAssignments.mockResolvedValue(state === "none" ? [] : [0, 1, 2].map(i => ({ segment_id: `s${i}`, code_id: "a" })));
    const result = await new AnalysisOverviewService(repo as never).getCodingSegments("project-distinct", query);
    expect(result.counts).toEqual({ all: 3, coded: state === "all" ? 3 : 0, uncoded: state === "none" ? 3 : 0 });
    expect(result.segments.map(s => s.is_coded)).toEqual(Array(3).fill(state === "all"));
  });
  it("falls back for missing document and participant metadata and ignores orphan segments in patterns", async () => {
    const repo = fixture();
    repo.getDocumentsByIds.mockResolvedValue([]);
    repo.getParticipantsByIds.mockResolvedValue([]);
    repo.getSegmentCodeAssignments.mockResolvedValue([{ segment_id: "s0", code_id: "a" }, { segment_id: "orphan", code_id: "a" }, { segment_id: "s1", code_id: "deleted" }]);
    const service = new AnalysisOverviewService(repo as never);
    const result = await service.getDocumentPatterns("project-distinct", { limit: 10, offset: 0 });
    expect(result).toMatchObject({ documents: [], patterns: [{ code_id: "a", total_segments: 1, documents: [{ document_id: "d0", document_title: "Documento", participant_label: "Sin participante", segment_count: 1 }] }] });
    expect((await service.getCodingSegments("project-distinct", query)).segments[0]).toMatchObject({ document_title: "Documento", participant_label: "Sin participante" });
  });
  describe.each(["getCodeRelationships", "getDocumentPatterns"] as const)("%s dependency failures", method => {
    it.each(["getSegmentCodeAssignments", "getSegmentsByIds", "getDocumentsByIds", "getCodesByIds"] as const)("propagates %s without partial result", async dependency => {
      const repo = fixture();
      const failure = new Error(`synthetic ${dependency}`);
      repo[dependency].mockRejectedValue(failure);
      await expect(new AnalysisOverviewService(repo as never)[method]("project-distinct", { limit: 10, offset: 0 })).rejects.toBe(failure);
    });
  });
  it("rejects standalone document patterns when participant enrichment fails", async () => {
    const repo = fixture();
    const failure = new Error("synthetic participant enrichment failure");
    repo.getParticipantsByIds.mockRejectedValue(failure);
    await expect(new AnalysisOverviewService(repo as never).getDocumentPatterns("project-distinct", { limit: 10, offset: 0 })).rejects.toBe(failure);
    expect(repo.getCodesByIds).not.toHaveBeenCalled();
  });
  it.each([["all", "uncoded", "coded"], ["uncoded", "all", "coded"]])("keeps queue results independent of order %j", async (...order) => {
    const repo = fixture();
    const service = new AnalysisOverviewService(repo as never);
    for (const status of order as ("all" | "uncoded" | "coded")[]) {
      const result = await service.getCodingSegments("project-distinct", { ...query, status });
      const expectedRows = [0, 1, 2].map(i => ({
        id: `s${i}`, project_id: "project-distinct", document_id: `d${i}`, note: i === 1 ? "Café" : "", selected_text: `Evidence ${i}`, start_char: i * 10, end_char: i * 10 + 9,
        document_title: `Document ${i}`, document_type: "interview", participant_id: "participant-distinct", participant_label: "Alias",
        code_count: i === 0 ? 2 : 0, code_ids: i === 0 ? ["b", "a"] : [], is_coded: i === 0,
        codes: i === 0 ? [{ id: "b", name: "Beta", color: "blue", position: 1, is_active: true }, { id: "a", name: "Alpha", color: "red", position: 2, is_active: true }] : [],
      })).filter(row => status === "all" || (status === "coded" ? row.is_coded : !row.is_coded));
      expect(result).toEqual({ counts: { all: 3, coded: 1, uncoded: 2 }, total: expectedRows.length, segments: expectedRows });
    }
  });
  describe.each(["getCodeRelationships", "getDocumentPatterns", "getDashboardSnapshot"] as const)("%s bounded aggregation", method => {
    it.each([1, 10, 100])("batches %i evidence rows with exact ID sets", async size => {
      const repo = fixture(size);
      repo.getSegmentCodeAssignments.mockResolvedValue(Array.from({ length: size }, (_, i) => [{ segment_id: `s${i}`, code_id: "a" }, { segment_id: `s${i}`, code_id: "b" }]).flat());
      const service = new AnalysisOverviewService(repo as never);
      if (method === "getDashboardSnapshot") await service.getDashboardSnapshot("project-distinct");
      else await service[method]("project-distinct", { limit: 100, offset: 0 });
      expect(repo.getSegmentCodeAssignments.mock.calls).toEqual([["project-distinct"]]);
      expect(repo.getSegmentsByIds.mock.calls).toEqual([["project-distinct", Array.from({ length: size }, (_, i) => `s${i}`)]]);
      expect(repo.getDocumentsByIds.mock.calls).toEqual([["project-distinct", Array.from({ length: size }, (_, i) => `d${i}`)]]);
      expect(repo.getCodesByIds.mock.calls).toEqual([["project-distinct", ["a", "b"]]]);
      expect(repo.getParticipantsByIds.mock.calls).toEqual(method === "getCodeRelationships" ? [] : [["project-distinct", ["participant-distinct"]]]);
      expect(repo.listSegmentsForCoding).not.toHaveBeenCalled();
      expect(repo.getCodeUsageStats).not.toHaveBeenCalled();
      expect(repo.getOverview.mock.calls).toEqual(method === "getDashboardSnapshot" ? [["project-distinct"]] : []);
      expect(repo.listCodesForDashboard.mock.calls).toEqual(method === "getDashboardSnapshot" ? [["project-distinct", { limit: 200, offset: 0 }]] : []);
      expect(repo.getUncodedSegments.mock.calls).toEqual(method === "getDashboardSnapshot" ? [["project-distinct", { limit: 8, offset: 0 }]] : []);
      expect(repo.getInsightsForDashboard.mock.calls).toEqual(method === "getDashboardSnapshot" ? [["project-distinct"]] : []);
    });
  });
  it("normalizes accent search and applies document, offset and limit without changing counts", async () => {
    const service = new AnalysisOverviewService(fixture() as never);
    expect(await service.getCodingSegments("project-distinct", { ...query, search: "CAFE", document_id: "d1" })).toMatchObject({ total: 1, counts: { all: 3, coded: 1, uncoded: 2 }, segments: [{ id: "s1" }] });
    expect(await service.getCodingSegments("project-distinct", { ...query, offset: 1, limit: 1 })).toMatchObject({ total: 3, segments: [{ id: "s1" }] });
    expect(await service.getCodingSegments("project-distinct", { ...query, search: "missing" })).toMatchObject({ total: 0, segments: [] });
  });
  it.each([0, 1, 10, 100])("batches context reads for %i items rather than per-segment reads", async size => {
    const repo = fixture(size);
    const service = new AnalysisOverviewService(repo as never);
    const result = await service.getCodingSegments("project-distinct", query);
    expect(result.counts.all).toBe(size);
    for (const method of [repo.listSegmentsForCoding, repo.getSegmentCodeAssignments, repo.getDocumentsByIds, repo.getParticipantsByIds, repo.getCodesByIds]) expect(method).toHaveBeenCalledTimes(1);
    expect(repo.getDocumentsByIds.mock.calls).toEqual([["project-distinct", Array.from({ length: size }, (_, i) => `d${i}`)]]);
    expect(repo.getParticipantsByIds.mock.calls).toEqual([["project-distinct", size ? ["participant-distinct"] : []]]);
    expect(repo.getCodesByIds.mock.calls).toEqual([["project-distinct", ["b", "a"]]]);
  });
  it("deduplicates relationship pairs and discards deleted code metadata", async () => {
    const repo = fixture();
    repo.getSegmentCodeAssignments.mockResolvedValue([{ segment_id: "s0", code_id: "a" }, { segment_id: "s0", code_id: "b" }, { segment_id: "s0", code_id: "b" }, { segment_id: "s0", code_id: "deleted" }]);
    const result = await new AnalysisOverviewService(repo as never).getCodeRelationships("project-distinct", { limit: 10, offset: 0 });
    expect(result).toEqual([expect.objectContaining({ source_code_id: "a", target_code_id: "b", shared_segment_count: 1, segment_ids: ["s0"], segments: [expect.objectContaining({ segment_id: "s0", code_ids: ["a", "b"] })] })]);
  });
  it.each(["listSegmentsForCoding", "getSegmentCodeAssignments", "getDocumentsByIds", "getParticipantsByIds", "getCodesByIds"] as const)("rejects queue on %s failure", async method => {
    const repo = fixture();
    const failure = new Error(`synthetic ${method}`);
    repo[method].mockRejectedValue(failure);
    await expect(new AnalysisOverviewService(repo as never).getCodingSegments("project-distinct", query)).rejects.toBe(failure);
  });
  it.each(["getOverview", "listCodesForDashboard", "getUncodedSegments", "getInsightsForDashboard", "getSegmentCodeAssignments", "getSegmentsByIds", "getDocumentsByIds", "getParticipantsByIds", "getCodesByIds"] as const)("rejects complete dashboard on %s failure", async method => {
    const repo = fixture();
    const failure = new Error(`synthetic ${method}`);
    repo[method].mockRejectedValue(failure);
    await expect(new AnalysisOverviewService(repo as never).getDashboardSnapshot("project-distinct")).rejects.toBe(failure);
  });
});
