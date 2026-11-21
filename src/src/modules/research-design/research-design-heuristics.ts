import type {
  ResearchDesignRow,
  SpecificObjectiveRow,
} from "./research-design.repo";

export type EvaluationSeverity = "info" | "warning" | "critical";
export type EvaluationStatus = "good" | "warning" | "critical" | "empty";
export type AlignmentStatus =
  | "aligned"
  | "partially_aligned"
  | "misaligned"
  | "not_applicable";

export type EvaluationIssue = {
  code: string;
  severity: EvaluationSeverity;
  field:
    | "research_question"
    | "general_objective"
    | "specific_objectives"
    | "coherence"
    | "alignment";
  message: string;
  suggestion?: string;
  objective_id?: string;
  matched_terms?: string[];
};

export type FieldEvaluation = {
  status: EvaluationStatus;
  issues: EvaluationIssue[];
};

export type SpecificObjectiveEvaluationItem = {
  id: string;
  text: string;
  position: number;
  status: EvaluationStatus;
  issues: EvaluationIssue[];
};

export type AlignmentCheck = {
  status: AlignmentStatus;
  source_text: string;
  matched_terms: string[];
};

export type AlignmentFieldEvaluation = {
  status: EvaluationStatus;
  issues: EvaluationIssue[];
  checks: {
    topic: AlignmentCheck;
    population: AlignmentCheck;
    context_place: AlignmentCheck;
    time_period: AlignmentCheck;
  };
  explanation: string;
};

export type AlignmentEvaluation = {
  status: EvaluationStatus;
  issues: EvaluationIssue[];
  by_field: {
    research_question: AlignmentFieldEvaluation;
    general_objective: AlignmentFieldEvaluation;
    specific_objectives: AlignmentFieldEvaluation;
  };
  explanation: string;
};

export type DelimitationAlignmentInput = {
  delim?: {
    topic?: string | null;
    context_place?: string | null;
    population?: string | null;
    time_period?: string | null;
    resources?: string | null;
  } | null;
  include?: Array<{ text: string }>;
  exclude?: Array<{ text: string }>;
} | null;

export type ResearchDesignEvaluation = {
  summary: {
    has_question: boolean;
    has_general_objective: boolean;
    specific_objectives_count: number;
    total_issues: number;
    critical_issues: number;
    warning_issues: number;
    alignment_issues: number;
    overall_status: EvaluationStatus;
  };
  question: FieldEvaluation;
  general_objective: FieldEvaluation;
  specific_objectives: {
    status: EvaluationStatus;
    issues: EvaluationIssue[];
    items: SpecificObjectiveEvaluationItem[];
  };
  coherence: FieldEvaluation;
  alignment: AlignmentEvaluation;
};

const STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "y",
  "e",
  "o",
  "u",
  "a",
  "en",
  "por",
  "para",
  "con",
  "sin",
  "sobre",
  "entre",
  "durante",
  "mediante",
  "desde",
  "hasta",
  "al",
  "un",
  "una",
  "unas",
  "unos",
  "que",
  "como",
  "cómo",
  "cual",
  "cuál",
  "cuales",
  "cuáles",
  "se",
  "su",
  "sus",
  "lo",
  "les",
  "esto",
  "esta",
  "este",
  "estas",
  "estos",
  "ser",
  "estar",
  "hacer",
  "uso",
]);

const INVESTIGABLE_VERBS = [
  "analizar",
  "describir",
  "explorar",
  "identificar",
  "comprender",
  "interpretar",
  "examinar",
  "caracterizar",
  "comparar",
  "determinar",
  "documentar",
  "explicar",
  "reconstruir",
  "relacionar",
  "evaluar",
];

const NON_INVESTIGABLE_INITIAL_VERBS = [
  "proponer",
  "disenar",
  "implementar",
  "elaborar",
  "desarrollar",
  "crear",
  "mejorar",
  "fortalecer",
  "promover",
  "generar",
  "aplicar",
  "validar",
];

const POPULATION_HINTS = [
  "estudiantes",
  "docentes",
  "profesores",
  "investigadores",
  "participantes",
  "usuarios",
  "pacientes",
  "mujeres",
  "hombres",
  "niños",
  "niñas",
  "adolescentes",
  "jóvenes",
  "jovenes",
  "adultos",
  "familias",
  "comunidades",
  "trabajadores",
  "personas",
];

const LOCATION_HINTS = [
  "guatemala",
  "ciudad",
  "municipio",
  "departamento",
  "universidad",
  "escuela",
  "hospital",
  "comunidad",
  "empresa",
  "centro",
  "facultad",
  "zona",
  "rural",
  "urbana",
];

const TIME_HINTS = [
  "2024",
  "2025",
  "2026",
  "2027",
  "2028",
  "semestre",
  "año",
  "años",
  "mes",
  "meses",
  "semana",
  "semanas",
  "periodo",
  "período",
  "ciclo",
  "trimestre",
  "bimestre",
  "durante",
  "entre",
  "actualidad",
  "últimos",
  "ultimos",
  "reciente",
  "recientes",
];

const VAGUE_TERMS: Array<{
  term: string;
  suggestion: string;
}> = [
  {
    term: "impacto",
    suggestion:
      "Aclara qué dimensión concreta se observará, por ejemplo percepción, uso, cambio, barreras o resultados.",
  },
  {
    term: "mejorar",
    suggestion:
      "Sustituye 'mejorar' por una acción investigable como describir, analizar o explorar.",
  },
  {
    term: "optimizar",
    suggestion:
      "Aclara qué variable o proceso se observará en lugar de usar 'optimizar'.",
  },
  {
    term: "fortalecer",
    suggestion:
      "Conviene especificar qué se estudiará exactamente y cómo se observará.",
  },
  {
    term: "muchos",
    suggestion:
      "Sustituye términos imprecisos por población, cantidad o criterio concreto.",
  },
  {
    term: "varios",
    suggestion:
      "Sustituye términos imprecisos por población, cantidad o criterio concreto.",
  },
  {
    term: "diversos",
    suggestion:
      "Sustituye términos imprecisos por población, cantidad o criterio concreto.",
  },
  {
    term: "adecuado",
    suggestion:
      "Aclara con qué criterio metodológico se juzgará que algo es adecuado.",
  },
  {
    term: "efectivo",
    suggestion:
      "Aclara qué indicador permitirá interpretar que algo es efectivo.",
  },
];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeContent(value: string): string[] {
  const normalized = normalizeText(value);

  if (!normalized) return [];

  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function hasAnyHint(text: string, hints: string[]): boolean {
  const normalized = normalizeText(text);
  return hints.some((hint) => normalized.includes(normalizeText(hint)));
}

function getFirstWord(text: string): string {
  const normalized = normalizeText(text);
  return normalized.split(" ")[0] ?? "";
}

function isInfinitiveWord(word: string): boolean {
  return /^[a-zñ]+(ar|er|ir)$/.test(normalizeText(word));
}

function startsWithPreferredInvestigableVerb(text: string): boolean {
  const firstWord = getFirstWord(text);
  return INVESTIGABLE_VERBS.includes(firstWord);
}

function hasCoordinatedActions(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    /\b(y|e)\b/.test(normalized) ||
    /\basi como\b/.test(normalized) ||
    /\bademas de\b/.test(normalized)
  );
}

function getInvestigableVerbsFound(text: string): string[] {
  const normalized = normalizeText(text);
  return INVESTIGABLE_VERBS.filter((verb) =>
    new RegExp(`\\b${verb}\\b`, "i").test(normalized)
  );
}

function intersection(a: string[], b: string[]): string[] {
  const bSet = new Set(b);
  return [...new Set(a.filter((item) => bSet.has(item)))];
}

function jaccardSimilarity(a: string[], b: string): number;
function jaccardSimilarity(a: string[], b: string[]): number;
function jaccardSimilarity(a: string[], b: string | string[]): number {
  const bTokens = Array.isArray(b) ? b : tokenizeContent(b);
  const aSet = new Set(a);
  const bSet = new Set(bTokens);

  const inter = [...aSet].filter((x) => bSet.has(x)).length;
  const union = new Set([...aSet, ...bSet]).size;

  if (union === 0) return 0;
  return inter / union;
}

function ratioCovered(baseTokens: string[], candidateTokens: string[]): number {
  if (baseTokens.length === 0) return 0;
  const inter = intersection(baseTokens, candidateTokens).length;
  return inter / baseTokens.length;
}

function buildIssue(
  issue: Omit<EvaluationIssue, "severity"> & { severity?: EvaluationSeverity }
): EvaluationIssue {
  return {
    severity: issue.severity ?? "warning",
    ...issue,
  };
}

function computeStatus(
  issues: EvaluationIssue[],
  isEmpty = false
): EvaluationStatus {
  if (isEmpty) return "empty";
  if (issues.some((issue) => issue.severity === "critical")) return "critical";
  if (issues.some((issue) => issue.severity === "warning")) return "warning";
  return "good";
}

function buildAlignmentCheck(
  sourceText: string,
  candidateTokens: string[]
): AlignmentCheck {
  const normalizedSource = String(sourceText ?? "").trim();
  const sourceTokens = [...new Set(tokenizeContent(normalizedSource))].slice(
    0,
    8
  );

  if (sourceTokens.length === 0) {
    return {
      status: "not_applicable",
      source_text: normalizedSource,
      matched_terms: [],
    };
  }

  const matchedTerms = intersection(sourceTokens, candidateTokens);
  const coverage = ratioCovered(sourceTokens, candidateTokens);

  let status: AlignmentStatus = "misaligned";
  if (coverage >= 0.5) {
    status = "aligned";
  } else if (coverage >= 0.2) {
    status = "partially_aligned";
  }

  return {
    status,
    source_text: normalizedSource,
    matched_terms: matchedTerms,
  };
}

function describeAlignmentStatus(
  label: string,
  status: AlignmentStatus
): string {
  switch (status) {
    case "aligned":
      return `${label}: alineado.`;
    case "partially_aligned":
      return `${label}: parcialmente alineado.`;
    case "misaligned":
      return `${label}: desalineado.`;
    default:
      return `${label}: no aplicable.`;
  }
}

function buildEmptyAlignmentFieldEvaluation(): AlignmentFieldEvaluation {
  return {
    status: "empty",
    issues: [],
    checks: {
      topic: {
        status: "not_applicable",
        source_text: "",
        matched_terms: [],
      },
      population: {
        status: "not_applicable",
        source_text: "",
        matched_terms: [],
      },
      context_place: {
        status: "not_applicable",
        source_text: "",
        matched_terms: [],
      },
      time_period: {
        status: "not_applicable",
        source_text: "",
        matched_terms: [],
      },
    },
    explanation: "Todavía no hay suficiente información para evaluar este campo.",
  };
}

function buildAlignmentFieldEvaluation(
  label: "research_question" | "general_objective" | "specific_objectives",
  text: string,
  delimitation?: DelimitationAlignmentInput
): AlignmentFieldEvaluation {
  const trimmed = String(text ?? "").trim();

  if (!trimmed) {
    return buildEmptyAlignmentFieldEvaluation();
  }

  const candidateTokens = tokenizeContent(trimmed);

  const checks = {
    topic: buildAlignmentCheck(delimitation?.delim?.topic ?? "", candidateTokens),
    population: buildAlignmentCheck(
      delimitation?.delim?.population ?? "",
      candidateTokens
    ),
    context_place: buildAlignmentCheck(
      delimitation?.delim?.context_place ?? "",
      candidateTokens
    ),
    time_period: buildAlignmentCheck(
      delimitation?.delim?.time_period ?? "",
      candidateTokens
    ),
  };

  const issues: EvaluationIssue[] = [];

  const fieldLabelMap = {
    research_question: "La pregunta de investigación",
    general_objective: "El objetivo general",
    specific_objectives: "Los objetivos específicos",
  };

  const fieldText = fieldLabelMap[label];

  if (checks.topic.status === "misaligned") {
    issues.push(
      buildIssue({
        code: `${label.toUpperCase()}_TOPIC_MISALIGNED`,
        field: "alignment",
        severity: "critical",
        message: `${fieldText} no refleja con claridad el tema definido en delimitación.`,
        suggestion:
          "Haz más explícito el fenómeno, problema o núcleo temático que ya definiste en la fase anterior.",
        matched_terms: checks.topic.matched_terms,
      })
    );
  } else if (checks.topic.status === "partially_aligned") {
    issues.push(
      buildIssue({
        code: `${label.toUpperCase()}_TOPIC_PARTIAL`,
        field: "alignment",
        severity: "warning",
        message: `${fieldText} solo refleja parcialmente el tema delimitado.`,
        suggestion:
          "Refuerza la formulación para que el tema central quede más visible.",
        matched_terms: checks.topic.matched_terms,
      })
    );
  }

  if (checks.population.status === "misaligned") {
    issues.push(
      buildIssue({
        code: `${label.toUpperCase()}_POPULATION_MISALIGNED`,
        field: "alignment",
        severity: "critical",
        message: `${fieldText} no refleja con claridad la población delimitada.`,
        suggestion:
          "Incluye explícitamente a quiénes estudiarás o analizarás.",
        matched_terms: checks.population.matched_terms,
      })
    );
  } else if (checks.population.status === "partially_aligned") {
    issues.push(
      buildIssue({
        code: `${label.toUpperCase()}_POPULATION_PARTIAL`,
        field: "alignment",
        severity: "warning",
        message: `${fieldText} solo refleja parcialmente la población delimitada.`,
        suggestion:
          "Haz más precisa la referencia a participantes, sujetos o unidades de análisis.",
        matched_terms: checks.population.matched_terms,
      })
    );
  }

  if (checks.context_place.status === "misaligned") {
    issues.push(
      buildIssue({
        code: `${label.toUpperCase()}_CONTEXT_MISALIGNED`,
        field: "alignment",
        severity: "warning",
        message: `${fieldText} no refleja con claridad el contexto o lugar delimitado.`,
        suggestion:
          "Incluye mejor el entorno geográfico, institucional o social donde ocurre el estudio.",
        matched_terms: checks.context_place.matched_terms,
      })
    );
  } else if (checks.context_place.status === "partially_aligned") {
    issues.push(
      buildIssue({
        code: `${label.toUpperCase()}_CONTEXT_PARTIAL`,
        field: "alignment",
        severity: "info",
        message: `${fieldText} solo refleja parcialmente el contexto delimitado.`,
        suggestion:
          "Refuerza la referencia al lugar o entorno del estudio.",
        matched_terms: checks.context_place.matched_terms,
      })
    );
  }

  if (checks.time_period.status === "misaligned") {
    issues.push(
      buildIssue({
        code: `${label.toUpperCase()}_TIME_MISALIGNED`,
        field: "alignment",
        severity: "info",
        message: `${fieldText} no refleja con claridad el tiempo o periodo delimitado.`,
        suggestion:
          "Si la temporalidad es importante, incorpórala de forma explícita.",
        matched_terms: checks.time_period.matched_terms,
      })
    );
  } else if (checks.time_period.status === "partially_aligned") {
    issues.push(
      buildIssue({
        code: `${label.toUpperCase()}_TIME_PARTIAL`,
        field: "alignment",
        severity: "info",
        message: `${fieldText} solo refleja parcialmente el periodo delimitado.`,
        suggestion:
          "Haz más claro el ciclo, rango temporal o periodo de estudio si corresponde.",
        matched_terms: checks.time_period.matched_terms,
      })
    );
  }

  const hasApplicableChecks = Object.values(checks).some(
    (item) => item.status !== "not_applicable"
  );

  if (!hasApplicableChecks) {
    return {
      ...buildEmptyAlignmentFieldEvaluation(),
      explanation:
        "Todavía no hay suficiente delimitación previa para evaluar este campo.",
    };
  }

  return {
    status: computeStatus(issues),
    issues,
    checks,
    explanation: [
      describeAlignmentStatus("Tema", checks.topic.status),
      describeAlignmentStatus("Población", checks.population.status),
      describeAlignmentStatus("Contexto", checks.context_place.status),
      describeAlignmentStatus("Tiempo", checks.time_period.status),
    ].join(" "),
  };
}

function evaluateQuestion(question: string): FieldEvaluation {
  const trimmed = question.trim();
  const issues: EvaluationIssue[] = [];

  if (!trimmed) {
    return {
      status: "empty",
      issues: [
        buildIssue({
          code: "QUESTION_EMPTY",
          severity: "critical",
          field: "research_question",
          message: "La pregunta de investigación todavía está vacía.",
          suggestion:
            "Redacta una pregunta central clara para la investigación.",
        }),
      ],
    };
  }

  if (!trimmed.includes("?") && !trimmed.includes("¿")) {
    issues.push(
      buildIssue({
        code: "QUESTION_NOT_INTERROGATIVE",
        field: "research_question",
        severity: "warning",
        message: "La formulación no parece una pregunta explícita.",
        suggestion:
          "Conviene redactarla en forma interrogativa para marcar mejor el foco de investigación.",
      })
    );
  }

  if (trimmed.length < 25) {
    issues.push(
      buildIssue({
        code: "QUESTION_TOO_SHORT",
        field: "research_question",
        severity: "warning",
        message: "La pregunta parece demasiado corta y puede quedar ambigua.",
        suggestion:
          "Agrega más precisión sobre población, contexto o fenómeno a estudiar.",
      })
    );
  }

  if (trimmed.length > 260) {
    issues.push(
      buildIssue({
        code: "QUESTION_TOO_LONG",
        field: "research_question",
        severity: "warning",
        message: "La pregunta es muy larga y puede mezclar varias ideas.",
        suggestion:
          "Intenta condensarla para que tenga un solo foco central.",
      })
    );
  }

  for (const vague of VAGUE_TERMS) {
    if (normalizeText(trimmed).includes(normalizeText(vague.term))) {
      issues.push(
        buildIssue({
          code: "QUESTION_VAGUE_TERM",
          field: "research_question",
          severity: "warning",
          message: `La pregunta contiene el término potencialmente vago "${vague.term}".`,
          suggestion: vague.suggestion,
          matched_terms: [vague.term],
        })
      );
    }
  }

  if (!hasAnyHint(trimmed, POPULATION_HINTS)) {
    issues.push(
      buildIssue({
        code: "QUESTION_MISSING_POPULATION",
        field: "research_question",
        severity: "warning",
        message:
          "No se detecta con claridad la población o los participantes del estudio.",
        suggestion:
          "Incluye quiénes serán observados o analizados en la investigación.",
      })
    );
  }

  if (!hasAnyHint(trimmed, LOCATION_HINTS)) {
    issues.push(
      buildIssue({
        code: "QUESTION_MISSING_LOCATION",
        field: "research_question",
        severity: "warning",
        message: "No se detecta con claridad el contexto o lugar del estudio.",
        suggestion:
          "Incluye el espacio institucional, geográfico o social donde se sitúa la investigación.",
      })
    );
  }

  if (!hasAnyHint(trimmed, TIME_HINTS)) {
    issues.push(
      buildIssue({
        code: "QUESTION_MISSING_TIME",
        field: "research_question",
        severity: "info",
        message: "No se detecta una referencia temporal explícita.",
        suggestion:
          "Si la temporalidad es importante para tu protocolo, agrega el periodo o ciclo de estudio.",
      })
    );
  }

  return {
    status: computeStatus(issues),
    issues,
  };
}

function evaluateGeneralObjective(text: string): FieldEvaluation {
  const trimmed = text.trim();
  const issues: EvaluationIssue[] = [];

  if (!trimmed) {
    return {
      status: "empty",
      issues: [
        buildIssue({
          code: "GENERAL_OBJECTIVE_EMPTY",
          severity: "critical",
          field: "general_objective",
          message: "El objetivo general todavía está vacío.",
          suggestion:
            "Redacta el propósito central del estudio en una sola oración.",
        }),
      ],
    };
  }

  const firstWord = getFirstWord(trimmed);

  if (!isInfinitiveWord(firstWord)) {
    issues.push(
      buildIssue({
        code: "GENERAL_OBJECTIVE_NOT_INFINITIVE",
        field: "general_objective",
        severity: "critical",
        message:
          "El objetivo general debe iniciar con un verbo en infinitivo.",
        suggestion:
          "Empieza con un verbo como analizar, describir, explorar, identificar, comprender o explicar.",
      })
    );
  }

  if (
    isInfinitiveWord(firstWord) &&
    !startsWithPreferredInvestigableVerb(trimmed)
  ) {
    issues.push(
      buildIssue({
        code: "GENERAL_OBJECTIVE_NON_RECOMMENDED_VERB",
        field: "general_objective",
        severity: "warning",
        message:
          "El objetivo general sí inicia en infinitivo, pero conviene usar un verbo más investigable.",
        suggestion:
          "Prefiere verbos como analizar, describir, explorar, identificar, comprender, comparar o explicar.",
      })
    );
  }

  if (NON_INVESTIGABLE_INITIAL_VERBS.includes(firstWord)) {
    issues.push(
      buildIssue({
        code: "GENERAL_OBJECTIVE_APPLIED_VERB",
        field: "general_objective",
        severity: "critical",
        message:
          "El objetivo general inicia con un verbo más propio de intervención o producción que de investigación.",
        suggestion:
          "Sustitúyelo por un verbo investigable como analizar, describir, explorar, identificar o comprender.",
      })
    );
  }

  const verbsFound = getInvestigableVerbsFound(trimmed);
  if (
    verbsFound.length > 1 ||
    (verbsFound.length > 0 && hasCoordinatedActions(trimmed))
  ) {
    issues.push(
      buildIssue({
        code: "GENERAL_OBJECTIVE_MULTIPLE_ACTIONS",
        field: "general_objective",
        severity: "warning",
        message:
          "El objetivo general parece mezclar varias acciones investigativas.",
        suggestion:
          "Intenta dejar una sola acción principal y mover lo demás a objetivos específicos.",
        matched_terms: verbsFound,
      })
    );
  }

  if (trimmed.length < 20) {
    issues.push(
      buildIssue({
        code: "GENERAL_OBJECTIVE_TOO_SHORT",
        field: "general_objective",
        severity: "warning",
        message:
          "El objetivo general parece demasiado corto y puede quedar ambiguo.",
        suggestion:
          "Agrega mayor precisión sobre fenómeno, población o contexto.",
      })
    );
  }

  if (trimmed.length > 240) {
    issues.push(
      buildIssue({
        code: "GENERAL_OBJECTIVE_TOO_LONG",
        field: "general_objective",
        severity: "warning",
        message: "El objetivo general es muy largo y puede perder claridad.",
        suggestion:
          "Condénsalo para que exprese una sola intención principal.",
      })
    );
  }

  for (const vague of VAGUE_TERMS) {
    if (normalizeText(trimmed).includes(normalizeText(vague.term))) {
      issues.push(
        buildIssue({
          code: "GENERAL_OBJECTIVE_VAGUE_TERM",
          field: "general_objective",
          severity: "warning",
          message: `El objetivo general contiene el término potencialmente vago "${vague.term}".`,
          suggestion: vague.suggestion,
          matched_terms: [vague.term],
        })
      );
    }
  }

  return {
    status: computeStatus(issues),
    issues,
  };
}

function evaluateSpecificObjectives(
  items: SpecificObjectiveRow[],
  questionText: string,
  generalObjectiveText: string
): {
  status: EvaluationStatus;
  issues: EvaluationIssue[];
  items: SpecificObjectiveEvaluationItem[];
} {
  const globalIssues: EvaluationIssue[] = [];

  if (items.length === 0) {
    return {
      status: "empty",
      issues: [
        buildIssue({
          code: "SPECIFIC_OBJECTIVES_EMPTY",
          field: "specific_objectives",
          severity: "critical",
          message: "Todavía no hay objetivos específicos.",
          suggestion:
            "Agrega objetivos específicos que desglosen operativamente el objetivo general.",
        }),
      ],
      items: [],
    };
  }

  if (items.length === 1) {
    globalIssues.push(
      buildIssue({
        code: "SPECIFIC_OBJECTIVES_ONLY_ONE",
        field: "specific_objectives",
        severity: "info",
        message:
          "Solo hay un objetivo específico; en muchos casos conviene más de uno para desglosar el estudio.",
        suggestion:
          "Evalúa si hace falta separar descripción, comparación, interpretación o identificación en más de un objetivo.",
      })
    );
  }

  if (items.length > 5) {
    globalIssues.push(
      buildIssue({
        code: "SPECIFIC_OBJECTIVES_TOO_MANY",
        field: "specific_objectives",
        severity: "warning",
        message:
          "Hay muchos objetivos específicos y eso puede dispersar el estudio.",
        suggestion: "Revisa si algunos pueden fusionarse o simplificarse.",
      })
    );
  }

  const questionTokens = tokenizeContent(questionText);
  const generalTokens = tokenizeContent(generalObjectiveText);

  const itemEvaluations: SpecificObjectiveEvaluationItem[] = items.map(
    (item) => {
      const itemIssues: EvaluationIssue[] = [];
      const trimmed = item.text.trim();

      if (!trimmed) {
        itemIssues.push(
          buildIssue({
            code: "SPECIFIC_OBJECTIVE_EMPTY",
            field: "specific_objectives",
            severity: "critical",
            message: "Este objetivo específico está vacío.",
            suggestion:
              "Redáctalo con una acción concreta y un foco metodológico claro.",
            objective_id: item.id,
          })
        );

        return {
          id: item.id,
          text: item.text,
          position: item.position,
          status: computeStatus(itemIssues),
          issues: itemIssues,
        };
      }

      const firstWord = getFirstWord(trimmed);

      if (!isInfinitiveWord(firstWord)) {
        itemIssues.push(
          buildIssue({
            code: "SPECIFIC_OBJECTIVE_NOT_INFINITIVE",
            field: "specific_objectives",
            severity: "critical",
            message:
              "Este objetivo específico debe iniciar con un verbo en infinitivo.",
            suggestion:
              "Empieza con verbos como identificar, describir, analizar, comparar, explorar o comprender.",
            objective_id: item.id,
          })
        );
      }

      if (
        isInfinitiveWord(firstWord) &&
        !startsWithPreferredInvestigableVerb(trimmed)
      ) {
        itemIssues.push(
          buildIssue({
            code: "SPECIFIC_OBJECTIVE_NON_RECOMMENDED_VERB",
            field: "specific_objectives",
            severity: "warning",
            message:
              "Este objetivo específico inicia en infinitivo, pero conviene usar un verbo más investigable.",
            suggestion:
              "Prefiere verbos como identificar, describir, analizar, comparar, explorar o comprender.",
            objective_id: item.id,
          })
        );
      }

      if (NON_INVESTIGABLE_INITIAL_VERBS.includes(firstWord)) {
        itemIssues.push(
          buildIssue({
            code: "SPECIFIC_OBJECTIVE_APPLIED_VERB",
            field: "specific_objectives",
            severity: "critical",
            message:
              "Este objetivo específico inicia con un verbo más propio de intervención o producción que de investigación.",
            suggestion:
              "Sustitúyelo por un verbo investigable como identificar, describir, analizar, comparar o explorar.",
            objective_id: item.id,
          })
        );
      }

      const verbsFound = getInvestigableVerbsFound(trimmed);
      if (
        verbsFound.length > 1 ||
        (verbsFound.length > 0 && hasCoordinatedActions(trimmed))
      ) {
        itemIssues.push(
          buildIssue({
            code: "SPECIFIC_OBJECTIVE_MULTIPLE_ACTIONS",
            field: "specific_objectives",
            severity: "warning",
            message:
              "Este objetivo específico parece mezclar varias acciones en una sola frase.",
            suggestion:
              "Conviene que cada objetivo específico exprese una sola operación investigativa.",
            objective_id: item.id,
            matched_terms: verbsFound,
          })
        );
      }

      if (trimmed.length < 20) {
        itemIssues.push(
          buildIssue({
            code: "SPECIFIC_OBJECTIVE_TOO_SHORT",
            field: "specific_objectives",
            severity: "warning",
            message:
              "Este objetivo específico parece demasiado corto y puede quedar ambiguo.",
            suggestion:
              "Agrega mayor precisión sobre qué se observará, comparará o analizará.",
            objective_id: item.id,
          })
        );
      }

      if (trimmed.length > 220) {
        itemIssues.push(
          buildIssue({
            code: "SPECIFIC_OBJECTIVE_TOO_LONG",
            field: "specific_objectives",
            severity: "warning",
            message:
              "Este objetivo específico es muy largo y puede perder precisión.",
            suggestion:
              "Condénsalo para que exprese una sola operación analítica.",
            objective_id: item.id,
          })
        );
      }

      for (const vague of VAGUE_TERMS) {
        if (normalizeText(trimmed).includes(normalizeText(vague.term))) {
          itemIssues.push(
            buildIssue({
              code: "SPECIFIC_OBJECTIVE_VAGUE_TERM",
              field: "specific_objectives",
              severity: "warning",
              message: `Este objetivo específico contiene el término potencialmente vago "${vague.term}".`,
              suggestion: vague.suggestion,
              objective_id: item.id,
              matched_terms: [vague.term],
            })
          );
        }
      }

      const itemTokens = tokenizeContent(trimmed);
      const overlapWithQuestion = ratioCovered(questionTokens, itemTokens);
      const overlapWithGeneral = ratioCovered(generalTokens, itemTokens);
      const similarityWithGeneral = jaccardSimilarity(itemTokens, generalTokens);

      if (
        questionTokens.length > 0 &&
        overlapWithQuestion < 0.15 &&
        overlapWithGeneral < 0.15
      ) {
        itemIssues.push(
          buildIssue({
            code: "SPECIFIC_OBJECTIVE_LOW_ALIGNMENT",
            field: "specific_objectives",
            severity: "warning",
            message:
              "Este objetivo específico parece poco alineado con la pregunta y el objetivo general.",
            suggestion:
              "Revisa si realmente aporta al foco central del estudio.",
            objective_id: item.id,
          })
        );
      }

      if (generalTokens.length > 0 && similarityWithGeneral >= 0.75) {
        itemIssues.push(
          buildIssue({
            code: "SPECIFIC_OBJECTIVE_TOO_SIMILAR_TO_GENERAL",
            field: "specific_objectives",
            severity: "warning",
            message:
              "Este objetivo específico se parece demasiado al objetivo general y puede estar repitiéndolo.",
            suggestion:
              "Hazlo más operativo y más concreto que el objetivo general.",
            objective_id: item.id,
          })
        );
      }

      return {
        id: item.id,
        text: item.text,
        position: item.position,
        status: computeStatus(itemIssues),
        issues: itemIssues,
      };
    }
  );

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      const sim = jaccardSimilarity(
        tokenizeContent(a.text),
        tokenizeContent(b.text)
      );

      if (sim >= 0.7) {
        globalIssues.push(
          buildIssue({
            code: "SPECIFIC_OBJECTIVES_POSSIBLE_DUPLICATE",
            field: "specific_objectives",
            severity: "warning",
            message:
              "Hay objetivos específicos muy parecidos entre sí y podrían estar duplicando función.",
            suggestion:
              "Revisa si conviene fusionarlos o diferenciar mejor su propósito.",
            matched_terms: intersection(
              tokenizeContent(a.text),
              tokenizeContent(b.text)
            ),
          })
        );
      }
    }
  }

  const allIssues = [
    ...globalIssues,
    ...itemEvaluations.flatMap((item) => item.issues),
  ];

  return {
    status: computeStatus(allIssues),
    issues: globalIssues,
    items: itemEvaluations,
  };
}

function evaluateCoherence(
  questionText: string,
  generalObjectiveText: string,
  specificObjectives: SpecificObjectiveRow[]
): FieldEvaluation {
  const issues: EvaluationIssue[] = [];

  const questionTokens = tokenizeContent(questionText);
  const generalTokens = tokenizeContent(generalObjectiveText);
  const specificTokenGroups = specificObjectives.map((item) =>
    tokenizeContent(item.text)
  );

  if (!questionText.trim() || !generalObjectiveText.trim()) {
    issues.push(
      buildIssue({
        code: "COHERENCE_INCOMPLETE_BASE",
        field: "coherence",
        severity: "critical",
        message:
          "No se puede evaluar bien la coherencia porque falta la pregunta o el objetivo general.",
        suggestion: "Completa primero la pregunta y el objetivo general.",
      })
    );

    return {
      status: computeStatus(issues),
      issues,
    };
  }

  const qgOverlap = ratioCovered(questionTokens, generalTokens);

  if (qgOverlap < 0.2) {
    issues.push(
      buildIssue({
        code: "COHERENCE_QUESTION_GENERAL_LOW_OVERLAP",
        field: "coherence",
        severity: "warning",
        message:
          "La pregunta y el objetivo general muestran poca coincidencia conceptual.",
        suggestion:
          "Revisa si ambos están hablando exactamente del mismo fenómeno, población y contexto.",
        matched_terms: intersection(questionTokens, generalTokens),
      })
    );
  }

  if (specificObjectives.length === 0) {
    issues.push(
      buildIssue({
        code: "COHERENCE_NO_SPECIFICS",
        field: "coherence",
        severity: "critical",
        message:
          "No hay objetivos específicos para comprobar si el objetivo general se desglosa correctamente.",
        suggestion:
          "Agrega objetivos específicos que traduzcan el objetivo general en operaciones observables.",
      })
    );
  } else {
    const averageCoverage =
      specificTokenGroups.reduce((acc, tokens) => {
        const qCoverage = ratioCovered(questionTokens, tokens);
        const gCoverage = ratioCovered(generalTokens, tokens);
        return acc + Math.max(qCoverage, gCoverage);
      }, 0) / specificTokenGroups.length;

    if (averageCoverage < 0.18) {
      issues.push(
        buildIssue({
          code: "COHERENCE_LOW_SPECIFIC_COVERAGE",
          field: "coherence",
          severity: "warning",
          message:
            "Los objetivos específicos parecen cubrir débilmente el foco de la pregunta y del objetivo general.",
          suggestion:
            "Revisa si faltan objetivos más conectados con el fenómeno principal de estudio.",
        })
      );
    }

    const coveredKeywords = new Set<string>();
    specificTokenGroups.forEach((tokens) => {
      intersection(questionTokens, tokens).forEach((token) =>
        coveredKeywords.add(token)
      );
    });

    const keyQuestionTerms = questionTokens.slice(0, 8);
    const missingCoreTerms = keyQuestionTerms.filter(
      (token) => !coveredKeywords.has(token)
    );

    if (missingCoreTerms.length >= 3) {
      issues.push(
        buildIssue({
          code: "COHERENCE_MISSING_CORE_TERMS",
          field: "coherence",
          severity: "warning",
          message:
            "Hay términos centrales de la pregunta que no parecen estar reflejados en los objetivos específicos.",
          suggestion:
            "Verifica si falta un objetivo específico que cubra esos elementos.",
          matched_terms: missingCoreTerms,
        })
      );
    }
  }

  return {
    status: computeStatus(issues),
    issues,
  };
}

function evaluateAlignment(
  questionText: string,
  generalObjectiveText: string,
  specificObjectives: SpecificObjectiveRow[],
  delimitation?: DelimitationAlignmentInput
): AlignmentEvaluation {
  const questionAlignment = buildAlignmentFieldEvaluation(
    "research_question",
    questionText,
    delimitation
  );

  const generalObjectiveAlignment = buildAlignmentFieldEvaluation(
    "general_objective",
    generalObjectiveText,
    delimitation
  );

  const specificObjectivesAlignment = buildAlignmentFieldEvaluation(
    "specific_objectives",
    specificObjectives.map((item) => item.text ?? "").join(" "),
    delimitation
  );

  const by_field = {
    research_question: questionAlignment,
    general_objective: generalObjectiveAlignment,
    specific_objectives: specificObjectivesAlignment,
  };

  const issues = [
    ...questionAlignment.issues,
    ...generalObjectiveAlignment.issues,
    ...specificObjectivesAlignment.issues,
  ];

  const allFieldStatuses = [
    questionAlignment.status,
    generalObjectiveAlignment.status,
    specificObjectivesAlignment.status,
  ];

  const allEmpty = allFieldStatuses.every((status) => status === "empty");

  return {
    status: computeStatus(issues, allEmpty),
    issues,
    by_field,
    explanation: [
      `Pregunta vs delimitación: ${questionAlignment.status}.`,
      `Objetivo general vs delimitación: ${generalObjectiveAlignment.status}.`,
      `Objetivos específicos vs delimitación: ${specificObjectivesAlignment.status}.`,
    ].join(" "),
  };
}

function computeOverallStatus(
  question: FieldEvaluation,
  generalObjective: FieldEvaluation,
  specifics: {
    status: EvaluationStatus;
    items: SpecificObjectiveEvaluationItem[];
    issues: EvaluationIssue[];
  },
  coherence: FieldEvaluation,
  alignment: AlignmentEvaluation
): EvaluationStatus {
  const statuses: EvaluationStatus[] = [
    question.status,
    generalObjective.status,
    specifics.status,
    coherence.status,
    alignment.status,
  ];

  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  if (statuses.every((status) => status === "empty")) return "empty";
  return "good";
}

export function evaluateResearchDesign(
  design: ResearchDesignRow,
  specificObjectives: SpecificObjectiveRow[],
  delimitation?: DelimitationAlignmentInput
): ResearchDesignEvaluation {
  const questionText = design.research_question ?? "";
  const generalObjectiveText = design.general_objective ?? "";

  const question = evaluateQuestion(questionText);
  const general_objective = evaluateGeneralObjective(generalObjectiveText);
  const specific_objectives = evaluateSpecificObjectives(
    specificObjectives,
    questionText,
    generalObjectiveText
  );
  const coherence = evaluateCoherence(
    questionText,
    generalObjectiveText,
    specificObjectives
  );
  const alignment = evaluateAlignment(
    questionText,
    generalObjectiveText,
    specificObjectives,
    delimitation
  );

  const allIssues = [
    ...question.issues,
    ...general_objective.issues,
    ...specific_objectives.issues,
    ...specific_objectives.items.flatMap((item) => item.issues),
    ...coherence.issues,
    ...alignment.issues,
  ];

  const critical_issues = allIssues.filter(
    (issue) => issue.severity === "critical"
  ).length;

  const warning_issues = allIssues.filter(
    (issue) => issue.severity === "warning"
  ).length;

  return {
    summary: {
      has_question: questionText.trim().length > 0,
      has_general_objective: generalObjectiveText.trim().length > 0,
      specific_objectives_count: specificObjectives.length,
      total_issues: allIssues.length,
      critical_issues,
      warning_issues,
      alignment_issues: alignment.issues.length,
      overall_status: computeOverallStatus(
        question,
        general_objective,
        specific_objectives,
        coherence,
        alignment
      ),
    },
    question,
    general_objective,
    specific_objectives,
    coherence,
    alignment,
  };
}