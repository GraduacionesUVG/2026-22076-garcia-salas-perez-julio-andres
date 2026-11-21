export const PROJECT_WORKFLOW_PHASE_KEYS = [
  "delimitation",
  "design",
  "sample",
  "collection",
  "analysis",
  "report",
] as const;

export type ProjectWorkflowPhaseKey =
  (typeof PROJECT_WORKFLOW_PHASE_KEYS)[number];

export type ProjectWorkflowPhaseState =
  | "not_started"
  | "in_progress"
  | "completed";

export type ProjectWorkflowEvidence = {
  delimitationFilledFields: number;
  delimitationItems: number;
  delimitationIncludeItems: number;
  delimitationExcludeItems: number;
  designFilledCoreFields: number;
  specificObjectives: number;
  sampleFilledCoreFields: number;
  collectionTechniques: number;
  documents: number;
  segments: number;
  codes: number;
  assignments: number;
  memos: number;
  insights: number;
  confirmedInsights: number;
};

export type ProjectWorkflowPhase = {
  key: ProjectWorkflowPhaseKey;
  label: string;
  state: ProjectWorkflowPhaseState;
  progress: number;
  available: boolean;
};

export type ProjectWorkflowSummary = {
  progress: number;
  phases: ProjectWorkflowPhase[];
  phaseMap: Record<ProjectWorkflowPhaseKey, ProjectWorkflowPhase>;
  evidence: ProjectWorkflowEvidence;
};

export type ProjectWorkflowSource = {
  delimitation: {
    topic: string | null;
    context_place: string | null;
    population: string | null;
    time_period: string | null;
    resources: string | null;
  } | null;
  design: {
    research_question: string | null;
    general_objective: string | null;
  } | null;
  sample: {
    main_approach_code: string | null;
    scope_code: string | null;
    target_sample_size: number | null;
    sample_size_rationale: string | null;
    field_phase: string | null;
  } | null;
  delimitationItems: number;
  delimitationIncludeItems: number;
  delimitationExcludeItems: number;
  specificObjectives: number;
  collectionTechniques: number;
  documents: number;
  segments: number;
  codes: number;
  assignments: number;
  memos: number;
  insights: number;
  confirmedInsights: number;
};
