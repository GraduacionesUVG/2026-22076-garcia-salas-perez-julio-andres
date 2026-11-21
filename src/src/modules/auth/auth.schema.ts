import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
}).strict();

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1).max(120).optional(),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "La contraseña actual es obligatoria."),
    newPassword: z
      .string()
      .min(6, "La nueva contraseña debe tener al menos 6 caracteres.")
      .max(128, "La nueva contraseña es demasiado larga."),
  })
  .superRefine((data, ctx) => {
    if (data.currentPassword === data.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "La nueva contraseña debe ser diferente a la contraseña actual.",
      });
    }
  });

export const ResetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(6, "La nueva contraseña debe tener al menos 6 caracteres.")
    .max(128, "La nueva contraseña es demasiado larga."),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
