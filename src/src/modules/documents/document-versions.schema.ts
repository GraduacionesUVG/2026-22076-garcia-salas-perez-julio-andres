import { z } from "zod";

export const DocumentVersionIdSchema = z.string().uuid();

export const DocumentVersionTriggerTypeSchema = z.enum([
  "manual",
  "auto_checkpoint",
  "before_restore",
  "restore_backup",
]);

function emptyStringToNull(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
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

export const DocumentVersionCreateSchema = z
  .object({
    label: z.preprocess(
      emptyStringToNull,
      z.string().max(180, "Label is too long").nullable().optional()
    ),
    trigger_type: DocumentVersionTriggerTypeSchema.optional().default("manual"),
  })
  .strict();

export type DocumentVersionCreateInput = z.infer<
  typeof DocumentVersionCreateSchema
>;

export const DocumentVersionListQuerySchema = z
  .object({
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

export type DocumentVersionListQuery = z.infer<
  typeof DocumentVersionListQuerySchema
>;

export const DocumentVersionRestoreSchema = z
  .object({
    base_revision: z.preprocess(
      parseIntegerInput,
      z.number().int().min(0, "base_revision must be greater than or equal to 0")
    ),
  })
  .strict();

export type DocumentVersionRestoreInput = z.infer<
  typeof DocumentVersionRestoreSchema
>;