import type { DelimitationReviewRequest } from "@/src/modules/delimitation/delimitation-review.schema";

function printList(items: string[]) {
  if (!Array.isArray(items) || items.length === 0) {
    return "No definidos todavía.";
  }

  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function heuristicSummary(
  heuristics?: DelimitationReviewRequest["heuristics"]
) {
  if (!heuristics) {
    return "No hay señales heurísticas disponibles.";
  }

  const lines: string[] = [];

  if (typeof heuristics.totalHighlights === "number") {
    lines.push(`Total de hallazgos heurísticos: ${heuristics.totalHighlights}`);
  }

  if (heuristics.jackQuestion) {
    lines.push(`Pregunta heurística actual: ${heuristics.jackQuestion}`);
  }

  if (Array.isArray(heuristics.signals) && heuristics.signals.length > 0) {
    lines.push("Señales heurísticas:");
    heuristics.signals.slice(0, 4).forEach((signal, index) => {
      lines.push(
        `${index + 1}. [${signal.field || "general"}] ${
          signal.level || "Señal"
        }: ${signal.text || "Sin detalle"}`
      );
    });
  }

  return lines.join("\n");
}

export function buildDelimitationReviewPrompt(
  input: DelimitationReviewRequest,
  options?: { guardrailNote?: string }
) {
  const draft = input?.draft ?? {};
  const guardrailNote = options?.guardrailNote ?? "";

  return `
Eres un evaluador académico experto en delimitación de investigaciones cualitativas.

Tu tarea NO es redactar la delimitación final por el estudiante.
Tu tarea es evaluar qué tan clara, acotada, viable y específica está su delimitación actual.

Debes evaluar:
- tema
- contexto espacial
- tiempo
- población
- recursos
- criterios de inclusión
- criterios de exclusión

Reglas de evaluación:
- Sé exigente pero útil.
- No reescribas la delimitación completa.
- No devuelvas texto fuera del objeto estructurado.
- Si algo está vacío, márcalo como pendiente.
- Si algo sigue siendo muy amplio, dilo claramente.
- Si algo está bien, reconócelo.
- Tus findings deben ser accionables y concretos.
- La jackQuestion debe ser socrática, breve y útil.
- suggestedNextStep debe ser una acción concreta de siguiente paso.
- findings máximo 5 si basta con menos.
- Si el lugar dice solo "Guatemala", puede ser muy amplio.
- Si el lugar dice "Ciudad de Guatemala" o una institución/lugar específico, no lo trates igual de amplio.
- Si el periodo ya tiene meses o fechas acotadas, no lo castigues como si fuera ambiguo.
- Nunca propongas “copia esta delimitación final”.
- Nunca conviertas la sugerencia en una respuesta final cerrada.

Reglas de redacción para findings:
- title debe decir el problema en una frase corta.
- message debe explicar qué pasa y por qué importa.
- suggestion debe decir cómo corregirlo con una acción concreta.
- No repitas exactamente el mismo texto en title, message y suggestion.
- No uses mensajes vagos como "debe mejorar" sin decir qué cambiar.
- Si el problema está en el tema, indica si falta fenómeno, variable, relación, población, contexto o alcance.
- Si el problema está en población, indica qué rasgo falta: edad, rol, institución, condición, cargo, sector o ubicación.
- Si el problema está en contexto espacial, indica qué nivel falta: ciudad, municipio, comunidad, institución, sede o zona.
- Si el problema está en tiempo, indica si faltan fechas, años, meses o rango temporal.
- Si el problema está en recursos, indica si faltan fuentes, bases, documentos, herramientas o acceso realista.

Formato esperado de cada finding:
- field: campo afectado
- kind: riesgo, mejora o fortaleza
- severity: alta, media o baja
- title: problema breve
- message: qué pasa y por qué importa
- suggestion: cómo corregirlo de forma concreta

Borrador actual:
Tema: ${draft.topic || "No definido"}
Contexto espacial: ${draft.context_place || "No definido"}
Periodo: ${draft.time_period || "No definido"}
Población: ${draft.population || "No definido"}
Recursos: ${draft.resources || "No definido"}

Criterios de inclusión:
${printList(Array.isArray(draft.include) ? draft.include : [])}

Criterios de exclusión:
${printList(Array.isArray(draft.exclude) ? draft.exclude : [])}

Contexto heurístico disponible:
${heuristicSummary(input?.heuristics)}

Contexto adicional de guardrails:
${guardrailNote || "Sin alertas adicionales."}
`.trim();
}