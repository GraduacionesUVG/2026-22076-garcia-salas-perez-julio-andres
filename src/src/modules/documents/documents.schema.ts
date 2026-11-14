import { z } from "zod";

export const DocumentIdSchema = z.string().uuid();

export const DocumentTypeSchema = z.enum([
  "interview",
  "focus_group",
  "field_note",
  "observation",
  "diary",
  "archival_document",
  "open_text",
  "other",
]);

export const DocumentStatusSchema = z.enum([
  "draft",
  "transcribed",
  "cleaned",
  "reviewed",
  "ready_for_coding",
  "archived",
]);

function trimString(value: unknown) {
  if (typeof value !== "string") return value;
  return value.trim();
}

function normalizeText(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return value;

  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function emptyStringToNull(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
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

const OptionalDateSchema = z.preprocess(
  emptyStringToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
    .nullable()
    .optional()
);

const MetadataSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return {};
    return value;
  },
  z.record(z.string(), z.unknown())
);

export const DocumentCreateSchema = z
  .object({
    title: z.preprocess(
      trimString,
      z.string().min(1, "Title is required").max(250, "Title is too long")
    ),

    content: z.preprocess(
      normalizeText,
      z
        .string()
        .max(1000000, "Content is too long")
        .optional()
        .default("")
    ),

    document_type: DocumentTypeSchema.optional().default("interview"),

    source_id: z.preprocess(
      emptyStringToNull,
      z.string().uuid().nullable().optional()
    ),

    participant_id: z.preprocess(
      emptyStringToNull,
      z.string().uuid().nullable().optional()
    ),

    interview_date: OptionalDateSchema,
    field_date: OptionalDateSchema,

    location: z.preprocess(
      (value) => emptyStringToDefault(value, ""),
      z.string().max(250, "Location is too long").optional()
    ),

    language: z.preprocess(
      (value) => emptyStringToDefault(value, "es"),
      z.string().min(2).max(20).optional()
    ),

    notes: z.preprocess(
      (value) => emptyStringToDefault(value, ""),
      z.string().max(20000, "Notes are too long").optional()
    ),

    metadata: MetadataSchema.optional(),

    status: DocumentStatusSchema.optional().default("draft"),
  })
  .strict();

export type DocumentCreateInput = z.infer<typeof DocumentCreateSchema>;

export const DocumentUpdateSchema = z
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

    content: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return normalizeText(value);
      },
      z.string().max(1000000, "Content is too long").optional()
    ),

    document_type: DocumentTypeSchema.optional(),

    source_id: z.preprocess(
      emptyStringToNull,
      z.string().uuid().nullable().optional()
    ),

    participant_id: z.preprocess(
      emptyStringToNull,
      z.string().uuid().nullable().optional()
    ),

    interview_date: OptionalDateSchema,
    field_date: OptionalDateSchema,

    location: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "");
      },
      z.string().max(250, "Location is too long").optional()
    ),

    language: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "es");
      },
      z.string().min(2).max(20).optional()
    ),

    notes: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "");
      },
      z.string().max(20000, "Notes are too long").optional()
    ),

    metadata: MetadataSchema.optional(),

    status: DocumentStatusSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.content !== undefined ||
      value.document_type !== undefined ||
      value.source_id !== undefined ||
      value.participant_id !== undefined ||
      value.interview_date !== undefined ||
      value.field_date !== undefined ||
      value.location !== undefined ||
      value.language !== undefined ||
      value.notes !== undefined ||
      value.metadata !== undefined ||
      value.status !== undefined,
    {
      message: "At least one editable field is required",
    }
  );

export type DocumentUpdateInput = z.infer<typeof DocumentUpdateSchema>;

export const DocumentListQuerySchema = z
  .object({
    search: z.preprocess(
      emptyStringToUndefined,
      z.string().max(120).optional()
    ),

    document_type: DocumentTypeSchema.optional(),
    status: DocumentStatusSchema.optional(),

    source_id: z.preprocess(
      emptyStringToUndefined,
      z.string().uuid().optional()
    ),

    participant_id: z.preprocess(
      emptyStringToUndefined,
      z.string().uuid().optional()
    ),

    include_deleted: z.preprocess(
      (value) => {
        const parsed = parseBooleanQuery(value);
        return parsed === undefined ? false : parsed;
      },
      z.boolean().default(false)
    ),

    limit: z.preprocess(
      (value) => parseIntegerQuery(value, 50),
      z.number().int().min(1).max(100).default(50)
    ),

    offset: z.preprocess(
      (value) => parseIntegerQuery(value, 0),
      z.number().int().min(0).default(0)
    ),
  })
  .strict();

export type DocumentListQuery = z.infer<typeof DocumentListQuerySchema>;