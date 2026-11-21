import { z } from "zod";

export const CodeIdSchema = z.string().uuid();

function trimString(value: unknown) {
  if (typeof value !== "string") return value;
  return value.trim();
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

const NullableTextSchema = (max: number, message: string) =>
  z.preprocess(emptyStringToNull, z.string().max(max, message).nullable().optional());

const MetadataSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return {};
    return value;
  },
  z.record(z.string(), z.unknown())
);

export const CodeCreateSchema = z
  .object({
    name: z.preprocess(
      trimString,
      z.string().min(1, "Name is required").max(180, "Name is too long")
    ),
    description: NullableTextSchema(10000, "Description is too long"),
    definition: NullableTextSchema(20000, "Definition is too long"),
    inclusion_criteria: NullableTextSchema(
      20000,
      "Inclusion criteria is too long"
    ),
    exclusion_criteria: NullableTextSchema(
      20000,
      "Exclusion criteria is too long"
    ),
    parent_code_id: z.preprocess(
      emptyStringToNull,
      z.string().uuid().nullable().optional()
    ),
    color: z.preprocess(
      (value) => emptyStringToDefault(value, "#0f766e"),
      z.string().min(1).max(40).optional()
    ),
    position: z.preprocess(
      parseIntegerInput,
      z.number().int().min(0).optional()
    ),
    metadata: MetadataSchema.optional(),
  })
  .strict();

export type CodeCreateInput = z.infer<typeof CodeCreateSchema>;

export const CodeUpdateSchema = z
  .object({
    base_revision: z.preprocess(
      parseIntegerInput,
      z.number().int().min(0, "base_revision must be greater than or equal to 0")
    ),
    name: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return trimString(value);
      },
      z
        .string()
        .min(1, "Name cannot be empty")
        .max(180, "Name is too long")
        .optional()
    ),
    description: NullableTextSchema(10000, "Description is too long"),
    definition: NullableTextSchema(20000, "Definition is too long"),
    inclusion_criteria: NullableTextSchema(
      20000,
      "Inclusion criteria is too long"
    ),
    exclusion_criteria: NullableTextSchema(
      20000,
      "Exclusion criteria is too long"
    ),
    parent_code_id: z.preprocess(
      emptyStringToNull,
      z.string().uuid().nullable().optional()
    ),
    color: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "#0f766e");
      },
      z.string().min(1).max(40).optional()
    ),
    position: z.preprocess(
      parseIntegerInput,
      z.number().int().min(0).optional()
    ),
    is_active: z.boolean().optional(),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.definition !== undefined ||
      value.inclusion_criteria !== undefined ||
      value.exclusion_criteria !== undefined ||
      value.parent_code_id !== undefined ||
      value.color !== undefined ||
      value.position !== undefined ||
      value.is_active !== undefined ||
      value.metadata !== undefined,
    {
      message: "At least one editable field is required",
    }
  );

export type CodeUpdateInput = z.infer<typeof CodeUpdateSchema>;

export const CodeListQuerySchema = z
  .object({
    search: z.preprocess(
      emptyStringToUndefined,
      z.string().max(120).optional()
    ),
    parent_code_id: z.preprocess(
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

export type CodeListQuery = z.infer<typeof CodeListQuerySchema>;
