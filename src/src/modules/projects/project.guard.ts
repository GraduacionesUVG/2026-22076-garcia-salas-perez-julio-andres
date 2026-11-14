import { requireSession } from "@/src/modules/auth/auth.guard";
import { normalizeDependencyError, withDependencyResult } from "@/src/modules/security/dependency-errors";

export type ProjectRole = "owner" | "editor" | "viewer";

type ProjectMemberRow = {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at?: string;
};

function forbiddenError() {
  const error: any = new Error("FORBIDDEN");
  error.status = 403;
  return error;
}

export async function requireProjectMember(projectId: string) {
  const { supabase, user } = await requireSession();

  try {
    const { data: member, error } = await withDependencyResult(() => supabase
      .from("project_members")
      .select("project_id, user_id, role, created_at")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle());

    if (error) throw error;
    if (!member) throw forbiddenError();

    return { supabase, user, member: member as ProjectMemberRow };
  } catch (error: unknown) {
    const normalized = normalizeDependencyError(error);
    if (normalized !== error) throw normalized;
    // Only recognized dependency failures may escape the safe membership denial.
    throw forbiddenError();
  }
}

export async function requireProjectRole(
  projectId: string,
  allowed: ProjectRole[]
) {
  const context = await requireProjectMember(projectId);

  if (!allowed.includes(context.member.role)) {
    throw forbiddenError();
  }

  return context;
}
