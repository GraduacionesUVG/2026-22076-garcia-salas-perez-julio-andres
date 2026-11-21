import {
  changePasswordWithCurrentPassword,
  registerWithEmailPassword,
  resetPasswordWithRecoverySession,
} from "@/src/modules/auth/auth.service";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import { supabaseServer } from "@/src/lib/supabase/server";

jest.mock("@/src/lib/supabase/server", () => ({
  supabaseServer: jest.fn(),
}));

describe("password service success branches", () => {
  it(actionEvidenceTitle(
    "profile.password.change",
    ["success", "persistence"],
    "mocked provider verifies the current identity before changing its password"
  ), async () => {
    const signInWithPassword = jest.fn().mockResolvedValue({
      data: { user: { id: "qa-owner" } },
      error: null,
    });
    const updateUser = jest.fn().mockResolvedValue({ error: null });
    const supabase = {
      auth: { signInWithPassword, updateUser },
    } as never;

    await expect(
      changePasswordWithCurrentPassword({
        supabase,
        user: { id: "qa-owner", email: "qa_backend_owner@example.test" },
        input: {
          currentPassword: "current-password",
          newPassword: "different-password",
        },
      })
    ).resolves.toEqual({ passwordUpdated: true });

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "qa_backend_owner@example.test",
      password: "current-password",
    });
    expect(updateUser).toHaveBeenCalledWith({ password: "different-password" });
  });

  it(actionEvidenceTitle(
    "auth.reset-password.submit",
    ["persistence"],
    "mocked provider updates and signs out the recovery session"
  ), async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: null });
    const signOut = jest.fn().mockResolvedValue({ error: null });
    const supabase = { auth: { updateUser, signOut } } as never;

    await expect(
      resetPasswordWithRecoverySession({
        supabase,
        input: { newPassword: "replacement-password" },
      })
    ).resolves.toEqual({ passwordUpdated: true });

    expect(updateUser).toHaveBeenCalledWith({
      password: "replacement-password",
    });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it(actionEvidenceTitle(
    "auth.register.submit",
    ["persistence"],
    "mocked provider persists registration with the requested profile metadata"
  ), async () => {
    const signUp = jest.fn().mockResolvedValue({
      data: {
        user: { id: "provider-user", email: "qa_backend_fixture@example.test" },
        session: null,
      },
      error: null,
    });
    (supabaseServer as jest.Mock).mockResolvedValue({ auth: { signUp } });

    await expect(
      registerWithEmailPassword({
        email: "qa_backend_fixture@example.test",
        password: "fixture-password",
        full_name: "Provider fixture",
      })
    ).resolves.toEqual({
      user: { id: "provider-user", email: "qa_backend_fixture@example.test" },
      session: null,
      needsEmailConfirmation: true,
    });

    expect(signUp).toHaveBeenCalledWith({
      email: "qa_backend_fixture@example.test",
      password: "fixture-password",
      options: { data: { full_name: "Provider fixture" } },
    });
  });
});
