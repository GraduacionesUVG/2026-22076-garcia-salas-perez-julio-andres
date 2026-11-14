import { z } from "zod";

export const DelimitationRestoreVersionSchema = z.object({
  base_revision: z.number().int().min(0).optional(),
  create_backup_of_current: z.boolean().optional(),
}).strict();

export const ProjectIdSchema = z.string().uuid();

export const DelimitationPatchSchema = z
  .object({
    topic: z.string().trim().max(500).optional(),
    context_place: z.string().trim().max(500).optional(),
    population: z.string().trim().max(500).optional(),
    time_period: z.string().trim().max(500).optional(),
    resources: z.string().trim().max(500).optional(),
  })
  .strict();

export type DelimitationPatch = z.infer<typeof DelimitationPatchSchema>;

export const DelimitationSaveSchema = z
  .object({
    base_revision: z.number().int().min(0),
    topic: z.string().trim().max(500).optional(),
    context_place: z.string().trim().max(500).optional(),
    population: z.string().trim().max(500).optional(),
    time_period: z.string().trim().max(500).optional(),
    resources: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (data) =>
      Object.prototype.hasOwnProperty.call(data, "topic") ||
      Object.prototype.hasOwnProperty.call(data, "context_place") ||
      Object.prototype.hasOwnProperty.call(data, "population") ||
      Object.prototype.hasOwnProperty.call(data, "time_period") ||
      Object.prototype.hasOwnProperty.call(data, "resources"),
    {
      message: "At least one editable field is required",
      path: ["base_revision"],
    }
  );

export type DelimitationSave = z.infer<typeof DelimitationSaveSchema>;

export const DelimitationItemKindSchema = z.enum(["include", "exclude"]);

export const DelimitationItemCreateSchema = z
  .object({
    kind: DelimitationItemKindSchema,
    text: z.string().trim().min(1).max(300),
  })
  .strict();

export type DelimitationItemCreate = z.infer<typeof DelimitationItemCreateSchema>;

export const DelimitationItemUpdateSchema = z
  .object({
    text: z.string().trim().min(1).max(300),
  })
  .strict();

export type DelimitationItemUpdate = z.infer<typeof DelimitationItemUpdateSchema>;

export const DelimitationVersionCreateSchema = z
  .object({
    label: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (typeof value !== "string") return value;
        const trimmed = value.trim();
        return trimmed === "" ? null : trimmed;
      },
      z.string().max(120).nullable().optional()
    ),
  })
  .strict();

export type DelimitationVersionCreate = z.infer<typeof DelimitationVersionCreateSchema>;

export const DelimitationVersionIdSchema = z.string().uuid();
export const DelimitationItemIdSchema = z.string().uuid();
