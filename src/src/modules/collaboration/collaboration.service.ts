import { withDependencyErrors } from "@/src/modules/security/dependency-errors";
import { randomBytes } from "node:crypto";
import type {
  CollaborationInvitationCreateInput,
  CollaborationInvitationRole,
  CollaborationMemberUpdateInput,
  CollaborationPresenceTouchInput,
} from "./collaboration.schema";
import type {
  CollaborationRepo,
  ProjectActivityRow,
  ProjectInvitationRow,
  ProjectMemberWithProfileRow,
  ProjectPresenceRow,
} from "./collaboration.repo";

function appError(message: string, status = 400) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function publicMember(row: ProjectMemberWithProfileRow) {
  return {
    project_id: row.project_id,
    user_id: row.user_id,
    role: row.role,
    created_at: row.created_at,
    full_name: row.profiles?.full_name ?? null,
    username: row.profiles?.username ?? null,
    email: row.profiles?.email ?? null,
  };
}

function publicPresence(row: ProjectPresenceRow) {
  return {
    id: row.id,
    project_id: row.project_id,
    user_id: row.user_id,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    presence_state: row.presence_state,
    metadata: row.metadata ?? {},
    last_seen_at: row.last_seen_at,
    display_name:
      row.profiles?.full_name || row.profiles?.username || row.profiles?.email,
    email: row.profiles?.email ?? null,
  };
}

function publicActivity(row: ProjectActivityRow) {
  return {
    id: row.id,
    project_id: row.project_id,
    event_type: row.event_type,
    event_payload: row.event_payload ?? {},
    created_at: row.created_at,
    created_by: row.created_by,
    actor_name:
      row.profiles?.full_name || row.profiles?.username || row.profiles?.email,
  };
}

function invitationIsExpired(invitation: ProjectInvitationRow) {
  return new Date(invitation.expires_at).getTime() <= Date.now();
}

export class CollaborationService {
  constructor(private readonly repo: CollaborationRepo) {}

  async getWorkspace(
    projectId: string,
    options: { includeInvitations?: boolean } = {}
  ) {
    const [members, invitations, presence, activity] = await Promise.all([
      withDependencyErrors(() => this.repo.listMembers(projectId)),
      options.includeInvitations === false
        ? Promise.resolve([])
        : withDependencyErrors(() => this.repo.listInvitations(projectId)),
      withDependencyErrors(() => this.repo.listPresence({ projectId })),
      withDependencyErrors(() => this.repo.listActivity(projectId)),
    ]);

    return {
      members: members.map(publicMember),
      invitations,
      presence: presence.map(publicPresence),
      activity: activity.map(publicActivity),
    };
  }

  async inviteMember(params: {
    projectId: string;
    actorUserId: string;
    actorEmail?: string | null;
    input: CollaborationInvitationCreateInput;
  }) {
    const email = normalizeEmail(params.input.email);
    const role = params.input.role as string;

    if (role === "owner") {
      throw appError("INVALID_INVITATION_ROLE", 400);
    }

    if (params.actorEmail && email === normalizeEmail(params.actorEmail)) {
      throw appError("CANNOT_INVITE_SELF", 409);
    }

    const [existingMember, pendingInvitation] = await Promise.all([
      withDependencyErrors(() => this.repo.hasMemberEmail({ projectId: params.projectId, email })),
      withDependencyErrors(() => this.repo.findPendingInvitationByEmail({
        projectId: params.projectId,
        email,
      })),
    ]);

    if (existingMember) {
      throw appError("PROJECT_MEMBER_ALREADY_EXISTS", 409);
    }

    if (pendingInvitation) {
      throw appError("PROJECT_INVITATION_ALREADY_PENDING", 409);
    }

    const invitation = await withDependencyErrors(() => this.repo.createInvitation({
      projectId: params.projectId,
      email,
      role: role as CollaborationInvitationRole,
      token: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      actorUserId: params.actorUserId,
    }));

    await withDependencyErrors(() => this.repo.createActivity({
      projectId: params.projectId,
      actorUserId: params.actorUserId,
      eventType: "invitation_created",
      payload: { email, role },
    }));

    return invitation;
  }

  async updateMemberRole(params: {
    projectId: string;
    targetUserId: string;
    actorUserId: string;
    input: CollaborationMemberUpdateInput;
  }) {
    if (params.targetUserId === params.actorUserId) {
      throw appError("CANNOT_CHANGE_OWN_ROLE", 400);
    }

    const member = await withDependencyErrors(() => this.repo.updateMemberRole({
      projectId: params.projectId,
      userId: params.targetUserId,
      role: params.input.role,
    }));

    if (!member) {
      throw appError("PROJECT_MEMBER_NOT_FOUND", 404);
    }

    await withDependencyErrors(() => this.repo.createActivity({
      projectId: params.projectId,
      actorUserId: params.actorUserId,
      eventType: "member_role_updated",
      payload: { user_id: params.targetUserId, role: params.input.role },
    }));

    return publicMember(member);
  }

  async removeMember(params: {
    projectId: string;
    targetUserId: string;
    actorUserId: string;
  }) {
    try {
      await withDependencyErrors(() => this.repo.removeMember({
        projectId: params.projectId,
        userId: params.targetUserId,
        actorUserId: params.actorUserId,
      }));
    } catch (error: unknown) {
      const message = typeof error === "object" && error !== null && "message" in error
        ? String(error.message) : "";
      const statuses: Record<string, number> = {
        CANNOT_REMOVE_SELF: 400,
        PROJECT_MEMBER_OWNER_PROTECTED: 400,
        PROJECT_MEMBER_NOT_FOUND: 404,
        FORBIDDEN: 403,
        UNAUTHORIZED: 401,
      };
      if (Object.hasOwn(statuses, message)) throw appError(message, statuses[message]);
      throw error;
    }
  }

  async revokeInvitation(params: {
    projectId: string;
    invitationId: string;
    actorUserId: string;
  }) {
    const invitation = await withDependencyErrors(() => this.repo.revokeInvitation({
      projectId: params.projectId,
      invitationId: params.invitationId,
    }));

    if (!invitation) {
      throw appError("PROJECT_INVITATION_NOT_FOUND", 404);
    }

    await withDependencyErrors(() => this.repo.createActivity({
      projectId: params.projectId,
      actorUserId: params.actorUserId,
      eventType: "invitation_revoked",
      payload: { invitation_id: params.invitationId },
    }));

    return invitation;
  }

  async acceptInvitation(params: {
    token: string;
    userId: string;
    userEmail: string | null;
  }) {
    const invitation = await withDependencyErrors(() => this.repo.findInvitationByToken(params.token));

    if (!invitation || invitation.status !== "pending") {
      throw appError("PROJECT_INVITATION_NOT_FOUND", 404);
    }

    if (invitationIsExpired(invitation)) {
      throw appError("PROJECT_INVITATION_EXPIRED", 410);
    }

    if (
      params.userEmail &&
      normalizeEmail(params.userEmail) !== normalizeEmail(invitation.email)
    ) {
      throw appError("PROJECT_INVITATION_EMAIL_MISMATCH", 403);
    }

    let accepted;
    try {
      accepted = await withDependencyErrors(() => this.repo.acceptInvitationAtomically(params.token));
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message?: unknown }).message ?? "")
            : "";
      if (message.includes("PROJECT_INVITATION_EXPIRED")) {
        throw appError("PROJECT_INVITATION_EXPIRED", 410);
      }
      if (message.includes("PROJECT_INVITATION_EMAIL_MISMATCH")) {
        throw appError("PROJECT_INVITATION_EMAIL_MISMATCH", 403);
      }
      if (message.includes("PROJECT_INVITATION_NOT_FOUND")) {
        throw appError("PROJECT_INVITATION_NOT_FOUND", 404);
      }
      if (
        message.includes("PROJECT_INVITATION_ALREADY_ACCEPTED") ||
        message.includes("PROJECT_INVITATION_NOT_PENDING") ||
        message.includes("PROJECT_MEMBER_ALREADY_EXISTS")
      ) {
        throw appError("PROJECT_INVITATION_CONFLICT", 409);
      }
      throw error;
    }

    await withDependencyErrors(() => this.repo.createActivity({
      projectId: accepted.invitation.project_id,
      actorUserId: params.userId,
      eventType: "invitation_accepted",
      payload: {
        invitation_id: accepted.invitation.id,
        role: accepted.invitation.role,
      },
    }));

    return {
      project_id: accepted.invitation.project_id,
      invitation: accepted.invitation,
      member: accepted.member,
    };
  }

  async touchPresence(params: {
    projectId: string;
    userId: string;
    input: CollaborationPresenceTouchInput;
  }) {
    const resourceId = params.input.resource_id ?? params.projectId;

    if (
      params.input.resource_type === "document" &&
      !(await withDependencyErrors(() => this.repo.documentExistsInProject({
        projectId: params.projectId,
        documentId: resourceId,
      })))
    ) {
      throw appError("DOCUMENT_NOT_FOUND", 404);
    }

    const presence = await withDependencyErrors(() => this.repo.upsertPresence({
      projectId: params.projectId,
      userId: params.userId,
      resourceType: params.input.resource_type,
      resourceId,
      presenceState: params.input.presence_state,
      metadata: params.input.metadata ?? {},
    }));
    const active = await withDependencyErrors(() => this.repo.listPresence({
      projectId: params.projectId,
      resourceType: params.input.resource_type,
      resourceId,
    }));

    return {
      presence: publicPresence(presence),
      active: active
        .filter((item) => item.user_id !== params.userId)
        .map(publicPresence),
    };
  }
}
