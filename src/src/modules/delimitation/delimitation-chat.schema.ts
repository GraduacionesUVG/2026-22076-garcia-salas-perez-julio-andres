import { z } from "zod";

export const DelimitationChatDraftSchema = z
  .object({
    topic: z.string().max(500).optional(),
    context_place: z.string().max(500).optional(),
    time_period: z.string().max(500).optional(),
    population: z.string().max(500).optional(),
    resources: z.string().max(500).optional(),
    include: z.array(z.any()).optional(),
    exclude: z.array(z.any()).optional(),
  })
  .strict();

export type DelimitationChatDraft = z.infer<
  typeof DelimitationChatDraftSchema
>;

export const DelimitationChatSignalSchema = z
  .object({
    field: z.string().optional(),
    level: z.string().optional(),
    text: z.string().optional(),
  })
  .passthrough();

export const DelimitationChatHeuristicsSchema = z
  .object({
    signals: z.array(DelimitationChatSignalSchema).optional(),
    jackQuestion: z.string().max(500).optional(),
    totalHighlights: z.number().int().min(0).optional(),
  })
  .strict();

export type DelimitationChatHeuristics = z.infer<
  typeof DelimitationChatHeuristicsSchema
>;

export const DelimitationChatRequestSchema = z
  .object({
    id: z.string().optional(),
    messages: z.array(z.any()).min(1),
    draft: DelimitationChatDraftSchema.optional(),
    heuristics: DelimitationChatHeuristicsSchema.optional(),
  })
  .strict();

const EMPTY_DRAFT: Required<
  Pick<
    DelimitationChatDraft,
    "topic" | "context_place" | "time_period" | "population" | "resources"
  >
> & {
  include: any[];
  exclude: any[];
} = {
  topic: "",
  context_place: "",
  time_period: "",
  population: "",
  resources: "",
  include: [],
  exclude: [],
};

export function coerceDelimitationChatDraft(
  draft?: DelimitationChatDraft
): typeof EMPTY_DRAFT {
  return {
    ...EMPTY_DRAFT,
    ...(draft ?? {}),
    include: Array.isArray(draft?.include) ? draft.include : [],
    exclude: Array.isArray(draft?.exclude) ? draft.exclude : [],
  };
}