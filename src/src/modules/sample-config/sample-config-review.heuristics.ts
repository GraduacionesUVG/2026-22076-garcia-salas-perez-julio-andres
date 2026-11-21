import type {
  SampleCollectionTechniqueRow,
  SampleConfigRow,
} from "./sample-config.repo";

export type SampleConfigEvaluationSignalField =
  | "main_approach"
  | "scope"
  | "collection_techniques"
  | "field_phase"
  | "target_sample_size"
  | "sample_size_rationale";

export type SampleConfigEvaluationSignal = {
  field: SampleConfigEvaluationSignalField;
  status: "ok" | "warning";
  message: string;
};

export type SampleConfigReviewEvaluation = {
  completeness_score: number;
  overall_stage: "initial" | "in_progress" | "complete";
  missing_fields: SampleConfigEvaluationSignalField[];
  signals: SampleConfigEvaluationSignal[];
  collection_techniques_count: number;
  has_custom_techniques: boolean;
  target_sample_size: number | null;
  rationale_length: number;
  field_phase_length: number;
};

export function evaluateSampleConfig(
  config: SampleConfigRow,
  collectionTechniques: SampleCollectionTechniqueRow[]
): SampleConfigReviewEvaluation {
  const signals: SampleConfigEvaluationSignal[] = [];
  const missing_fields: SampleConfigEvaluationSignalField[] = [];

  const fieldPhaseLength = String(config.field_phase ?? "").trim().length;
  const rationaleLength = String(config.sample_size_rationale ?? "").trim().length;
  const techniquesCount = collectionTechniques.length;
  const hasCustomTechniques = collectionTechniques.some((item) => item.is_custom);

  let completed = 0;

  if (config.main_approach_code) {
    completed += 1;
    signals.push({
      field: "main_approach",
      status: "ok",
      message: "El enfoque principal ya está definido.",
    });
  } else {
    missing_fields.push("main_approach");
    signals.push({
      field: "main_approach",
      status: "warning",
      message: "Falta definir el enfoque principal de la muestra.",
    });
  }

  if (config.scope_code) {
    completed += 1;
    signals.push({
      field: "scope",
      status: "ok",
      message: "El alcance ya está definido.",
    });
  } else {
    missing_fields.push("scope");
    signals.push({
      field: "scope",
      status: "warning",
      message: "Falta definir el alcance de la muestra.",
    });
  }

  if (techniquesCount > 0) {
    completed += 1;
    signals.push({
      field: "collection_techniques",
      status: "ok",
      message:
        techniquesCount === 1
          ? "Ya se registró una técnica de recolección."
          : `Ya se registraron ${techniquesCount} técnicas de recolección.`,
    });
  } else {
    missing_fields.push("collection_techniques");
    signals.push({
      field: "collection_techniques",
      status: "warning",
      message: "Todavía no se registran técnicas de recolección.",
    });
  }

  if (fieldPhaseLength > 0) {
    completed += 1;
    signals.push({
      field: "field_phase",
      status: fieldPhaseLength >= 25 ? "ok" : "warning",
      message:
        fieldPhaseLength >= 25
          ? "La fase de campo ya tiene suficiente contexto inicial."
          : "La fase de campo existe, pero conviene describirla con más contexto.",
    });
  } else {
    missing_fields.push("field_phase");
    signals.push({
      field: "field_phase",
      status: "warning",
      message: "Falta describir la fase de campo.",
    });
  }

  if (config.target_sample_size !== null) {
    completed += 1;
    signals.push({
      field: "target_sample_size",
      status: "ok",
      message: `El tamaño de muestra ya está definido en ${config.target_sample_size}.`,
    });
  } else {
    missing_fields.push("target_sample_size");
    signals.push({
      field: "target_sample_size",
      status: "warning",
      message: "Falta definir el tamaño de muestra.",
    });
  }

  if (rationaleLength > 0) {
    completed += 1;
    signals.push({
      field: "sample_size_rationale",
      status: rationaleLength >= 40 ? "ok" : "warning",
      message:
        rationaleLength >= 40
          ? "La justificación del tamaño de muestra ya tiene desarrollo inicial."
          : "La justificación existe, pero conviene desarrollarla mejor.",
    });
  } else {
    missing_fields.push("sample_size_rationale");
    signals.push({
      field: "sample_size_rationale",
      status: "warning",
      message: "Falta justificar el tamaño de muestra.",
    });
  }

  const completeness_score = Math.round((completed / 6) * 100);

  const overall_stage =
    completeness_score >= 80
      ? "complete"
      : completeness_score >= 45
      ? "in_progress"
      : "initial";

  return {
    completeness_score,
    overall_stage,
    missing_fields,
    signals,
    collection_techniques_count: techniquesCount,
    has_custom_techniques: hasCustomTechniques,
    target_sample_size: config.target_sample_size ?? null,
    rationale_length: rationaleLength,
    field_phase_length: fieldPhaseLength,
  };
}