import type { SampleConfigReviewEvaluation } from "./sample-config-review.heuristics";
import { SampleConfigAIReviewSchema, type SampleConfigAIReview } from "./sample-config-review.schema";

export function buildHeuristicSampleConfigReview(evaluation: SampleConfigReviewEvaluation): SampleConfigAIReview {
  const warnings = evaluation.signals.filter(signal => signal.status === "warning");
  return SampleConfigAIReviewSchema.parse({
    overall_status: warnings.length ? "warning" : "good",
    concise_summary: `Revisión heurística local, sin generación de IA. Completitud: ${evaluation.completeness_score}%. La pertinencia metodológica requiere revisión humana.`,
    issues: warnings.slice(0, 10).map(signal => ({
      field: signal.field, severity: "warning", title: signal.message.slice(0, 160), explanation: signal.message.slice(0, 800),
    })),
    strengths: evaluation.signals.filter(signal => signal.status === "ok").slice(0, 6).map(signal => signal.message.slice(0, 220)),
    guiding_questions: [],
    improvement_suggestions: warnings.slice(0, 8).map(signal => ({ field: signal.field, suggestion: signal.message.slice(0, 500) })),
    coverage_check: {
      approach_scope_alignment: "partially_aligned",
      techniques_alignment: evaluation.collection_techniques_count ? "partial" : "insufficient",
      sample_size_rationale_alignment: evaluation.rationale_length ? "partially_supported" : "unsupported",
      field_phase_context: !evaluation.field_phase_length ? "unclear" : evaluation.field_phase_length >= 25 ? "clear" : "partial",
      explanation: "Las reglas locales comprueban presencia y extensión de los campos, no la idoneidad del enfoque, las técnicas ni el tamaño de muestra.",
    },
    next_step: warnings[0]?.message.slice(0, 400) || "Revisa manualmente la pertinencia de las técnicas y la justificación de la muestra.",
  });
}
