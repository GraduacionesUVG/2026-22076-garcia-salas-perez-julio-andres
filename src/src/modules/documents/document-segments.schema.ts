import { z } from "zod";

export const DocumentSegmentIdSchema = z.string().uuid();

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

function normalizeSelectedText(value: unknown) {
  if (typeof value !== "string") return value;

  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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

function parseBooleanQuery(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();

  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;

  return value;
}

export const DocumentSegmentCreateSchema = z
  .object({
    base_document_revision: z.preprocess(
      parseIntegerInput,
      z
        .number()
        .int()
        .min(0, "base_document_revision must be greater than or equal to 0")
    ),

    start_char: z.preprocess(
      parseIntegerInput,
      z.number().int().min(0, "start_char must be greater than or equal to 0")
    ),

    end_char: z.preprocess(
      parseIntegerInput,
      z.number().int().min(1, "end_char must be greater than 0")
    ),

    selected_text: z.preprocess(
      normalizeSelectedText,
      z
        .string()
        .min(1, "selected_text is required")
        .max(50000, "selected_text is too long")
    ),

    note: z.preprocess(
      (value) => emptyStringToDefault(value, ""),
      z.string().max(20000, "Note is too long").optional()
    ),
  })
  .strict()
  .refine((value) => value.end_char > value.start_char, {
    message: "end_char must be greater than start_char",
    path: ["end_char"],
  });

export type DocumentSegmentCreateInput = z.infer<
  typeof DocumentSegmentCreateSchema
>;

export const DocumentSegmentUpdateSchema = z
  .object({
    base_revision: z.preprocess(
      parseIntegerInput,
      z.number().int().min(0, "base_revision must be greater than or equal to 0")
    ),

    base_document_revision: z.preprocess(
      parseIntegerInput,
      z
        .number()
        .int()
        .min(0, "base_document_revision must be greater than or equal to 0")
        .optional()
    ),

    start_char: z.preprocess(
      parseIntegerInput,
      z
        .number()
        .int()
        .min(0, "start_char must be greater than or equal to 0")
        .optional()
    ),

    end_char: z.preprocess(
      parseIntegerInput,
      z.number().int().min(1, "end_char must be greater than 0").optional()
    ),

    selected_text: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return normalizeSelectedText(value);
      },
      z
        .string()
        .min(1, "selected_text cannot be empty")
        .max(50000, "selected_text is too long")
        .optional()
    ),

    note: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "");
      },
      z.string().max(20000, "Note is too long").optional()
    ),
  })
  .strict()
  .refine(
    (value) =>
      value.start_char !== undefined ||
      value.end_char !== undefined ||
      value.selected_text !== undefined ||
      value.note !== undefined,
    {
      message: "At least one editable field is required",
    }
  )
  .refine(
    (value) => {
      const isChangingRange =
        value.start_char !== undefined ||
        value.end_char !== undefined ||
        value.selected_text !== undefined;

      if (!isChangingRange) return true;

      return value.base_document_revision !== undefined;
    },
    {
      message:
        "base_document_revision is required when changing segment range or selected_text",
      path: ["base_document_revision"],
    }
  );

export type DocumentSegmentUpdateInput = z.infer<
  typeof DocumentSegmentUpdateSchema
>;

export const DocumentSegmentListQuerySchema = z
  .object({
    search: z.preprocess(
      emptyStringToUndefined,
      z.string().max(120).optional()
    ),

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

export type DocumentSegmentListQuery = z.infer<
  typeof DocumentSegmentListQuerySchema
>;
