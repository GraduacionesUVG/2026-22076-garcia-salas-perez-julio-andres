import { buildProjectWorkflowSummary } from "./project-workflow.helpers";
import type { ProjectWorkflowRepo } from "./project-workflow.repo";
import type { ProjectWorkflowEvidence } from "./project-workflow.types";

function hasValue(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function countValues(values: unknown[]) {
  return values.filter(hasValue).length;
}

export class ProjectWorkflowService {
  constructor(private readonly repo: ProjectWorkflowRepo) {}

  async getSummary(projectId: string) {
    const source = await this.repo.getSource(projectId);
    const evidence: ProjectWorkflowEvidence = {
      delimitationFilledFields: source.delimitation
        ? countValues([
            source.delimitation.topic,
            source.delimitation.context_place,
            source.delimitation.population,
            source.delimitation.time_period,
            source.delimitation.resources,
          ])
        : 0,
      delimitationItems: source.delimitationItems,
      delimitationIncludeItems: source.delimitationIncludeItems,
      delimitationExcludeItems: source.delimitationExcludeItems,
      designFilledCoreFields: source.design
        ? countValues([
            source.design.research_question,
            source.design.general_objective,
          ])
        : 0,
      specificObjectives: source.specificObjectives,
      sampleFilledCoreFields: source.sample
        ? countValues([
            source.sample.main_approach_code,
            source.sample.scope_code,
            source.sample.field_phase,
            Number(source.sample.target_sample_size) > 0
              ? source.sample.target_sample_size
              : null,
            source.sample.sample_size_rationale,
          ])
        : 0,
      collectionTechniques: source.collectionTechniques,
      documents: source.documents,
      segments: source.segments,
      codes: source.codes,
      assignments: source.assignments,
      memos: source.memos,
      insights: source.insights,
      confirmedInsights: source.confirmedInsights,
    };

    return buildProjectWorkflowSummary(evidence);
  }
}
