import { z } from "zod";

export const ProjectIdSchema = z.string().uuid();
export const SpecificObjectiveIdSchema = z.string().uuid();
export const ResearchDesignVersionIdSchema = z.string().uuid();

export const ResearchDesignPatchSchema = z
  .object({
    research_question: z.string().trim().max(5000).optional(),
    general_objective: z.string().trim().max(5000).optional(),
  })
  .strict();

export type ResearchDesignPatch = z.infer<typeof ResearchDesignPatchSchema>;

export const ResearchDesignSaveSchema = z
  .object({
    base_revision: z.number().int().min(0),
    research_question: z.string().trim().max(5000).optional(),
    general_objective: z.string().trim().max(5000).optional(),
  })
  .strict()
  .refine(
    (data) =>
      Object.prototype.hasOwnProperty.call(data, "research_question") ||
      Object.prototype.hasOwnProperty.call(data, "general_objective"),
    {
      message: "At least one editable field is required",
      path: ["base_revision"],
    }
  );

export type ResearchDesignSave = z.infer<typeof ResearchDesignSaveSchema>;

export const SpecificObjectiveCreateSchema = z
  .object({
    text: z.string().trim().min(1).max(3000),
  })
  .strict();

export type SpecificObjectiveCreate = z.infer<
  typeof SpecificObjectiveCreateSchema
>;

export const SpecificObjectiveUpdateSchema = z
  .object({
    text: z.string().trim().min(1).max(3000),
  })
  .strict();

export type SpecificObjectiveUpdate = z.infer<
  typeof SpecificObjectiveUpdateSchema
>;

export const SpecificObjectivesReorderSchema = z
  .object({
    ordered_ids: z.array(z.string().uuid()).min(1),
  })
  .strict();

export type SpecificObjectivesReorder = z.infer<
  typeof SpecificObjectivesReorderSchema
>;

export const ResearchDesignVersionTriggerTypeSchema = z.enum([
  "manual",
  "auto_checkpoint",
  "restore_backup",
]);

export type ResearchDesignVersionTriggerType = z.infer<
  typeof ResearchDesignVersionTriggerTypeSchema
>;

export const ResearchDesignCreateVersionSchema = z
  .object({
    label: z.string().trim().max(120).nullable().optional(),
    trigger_type: ResearchDesignVersionTriggerTypeSchema.optional(),
  })
  .strict();

export type ResearchDesignCreateVersion = z.infer<
  typeof ResearchDesignCreateVersionSchema
>;

export const ResearchDesignRestoreVersionSchema = z
  .object({
    base_revision: z.number().int().min(0).optional(),
    create_backup_of_current: z.boolean().optional(),
  })
  .strict();

export type ResearchDesignRestoreVersion = z.infer<
  typeof ResearchDesignRestoreVersionSchema
>;

export const SpecificObjectiveSaveSchema = z
  .object({
    base_revision: z.number().int().min(0),
    text: z.string().trim().min(1).max(3000),
  })
  .strict();

export type SpecificObjectiveSave = z.infer<
  typeof SpecificObjectiveSaveSchema
>;
