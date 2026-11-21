import type {
  DelimitationReviewOutput,
  DelimitationReviewRequest,
} from "@/src/modules/delimitation/delimitation-review.schema";

type ReviewField = keyof DelimitationReviewOutput["fields"];
type ReviewAssessment = DelimitationReviewOutput["fields"][ReviewField];
type ReviewDraft = Required<NonNullable<DelimitationReviewRequest["draft"]>>;
type ReviewHeuristics = DelimitationReviewRequest["heuristics"];

type FieldDefinition = {
  label: string;
  missingNote: string;
  missingSuggestion: string;
};

const FIELD_DEFINITIONS: Record<ReviewField, FieldDefinition> = {
  topic: {
    label: "tema",
    missingNote: "Todavía no hay un tema definido.",
    missingSuggestion:
      "Define el fenómeno y la dimensión concreta que quieres investigar.",
  },
  context_place: {
    label: "contexto espacial",
    missingNote: "Todavía no hay un contexto espacial definido.",
    missingSuggestion:
      "Indica la ciudad, comunidad, institución o espacio específico del estudio.",
  },
  time_period: {
    label: "periodo",
    missingNote: "Todavía no hay un periodo definido.",
    missingSuggestion:
      "Agrega fechas, meses, ciclos o años concretos para cerrar el alcance temporal.",
  },
  population: {
    label: "población",
    missingNote: "Todavía no hay una población definida.",
    missingSuggestion:
      "Indica quiénes participarán y qué rasgos delimitan al grupo.",
  },
  resources: {
    label: "recursos",
    missingNote: "Todavía no hay recursos definidos.",
    missingSuggestion:
      "Indica fuentes, documentos, herramientas o accesos disponibles.",
  },
  include: {
    label: "criterios de inclusión",
    missingNote: "Todavía no hay criterios de inclusión.",
    missingSuggestion:
      "Define qué casos, documentos o participantes sí formarán parte del estudio.",
  },
  exclude: {
    label: "criterios de exclusión",
    missingNote: "Todavía no hay criterios de exclusión.",
    missingSuggestion:
      "Define qué casos, documentos o participantes quedarán fuera del estudio.",
  },
};

const REVIEW_FIELDS = Object.keys(FIELD_DEFINITIONS) as ReviewField[];

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hasFieldContent(draft: ReviewDraft, field: ReviewField) {
  const value = draft[field];
  return Array.isArray(value)
    ? value.some((item) => String(item).trim())
    : Boolean(String(value ?? "").trim());
}

function signalForField(
  heuristics: ReviewHeuristics,
  field: ReviewField
) {
  return heuristics?.signals?.find((signal) => signal.field === field);
}

function assessmentForField(
  draft: ReviewDraft,
  heuristics: ReviewHeuristics,
  field: ReviewField
): ReviewAssessment {
  const definition = FIELD_DEFINITIONS[field];

  if (!hasFieldContent(draft, field)) {
    return {
      score: 0,
      status: "pendiente",
      note: definition.missingNote,
      priority: "alta",
    };
  }

  const signal = signalForField(heuristics, field);
  const level = normalizeText(signal?.level);

  if (level.includes("muy amplio")) {
    return {
      score: 35,
      status: "amplio",
      note:
        String(signal?.text ?? "").trim().slice(0, 280) ||
        `El ${definition.label} todavía es demasiado amplio.`,
      priority: "alta",
    };
  }

  if (level.includes("difuso") || level.includes("revisar")) {
    return {
      score: 55,
      status: "amplio",
      note:
        String(signal?.text ?? "").trim().slice(0, 280) ||
        `El ${definition.label} necesita mayor precisión.`,
      priority: "media",
    };
  }

  return {
    score: 90,
    status: "bien_delimitado",
    note: `El ${definition.label} está definido y no presenta alertas heurísticas activas.`,
    priority: "baja",
  };
}

function severityForAssessment(
  assessment: ReviewAssessment
): "alta" | "media" | "baja" {
  if (assessment.status === "pendiente" || assessment.priority === "alta") {
    return "alta";
  }

  return assessment.priority === "media" ? "media" : "baja";
}

function buildFindings(
  assessments: DelimitationReviewOutput["fields"]
): DelimitationReviewOutput["findings"] {
  const findings: DelimitationReviewOutput["findings"] = [];

  for (const field of REVIEW_FIELDS) {
    const assessment = assessments[field];
    if (assessment.status === "bien_delimitado") continue;

    const definition = FIELD_DEFINITIONS[field];
    findings.push({
      field,
      kind: assessment.status === "pendiente" ? "riesgo" : "mejora",
      severity: severityForAssessment(assessment),
      title:
        assessment.status === "pendiente"
          ? `Falta definir ${definition.label}`
          : `Conviene precisar ${definition.label}`,
      message: assessment.note.slice(0, 240),
      suggestion: definition.missingSuggestion,
    });

    if (findings.length === 5) break;
  }

  if (findings.length === 0) {
    findings.push({
      field: "overall",
      kind: "fortaleza",
      severity: "baja",
      title: "Delimitación consistente",
      message:
        "Los siete componentes están definidos y no presentan alertas heurísticas activas.",
      suggestion:
        "Revisa la coherencia entre tema, población, contexto y periodo antes de continuar.",
    });
  }

  return findings;
}

function defaultQuestion(assessments: DelimitationReviewOutput["fields"]) {
  const pendingField = REVIEW_FIELDS.find(
    (field) => assessments[field].status === "pendiente"
  );

  if (pendingField) {
    return `¿Qué información concreta necesitas agregar para definir ${FIELD_DEFINITIONS[pendingField].label}?`;
  }

  const broadField = REVIEW_FIELDS.find(
    (field) => assessments[field].status === "amplio"
  );

  if (broadField) {
    return `¿Cómo podrías hacer más específico ${FIELD_DEFINITIONS[broadField].label} sin perder relevancia?`;
  }

  return "¿Qué relación entre tema, población, contexto y periodo conviene revisar antes de continuar?";
}

export function buildHeuristicDelimitationReview({
  draft,
  heuristics,
}: {
  draft: ReviewDraft;
  heuristics?: ReviewHeuristics;
}): DelimitationReviewOutput & { source: "heuristic" } {
  const assessments = Object.fromEntries(
    REVIEW_FIELDS.map((field) => [
      field,
      assessmentForField(draft, heuristics, field),
    ])
  ) as DelimitationReviewOutput["fields"];

  const average =
    REVIEW_FIELDS.reduce(
      (total, field) => total + assessments[field].score,
      0
    ) / REVIEW_FIELDS.length;
  const highlightPenalty = Math.min(
    Number(heuristics?.totalHighlights ?? 0) * 2,
    10
  );
  const score = Math.max(0, Math.round(average - highlightPenalty));
  const verdict =
    score >= 80
      ? "bien_delimitada"
      : score >= 50
        ? "mejorable"
        : "muy_amplia";
  const findings = buildFindings(assessments);
  const jackQuestion =
    String(heuristics?.jackQuestion ?? "").trim().slice(0, 220) ||
    defaultQuestion(assessments);

  return {
    source: "heuristic",
    summary:
      verdict === "bien_delimitada"
        ? "La delimitación cubre sus componentes principales y no presenta alertas heurísticas relevantes."
        : "La delimitación todavía necesita completar o precisar algunos componentes antes de considerarse cerrada.",
    overall: {
      score,
      verdict,
      rationale:
        "La puntuación se calculó con la completitud de los siete componentes y las señales heurísticas activas.",
    },
    fields: assessments,
    findings,
    jackQuestion,
    suggestedNextStep:
      findings[0]?.suggestion ||
      "Revisa la coherencia general antes de continuar con el diseño.",
  };
}
