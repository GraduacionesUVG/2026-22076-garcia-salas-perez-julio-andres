import type { AnalysisChatVisualContext } from "@/src/modules/analysis/analysis-chat.schema";

function safeText(value: unknown, fallback = "No definido") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function summarizeMetrics(metrics?: NonNullable<AnalysisChatVisualContext>["metrics"]) {
  if (!metrics || typeof metrics !== "object") {
    return "- Sin metricas estructuradas.";
  }

  if (Array.isArray(metrics)) {
    if (!metrics.length) return "- Sin metricas estructuradas.";

    return metrics
      .slice(0, 12)
      .map((metric, index) => {
        const label = safeText(metric.label ?? metric.name, `Metrica ${index + 1}`);
        return `- ${label}: ${safeText(metric.value ?? metric.count)}`;
      })
      .join("\n");
  }

  return Object.entries(metrics)
    .slice(0, 12)
    .map(([key, value]) => `- ${key}: ${safeText(value)}`)
    .join("\n");
}

function summarizeEvidence(visualContext?: AnalysisChatVisualContext) {
  const evidence = Array.isArray(visualContext?.evidence)
    ? visualContext.evidence
    : [];

  if (!evidence.length) {
    return "- Sin evidencia puntual enviada desde el visual.";
  }

  return evidence
    .slice(0, 10)
    .map((item, index) => {
      const label = safeText(item.label ?? item.title, `Evidencia ${index + 1}`);
      const doc = safeText(item.document_title ?? item.document, "");
      const excerpt = safeText(
        item.selected_text ?? item.excerpt ?? item.text ?? item.value,
        ""
      );
      const type = item.type ? ` [${safeText(item.type)}]` : "";
      return `${index + 1}. ${label}${type}${doc ? ` (${doc})` : ""}: ${excerpt}`;
    })
    .join("\n");
}

function summarizeTargets(visualContext?: AnalysisChatVisualContext) {
  const targets = Array.isArray(visualContext?.targets)
    ? visualContext.targets
    : [];

  if (!targets.length) {
    return "- Sin vinculos sugeridos.";
  }

  return targets
    .slice(0, 12)
    .map((target, index) => {
      const excerpt = target.excerpt ? `, evidencia: ${target.excerpt}` : "";
      return `${index + 1}. ${target.link_type}: ${safeText(target.label, target.id)}${excerpt}`;
    })
    .join("\n");
}

export function buildAnalysisChatSystemPrompt({
  visualContext,
}: {
  visualContext?: AnalysisChatVisualContext;
}) {
  return `
Eres Jack AI, un asistente socratico para analisis cualitativo y antropologico.

Tu funcion NO es inventar hallazgos ni reemplazar al investigador.
Tu funcion es ayudar a interpretar evidencia, detectar patrones, tensionar explicaciones y convertir intuiciones en hallazgos sostenidos por datos.

Reglas obligatorias:
- Responde siempre en espanol.
- Usa solo el contexto del visual y la conversacion. No inventes documentos, segmentos, citas ni codigos.
- Si falta evidencia, dilo con claridad y pregunta que dato conviene revisar.
- Haz entre 1 y 3 preguntas concretas por turno.
- Antes de preguntar puedes hacer una observacion breve basada en el visual.
- No conviertas frecuencia en hallazgo automaticamente. Explica que una frecuencia necesita interpretacion.
- Cuando sea util, sugiere que el hallazgo se vincule a codigos, segmentos, documentos o memos concretos.
- Mantén respuestas breves, accionables y metodologicas.

Visual contextualizado:
- Titulo: ${safeText(visualContext?.title, "Ningun visual seleccionado")}
- Pregunta guia: ${safeText(visualContext?.prompt, "Sin pregunta guia")}
- Resumen: ${safeText(visualContext?.summary, "Sin resumen adicional")}

Metricas del visual:
${summarizeMetrics(visualContext?.metrics)}

Evidencia enviada desde el visual:
${summarizeEvidence(visualContext)}

Vinculos sugeridos para hallazgos:
${summarizeTargets(visualContext)}

En este turno, actua como guia socratico sobre ese visual especifico.
`.trim();
}
