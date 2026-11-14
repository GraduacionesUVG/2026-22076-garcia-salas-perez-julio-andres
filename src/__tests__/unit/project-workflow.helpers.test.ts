import { buildProjectWorkflowSummary } from "@/src/modules/projects/project-workflow.helpers";

const emptyEvidence = {
  delimitationFilledFields: 0,
  delimitationItems: 0,
  delimitationIncludeItems: 0,
  delimitationExcludeItems: 0,
  designFilledCoreFields: 0,
  specificObjectives: 0,
  sampleFilledCoreFields: 0,
  collectionTechniques: 0,
  documents: 0,
  segments: 0,
  codes: 0,
  assignments: 0,
  memos: 0,
  insights: 0,
  confirmedInsights: 0,
};

describe("buildProjectWorkflowSummary", () => {
  it("starts an empty project at delimitation without inventing completion", () => {
    const summary = buildProjectWorkflowSummary(emptyEvidence);

    expect(summary.progress).toBe(0);
    expect(summary.phases.map((phase) => phase.state)).toEqual([
      "not_started",
      "not_started",
      "not_started",
      "not_started",
      "not_started",
      "not_started",
    ]);
    expect(summary.phases.map((phase) => phase.available)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("derives phase completion from saved evidence instead of route order", () => {
    const summary = buildProjectWorkflowSummary({
      ...emptyEvidence,
      delimitationFilledFields: 5,
      delimitationItems: 2,
      delimitationIncludeItems: 1,
      delimitationExcludeItems: 1,
      designFilledCoreFields: 1,
    });

    expect(summary.phaseMap.delimitation.state).toBe("completed");
    expect(summary.phaseMap.design.state).toBe("in_progress");
    expect(summary.phaseMap.sample.state).toBe("not_started");
    expect(summary.phaseMap.design.available).toBe(true);
    expect(summary.phaseMap.sample.available).toBe(false);
  });

  it("treats analysis as an iterative cycle and unlocks report from findings", () => {
    const summary = buildProjectWorkflowSummary({
      ...emptyEvidence,
      delimitationFilledFields: 5,
      delimitationIncludeItems: 1,
      delimitationExcludeItems: 1,
      designFilledCoreFields: 2,
      specificObjectives: 2,
      sampleFilledCoreFields: 5,
      collectionTechniques: 1,
      documents: 3,
      segments: 12,
      codes: 4,
      assignments: 9,
      memos: 2,
      insights: 1,
      confirmedInsights: 1,
    });

    expect(summary.phaseMap.collection.state).toBe("completed");
    expect(summary.phaseMap.analysis.state).toBe("completed");
    expect(summary.phaseMap.report.state).toBe("completed");
    expect(summary.phaseMap.report.available).toBe(true);
    expect(summary.progress).toBe(100);
  });

  it("bounds malformed counts and progress to a safe 0–100 range", () => {
    const summary = buildProjectWorkflowSummary({
      ...emptyEvidence,
      delimitationFilledFields: 99,
      designFilledCoreFields: -5,
      documents: Number.NaN,
      confirmedInsights: 50,
    });

    expect(summary.progress).toBeGreaterThanOrEqual(0);
    expect(summary.progress).toBeLessThanOrEqual(100);
    summary.phases.forEach((phase) => {
      expect(phase.progress).toBeGreaterThanOrEqual(0);
      expect(phase.progress).toBeLessThanOrEqual(100);
    });
  });
});
