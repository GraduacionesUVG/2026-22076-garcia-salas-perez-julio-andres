import { withDependencyErrors } from "@/src/modules/security/dependency-errors";
import type {
  ServerSupabase,
  SessionUser,
} from "@/src/modules/auth/auth.guard";
import { UsersRepo, type ProfileRow } from "./users.repo";
import type { UpdateMeInput } from "./users.schema";

export type MePayload = {
  user: SessionUser;
  profile: ProfileRow | null;
};

type MeContext = {
  supabase: ServerSupabase;
  user: SessionUser;
};

export async function getMe(params: MeContext): Promise<MePayload> {
  const repo = new UsersRepo(params.supabase);
  const profile = await withDependencyErrors(() => repo.getProfileById(params.user.id));

  return {
    user: params.user,
    profile,
  };
}

export async function updateMe(params: MeContext & { input: UpdateMeInput }): Promise<MePayload> {
  const repo = new UsersRepo(params.supabase);

  const profile = await withDependencyErrors(() => repo.saveOwnProfile({
    userId: params.user.id,
    full_name: params.input.full_name ?? null,
  }));

  return {
    user: params.user,
    profile,
  };
}

export async function getMyProfile(params: MeContext): Promise<ProfileRow | null> {
  const payload = await getMe(params);
  return payload.profile;
}

export async function updateMyProfile(
  params: MeContext & { input: UpdateMeInput }
): Promise<ProfileRow> {
  const payload = await updateMe(params);

  if (!payload.profile) {
    throw new Error("PROFILE_NOT_AVAILABLE");
  }

  return payload.profile;
}
