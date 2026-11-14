import { supabaseServer } from "@/src/lib/supabase/server";

export type ServerSupabase = Awaited<ReturnType<typeof supabaseServer>>;

export type SessionUser = {
  id: string;
  email: string | null;
};

export type OptionalSessionContext = {
  supabase: ServerSupabase;
  user: SessionUser | null;
};

export type SessionContext = {
  supabase: ServerSupabase;
  user: SessionUser;
};

function unauthorizedError() {
  const error: any = new Error("UNAUTHORIZED");
  error.status = 401;
  return error;
}

export async function getOptionalSession(): Promise<OptionalSessionContext> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return {
      supabase,
      user: null,
    };
  }

  return {
    supabase,
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
    },
  };
}

export async function requireSession(): Promise<SessionContext> {
  const context = await getOptionalSession();

  if (!context.user) {
    throw unauthorizedError();
  }

  return {
    supabase: context.supabase,
    user: context.user,
  };
}