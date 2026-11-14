import { z } from "zod";

export const InsightIdSchema = z.string().uuid();
export const InsightLinkIdSchema = z.string().uuid();

export const InsightTypeSchema = z.enum([
  "pattern",
  "contrast",
  "tension",
  "exception",
  "question",
  "recommendation",
  "other",
]);

export const InsightConfidenceSchema = z.enum(["low", "medium", "high"]);

export const InsightStatusSchema = z.enum([
  "draft",
  "reviewed",
  "confirmed",
  "archived",
]);

export const InsightLinkTypeSchema = z.enum([
  "document",
  "segment",
  "code",
  "memo",
  "participant",
]);

function trimString(value: unknown) {
  if (typeof value !== "string") return value;
  return value.trim();
}

function emptyStringToDefault(value: unknown, fallback: string) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return value;
  return value.trim();
}

function emptyStringToUndefined(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseBooleanQuery(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();

  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;

  return value;
}

function parseIntegerInput(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed)) return value;

  return parsed;
}

function parseIntegerQuery(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed)) return fallback;

  return parsed;
}

const MetadataSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return {};
    return value;
  },
  z.record(z.string(), z.unknown())
);

const TagsSchema = z
  .array(z.preprocess(trimString, z.string().min(1).max(80)))
  .max(100)
  .optional();

const OptionalUuidSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().uuid().optional()
);

function targetKeyForLinkType(linkType: z.infer<typeof InsightLinkTypeSchema>) {
  return `${linkType}_id` as
    | "document_id"
    | "segment_id"
    | "code_id"
    | "memo_id"
    | "participant_id";
}

export const InsightCreateSchema = z
  .object({
    title: z.preprocess(
      trimString,
      z.string().min(1, "Title is required").max(250, "Title is too long")
    ),
    summary: z.preprocess(
      (value) => emptyStringToDefault(value, ""),
      z.string().max(50000, "Summary is too long").optional()
    ),
    interpretation: z.preprocess(
      (value) => emptyStringToDefault(value, ""),
      z.string().max(200000, "Interpretation is too long").optional()
    ),
    insight_type: InsightTypeSchema.optional().default("pattern"),
    confidence: InsightConfidenceSchema.optional().default("medium"),
    status: InsightStatusSchema.optional().default("draft"),
    tags: TagsSchema,
    metadata: MetadataSchema.optional(),
  })
  .strict();

export type InsightCreateInput = z.infer<typeof InsightCreateSchema>;

export const InsightUpdateSchema = z
  .object({
    base_revision: z.preprocess(
      parseIntegerInput,
      z.number().int().min(0, "base_revision must be greater than or equal to 0")
    ),
    title: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return trimString(value);
      },
      z
        .string()
        .min(1, "Title cannot be empty")
        .max(250, "Title is too long")
        .optional()
    ),
    summary: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "");
      },
      z.string().max(50000, "Summary is too long").optional()
    ),
    interpretation: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "");
      },
      z.string().max(200000, "Interpretation is too long").optional()
    ),
    insight_type: InsightTypeSchema.optional(),
    confidence: InsightConfidenceSchema.optional(),
    status: InsightStatusSchema.optional(),
    tags: TagsSchema,
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.summary !== undefined ||
      value.interpretation !== undefined ||
      value.insight_type !== undefined ||
      value.confidence !== undefined ||
      value.status !== undefined ||
      value.tags !== undefined ||
      value.metadata !== undefined,
    {
      message: "At least one editable field is required",
    }
  );

export type InsightUpdateInput = z.infer<typeof InsightUpdateSchema>;

export const InsightListQuerySchema = z
  .object({
    tag: z.preprocess(trimString, z.string().min(1).max(80).optional()),
    search: z.preprocess(
      emptyStringToUndefined,
      z.string().max(120).optional()
    ),
    insight_type: InsightTypeSchema.optional(),
    confidence: InsightConfidenceSchema.optional(),
    status: InsightStatusSchema.optional(),
    include_deleted: z.preprocess(
      (value) => {
        const parsed = parseBooleanQuery(value);
        return parsed === undefined ? false : parsed;
      },
      z.boolean().default(false)
    ),
    include_links: z.preprocess(
      (value) => {
        const parsed = parseBooleanQuery(value);
        return parsed === undefined ? false : parsed;
      },
      z.boolean().default(false)
    ),
    limit: z.preprocess(
      (value) => parseIntegerQuery(value, 100),
      z.number().int().min(1).max(200).default(100)
    ),
    offset: z.preprocess(
      (value) => parseIntegerQuery(value, 0),
      z.number().int().min(0).default(0)
    ),
  })
  .strict();

export type InsightListQuery = z.infer<typeof InsightListQuerySchema>;

export const InsightLinkCreateSchema = z
  .object({
    link_type: InsightLinkTypeSchema,
    document_id: OptionalUuidSchema,
    segment_id: OptionalUuidSchema,
    code_id: OptionalUuidSchema,
    memo_id: OptionalUuidSchema,
    participant_id: OptionalUuidSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected = targetKeyForLinkType(value.link_type);
    const targetKeys = [
      "document_id",
      "segment_id",
      "code_id",
      "memo_id",
      "participant_id",
    ] as const;
    const present = targetKeys.filter((key) => value[key] !== undefined);

    if (present.length !== 1 || present[0] !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INVALID_LINK_TARGET",
        path: [expected],
      });
    }
  });

export type InsightLinkCreateInput = z.infer<typeof InsightLinkCreateSchema>;
