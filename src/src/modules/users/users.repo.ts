import { withDependencyResult } from "@/src/modules/security/dependency-errors";
import type { ServerSupabase } from "@/src/modules/auth/auth.guard";

export type ProfileRole = "user" | "admin";

export type ProfileRow = {
  id: string;
  full_name: string | null;
  role: ProfileRole;
  created_at: string;
};

export class UsersRepo {
  constructor(private readonly supabase: ServerSupabase) {}

  async getProfileById(userId: string): Promise<ProfileRow | null> {
    const { data, error } = await withDependencyResult(() => this.supabase
      .from("profiles")
      .select("id, full_name, role, created_at")
      .eq("id", userId)
      .maybeSingle());

    if (error) throw error;
    return (data as ProfileRow | null) ?? null;
  }

  async saveOwnProfile(params: {
    userId: string;
    full_name: string | null;
  }): Promise<ProfileRow> {
    const { userId, full_name } = params;

    const existing = await this.getProfileById(userId);

    if (existing) {
      const { data, error } = await withDependencyResult(() => this.supabase
        .from("profiles")
        .update({
          full_name: full_name ?? null,
        })
        .eq("id", userId)
        .select("id, full_name, role, created_at")
        .single());

      if (error) throw error;
      return data as ProfileRow;
    }

    const { data, error } = await withDependencyResult(() => this.supabase
      .from("profiles")
      .insert({
        id: userId,
        full_name: full_name ?? null,
        role: "user",
      })
      .select("id, full_name, role, created_at")
      .single());

    if (error) throw error;
    return data as ProfileRow;
  }
}
