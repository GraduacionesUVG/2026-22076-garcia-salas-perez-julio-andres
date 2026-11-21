import { z } from "zod";

export const ProjectIdSchema = z.string().uuid();

export const CreateProjectSchema = z
  .object({
    name: z.preprocess(
      (value) => {
        if (typeof value !== "string") return value;
        return value.trim();
      },
      z.string().min(1, "Name is required").max(180, "Name is too long")
    ),
    description: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (typeof value !== "string") return value;
        const trimmed = value.trim();
        return trimmed === "" ? null : trimmed;
      },
      z.string().max(1000, "Description is too long").nullable().optional()
    ),
    is_active: z.boolean().optional(),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z
  .object({
    name: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        if (typeof value !== "string") return value;
        return value.trim();
      },
      z.string().min(1, "Name cannot be empty").max(180, "Name is too long").optional()
    ),
    description: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (typeof value !== "string") return value;
        const trimmed = value.trim();
        return trimmed === "" ? null : trimmed;
      },
      z.string().max(1000, "Description is too long").nullable().optional()
    ),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.is_active !== undefined,
    {
      message: "At least one field is required",
    }
  );

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;