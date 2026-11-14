import type { DelimitationFullPayload } from "@/src/modules/delimitation/delimitation.service";
import type { ResearchDesignFullPayload } from "./research-design.service";
import type { ResearchDesignEvaluation } from "./research-design-heuristics";
import type { ResearchDesignReviewFocus } from "./research-design-review.schema";

type PromptInput = {
  data: ResearchDesignFullPayload;
  delimitation?: DelimitationFullPayload | null;
  evaluation: ResearchDesignEvaluation;
  focus: ResearchDesignReviewFocus;
};

export function buildResearchDesignSystemPrompt() {
  return `
Eres un asesor metodológico académico para investigaciones cualitativas.

Tu tarea es revisar:
1. la pregunta de investigación,
2. el objetivo general,
3. los objetivos específicos,
4. y su coherencia con la fase previa de delimitación.

Reglas obligatorias:
- NO redactes una investigación final completa.
- NO inventes datos.
- NO afirmes que algo está "correcto" sin justificarlo.
- Tu rol es guiar, señalar problemas y hacer preguntas útiles.
- Debes priorizar claridad metodológica, coherencia interna, delimitación, investigabilidad, cobertura y consistencia entre fases.
- Debes revisar si la pregunta y los objetivos respetan el tema, la población, el contexto y el tiempo definidos en delimitación.
- Si detectas problemas, explícalos con tono académico claro y humano.
- Si propones mejoras, deben ser puntuales y concretas, no una reescritura total automática.
- Devuelve SIEMPRE un objeto estructurado.
- No entregues markdown.
- No entregues texto fuera del objeto solicitado.
- No conviertas tus sugerencias en una versión final cerrada.

Reglas específicas para objetivos específicos:
- Cuando un problema afecte a uno o más objetivos específicos concretos, el issue debe usar field: "specific_objectives".
- En ese caso, debes llenar affected_specific_objective_ids con los IDs exactos de los objetivos afectados.
- Usa únicamente IDs que aparecen en research_design.specific_objectives.
- No inventes IDs.
- Si el problema afecta al conjunto completo de objetivos específicos, puedes omitir affected_specific_objective_ids.
- Cada issue debe explicar qué pasa, por qué importa y cómo corregirlo.
- Cuando sea posible, agrega una suggestion concreta dentro del issue.
`.trim();
}

export function buildResearchDesignUserPrompt(input: PromptInput) {
  const { data, delimitation, evaluation, focus } = input;

  const payload = {
    focus,
    delimitation_phase: delimitation
      ? {
          topic: delimitation.delim?.topic ?? "",
          context_place: delimitation.delim?.context_place ?? "",
          population: delimitation.delim?.population ?? "",
          time_period: delimitation.delim?.time_period ?? "",
          resources: delimitation.delim?.resources ?? "",
          include: (delimitation.include ?? []).map((item) => item.text),
          exclude: (delimitation.exclude ?? []).map((item) => item.text),
        }
      : null,
    research_design: {
      project_id: data.design.project_id,
      research_question: data.design.research_question ?? "",
      general_objective: data.design.general_objective ?? "",
      specific_objectives: data.specific_objectives.map((item) => ({
        id: item.id,
        position: item.position,
        number: item.position + 1,
        text: item.text,
      })),
    },
    heuristic_evaluation: evaluation,
    instructions: {
      expected_behavior:
        "Analiza calidad metodológica, claridad, coherencia entre pregunta y objetivos, cobertura de los objetivos específicos y consistencia con la delimitación previa.",
      focus_behavior: {
        full: "Evalúa todo el diseño de investigación y su alineación con la delimitación.",
        question:
          "Pon mayor atención a la pregunta de investigación, su relación con el objetivo general y su coherencia con la delimitación.",
        objectives:
          "Pon mayor atención al objetivo general, los objetivos específicos, sus verbos, su cobertura y su coherencia con la delimitación.",
      },
      objective_issue_rules: [
        "Si un issue afecta a un objetivo específico individual, identifica el objetivo usando affected_specific_objective_ids.",
        "affected_specific_objective_ids debe contener los IDs exactos recibidos en research_design.specific_objectives.",
        "No uses números de objetivo como IDs.",
        "No inventes IDs.",
        "Si el problema afecta a todos los objetivos específicos como conjunto, field debe ser specific_objectives y affected_specific_objective_ids puede omitirse.",
        "En cada issue, usa title para resumir el problema, explanation para explicar por qué importa y suggestion para decir cómo corregirlo.",
      ],
      output_rules: [
        "Devuelve overall_status",
        "Devuelve concise_summary",
        "Devuelve issues",
        "Devuelve guiding_questions",
        "Devuelve improvement_suggestions",
        "Devuelve coverage_check",
        "Devuelve delimitation_alignment",
        "Devuelve next_step",
      ],
    },
  };

  return JSON.stringify(payload, null, 2);
}