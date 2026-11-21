import { z } from "zod";

export const ParticipantIdSchema = z.string().uuid();

export const ParticipantStatusSchema = z.enum([
  "active",
  "inactive",
  "withdrawn",
  "archived",
]);

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

function parseBooleanQuery(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;

  return value === "true" || value === "1";
}

function parseIntegerQuery(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed)) return fallback;

  return parsed;
}

const AttributesSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return {};
    return value;
  },
  z.record(z.string(), z.unknown())
);

export const ParticipantCreateSchema = z
  .object({
    alias: z.preprocess(
      (value) => {
        if (typeof value !== "string") return value;
        return value.trim();
      },
      z.string().min(1, "Alias is required").max(120, "Alias is too long")
    ),
    display_name: z.preprocess(
      emptyStringToNull,
      z.string().max(180, "Display name is too long").nullable().optional()
    ),
    notes: z.preprocess(
      (value) => emptyStringToDefault(value, ""),
      z.string().max(10000, "Notes are too long").optional()
    ),
    attributes: AttributesSchema.optional(),
    status: ParticipantStatusSchema.optional(),
  })
  .strict();

export type ParticipantCreateInput = z.infer<typeof ParticipantCreateSchema>;

export const ParticipantUpdateSchema = z
  .object({
    // JSON numbers must round-trip without losing the persisted bigint's identity.
    base_revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    alias: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        if (typeof value !== "string") return value;
        return value.trim();
      },
      z
        .string()
        .min(1, "Alias cannot be empty")
        .max(120, "Alias is too long")
        .optional()
    ),
    display_name: z.preprocess(
      emptyStringToNull,
      z.string().max(180, "Display name is too long").nullable().optional()
    ),
    notes: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        return emptyStringToDefault(value, "");
      },
      z.string().max(10000, "Notes are too long").optional()
    ),
    attributes: AttributesSchema.optional(),
    status: ParticipantStatusSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.alias !== undefined ||
      value.display_name !== undefined ||
      value.notes !== undefined ||
      value.attributes !== undefined ||
      value.status !== undefined,
    {
      message: "At least one field is required",
    }
  );

export type ParticipantUpdateInput = z.infer<typeof ParticipantUpdateSchema>;

export const ParticipantListQuerySchema = z
  .object({
    search: z.preprocess(
      (value) => {
        if (value === undefined || value === null) return undefined;
        if (typeof value !== "string") return value;

        const trimmed = value.trim();
        return trimmed === "" ? undefined : trimmed;
      },
      z.string().max(120).optional()
    ),
    status: ParticipantStatusSchema.optional(),
    include_deleted: z.preprocess(parseBooleanQuery, z.boolean().default(false)),
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

export type ParticipantListQuery = z.infer<typeof ParticipantListQuerySchema>;
