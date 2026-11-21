import { buildProjectWorkflowSummary } from "@/src/modules/projects/project-workflow.helpers";

type Evidence = Parameters<typeof buildProjectWorkflowSummary>[0];

const emptyEvidence: Evidence = {
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

const operations: Array<keyof Evidence> = [
  "delimitationFilledFields",
  "delimitationIncludeItems",
  "delimitationExcludeItems",
  "designFilledCoreFields",
  "specificObjectives",
  "sampleFilledCoreFields",
  "collectionTechniques",
  "documents",
  "segments",
  "codes",
  "assignments",
  "memos",
  "insights",
  "confirmedInsights",
];

function increment(evidence: Evidence, key: keyof Evidence): Evidence {
  return { ...evidence, [key]: evidence[key] + 1 };
}

describe("project workflow state machine", () => {
  it("keeps progress and phase availability monotonic as evidence is added", () => {
    let evidence = emptyEvidence;
    let previous = buildProjectWorkflowSummary(evidence);

    for (let index = 0; index < operations.length * 2; index += 1) {
      evidence = increment(evidence, operations[index % operations.length]);
      const current = buildProjectWorkflowSummary(evidence);

      expect(current.progress).toBeGreaterThanOrEqual(previous.progress);
      current.phases.forEach((phase, phaseIndex) => {
        expect(phase.progress).toBeGreaterThanOrEqual(
          previous.phases[phaseIndex].progress
        );
        if (previous.phases[phaseIndex].available) {
          expect(phase.available).toBe(true);
        }
      });

      previous = current;
    }
  });

  it("reaches a report only after confirmed insight evidence exists", () => {
    const withoutConfirmation = buildProjectWorkflowSummary({
      ...emptyEvidence,
      insights: 4,
      confirmedInsights: 0,
    });
    const confirmed = buildProjectWorkflowSummary({
      ...emptyEvidence,
      insights: 4,
      confirmedInsights: 1,
    });

    expect(withoutConfirmation.phaseMap.report.progress).toBe(50);
    expect(withoutConfirmation.phaseMap.report.state).toBe("in_progress");
    expect(confirmed.phaseMap.report.progress).toBe(100);
    expect(confirmed.phaseMap.report.state).toBe("completed");
  });
});
