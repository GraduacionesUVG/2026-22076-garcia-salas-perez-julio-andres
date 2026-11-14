import type { SampleConfigReviewEvaluation } from "./sample-config-review.heuristics";
import type { SampleConfigReviewFocus } from "./sample-config-review.schema";
import type {
  SampleConfigFullPayload,
  SampleConfigOptionsPayload,
} from "./sample-config.service";

type PromptInput = {
  data: SampleConfigFullPayload;
  options: SampleConfigOptionsPayload;
  evaluation: SampleConfigReviewEvaluation;
  focus: SampleConfigReviewFocus;
};

function findOptionLabel(rows: Array<{ code: string; label: string }>, code: string | null) {
  if (!code) return null;
  return rows.find((item) => item.code === code)?.label ?? code;
}

function buildTechniqueLabels(
  data: SampleConfigFullPayload,
  options: SampleConfigOptionsPayload
) {
  return data.collection_techniques.map((item) => ({
    technique_code: item.technique_code ?? null,
    label: item.is_custom
      ? item.custom_label ?? "Técnica personalizada"
      : findOptionLabel(options.collection_technique_options, item.technique_code),
    custom_label: item.custom_label ?? null,
    is_custom: item.is_custom,
    position: item.position,
  }));
}

export function buildSampleConfigReviewSystemPrompt() {
  return `
Eres un asesor metodológico académico especializado en configuración de muestra para investigaciones cualitativas y de enfoque antropológico.

Tu tarea es revisar:
1. el enfoque principal,
2. el alcance,
3. las técnicas de recolección,
4. la descripción de la fase de campo,
5. el tamaño de muestra,
6. y la justificación del tamaño de muestra.

Reglas obligatorias:
- NO redactes una versión final cerrada del protocolo.
- NO inventes participantes, técnicas ni tamaños de muestra.
- NO afirmes que algo está bien sin justificarlo.
- Debes evaluar coherencia metodológica entre enfoque, alcance, técnicas, fase de campo y justificación.
- Si detectas debilidades, explica por qué son un problema metodológico.
- Si propones mejoras, deben ser puntuales y aplicables.
- Prioriza claridad, consistencia interna, viabilidad y justificación metodológica.
- Devuelve SIEMPRE un objeto estructurado.
- No entregues markdown.
- No entregues texto fuera del objeto solicitado.
`.trim();
}

export function buildSampleConfigReviewUserPrompt(input: PromptInput) {
  const { data, options, evaluation, focus } = input;

  const payload = {
    focus,
    sample_config: {
      project_id: data.config.project_id,
      main_approach: {
        code: data.config.main_approach_code ?? null,
        label: findOptionLabel(
          options.main_approaches,
          data.config.main_approach_code
        ),
      },
      scope: {
        code: data.config.scope_code ?? null,
        label: findOptionLabel(options.scopes, data.config.scope_code),
      },
      field_phase: data.config.field_phase ?? "",
      target_sample_size: data.config.target_sample_size ?? null,
      sample_size_rationale: data.config.sample_size_rationale ?? "",
      collection_techniques: buildTechniqueLabels(data, options),
    },
    heuristic_evaluation: evaluation,
    instructions: {
      expected_behavior:
        "Analiza si la configuración de muestra tiene coherencia metodológica, si las técnicas son razonables para el enfoque y alcance, si la fase de campo está contextualizada y si el tamaño de muestra está justificado.",
      focus_behavior: {
        full:
          "Evalúa toda la configuración de muestra con visión integral.",
        coverage:
          "Pon mayor atención a si la configuración cubre lo mínimo necesario para que la fase sea metodológicamente defendible.",
        rationale:
          "Pon mayor atención a la coherencia entre tamaño de muestra, técnicas, fase de campo y justificación.",
      },
      output_rules: [
        "Devuelve overall_status",
        "Devuelve concise_summary",
        "Devuelve issues",
        "Devuelve strengths",
        "Devuelve guiding_questions",
        "Devuelve improvement_suggestions",
        "Devuelve coverage_check",
        "Devuelve next_step",
      ],
    },
  };

  return JSON.stringify(payload, null, 2);
}