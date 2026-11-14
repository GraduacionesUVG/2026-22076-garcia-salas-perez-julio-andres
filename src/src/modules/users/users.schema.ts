import { z } from "zod";

export const UpdateMeSchema = z.object({
  full_name: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    },
    z
      .string()
      .max(120, "full_name is too long")
      .nullable()
      .optional()
  ),
}).strict();

export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;
