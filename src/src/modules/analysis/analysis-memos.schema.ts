import { z } from "zod";

export const MemoIdSchema = z.string().uuid();
export const MemoLinkIdSchema = z.string().uuid();

export const MemoTypeSchema = z.enum([
  "analytic",
  "methodological",
  "reflexive",
  "field",
  "theoretical",
]);

export const MemoStatusSchema = z.enum([
  "draft",
  "reviewed",
  "confirmed",
  "archived",
]);

export const MemoLinkTypeSchema = z.enum([
  "document",
  "segment",
  "code",
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

function targetKeyForLinkType(linkType: z.infer<typeof MemoLinkTypeSchema>) {
  return `${linkType}_id` as
    | "document_id"
    | "segment_id"
    | "code_id"
    | "participant_id";
}

export const MemoCreateSchema = z
  .object({
    title: z.preprocess(
      trimString,
      z.string().min(1, "Title is required").max(250, "Title is too long")
    ),
    body: z.preprocess(
      (value) => emptyStringToDefault(value, ""),
      z.string().max(200000, "Body is too long").optional()
    ),
    memo_type: MemoTypeSchema.optional().default("analytic"),
    status: MemoStatusSchema.optional().default("draft"),
    tags: TagsSchema,
    metadata: MetadataSchema.optional(),
  })
  .strict();

export type MemoCreateInput = z.infer<typeof MemoCreateSchema>;

export const MemoUpdateSchema = z
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
    body: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "");
      },
      z.string().max(200000, "Body is too long").optional()
    ),
    memo_type: MemoTypeSchema.optional(),
    status: MemoStatusSchema.optional(),
    tags: TagsSchema,
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.body !== undefined ||
      value.memo_type !== undefined ||
      value.status !== undefined ||
      value.tags !== undefined ||
      value.metadata !== undefined,
    {
      message: "At least one editable field is required",
    }
  );

export type MemoUpdateInput = z.infer<typeof MemoUpdateSchema>;

export const MemoListQuerySchema = z
  .object({
    tag: z.preprocess(trimString, z.string().min(1).max(80).optional()),
    search: z.preprocess(
      emptyStringToUndefined,
      z.string().max(120).optional()
    ),
    memo_type: MemoTypeSchema.optional(),
    status: MemoStatusSchema.optional(),
    include_deleted: z.preprocess(
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

export type MemoListQuery = z.infer<typeof MemoListQuerySchema>;

export const MemoLinkCreateSchema = z
  .object({
    link_type: MemoLinkTypeSchema,
    document_id: OptionalUuidSchema,
    segment_id: OptionalUuidSchema,
    code_id: OptionalUuidSchema,
    participant_id: OptionalUuidSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected = targetKeyForLinkType(value.link_type);
    const targetKeys = [
      "document_id",
      "segment_id",
      "code_id",
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

export type MemoLinkCreateInput = z.infer<typeof MemoLinkCreateSchema>;
