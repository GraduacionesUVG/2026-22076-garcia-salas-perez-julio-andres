import { z } from "zod";

export const SampleConfigChatTechniqueSchema = z
  .object({
    id: z.string().optional(),
    technique_code: z.string().max(120).nullable().optional(),
    label: z.string().max(300).optional(),
    custom_label: z.string().max(300).optional(),
    is_custom: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
  })
  .passthrough();

export type SampleConfigChatTechnique = z.infer<
  typeof SampleConfigChatTechniqueSchema
>;

export const SampleConfigChatDraftSchema = z
  .object({
    main_approach_code: z.string().max(120).optional(),
    main_approach_label: z.string().max(300).optional(),
    scope_code: z.string().max(120).optional(),
    scope_label: z.string().max(300).optional(),
    field_phase: z.string().max(5000).optional(),
    target_sample_size: z.string().max(100).optional(),
    sample_size_rationale: z.string().max(5000).optional(),
    collection_techniques: z.array(SampleConfigChatTechniqueSchema).optional(),
  })
  .strict();

export type SampleConfigChatDraft = z.infer<
  typeof SampleConfigChatDraftSchema
>;

export const SampleConfigChatSignalSchema = z
  .object({
    field: z.string().optional(),
    level: z.string().optional(),
    text: z.string().optional(),
  })
  .passthrough();

export const SampleConfigChatHeuristicsSchema = z
  .object({
    signals: z.array(SampleConfigChatSignalSchema).optional(),
    jackQuestion: z.string().max(500).optional(),
    conciseSummary: z.string().max(800).optional(),
    totalHighlights: z.number().int().min(0).optional(),
  })
  .strict();

export type SampleConfigChatHeuristics = z.infer<
  typeof SampleConfigChatHeuristicsSchema
>;

export const SampleConfigChatRequestSchema = z
  .object({
    id: z.string().optional(),
    messages: z.array(z.any()).min(1),
    draft: SampleConfigChatDraftSchema.optional(),
    heuristics: SampleConfigChatHeuristicsSchema.optional(),
  })
  .strict();

const EMPTY_DRAFT = {
  main_approach_code: "",
  main_approach_label: "",
  scope_code: "",
  scope_label: "",
  field_phase: "",
  target_sample_size: "",
  sample_size_rationale: "",
  collection_techniques: [] as Array<{
    id?: string;
    technique_code: string | null;
    label: string;
    custom_label: string;
    is_custom: boolean;
    position: number;
  }>,
};

export function coerceSampleConfigChatDraft(
  draft?: SampleConfigChatDraft
): typeof EMPTY_DRAFT {
  return {
    main_approach_code: String(draft?.main_approach_code ?? ""),
    main_approach_label: String(draft?.main_approach_label ?? ""),
    scope_code: String(draft?.scope_code ?? ""),
    scope_label: String(draft?.scope_label ?? ""),
    field_phase: String(draft?.field_phase ?? ""),
    target_sample_size: String(draft?.target_sample_size ?? ""),
    sample_size_rationale: String(draft?.sample_size_rationale ?? ""),
    collection_techniques: Array.isArray(draft?.collection_techniques)
      ? draft.collection_techniques.map((item, index) => ({
          id: item?.id,
          technique_code: item?.technique_code ?? null,
          label: String(item?.label ?? ""),
          custom_label: String(item?.custom_label ?? ""),
          is_custom: !!item?.is_custom,
          position:
            typeof item?.position === "number" ? item.position : index,
        }))
      : [],
  };
}