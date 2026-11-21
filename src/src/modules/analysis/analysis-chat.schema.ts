import { z } from "zod";

const OptionalTextSchema = z
  .preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().max(4000).optional()
  )
  .optional();

const VisualTargetSchema = z
  .object({
    link_type: z.enum(["document", "segment", "code", "memo", "participant"]),
    id: z.string().uuid(),
    label: z.string().max(160).optional(),
    excerpt: z.string().max(600).optional(),
  })
  .strict();

const VisualMetricSchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.record(z.string(), z.unknown())).max(30),
]);

export const AnalysisChatVisualContextSchema = z
  .object({
    id: z.string().max(120).optional(),
    title: z.string().max(220).optional(),
    prompt: z.string().max(1200).optional(),
    summary: OptionalTextSchema,
    metrics: VisualMetricSchema.optional(),
    evidence: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
    targets: z.array(VisualTargetSchema).max(20).optional(),
  })
  .strict()
  .optional();

export const AnalysisChatRequestSchema = z
  .object({
    id: z.string().optional(),
    messages: z.array(z.any()).default([]),
    visualContext: AnalysisChatVisualContextSchema,
  })
  .strict();

export type AnalysisChatVisualContext = z.infer<
  typeof AnalysisChatVisualContextSchema
>;
