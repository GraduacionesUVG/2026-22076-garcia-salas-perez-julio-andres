import { z } from "zod";

const invitationRoleSchema = z.enum(["editor", "viewer"]);
const presenceResourceTypeSchema = z.enum(["project", "document"]);
const presenceStateSchema = z.enum(["viewing", "editing", "idle"]);

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return value;
  return value.trim().toLowerCase();
}

export const CollaborationInvitationCreateSchema = z
  .object({
    email: z.preprocess(
      normalizeEmail,
      z.string().email("Email invalido").max(320)
    ),
    role: invitationRoleSchema,
  })
  .strict();

export const CollaborationMemberUpdateSchema = z
  .object({
    role: z.enum(["editor", "viewer"]),
  })
  .strict();

export const CollaborationPresenceTouchSchema = z
  .object({
    resource_type: presenceResourceTypeSchema,
    resource_id: z.string().uuid().nullable().optional(),
    presence_state: presenceStateSchema.default("viewing"),
    metadata: z
      .record(z.string(), z.unknown())
      .refine(
        (value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= 8_192,
        "Presence metadata is too large"
      )
      .default({}),
  })
  .strict();

export const CollaborationInvitationAcceptSchema = z
  .object({
    token: z.string().min(24).max(256),
  })
  .strict();

export type CollaborationInvitationCreateInput = z.infer<
  typeof CollaborationInvitationCreateSchema
>;
export type CollaborationMemberUpdateInput = z.infer<
  typeof CollaborationMemberUpdateSchema
>;
export type CollaborationPresenceTouchInput = z.infer<
  typeof CollaborationPresenceTouchSchema
>;
export type CollaborationInvitationAcceptInput = z.infer<
  typeof CollaborationInvitationAcceptSchema
>;
export type CollaborationInvitationRole = z.infer<typeof invitationRoleSchema>;
export type CollaborationMemberRole = "owner" | "editor" | "viewer";
export type CollaborationPresenceResourceType = z.infer<
  typeof presenceResourceTypeSchema
>;
export type CollaborationPresenceState = z.infer<typeof presenceStateSchema>;
