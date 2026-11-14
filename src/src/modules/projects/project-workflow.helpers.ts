import {
  PROJECT_WORKFLOW_PHASE_KEYS,
  type ProjectWorkflowEvidence,
  type ProjectWorkflowPhase,
  type ProjectWorkflowPhaseKey,
  type ProjectWorkflowPhaseState,
  type ProjectWorkflowSummary,
} from "./project-workflow.types";

const PHASE_LABELS: Record<ProjectWorkflowPhaseKey, string> = {
  delimitation: "Delimitación",
  design: "Diseño",
  sample: "Muestra",
  collection: "Corpus",
  analysis: "Análisis",
  report: "Reporte",
};

function safeCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function ratioProgress(completedChecks: number, totalChecks: number) {
  return Math.round(
    Math.min(1, Math.max(0, completedChecks) / Math.max(1, totalChecks)) * 100
  );
}

function phaseState(progress: number): ProjectWorkflowPhaseState {
  if (progress >= 100) return "completed";
  if (progress > 0) return "in_progress";
  return "not_started";
}

export function normalizeProjectWorkflowEvidence(
  evidence: ProjectWorkflowEvidence
): ProjectWorkflowEvidence {
  return Object.fromEntries(
    Object.entries(evidence).map(([key, value]) => [key, safeCount(value)])
  ) as ProjectWorkflowEvidence;
}

export function buildProjectWorkflowSummary(
  rawEvidence: ProjectWorkflowEvidence
): ProjectWorkflowSummary {
  const evidence = normalizeProjectWorkflowEvidence(rawEvidence);

  const phaseProgress: Record<ProjectWorkflowPhaseKey, number> = {
    delimitation: ratioProgress(
      Math.min(evidence.delimitationFilledFields, 5) +
        (evidence.delimitationIncludeItems > 0 ? 1 : 0) +
        (evidence.delimitationExcludeItems > 0 ? 1 : 0),
      7
    ),
    design: ratioProgress(
      Math.min(evidence.designFilledCoreFields, 2) +
        (evidence.specificObjectives > 0 ? 1 : 0),
      3
    ),
    sample: ratioProgress(
      Math.min(evidence.sampleFilledCoreFields, 5) +
        (evidence.collectionTechniques > 0 ? 1 : 0),
      6
    ),
    collection: ratioProgress(
      (evidence.documents > 0 ? 1 : 0) + (evidence.segments > 0 ? 1 : 0),
      2
    ),
    analysis: ratioProgress(
      (evidence.segments > 0 ? 1 : 0) +
        (evidence.codes > 0 ? 1 : 0) +
        (evidence.assignments > 0 ? 1 : 0) +
        (evidence.insights > 0 ? 1 : 0),
      4
    ),
    report: evidence.confirmedInsights > 0 ? 100 : evidence.insights > 0 ? 50 : 0,
  };

  const stateMap = Object.fromEntries(
    PROJECT_WORKFLOW_PHASE_KEYS.map((key) => [key, phaseState(phaseProgress[key])])
  ) as Record<ProjectWorkflowPhaseKey, ProjectWorkflowPhaseState>;

  const hasAnalysisEvidence =
    evidence.segments +
      evidence.codes +
      evidence.assignments +
      evidence.memos +
      evidence.insights >
    0;

  const availability: Record<ProjectWorkflowPhaseKey, boolean> = {
    delimitation: true,
    design:
      stateMap.delimitation === "completed" ||
      stateMap.design !== "not_started",
    sample:
      stateMap.design === "completed" || stateMap.sample !== "not_started",
    collection:
      stateMap.sample === "completed" || stateMap.collection !== "not_started",
    analysis:
      stateMap.collection !== "not_started" || hasAnalysisEvidence,
    report:
      stateMap.analysis === "completed" || stateMap.report !== "not_started",
  };

  const phases = PROJECT_WORKFLOW_PHASE_KEYS.map<ProjectWorkflowPhase>((key) => ({
    key,
    label: PHASE_LABELS[key],
    state: stateMap[key],
    progress: phaseProgress[key],
    available: availability[key],
  }));

  const phaseMap = Object.fromEntries(
    phases.map((phase) => [phase.key, phase])
  ) as Record<ProjectWorkflowPhaseKey, ProjectWorkflowPhase>;

  return {
    progress: Math.round(
      phases.reduce((total, phase) => total + phase.progress, 0) / phases.length
    ),
    phases,
    phaseMap,
    evidence,
  };
}
