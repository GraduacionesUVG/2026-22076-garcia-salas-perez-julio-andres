import { z } from "zod";

export const ProjectIdSchema = z.string().uuid();
export const SampleConfigVersionIdSchema = z.string().uuid();

const OptionalCodeSchema = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  },
  z.string().max(120).nullable().optional()
);

const OptionalLongTextSchema = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null) return "";
    if (typeof value !== "string") return value;
    return value.trim();
  },
  z.string().max(5000).optional()
);

const OptionalNullablePositiveIntSchema = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      const parsed = Number(trimmed);
      return Number.isNaN(parsed) ? value : parsed;
    }
    return value;
  },
  z
    .number()
    .int()
    .positive()
    .refine(Number.isSafeInteger, "Must be a safe integer")
    .nullable()
    .optional()
);

export const SampleCollectionTechniqueInputSchema = z
  .object({
    technique_code: OptionalCodeSchema,
    custom_label: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (typeof value !== "string") return value;
        const trimmed = value.trim();
        return trimmed === "" ? null : trimmed;
      },
      z.string().max(300).nullable().optional()
    ),
    is_custom: z.boolean(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.is_custom) {
      if (!data.custom_label) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "custom_label is required when is_custom is true",
          path: ["custom_label"],
        });
      }

      if (data.technique_code !== null && data.technique_code !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "technique_code must be null for custom techniques",
          path: ["technique_code"],
        });
      }
    } else {
      if (!data.technique_code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "technique_code is required when is_custom is false",
          path: ["technique_code"],
        });
      }

      if (data.custom_label !== null && data.custom_label !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "custom_label must be null for standard techniques",
          path: ["custom_label"],
        });
      }
    }
  });

export type SampleCollectionTechniqueInput = z.infer<
  typeof SampleCollectionTechniqueInputSchema
>;

export const SampleConfigPatchSchema = z
  .object({
    main_approach_code: OptionalCodeSchema,
    scope_code: OptionalCodeSchema,
    field_phase: OptionalLongTextSchema,
    target_sample_size: OptionalNullablePositiveIntSchema,
    sample_size_rationale: OptionalLongTextSchema,
  })
  .strict();

export type SampleConfigPatch = z.infer<typeof SampleConfigPatchSchema>;

export const SampleConfigSaveSchema = SampleConfigPatchSchema.extend({
  base_revision: z.number().int().min(0),
  collection_techniques: z
    .array(SampleCollectionTechniqueInputSchema)
    .max(100)
    .optional(),
})
  .strict()
  .refine(
    (data) =>
      Object.prototype.hasOwnProperty.call(data, "main_approach_code") ||
      Object.prototype.hasOwnProperty.call(data, "scope_code") ||
      Object.prototype.hasOwnProperty.call(data, "field_phase") ||
      Object.prototype.hasOwnProperty.call(data, "target_sample_size") ||
      Object.prototype.hasOwnProperty.call(data, "sample_size_rationale") ||
      Object.prototype.hasOwnProperty.call(data, "collection_techniques"),
    {
      message:
        "At least one editable field is required",
      path: ["base_revision"],
    }
  );

export type SampleConfigSave = z.infer<typeof SampleConfigSaveSchema>;

export const SampleConfigVersionTriggerTypeSchema = z.enum([
  "manual",
  "auto_checkpoint",
  "restore_backup",
]);

export type SampleConfigVersionTriggerType = z.infer<
  typeof SampleConfigVersionTriggerTypeSchema
>;

export const SampleConfigCreateVersionSchema = z
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
    trigger_type: SampleConfigVersionTriggerTypeSchema.optional(),
  })
  .strict();

export type SampleConfigCreateVersion = z.infer<
  typeof SampleConfigCreateVersionSchema
>;

export const SampleConfigRestoreVersionSchema = z
  .object({
    base_revision: z.number().int().min(0).optional(),
    create_backup_of_current: z.boolean().optional(),
  })
  .strict();

export type SampleConfigRestoreVersion = z.infer<
  typeof SampleConfigRestoreVersionSchema
>;
