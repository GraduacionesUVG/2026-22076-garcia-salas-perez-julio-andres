import { withDependencyResult } from "@/src/modules/security/dependency-errors";
import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type {
  CollaborationInvitationRole,
  CollaborationMemberRole,
  CollaborationPresenceResourceType,
  CollaborationPresenceState,
} from "./collaboration.schema";

export type ProjectMemberWithProfileRow = {
  project_id: string;
  user_id: string;
  role: CollaborationMemberRole;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string | null;
    email: string | null;
    username: string | null;
  } | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
};

export type ProjectInvitationRow = {
  id: string;
  project_id: string;
  email: string;
  role: CollaborationInvitationRole;
  token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by: string | null;
};

export type ProjectPresenceRow = {
  id: string;
  project_id: string;
  user_id: string;
  resource_type: CollaborationPresenceResourceType;
  resource_id: string | null;
  presence_state: CollaborationPresenceState;
  metadata: Record<string, unknown>;
  last_seen_at: string;
  profiles?: {
    id: string;
    full_name: string | null;
    email: string | null;
    username: string | null;
  } | null;
};

export type ProjectActivityRow = {
  id: string;
  project_id: string;
  event_type: string;
  event_payload: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
  profiles?: {
    id: string;
    full_name: string | null;
    email: string | null;
    username: string | null;
  } | null;
};

export type AtomicInvitationAcceptance = {
  invitation: ProjectInvitationRow;
  member: ProjectMemberWithProfileRow;
};

const MEMBER_SELECT = `
  project_id,
  user_id,
  role,
  created_at
`;

const INVITATION_SELECT = `
  id,
  project_id,
  email,
  role,
  token,
  status,
  expires_at,
  accepted_at,
  accepted_by,
  revoked_at,
  created_at,
  created_by
`;

const PRESENCE_SELECT = `
  id,
  project_id,
  user_id,
  resource_type,
  resource_id,
  presence_state,
  metadata,
  last_seen_at
`;

const ACTIVITY_SELECT = `
  id,
  project_id,
  event_type,
  event_payload,
  created_at,
  created_by
`;

export class CollaborationRepo {
  constructor(private readonly db: ServerSupabase) {}

  async hasMemberEmail(params: {
    projectId: string;
    email: string;
  }): Promise<boolean> {
    const { data, error } = await withDependencyResult(() => this.db.rpc("project_has_member_email_safe", {
      p_project_id: params.projectId,
      p_email_b64: Buffer.from(params.email, "utf8").toString("base64"),
    }));

    if (error) throw error;
    return data === true;
  }

  private async listProfilesByIds(projectId: string, userIds: string[]): Promise<Map<string, ProfileRow>> {
    const ids = Array.from(new Set(userIds.filter(Boolean)));

    if (!ids.length) {
      return new Map();
    }

    const { data, error } = await withDependencyResult(() => this.db.rpc(
      "project_member_profiles_safe", { p_project_id: projectId, p_user_ids: ids }
    ));

    if (error) throw error;

    return new Map(
      (((data ?? []) as unknown) as ProfileRow[]).map((profile) => [
        profile.id,
        profile,
      ])
    );
  }

  private async attachMemberProfiles(
    projectId: string,
    rows: ProjectMemberWithProfileRow[]
  ): Promise<ProjectMemberWithProfileRow[]> {
    const profiles = await this.listProfilesByIds(projectId, rows.map((row) => row.user_id));
    return rows.map((row) => ({
      ...row,
      profiles: profiles.get(row.user_id) ?? null,
    }));
  }

  private async attachPresenceProfiles(
    projectId: string,
    rows: ProjectPresenceRow[]
  ): Promise<ProjectPresenceRow[]> {
    const profiles = await this.listProfilesByIds(projectId, rows.map((row) => row.user_id));
    return rows.map((row) => ({
      ...row,
      profiles: profiles.get(row.user_id) ?? null,
    }));
  }

  private async attachActivityProfiles(
    projectId: string,
    rows: ProjectActivityRow[]
  ): Promise<ProjectActivityRow[]> {
    const profiles = await this.listProfilesByIds(
      projectId,
      rows.map((row) => row.created_by).filter((id): id is string => Boolean(id))
    );
    return rows.map((row) => ({
      ...row,
      profiles: row.created_by ? profiles.get(row.created_by) ?? null : null,
    }));
  }

  async listMembers(projectId: string): Promise<ProjectMemberWithProfileRow[]> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_members")
      .select(MEMBER_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }));

    if (error) throw error;

    return this.attachMemberProfiles(
      projectId,
      ((data ?? []) as unknown) as ProjectMemberWithProfileRow[]
    );
  }

  async findMemberByUserId(params: {
    projectId: string;
    userId: string;
  }): Promise<ProjectMemberWithProfileRow | null> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_members")
      .select(MEMBER_SELECT)
      .eq("project_id", params.projectId)
      .eq("user_id", params.userId)
      .maybeSingle());

    if (error) throw error;

    const row = (data as unknown as ProjectMemberWithProfileRow | null) ?? null;
    if (!row) return null;

    const [member] = await this.attachMemberProfiles(params.projectId, [row]);
    return member;
  }

  async findMemberByEmail(params: {
    projectId: string;
    email: string;
  }): Promise<ProjectMemberWithProfileRow | null> {
    const members = await this.listMembers(params.projectId);
    return (
      members.find(
        (member) =>
          member.profiles?.email?.toLowerCase() === params.email.toLowerCase()
      ) ?? null
    );
  }

  async documentExistsInProject(params: {
    projectId: string;
    documentId: string;
  }): Promise<boolean> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_documents")
      .select("id")
      .eq("project_id", params.projectId)
      .eq("id", params.documentId)
      .is("deleted_at", null)
      .maybeSingle());

    if (error) throw error;
    return Boolean(data);
  }

  async updateMemberRole(params: {
    projectId: string;
    userId: string;
    role: "editor" | "viewer";
  }): Promise<ProjectMemberWithProfileRow | null> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_members")
      .update({ role: params.role })
      .eq("project_id", params.projectId)
      .eq("user_id", params.userId)
      .neq("role", "owner")
      .select(MEMBER_SELECT)
      .maybeSingle());

    if (error) throw error;

    const row = (data as unknown as ProjectMemberWithProfileRow | null) ?? null;
    if (!row) return null;

    const [member] = await this.attachMemberProfiles(params.projectId, [row]);
    return member;
  }

  async removeMember(params: {
    projectId: string;
    userId: string;
    actorUserId: string;
  }): Promise<void> {
    const { error } = await withDependencyResult(() => this.db.rpc(
      "remove_project_member_atomic",
      {
        p_project_id: params.projectId,
        p_user_id: params.userId,
        p_actor_user_id: params.actorUserId,
      }
    ));

    if (error) throw error;
  }

  async listInvitations(projectId: string): Promise<ProjectInvitationRow[]> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_invitations")
      .select(INVITATION_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }));

    if (error) throw error;

    return (data as ProjectInvitationRow[] | null) ?? [];
  }

  async findPendingInvitationByEmail(params: {
    projectId: string;
    email: string;
  }): Promise<ProjectInvitationRow | null> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_invitations")
      .select(INVITATION_SELECT)
      .eq("project_id", params.projectId)
      .eq("email", params.email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectInvitationRow | null) ?? null;
  }

  async findInvitationByToken(token: string): Promise<ProjectInvitationRow | null> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_invitations")
      .select(INVITATION_SELECT)
      .eq("token", token)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectInvitationRow | null) ?? null;
  }

  async createInvitation(params: {
    projectId: string;
    email: string;
    role: CollaborationInvitationRole;
    token: string;
    expiresAt: string;
    actorUserId: string;
  }): Promise<ProjectInvitationRow> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_invitations")
      .insert({
        project_id: params.projectId,
        email: params.email,
        role: params.role,
        token: params.token,
        expires_at: params.expiresAt,
        created_by: params.actorUserId,
      })
      .select(INVITATION_SELECT)
      .single());

    if (error) throw error;

    return data as ProjectInvitationRow;
  }

  async revokeInvitation(params: {
    projectId: string;
    invitationId: string;
  }): Promise<ProjectInvitationRow | null> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_invitations")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      })
      .eq("project_id", params.projectId)
      .eq("id", params.invitationId)
      .eq("status", "pending")
      .select(INVITATION_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectInvitationRow | null) ?? null;
  }

  async createMember(params: {
    projectId: string;
    userId: string;
    role: CollaborationInvitationRole;
  }): Promise<ProjectMemberWithProfileRow> {
    const { error } = await withDependencyResult(() => this.db
      .from("project_members")
      .insert({
        project_id: params.projectId,
        user_id: params.userId,
        role: params.role,
      }));

    if (error) throw error;

    const member = await this.findMemberByUserId({
      projectId: params.projectId,
      userId: params.userId,
    });
    if (!member) {
      throw new Error("Created project member could not be loaded");
    }

    return member;
  }

  async markInvitationAccepted(params: {
    invitationId: string;
    userId: string;
  }): Promise<void> {
    const { error } = await withDependencyResult(() => this.db
      .from("project_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: params.userId,
      })
      .eq("id", params.invitationId));

    if (error) throw error;
  }

  async acceptInvitationAtomically(token: string): Promise<AtomicInvitationAcceptance> {
    const { data, error } = await withDependencyResult(() => this.db.rpc(
      "accept_project_invitation_atomic",
      { p_token: token }
    ));

    if (error) throw error;

    const result = data as unknown as AtomicInvitationAcceptance;
    const [member] = await this.attachMemberProfiles(result.member.project_id, [result.member]);
    return { invitation: result.invitation, member };
  }

  async listPresence(params: {
    projectId: string;
    resourceType?: CollaborationPresenceResourceType;
    resourceId?: string;
  }): Promise<ProjectPresenceRow[]> {
    let query = this.db
      .from("project_presence")
      .select(PRESENCE_SELECT)
      .eq("project_id", params.projectId)
      .gte("last_seen_at", new Date(Date.now() - 90_000).toISOString())
      .order("last_seen_at", { ascending: false });

    if (params.resourceType) {
      query = query.eq("resource_type", params.resourceType);
    }

    if (params.resourceId !== undefined) {
      query = query.eq("resource_id", params.resourceId);
    }

    const { data, error } = await withDependencyResult(() => query);

    if (error) throw error;

    return this.attachPresenceProfiles(
      params.projectId,
      ((data ?? []) as unknown) as ProjectPresenceRow[]
    );
  }

  async upsertPresence(params: {
    projectId: string;
    userId: string;
    resourceType: CollaborationPresenceResourceType;
    resourceId: string;
    presenceState: CollaborationPresenceState;
    metadata: Record<string, unknown>;
  }): Promise<ProjectPresenceRow> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_presence")
      .upsert(
        {
          project_id: params.projectId,
          user_id: params.userId,
          resource_type: params.resourceType,
          resource_id: params.resourceId,
          presence_state: params.presenceState,
          metadata: params.metadata,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "project_id,user_id,resource_type,resource_id" }
      )
      .select(PRESENCE_SELECT)
      .single());

    if (error) throw error;

    const [presence] = await this.attachPresenceProfiles(params.projectId, [
      data as unknown as ProjectPresenceRow,
    ]);
    return presence;
  }

  async listActivity(projectId: string): Promise<ProjectActivityRow[]> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_activity_events")
      .select(ACTIVITY_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .range(0, 19));

    if (error) throw error;

    return this.attachActivityProfiles(
      projectId,
      ((data ?? []) as unknown) as ProjectActivityRow[]
    );
  }

  async createActivity(params: {
    projectId: string;
    eventType: string;
    actorUserId: string | null;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await withDependencyResult(() => this.db.from("project_activity_events").insert({
      project_id: params.projectId,
      event_type: params.eventType,
      event_payload: params.payload ?? {},
      created_by: params.actorUserId,
    }));

    if (error) throw error;
  }
}
