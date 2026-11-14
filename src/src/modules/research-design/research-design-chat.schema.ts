import { z } from "zod";

export const ResearchDesignChatSpecificObjectiveSchema = z
  .object({
    id: z.string().optional(),
    text: z.string().max(3000).optional(),
    position: z.number().int().min(0).optional(),
  })
  .passthrough();

export type ResearchDesignChatSpecificObjective = z.infer<
  typeof ResearchDesignChatSpecificObjectiveSchema
>;

export const ResearchDesignChatDraftSchema = z
  .object({
    research_question: z.string().max(5000).optional(),
    general_objective: z.string().max(5000).optional(),
    specific_objectives: z
      .array(ResearchDesignChatSpecificObjectiveSchema)
      .optional(),
  })
  .strict();

export type ResearchDesignChatDraft = z.infer<
  typeof ResearchDesignChatDraftSchema
>;

export const ResearchDesignChatSignalSchema = z
  .object({
    field: z.string().optional(),
    level: z.string().optional(),
    text: z.string().optional(),
  })
  .passthrough();

export const ResearchDesignChatHeuristicsSchema = z
  .object({
    signals: z.array(ResearchDesignChatSignalSchema).optional(),
    jackQuestion: z.string().max(500).optional(),
    totalHighlights: z.number().int().min(0).optional(),
  })
  .strict();

export type ResearchDesignChatHeuristics = z.infer<
  typeof ResearchDesignChatHeuristicsSchema
>;

export const ResearchDesignChatRequestSchema = z
  .object({
    id: z.string().optional(),
    messages: z.array(z.any()).min(1),
    draft: ResearchDesignChatDraftSchema.optional(),
    heuristics: ResearchDesignChatHeuristicsSchema.optional(),
  })
  .strict();

const EMPTY_DRAFT: {
  research_question: string;
  general_objective: string;
  specific_objectives: Array<{
    id?: string;
    text: string;
    position: number;
  }>;
} = {
  research_question: "",
  general_objective: "",
  specific_objectives: [],
};

export function coerceResearchDesignChatDraft(
  draft?: ResearchDesignChatDraft
): typeof EMPTY_DRAFT {
  return {
    research_question: String(draft?.research_question ?? ""),
    general_objective: String(draft?.general_objective ?? ""),
    specific_objectives: Array.isArray(draft?.specific_objectives)
      ? draft.specific_objectives.map((item, index) => ({
          id: item?.id,
          text: String(item?.text ?? ""),
          position:
            typeof item?.position === "number" ? item.position : index,
        }))
      : [],
  };
}