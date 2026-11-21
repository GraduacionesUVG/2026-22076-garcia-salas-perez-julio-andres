jest.mock("@/src/lib/supabase/server", () => ({
  supabaseServer: jest.fn(),
}));

jest.mock("@/src/modules/auth/auth.guard", () => ({
  requireSession: jest.fn(),
}));

jest.mock("@/src/modules/auth/auth.rate-limit", () => ({
  enforceAuthRateLimit: jest.fn(() => null),
}));

jest.mock("@/src/modules/auth/auth.service", () => ({
  changePasswordWithCurrentPassword: jest.fn(),
  registerWithEmailPassword: jest.fn(),
  resetPasswordWithRecoverySession: jest.fn(),
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

import { cookies } from "next/headers";
import { GET as callback } from "@/app/api/auth/callback/route";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import { supabaseServer } from "@/src/lib/supabase/server";
import { requireSession } from "@/src/modules/auth/auth.guard";
import {
  changePasswordWithCurrentPassword,
  registerWithEmailPassword,
  resetPasswordWithRecoverySession,
} from "@/src/modules/auth/auth.service";

const user = { id: "qa-owner", email: "qa_backend_owner@example.test" };

describe("side-effect-free auth route success contracts", () => {
  it("register rejects malformed JSON before creating an account", async () => {
    jest.mocked(registerWithEmailPassword).mockClear();
    const response = await register(new Request("https://app.example.test/api/auth/register", {
      method: "POST", body: "{",
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Invalid JSON body" });
    expect(registerWithEmailPassword).not.toHaveBeenCalled();
  });

  it("change-password denies absent session without changing a password", async () => {
    jest.mocked(changePasswordWithCurrentPassword).mockClear();
    jest.mocked(requireSession).mockRejectedValueOnce(Object.assign(new Error("UNAUTHORIZED"), { status: 401 }));
    const response = await changePassword(new Request("https://app.example.test/api/auth/change-password", {
      method: "POST", body: JSON.stringify({ currentPassword: "current-password", newPassword: "different-password" }),
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(changePasswordWithCurrentPassword).not.toHaveBeenCalled();
  });

  it("callback rejects missing code without consulting the provider or marking recovery verified", async () => {
    jest.mocked(supabaseServer).mockClear();
    const response = await callback(new Request("https://app.example.test/api/auth/callback?next=%2Fauth%2Freset"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.test/login?e=missing_code");
    expect(await response.text()).toBe("");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(supabaseServer).not.toHaveBeenCalled();
  });

  it("callback redirects exchange rejection without marking recovery verified", async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValue({ error: { message: "invalid code" } });
    jest.mocked(supabaseServer).mockResolvedValueOnce({ auth: { exchangeCodeForSession } } as never);
    const response = await callback(new Request("https://app.example.test/api/auth/callback?code=rejected-fixture&next=%2Fauth%2Freset"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.test/login?e=invalid%20code");
    expect(await response.text()).toBe("");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("rejected-fixture");
  });

  it(actionEvidenceTitle(
    "auth.forgot-password.submit",
    ["success", "persistence", "permissions"],
    "mocked provider accepts the exact same-origin recovery request"
  ), async () => {
    const resetPasswordForEmail = jest.fn().mockResolvedValue({ error: null });
    (supabaseServer as jest.Mock).mockResolvedValue({
      auth: { resetPasswordForEmail },
    });

    const response = await forgotPassword(
      new Request("https://app.example.test/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: user.email }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith(user.email, {
      redirectTo:
        "https://app.example.test/auth/callback?next=%2Fauth%2Freset",
    });
  });

  it("keeps mocked-provider recovery errors private", async () => {
    const resetPasswordForEmail = jest.fn().mockResolvedValue({
      error: new Error("provider detail must remain private"),
    });
    (supabaseServer as jest.Mock).mockResolvedValue({
      auth: { resetPasswordForEmail },
    });

    const response = await forgotPassword(
      new Request("https://app.example.test/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: user.email }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith(user.email, {
      redirectTo:
        "https://app.example.test/auth/callback?next=%2Fauth%2Freset",
    });
  });

  it(actionEvidenceTitle(
    "auth.register.submit",
    ["success", "permissions"],
    "returns stable creation HTTP from the mocked registration boundary"
  ), async () => {
    const input = {
      email: "qa_backend_fixture@example.test",
      password: "fixture-password",
      full_name: "Provider fixture",
    };
    (registerWithEmailPassword as jest.Mock).mockResolvedValue({
      user: { id: "provider-user", email: input.email },
      session: null,
      needsEmailConfirmation: true,
    });

    const response = await register(
      new Request("https://app.example.test/api/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      ok: true,
      user: { id: "provider-user", email: input.email },
      session: null,
      needsEmailConfirmation: true,
    });
    expect(registerWithEmailPassword).toHaveBeenCalledWith(input);
  });

  it("accepts a valid change-password payload through the mocked service boundary", async () => {
    const supabase = { auth: {} };
    (requireSession as jest.Mock).mockResolvedValue({ supabase, user });
    (changePasswordWithCurrentPassword as jest.Mock).mockResolvedValue({
      passwordUpdated: true,
    });

    const input = {
      currentPassword: "current-password",
      newPassword: "different-password",
    };
    const response = await changePassword(
      new Request("https://app.example.test/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(input),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(changePasswordWithCurrentPassword).toHaveBeenCalledWith({
      supabase,
      user,
      input,
    });
  });

  it(actionEvidenceTitle(
    "auth.reset-password.submit",
    ["success", "permissions"],
    "returns stable recovery success through the mocked authenticated boundary"
  ), async () => {
    const supabase = { auth: {} };
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue({ value: "true" }),
    });
    (requireSession as jest.Mock).mockResolvedValue({ supabase, user });
    (resetPasswordWithRecoverySession as jest.Mock).mockResolvedValue({
      passwordUpdated: true,
    });

    const input = { newPassword: "replacement-password" };
    const response = await resetPassword(
      new Request("https://app.example.test/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(input),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(resetPasswordWithRecoverySession).toHaveBeenCalledWith({
      supabase,
      input,
    });
    expect(response.headers.get("set-cookie")).toContain(
      "password-recovery-verified="
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it(actionEvidenceTitle(
    "profile.session.logout",
    ["permissions", "validation"],
    "uses the mocked server-scoped provider without caller-controlled input"
  ), async () => {
    const signOut = jest.fn().mockResolvedValue({ error: null });
    (supabaseServer as jest.Mock).mockResolvedValue({ auth: { signOut } });

    const response = await logout();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(signOut).toHaveBeenCalledWith();
  });

  it("rejects an invalid reset payload before calling the password service", async () => {
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue({ value: "true" }),
    });
    (requireSession as jest.Mock).mockResolvedValue({
      supabase: { auth: {} },
      user,
    });

    const response = await resetPassword(
      new Request("https://app.example.test/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ newPassword: 42 }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "Validation error",
    });
    expect(resetPasswordWithRecoverySession).not.toHaveBeenCalled();
  });

  it("forces callback open-redirect attempts onto the recovery path", async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValue({ error: null });
    (supabaseServer as jest.Mock).mockResolvedValue({
      auth: { exchangeCodeForSession },
    });

    const response = await callback(
      new Request(
        "https://app.example.test/api/auth/callback?code=safe-fixture&next=https%3A%2F%2Fevil.example%2Fsteal"
      )
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/auth/reset"
    );
    expect(response.headers.get("set-cookie")).toMatch(
      /password-recovery-verified=true.*HttpOnly.*SameSite=lax/i
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith("safe-fixture");
  });
});
