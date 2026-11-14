import type { ResearchDesignEvaluation } from "./research-design-heuristics";
import { ResearchDesignAIReviewSchema, type ResearchDesignAIReview } from "./research-design-review.schema";

export function buildHeuristicResearchDesignReview(
  evaluation: ResearchDesignEvaluation,
  objectiveIds: Set<string>,
): ResearchDesignAIReview {
  const issues = [
    ...evaluation.question.issues,
    ...evaluation.general_objective.issues,
    ...evaluation.specific_objectives.issues,
    ...evaluation.specific_objectives.items.flatMap(item => item.issues),
    ...evaluation.coherence.issues,
    ...evaluation.alignment.issues,
  ].slice(0, 12).map(issue => ({
    field: issue.field,
    severity: issue.severity,
    title: issue.message.slice(0, 160),
    explanation: issue.message.slice(0, 800),
    ...(issue.suggestion ? { suggestion: issue.suggestion.slice(0, 500) } : {}),
    ...(issue.objective_id && objectiveIds.has(issue.objective_id)
      ? { affected_specific_objective_ids: [issue.objective_id] } : {}),
  }));
  // Missing checks cannot be represented as "unknown" in the existing schema.
  // Use conservative partial states and explicitly state the local limits.
  const checks = evaluation.alignment.by_field;
  const alignmentFor = (field: "topic" | "population" | "context_place" | "time_period") => {
    const statuses = Object.values(checks).map(check => check.checks[field].status);
    if (statuses.every(status => status === "not_applicable")) return "not_applicable" as const;
    if (statuses.includes("misaligned")) return "misaligned" as const;
    if (statuses.every(status => status === "aligned")) return "aligned" as const;
    return "partially_aligned" as const;
  };
  return ResearchDesignAIReviewSchema.parse({
    overall_status: evaluation.summary.overall_status === "empty" ? "warning" : evaluation.summary.overall_status,
    concise_summary: "Revisión heurística local, sin generación de IA. Se muestran las señales del diseño; la coherencia semántica requiere revisión humana.",
    issues,
    guiding_questions: [],
    improvement_suggestions: issues.filter(issue => issue.suggestion).slice(0, 10)
      .map(issue => ({ field: issue.field, suggestion: issue.suggestion! })),
    coverage_check: {
      question_vs_general_objective: "partially_aligned",
      specific_objectives_vs_question: evaluation.summary.specific_objectives_count ? "partially_covered" : "not_covered",
      specific_objectives_vs_general_objective: evaluation.summary.specific_objectives_count ? "partially_covered" : "not_covered",
      explanation: "Las reglas locales detectan señales de completitud y coincidencias; no certifican la cobertura semántica. Contrasta la pregunta y los objetivos manualmente.",
    },
    delimitation_alignment: {
      topic: alignmentFor("topic"), population: alignmentFor("population"),
      context_place: alignmentFor("context_place"), time_period: alignmentFor("time_period"),
      explanation: "Alineación estimada por las reglas heurísticas existentes, no por un modelo generativo.",
    },
    next_step: issues.find(issue => issue.suggestion)?.suggestion?.slice(0, 400) || "Revisa manualmente la coherencia entre pregunta, objetivos y delimitación.",
  });
}
