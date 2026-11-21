import { z } from "zod";

export const SegmentCodeIdSchema = z.string().uuid();

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

export const SegmentCodeCreateSchema = z
  .object({
    code_id: z.string().uuid(),
    analytic_note: z.preprocess(
      (value) => emptyStringToDefault(value, ""),
      z.string().max(20000, "Analytic note is too long").optional()
    ),
    is_quote: z.boolean().optional().default(false),
    quote_label: z.preprocess(
      (value) => emptyStringToDefault(value, ""),
      z.string().max(180, "Quote label is too long").optional()
    ),
    metadata: MetadataSchema.optional(),
  })
  .strict();

export type SegmentCodeCreateInput = z.infer<typeof SegmentCodeCreateSchema>;

export const SegmentCodeUpdateSchema = z
  .object({
    base_revision: z.preprocess(
      parseIntegerInput,
      z.number().int().min(0, "base_revision must be greater than or equal to 0")
    ),
    analytic_note: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "");
      },
      z.string().max(20000, "Analytic note is too long").optional()
    ),
    is_quote: z.boolean().optional(),
    quote_label: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "");
      },
      z.string().max(180, "Quote label is too long").optional()
    ),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.analytic_note !== undefined ||
      value.is_quote !== undefined ||
      value.quote_label !== undefined ||
      value.metadata !== undefined,
    {
      message: "At least one editable field is required",
    }
  );

export type SegmentCodeUpdateInput = z.infer<typeof SegmentCodeUpdateSchema>;

export const SegmentCodeListQuerySchema = z
  .object({
    code_id: z.preprocess(
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
      (value) => parseIntegerQuery(value, 100),
      z.number().int().min(1).max(200).default(100)
    ),
    offset: z.preprocess(
      (value) => parseIntegerQuery(value, 0),
      z.number().int().min(0).default(0)
    ),
  })
  .strict();

export type SegmentCodeListQuery = z.infer<typeof SegmentCodeListQuerySchema>;
