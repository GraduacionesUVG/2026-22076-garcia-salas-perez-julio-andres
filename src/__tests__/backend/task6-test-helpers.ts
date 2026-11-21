type MemberRole = "owner" | "editor" | "viewer";
type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface TeamSnapshot {
  members: Array<{ userId: string; role: MemberRole }>;
  invitations: Array<{
    id: string;
    status: InvitationStatus;
    email: string;
  }>;
}

export interface PresenceSnapshotEntry {
  projectId: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  presenceState: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseMarkedProjectId(body: unknown, marker: string): string {
  const project = isRecord(body) ? body.project : undefined;
  if (
    !isRecord(project) ||
    typeof project.id !== "string" ||
    !UUID_PATTERN.test(project.id) ||
    typeof project.name !== "string" ||
    !project.name.includes(marker)
  ) {
    throw new Error("Invalid marked project response");
  }

  return project.id;
}

export function parsePresenceSnapshot(body: unknown): PresenceSnapshotEntry[] {
  if (!isRecord(body) || !Array.isArray(body.presence)) {
    throw new Error("Invalid presence snapshot");
  }

  return body.presence.map((value) => {
    if (
      !isRecord(value) ||
      typeof value.project_id !== "string" ||
      typeof value.user_id !== "string" ||
      typeof value.resource_type !== "string" ||
      typeof value.resource_id !== "string" ||
      typeof value.presence_state !== "string"
    ) {
      throw new Error("Invalid presence snapshot");
    }

    return {
      projectId: value.project_id,
      userId: value.user_id,
      resourceType: value.resource_type,
      resourceId: value.resource_id,
      presenceState: value.presence_state,
    };
  });
}

export function parseTeamSnapshot(body: unknown): TeamSnapshot {
  if (
    !isRecord(body) ||
    !Array.isArray(body.members) ||
    !Array.isArray(body.invitations)
  ) {
    throw new Error("Invalid team snapshot");
  }

  const members = body.members.map((value) => {
    if (
      !isRecord(value) ||
      typeof value.user_id !== "string" ||
      !["owner", "editor", "viewer"].includes(String(value.role))
    ) {
      throw new Error("Invalid team snapshot");
    }
    return { userId: value.user_id, role: value.role as MemberRole };
  });

  const invitations = body.invitations.map((value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.email !== "string" ||
      !["pending", "accepted", "revoked", "expired"].includes(
        String(value.status)
      )
    ) {
      throw new Error("Invalid team snapshot");
    }
    return {
      id: value.id,
      status: value.status as InvitationStatus,
      email: value.email,
    };
  });

  return { members, invitations };
}

export function classifyInvitationRace(state: {
  acceptStatus: number;
  revokeStatus: number;
  memberExists: boolean;
  invitationStatus: InvitationStatus;
}): "accepted" | "revoked" {
  if (
    state.acceptStatus === 200 &&
    state.revokeStatus === 404 &&
    state.memberExists &&
    state.invitationStatus === "accepted"
  ) {
    return "accepted";
  }

  if (
    state.acceptStatus === 404 &&
    state.revokeStatus === 200 &&
    !state.memberExists &&
    state.invitationStatus === "revoked"
  ) {
    return "revoked";
  }

  throw new Error(
    `Inconsistent invitation race terminal state: ${JSON.stringify(state)}`
  );
}
