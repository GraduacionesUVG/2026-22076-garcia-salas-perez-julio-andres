import { z } from "zod";

export const DocumentSourceIdSchema = z.string().uuid();

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

function normalizeCode(value: unknown) {
  if (typeof value !== "string") return value;

  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseBooleanInput(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();

  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;

  return value;
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

export const DocumentSourceCreateSchema = z
  .object({
    code: z.preprocess(
      normalizeCode,
      z
        .string()
        .min(1, "Code is required")
        .max(80, "Code is too long")
        .regex(
          /^[a-z0-9][a-z0-9_-]*$/,
          "Code must use lowercase letters, numbers, underscores or hyphens"
        )
    ),
    label: z.preprocess(
      (value) => emptyStringToDefault(value, ""),
      z.string().min(1, "Label is required").max(160, "Label is too long")
    ),
    description: z.preprocess(
      (value) => emptyStringToDefault(value, ""),
      z.string().max(5000, "Description is too long").optional()
    ),
    is_active: z.preprocess(
      parseBooleanInput,
      z.boolean().optional()
    ),
    position: z.preprocess(
      parseIntegerInput,
      z.number().int().min(0).max(100000).optional()
    ),
  })
  .strict();

export type DocumentSourceCreateInput = z.infer<
  typeof DocumentSourceCreateSchema
>;

export const DocumentSourceUpdateSchema = z
  .object({
    code: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return normalizeCode(value);
      },
      z
        .string()
        .min(1, "Code cannot be empty")
        .max(80, "Code is too long")
        .regex(
          /^[a-z0-9][a-z0-9_-]*$/,
          "Code must use lowercase letters, numbers, underscores or hyphens"
        )
        .optional()
    ),
    label: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "");
      },
      z.string().min(1, "Label cannot be empty").max(160, "Label is too long").optional()
    ),
    description: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "");
      },
      z.string().max(5000, "Description is too long").optional()
    ),
    is_active: z.preprocess(parseBooleanInput, z.boolean().optional()),
    position: z.preprocess(
      parseIntegerInput,
      z.number().int().min(0).max(100000).optional()
    ),
  })
  .strict()
  .refine(
    (value) =>
      value.code !== undefined ||
      value.label !== undefined ||
      value.description !== undefined ||
      value.is_active !== undefined ||
      value.position !== undefined,
    {
      message: "At least one field is required",
    }
  );

export type DocumentSourceUpdateInput = z.infer<
  typeof DocumentSourceUpdateSchema
>;

export const DocumentSourceListQuerySchema = z
  .object({
    search: z.preprocess(
      emptyStringToUndefined,
      z.string().max(120).optional()
    ),
    active: z.preprocess(parseBooleanQuery, z.boolean().optional()),
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

export type DocumentSourceListQuery = z.infer<
  typeof DocumentSourceListQuerySchema
>;