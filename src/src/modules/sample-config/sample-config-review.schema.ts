import { z } from "zod";

export const SampleConfigReviewFocusSchema = z.enum([
  "full",
  "coverage",
  "rationale",
]);

export type SampleConfigReviewFocus = z.infer<
  typeof SampleConfigReviewFocusSchema
>;

export const SampleConfigReviewRequestSchema = z
  .object({
    focus: SampleConfigReviewFocusSchema.optional(),
  })
  .strict();

export type SampleConfigReviewRequest = z.infer<
  typeof SampleConfigReviewRequestSchema
>;

export const SampleConfigReviewFieldSchema = z.enum([
  "main_approach",
  "scope",
  "collection_techniques",
  "field_phase",
  "target_sample_size",
  "sample_size_rationale",
  "coherence",
]);

export type SampleConfigReviewField = z.infer<
  typeof SampleConfigReviewFieldSchema
>;

export const SampleConfigReviewIssueSchema = z.object({
  field: SampleConfigReviewFieldSchema,
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string().min(1).max(160),
  explanation: z.string().min(1).max(800),
});

export type SampleConfigReviewIssue = z.infer<
  typeof SampleConfigReviewIssueSchema
>;

export const SampleConfigReviewQuestionSchema = z.object({
  question: z.string().min(1).max(400),
  purpose: z.string().min(1).max(400),
});

export type SampleConfigReviewQuestion = z.infer<
  typeof SampleConfigReviewQuestionSchema
>;

export const SampleConfigReviewSuggestionSchema = z.object({
  field: SampleConfigReviewFieldSchema,
  suggestion: z.string().min(1).max(500),
});

export type SampleConfigReviewSuggestion = z.infer<
  typeof SampleConfigReviewSuggestionSchema
>;

export const SampleConfigAIReviewSchema = z.object({
  overall_status: z.enum(["good", "warning", "critical"]),
  concise_summary: z.string().min(1).max(700),
  issues: z.array(SampleConfigReviewIssueSchema).max(10),
  strengths: z.array(z.string().min(1).max(220)).max(6),
  guiding_questions: z.array(SampleConfigReviewQuestionSchema).max(8),
  improvement_suggestions: z
    .array(SampleConfigReviewSuggestionSchema)
    .max(8),
  coverage_check: z.object({
    approach_scope_alignment: z.enum([
      "aligned",
      "partially_aligned",
      "misaligned",
    ]),
    techniques_alignment: z.enum([
      "adequate",
      "partial",
      "insufficient",
    ]),
    sample_size_rationale_alignment: z.enum([
      "supported",
      "partially_supported",
      "unsupported",
    ]),
    field_phase_context: z.enum(["clear", "partial", "unclear"]),
    explanation: z.string().min(1).max(700),
  }),
  next_step: z.string().min(1).max(400),
});

export type SampleConfigAIReview = z.infer<typeof SampleConfigAIReviewSchema>;