import { z } from "zod";

export const ResearchDesignReviewFocusSchema = z.enum([
  "full",
  "question",
  "objectives",
]);

export type ResearchDesignReviewFocus = z.infer<
  typeof ResearchDesignReviewFocusSchema
>;

export const ResearchDesignReviewRequestSchema = z
  .object({
    focus: ResearchDesignReviewFocusSchema.optional(),
  })
  .strict();

export type ResearchDesignReviewRequest = z.infer<
  typeof ResearchDesignReviewRequestSchema
>;

const ResearchDesignReviewFieldSchema = z.enum([
  "research_question",
  "general_objective",
  "specific_objectives",
  "coherence",
  "alignment",
]);

export const ResearchDesignReviewIssueSchema = z.object({
  field: ResearchDesignReviewFieldSchema,
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string().min(1).max(160),
  explanation: z.string().min(1).max(800),
  suggestion: z.string().min(1).max(500).optional(),
  affected_specific_objective_ids: z.array(z.string().uuid()).optional(),
});

export type ResearchDesignReviewIssue = z.infer<
  typeof ResearchDesignReviewIssueSchema
>;

export const ResearchDesignReviewQuestionSchema = z.object({
  question: z.string().min(1).max(400),
  purpose: z.string().min(1).max(400),
});

export type ResearchDesignReviewQuestion = z.infer<
  typeof ResearchDesignReviewQuestionSchema
>;

export const ResearchDesignReviewSuggestionSchema = z.object({
  field: ResearchDesignReviewFieldSchema,
  suggestion: z.string().min(1).max(500),
});

export type ResearchDesignReviewSuggestion = z.infer<
  typeof ResearchDesignReviewSuggestionSchema
>;

const DelimitationAlignmentStatusSchema = z.enum([
  "aligned",
  "partially_aligned",
  "misaligned",
  "not_applicable",
]);

export const ResearchDesignAIReviewSchema = z.object({
  overall_status: z.enum(["good", "warning", "critical"]),
  concise_summary: z.string().min(1).max(700),
  issues: z.array(ResearchDesignReviewIssueSchema).max(12),
  guiding_questions: z.array(ResearchDesignReviewQuestionSchema).max(10),
  improvement_suggestions: z.array(ResearchDesignReviewSuggestionSchema).max(10),
  coverage_check: z.object({
    question_vs_general_objective: z.enum([
      "aligned",
      "partially_aligned",
      "misaligned",
    ]),
    specific_objectives_vs_question: z.enum([
      "covered",
      "partially_covered",
      "not_covered",
    ]),
    specific_objectives_vs_general_objective: z.enum([
      "covered",
      "partially_covered",
      "not_covered",
    ]),
    explanation: z.string().min(1).max(700),
  }),
  delimitation_alignment: z.object({
    topic: DelimitationAlignmentStatusSchema,
    population: DelimitationAlignmentStatusSchema,
    context_place: DelimitationAlignmentStatusSchema,
    time_period: DelimitationAlignmentStatusSchema,
    explanation: z.string().min(1).max(700),
  }),
  next_step: z.string().min(1).max(400),
});

export type ResearchDesignAIReview = z.infer<
  typeof ResearchDesignAIReviewSchema
>;