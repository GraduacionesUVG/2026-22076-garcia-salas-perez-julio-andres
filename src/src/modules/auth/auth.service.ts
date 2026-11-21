import { supabaseServer } from "@/src/lib/supabase/server";
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "./auth.schema";
import type {
  ServerSupabase,
  SessionUser,
} from "@/src/modules/auth/auth.guard";

function makeServiceError(message: string, status = 400) {
  const error: any = new Error(message);
  error.status = status;
  return error;
}

export async function loginWithEmailPassword(input: LoginInput) {
  const supabase = await supabaseServer();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    const e: any = new Error(
      msg.includes("invalid") ? "Invalid credentials" : error.message
    );
    e.status = msg.includes("invalid") ? 401 : 500;
    throw e;
  }

  return {
    user: { id: data.user?.id, email: data.user?.email ?? null },
  };
}

export async function registerWithEmailPassword(input: RegisterInput) {
  const supabase = await supabaseServer();

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.full_name ?? "",
      },
    },
  });

  if (error) {
    const e: any = new Error(error.message);
    e.status = 400;
    throw e;
  }

  return {
    user: { id: data.user?.id, email: data.user?.email ?? null },
    session: data.session ? { access_token: data.session.access_token } : null,
    needsEmailConfirmation: !data.session,
  };
}

export async function changePasswordWithCurrentPassword(params: {
  supabase: ServerSupabase;
  user: SessionUser;
  input: ChangePasswordInput;
}) {
  const { supabase, user, input } = params;

  if (!user.email) {
    throw makeServiceError(
      "No se pudo verificar la contraseña actual de este usuario.",
      400
    );
  }

  const { data: verifiedSession, error: verifyError } =
    await supabase.auth.signInWithPassword({
      email: user.email,
      password: input.currentPassword,
    });

  if (
    verifyError ||
    !verifiedSession?.user ||
    verifiedSession.user.id !== user.id
  ) {
    throw makeServiceError("La contraseña actual no es correcta.", 401);
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  });

  if (updateError) {
    throw makeServiceError("No se pudo actualizar la contraseña.", 400);
  }

  return {
    passwordUpdated: true,
  };
}

export async function resetPasswordWithRecoverySession(params: {
  supabase: ServerSupabase;
  input: ResetPasswordInput;
}) {
  const { supabase, input } = params;

  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  });

  if (updateError) {
    throw makeServiceError("No se pudo actualizar la contraseña.", 400);
  }

  await supabase.auth.signOut();

  return {
    passwordUpdated: true,
  };
}