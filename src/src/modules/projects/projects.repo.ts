import { withDependencyResult } from "@/src/modules/security/dependency-errors";
import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type { CreateProjectInput, UpdateProjectInput } from "./projects.schema";

export type ProjectRole = "owner" | "editor" | "viewer";

export type ProjectMemberSummary = {
  user_id: string;
  role: ProjectRole;
  full_name: string | null;
  username: string | null;
};

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  members?: ProjectMemberSummary[];
};

type ProjectMembershipRow = {
  role: ProjectRole;
  projects: ProjectRow | null;
};

type ProjectMembershipRowRaw = {
  role: ProjectRole;
  projects: ProjectRow | ProjectRow[] | null;
};

type ProjectMemberRow = {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at: string;
};

type ProjectProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
};

function normalizeProjectRelation(
  value: ProjectRow | ProjectRow[] | null | undefined
): ProjectRow | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

export class ProjectsRepo {
  constructor(private readonly supabase: ServerSupabase) {}

  async listForUser(userId: string): Promise<ProjectMembershipRow[]> {
    const { data, error } = await withDependencyResult(() => this.supabase
      .from("project_members")
      .select(
        `
          role,
          projects:project_id (
            id,
            name,
            description,
            owner_id,
            is_active,
            created_at,
            updated_at
          )
        `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false, referencedTable: "projects" }));

    if (error) throw error;

    const rows = ((data ?? []) as unknown as ProjectMembershipRowRaw[]).map(
      (row) => ({
        role: row.role,
        projects: normalizeProjectRelation(row.projects),
      })
    );

    const projectIds = rows
      .map((row) => row.projects?.id)
      .filter((id): id is string => Boolean(id));

    if (!projectIds.length) return rows;

    const { data: memberData, error: memberError } = await withDependencyResult(() => this.supabase
      .from("project_members")
      .select("project_id, user_id, role, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: true }));

    if (memberError) throw memberError;

    const memberRows = (memberData ?? []) as ProjectMemberRow[];
    const userIds = Array.from(new Set(memberRows.map((member) => member.user_id)));
    const profilesById = new Map<string, ProjectProfileRow>();

    if (userIds.length) {
      const { data: profileData, error: profileError } = await withDependencyResult(() => this.supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", userIds));

      if (profileError) throw profileError;

      for (const profile of (profileData ?? []) as ProjectProfileRow[]) {
        profilesById.set(profile.id, profile);
      }
    }

    const membersByProject = new Map<string, ProjectMemberSummary[]>();

    for (const member of memberRows) {
      const profile = profilesById.get(member.user_id);
      const members = membersByProject.get(member.project_id) ?? [];

      members.push({
        user_id: member.user_id,
        role: member.role,
        full_name: profile?.full_name ?? null,
        username: profile?.username ?? null,
      });

      membersByProject.set(member.project_id, members);
    }

    return rows.map((row) => {
      if (!row.projects) return row;

      return {
        ...row,
        projects: {
          ...row.projects,
          members: membersByProject.get(row.projects.id) ?? [],
        },
      };
    });
  }

  async createForOwner(params: {
    ownerId: string;
    input: CreateProjectInput;
  }): Promise<ProjectRow> {
    const { ownerId, input } = params;

    const insertPayload: {
      name: string;
      description: string | null;
      owner_id: string;
      is_active?: boolean;
    } = {
      name: input.name,
      description: input.description ?? null,
      owner_id: ownerId,
    };

    if (input.is_active !== undefined) {
      insertPayload.is_active = input.is_active;
    }

    const { data, error } = await withDependencyResult(() => this.supabase
      .from("projects")
      .insert(insertPayload)
      .select("id, name, description, owner_id, is_active, created_at, updated_at")
      .single());

    if (error) throw error;

    return data as ProjectRow;
  }

  async getMembershipRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    const { data, error } = await withDependencyResult(() => this.supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle());

    if (error) throw error;

    return (data?.role as ProjectRole | undefined) ?? null;
  }

  async getById(projectId: string): Promise<ProjectRow | null> {
    const { data, error } = await withDependencyResult(() => this.supabase
      .from("projects")
      .select("id, name, description, owner_id, is_active, created_at, updated_at")
      .eq("id", projectId)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectRow | null) ?? null;
  }

  async updateById(projectId: string, input: UpdateProjectInput): Promise<ProjectRow | null> {
    const patch: Partial<Pick<ProjectRow, "name" | "description" | "is_active">> = {};

    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description ?? null;
    if (input.is_active !== undefined) patch.is_active = input.is_active;

    const { data, error } = await withDependencyResult(() => this.supabase
      .from("projects")
      .update(patch)
      .eq("id", projectId)
      .select("id, name, description, owner_id, is_active, created_at, updated_at")
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectRow | null) ?? null;
  }

  async deleteById(projectId: string): Promise<void> {
    const { error } = await withDependencyResult(() => this.supabase.from("projects").delete().eq("id", projectId));

    if (error) throw error;
  }
}
