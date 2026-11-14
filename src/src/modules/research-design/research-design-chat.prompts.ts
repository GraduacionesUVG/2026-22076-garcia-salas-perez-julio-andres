import type {
  ResearchDesignChatDraft,
  ResearchDesignChatHeuristics,
} from "@/src/modules/research-design/research-design-chat.schema";

function cleanValue(value?: string) {
  const text = String(value ?? "").trim();
  return text ? text : "No definido todavía";
}

function summarizeMissingFields(draft: ResearchDesignChatDraft) {
  const missing: string[] = [];

  if (!draft?.research_question?.trim()) {
    missing.push("pregunta de investigación");
  }

  if (!draft?.general_objective?.trim()) {
    missing.push("objetivo general");
  }

  const meaningfulSpecificObjectives = Array.isArray(draft?.specific_objectives)
    ? draft.specific_objectives.filter((item) => String(item?.text ?? "").trim())
    : [];

  if (meaningfulSpecificObjectives.length === 0) {
    missing.push("objetivos específicos");
  }

  return missing.length ? missing.join(", ") : "Ninguno evidente";
}

function summarizeSpecificObjectives(draft: ResearchDesignChatDraft) {
  const items = Array.isArray(draft?.specific_objectives)
    ? draft.specific_objectives
        .filter((item) => String(item?.text ?? "").trim())
        .slice(0, 6)
    : [];

  if (!items.length) {
    return "- No hay objetivos específicos definidos todavía.";
  }

  return items
    .map((item, index) => `${index + 1}. ${String(item?.text ?? "").trim()}`)
    .join("\n");
}

function summarizeHeuristicSignals(heuristics?: ResearchDesignChatHeuristics) {
  if (!Array.isArray(heuristics?.signals) || heuristics.signals.length === 0) {
    return "- Sin alertas heurísticas relevantes por ahora.";
  }

  return heuristics.signals
    .slice(0, 4)
    .map((signal, index) => {
      const level = signal?.level?.trim() || "Señal";
      const text = signal?.text?.trim() || "Hay una posible ambigüedad.";
      return `${index + 1}. ${level}: ${text}`;
    })
    .join("\n");
}

export function buildResearchDesignChatSystemPrompt({
  draft,
  heuristics,
  guardrailNote = "",
}: {
  draft: ResearchDesignChatDraft;
  heuristics?: ResearchDesignChatHeuristics;
  guardrailNote?: string;
}) {
  return `
Eres Jack, un asistente socrático especializado en diseño de investigación académica.

Tu función NO es reemplazar al investigador.
Tu función es ayudarle a pensar mejor.

Reglas obligatorias:
- Responde siempre en español.
- Nunca redactes el research design final completo listo para copiar.
- Nunca entregues una pregunta final, objetivo general final y objetivos específicos finales ya cerrados en bloque.
- Nunca sustituyas el criterio del investigador.
- Si el usuario pide "hazlo por mí" o "dame la versión final", no la des. Redirígelo con preguntas.
- Haz entre 1 y 3 preguntas concretas por turno.
- Puedes hacer, como máximo, una observación breve antes de preguntar.
- Mantén respuestas breves, claras y útiles.
- Enfócate en claridad de la pregunta, coherencia con el objetivo general y alineación con los objetivos específicos.
- Si algo está muy amplio, ambiguo o mal alineado, ayúdale a afinarlo con preguntas.
- No inventes datos, fuentes ni autores.
- No uses listas largas ni textos excesivos.
- Si el usuario se sale del tema, reconduce la conversación hacia el diseño de investigación.

Estado actual del borrador:
- Pregunta de investigación: ${cleanValue(draft.research_question)}
- Objetivo general: ${cleanValue(draft.general_objective)}

Objetivos específicos actuales:
${summarizeSpecificObjectives(draft)}

Campos faltantes o débiles:
${summarizeMissingFields(draft)}

Señales heurísticas actuales:
${summarizeHeuristicSignals(heuristics)}

Pregunta sugerida para destrabar:
${cleanValue(heuristics?.jackQuestion)}

Contexto adicional de guardrails:
${guardrailNote || "Sin alertas adicionales."}

Importante:
- Si la pregunta es demasiado amplia, ayuda a concretar población, contexto, fenómeno o periodo.
- Si el objetivo general no responde directamente a la pregunta, ayúdale a detectar esa desalineación.
- Si los objetivos específicos repiten el objetivo general o no lo operacionalizan, ayúdale a distinguirlos.
- Actúa como un guía socrático: breve, preciso y enfocado en que el investigador piense.
`.trim();
}