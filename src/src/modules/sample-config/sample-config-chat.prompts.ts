import type {
  SampleConfigChatDraft,
  SampleConfigChatHeuristics,
} from "@/src/modules/sample-config/sample-config-chat.schema";

function cleanValue(value?: string) {
  const text = String(value ?? "").trim();
  return text ? text : "No definido todavía";
}

function summarizeTechniques(draft: SampleConfigChatDraft) {
  const items = Array.isArray(draft?.collection_techniques)
    ? draft.collection_techniques
        .filter(
          (item) =>
            String(item?.label ?? "").trim() ||
            String(item?.custom_label ?? "").trim() ||
            String(item?.technique_code ?? "").trim()
        )
        .slice(0, 8)
    : [];

  if (!items.length) {
    return "- No hay técnicas de recolección definidas todavía.";
  }

  return items
    .map((item, index) => {
      const label =
        String(item?.label ?? "").trim() ||
        String(item?.custom_label ?? "").trim() ||
        String(item?.technique_code ?? "").trim() ||
        "Técnica sin nombre";
      return `${index + 1}. ${label}`;
    })
    .join("\n");
}

function summarizeMissingFields(draft: SampleConfigChatDraft) {
  const missing: string[] = [];

  if (!draft?.main_approach_label?.trim() && !draft?.main_approach_code?.trim()) {
    missing.push("enfoque principal");
  }

  if (!draft?.scope_label?.trim() && !draft?.scope_code?.trim()) {
    missing.push("alcance");
  }

  const meaningfulTechniques = Array.isArray(draft?.collection_techniques)
    ? draft.collection_techniques.filter((item) => {
        return Boolean(
          String(item?.label ?? "").trim() ||
            String(item?.custom_label ?? "").trim() ||
            String(item?.technique_code ?? "").trim()
        );
      })
    : [];

  if (meaningfulTechniques.length === 0) {
    missing.push("técnicas de recolección");
  }

  if (!draft?.field_phase?.trim()) {
    missing.push("fase de campo");
  }

  if (!draft?.target_sample_size?.trim()) {
    missing.push("tamaño de muestra");
  }

  if (!draft?.sample_size_rationale?.trim()) {
    missing.push("justificación del tamaño de muestra");
  }

  return missing.length ? missing.join(", ") : "Ninguno evidente";
}

function summarizeHeuristicSignals(heuristics?: SampleConfigChatHeuristics) {
  if (!Array.isArray(heuristics?.signals) || heuristics.signals.length === 0) {
    return "- Sin alertas heurísticas relevantes por ahora.";
  }

  return heuristics.signals
    .slice(0, 4)
    .map((signal, index) => {
      const level = signal?.level?.trim() || "Señal";
      const text = signal?.text?.trim() || "Hay una posible debilidad.";
      return `${index + 1}. ${level}: ${text}`;
    })
    .join("\n");
}

export function buildSampleConfigChatSystemPrompt({
  draft,
  heuristics,
  guardrailNote = "",
}: {
  draft: SampleConfigChatDraft;
  heuristics?: SampleConfigChatHeuristics;
  guardrailNote?: string;
}) {
  return `
Eres Jack, un asistente socrático especializado en configuración de muestra para investigación académica, especialmente en contextos cualitativos y antropológicos.

Tu función NO es reemplazar al investigador.
Tu función es ayudarle a pensar mejor.

Reglas obligatorias:
- Responde siempre en español.
- Nunca redactes la sección final completa de sample-config lista para copiar.
- Nunca cierres por tu cuenta toda la decisión metodológica.
- Si el usuario pide "hazlo por mí" o "dame la versión final", no la des. Redirígelo con preguntas.
- Haz entre 1 y 3 preguntas concretas por turno.
- Puedes hacer, como máximo, una observación breve antes de preguntar.
- Mantén respuestas breves, claras y útiles.
- Enfócate en coherencia entre enfoque, alcance, técnicas, fase de campo, tamaño de muestra y justificación.
- Si algo está muy amplio, ambiguo o poco defendible, ayúdale a afinarlo con preguntas.
- No inventes datos, participantes, tamaños de muestra, técnicas ni autores.
- No uses listas largas ni textos excesivos.
- Si el usuario se sale del tema, reconduce la conversación hacia la configuración de muestra.

Estado actual del borrador:
- Enfoque principal: ${cleanValue(
    draft.main_approach_label || draft.main_approach_code
  )}
- Alcance: ${cleanValue(draft.scope_label || draft.scope_code)}
- Fase de campo: ${cleanValue(draft.field_phase)}
- Tamaño de muestra: ${cleanValue(draft.target_sample_size)}
- Justificación del tamaño de muestra: ${cleanValue(
    draft.sample_size_rationale
  )}

Técnicas actuales:
${summarizeTechniques(draft)}

Campos faltantes o débiles:
${summarizeMissingFields(draft)}

Señales heurísticas actuales:
${summarizeHeuristicSignals(heuristics)}

Pregunta sugerida para destrabar:
${cleanValue(heuristics?.jackQuestion)}

Resumen heurístico breve:
${cleanValue(heuristics?.conciseSummary)}

Contexto adicional de guardrails:
${guardrailNote || "Sin alertas adicionales."}

Importante:
- Si el enfoque no encaja con las técnicas, ayuda a detectar esa incoherencia.
- Si el tamaño de muestra aparece arbitrario, ayúdale a justificarlo mejor.
- Si la fase de campo no contextualiza el acceso o el momento del trabajo de campo, ayúdale a precisarla.
- Actúa como un guía socrático: breve, preciso y enfocado en que el investigador piense.
`.trim();
}