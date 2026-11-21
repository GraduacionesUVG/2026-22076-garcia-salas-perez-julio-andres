import { z } from "zod";

const DelimitationReviewFieldKeySchema = z.enum([
  "topic",
  "context_place",
  "time_period",
  "population",
  "resources",
  "include",
  "exclude",
  "overall",
]);

const DelimitationReviewHeuristicSignalSchema = z
  .object({
    field: z.string().optional(),
    level: z.string().optional(),
    text: z.string().optional(),
  })
  .strict();

export const DelimitationReviewDraftSchema = z
  .object({
    topic: z.string().max(500).optional(),
    context_place: z.string().max(500).optional(),
    time_period: z.string().max(500).optional(),
    population: z.string().max(500).optional(),
    resources: z.string().max(500).optional(),
    include: z.array(z.string().max(300)).optional(),
    exclude: z.array(z.string().max(300)).optional(),
  })
  .strict();

export const DelimitationReviewRequestSchema = z
  .object({
    draft: DelimitationReviewDraftSchema.optional(),
    heuristics: z
      .object({
        totalHighlights: z.number().int().min(0).optional(),
        jackQuestion: z.string().max(300).optional(),
        signals: z.array(DelimitationReviewHeuristicSignalSchema).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const DelimitationReviewFieldAssessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
  status: z.enum(["pendiente", "amplio", "aceptable", "bien_delimitado"]),
  note: z.string().max(280),
  priority: z.enum(["alta", "media", "baja"]),
});

export const DelimitationReviewFindingSchema = z.object({
  field: DelimitationReviewFieldKeySchema,
  kind: z.enum(["riesgo", "mejora", "fortaleza"]),
  severity: z.enum(["alta", "media", "baja"]),
  title: z.string().max(100),
  message: z.string().max(240),
  suggestion: z.string().max(240),
});

export const DelimitationReviewOutputSchema = z.object({
  summary: z.string().max(320),
  overall: z.object({
    score: z.number().int().min(0).max(100),
    verdict: z.enum(["muy_amplia", "mejorable", "bien_delimitada"]),
    rationale: z.string().max(280),
  }),
  fields: z.object({
    topic: DelimitationReviewFieldAssessmentSchema,
    context_place: DelimitationReviewFieldAssessmentSchema,
    time_period: DelimitationReviewFieldAssessmentSchema,
    population: DelimitationReviewFieldAssessmentSchema,
    resources: DelimitationReviewFieldAssessmentSchema,
    include: DelimitationReviewFieldAssessmentSchema,
    exclude: DelimitationReviewFieldAssessmentSchema,
  }),
  findings: z.array(DelimitationReviewFindingSchema).max(6),
  jackQuestion: z.string().max(220),
  suggestedNextStep: z.string().max(220),
});

export type DelimitationReviewRequest = z.infer<
  typeof DelimitationReviewRequestSchema
>;

export type DelimitationReviewOutput = z.infer<
  typeof DelimitationReviewOutputSchema
>;

export function coerceDelimitationReviewDraft(
  draft?: z.infer<typeof DelimitationReviewDraftSchema>
) {
  return {
    topic: String(draft?.topic ?? "").trim(),
    context_place: String(draft?.context_place ?? "").trim(),
    time_period: String(draft?.time_period ?? "").trim(),
    population: String(draft?.population ?? "").trim(),
    resources: String(draft?.resources ?? "").trim(),
    include: Array.isArray(draft?.include) ? draft.include.filter(Boolean) : [],
    exclude: Array.isArray(draft?.exclude) ? draft.exclude.filter(Boolean) : [],
  };
}