import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import {
  assertNoBackendLeak,
  loginQaSessionWithOneTransientRetry,
  runWithCleanupAggregation,
} from "@/__tests__/backend/auth-test-helpers";
import {
  closeQaSession,
  loadLocalBackendTestConfig,
  type QaIdentity,
  type QaSession,
} from "@/__tests__/backend/sessions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/admin/users"],
  ["POST", "/api/auth/change-password"],
  ["POST", "/api/auth/forgot-password"],
  ["POST", "/api/auth/login"],
  ["POST", "/api/auth/logout"],
  ["GET", "/api/auth/me"],
  ["POST", "/api/auth/refresh"],
  ["POST", "/api/auth/register"],
  ["POST", "/api/auth/reset-password"],
] as const;

const config = loadLocalBackendTestConfig();
const baseURL = process.env.BACKEND_TEST_BASE_URL ?? "http://localhost:3000";
const contextOptions = {
  baseURL,
  extraHTTPHeaders: { origin: new URL(baseURL).origin },
};

function expectJson(response: APIResponse, status: number): void {
  expect(response.status()).toBe(status);
  expect(response.headers()["content-type"]).toContain("application/json");
}

function emailFor(identity: QaIdentity): string {
  return config[`${identity}Email`];
}

async function withQaSession(
  identity: QaIdentity,
  run: (session: QaSession) => Promise<void>
): Promise<void> {
  const request = await playwrightRequest.newContext(contextOptions);
  let session: QaSession | undefined;

  await runWithCleanupAggregation(
    async () => {
      session = await loginQaSessionWithOneTransientRetry({
        identity,
        email: emailFor(identity),
        password: config.userPassword,
        request,
      });
      await run(session);
    },
    [async () => (session ? closeQaSession(session) : request.dispose())],
    `${identity} auth contract and cleanup failed`
  );
}

async function withAnonymousContext(
  run: (request: APIRequestContext) => Promise<void>
): Promise<void> {
  const request = await playwrightRequest.newContext(contextOptions);
  await runWithCleanupAggregation(
    () => run(request),
    [() => request.dispose()],
    "Anonymous auth contract and cleanup failed"
  );
}

test(actionEvidenceTitle(
  "auth.login.submit",
  ["success", "persistence", "cleanup"],
  "logs in the existing QA owner without secrets"
), async () => {
  const request = await playwrightRequest.newContext(contextOptions);
  await runWithCleanupAggregation(
    async () => {
      const response = await request.post("/api/auth/login", {
        data: { email: config.ownerEmail, password: config.userPassword },
      });
      const body = await response.json();
      expectJson(response, 200);
      expect(body).toMatchObject({
        ok: true,
        user: { id: expect.any(String), email: config.ownerEmail },
      });
      assertNoBackendLeak(body, [config.userPassword]);
    },
    [async () => void (await request.post("/api/auth/logout")), () => request.dispose()],
    "Login contract and cleanup failed"
  );
});

test(actionEvidenceTitle(
  "auth.login.submit",
  ["permissions"],
  "preserves cookie isolation after login"
), async () => {
  const anonymous = await playwrightRequest.newContext(contextOptions);
  await runWithCleanupAggregation(
    () =>
      withQaSession("owner", async (session) => {
        const response = await session.request.get("/api/auth/me");
        const body = await response.json();
        expectJson(response, 200);
        expect(body).toMatchObject({ ok: true, user: session.user });
        assertNoBackendLeak(body, [config.userPassword]);

        const isolated = await anonymous.get("/api/auth/me");
        const isolatedBody = await isolated.json();
        expectJson(isolated, 401);
        expect(isolatedBody).toEqual({ ok: false, error: "UNAUTHORIZED" });
        assertNoBackendLeak(isolatedBody, [config.userPassword]);
      }),
    [() => anonymous.dispose()],
    "Auth me isolation and cleanup failed"
  );
});

test("refresh reports the existing editor session", async () => {
  await withQaSession("editor", async (session) => {
    const response = await session.request.post("/api/auth/refresh");
    const body = await response.json();
    expectJson(response, 200);
    expect(body).toEqual({ ok: true, hasSession: true, userId: session.user.id });
    assertNoBackendLeak(body, [config.userPassword]);
  });
});

test(actionEvidenceTitle(
  "profile.session.logout",
  ["success", "persistence", "cleanup"],
  "clears only the viewer session"
), async () => {
  await withQaSession("viewer", async (session) => {
    const response = await session.request.post("/api/auth/logout");
    const body = await response.json();
    expectJson(response, 200);
    expect(body).toEqual({ ok: true });
    assertNoBackendLeak(body, [config.userPassword]);

    const me = await session.request.get("/api/auth/me");
    expectJson(me, 401);
    assertNoBackendLeak(await me.json(), [config.userPassword]);
  });
});

test("admin users rejects the non-admin QA owner", async () => {
  await withQaSession("owner", async (session) => {
    const response = await session.request.get("/api/admin/users");
    const body = await response.json();
    expectJson(response, 403);
    expect(body).toEqual({ ok: false, error: "FORBIDDEN" });
    assertNoBackendLeak(body, [config.userPassword]);
  });
});

test(actionEvidenceTitle(
  "profile.password.change",
  ["permissions", "validation", "cleanup"],
  "rejects invalid password types before mutation"
), async () => {
  await withQaSession("editor", async (session) => {
    const response = await session.request.post("/api/auth/change-password", {
      data: { currentPassword: 42, newPassword: false },
    });
    const body = await response.json();
    expectJson(response, 400);
    expect(body).toMatchObject({ ok: false, error: "Validation error" });
    assertNoBackendLeak(body, [config.userPassword]);
  });
});

test(actionEvidenceTitle(
  "auth.reset-password.submit",
  ["permissions", "cleanup"],
  "requires a recovery cookie"
), async () => {
  await withQaSession("viewer", async (session) => {
    const response = await session.request.post("/api/auth/reset-password", {
      data: { newPassword: "never-used-password" },
    });
    const body = await response.json();
    expectJson(response, 403);
    expect(body).toEqual(
      expect.objectContaining({ ok: false, error: expect.any(String) })
    );
    assertNoBackendLeak(body, [config.userPassword]);
  });
});

test(actionEvidenceTitle(
  "auth.reset-password.submit",
  ["validation"],
  "rejects malformed passwords after recovery authentication"
), async () => {
  await withQaSession("viewer", async (session) => {
    const state = await session.request.storageState();
    const recoveryRequest = await playwrightRequest.newContext({
      ...contextOptions,
      storageState: {
        ...state,
        cookies: [
          ...state.cookies,
          {
            name: "password-recovery-verified",
            value: "true",
            domain: new URL(baseURL).hostname,
            path: "/",
            expires: -1,
            httpOnly: true,
            secure: new URL(baseURL).protocol === "https:",
            sameSite: "Lax",
          },
        ],
      },
    });
    try {
      const response = await recoveryRequest.post("/api/auth/reset-password", {
        data: { newPassword: 42 },
      });
      const body = await response.json();
      expectJson(response, 400);
      expect(body).toMatchObject({ ok: false, error: "Validation error" });
      assertNoBackendLeak(body, [config.userPassword]);
    } finally {
      await recoveryRequest.dispose();
    }
  });
});

test("forgot-password rejects missing email before delivery", async () => {
  await withAnonymousContext(async (request) => {
    const response = await request.post("/api/auth/forgot-password", { data: {} });
    const body = await response.json();
    expectJson(response, 400);
    expect(body).toMatchObject({ ok: false, error: "Validation error" });
    assertNoBackendLeak(body, [config.userPassword]);
  });
});

test(actionEvidenceTitle(
  "auth.register.submit",
  ["duplicate", "cleanup"],
  "rejects registration of the existing QA owner after login proof"
), async () => {
  const proofRequest = await playwrightRequest.newContext(contextOptions);
  const registerRequest = await playwrightRequest.newContext(contextOptions);
  let proofSession: QaSession | undefined;

  await runWithCleanupAggregation(
    async () => {
      proofSession = await loginQaSessionWithOneTransientRetry({
        identity: "owner",
        email: config.ownerEmail,
        password: config.userPassword,
        request: proofRequest,
      });
      expect(proofSession.user.email.toLowerCase()).toBe(
        config.ownerEmail.toLowerCase()
      );

      const response = await registerRequest.post("/api/auth/register", {
        data: {
          email: config.ownerEmail,
          password: config.userPassword,
          full_name: "Duplicate QA account",
        },
      });
      const body = await response.json();
      expect([400, 409]).toContain(response.status());
      expect(response.headers()["content-type"]).toContain("application/json");
      expect(body).toEqual(
        expect.objectContaining({ ok: false, error: expect.any(String) })
      );
      assertNoBackendLeak(body, [config.userPassword]);
    },
    [
      async () =>
        proofSession ? closeQaSession(proofSession) : proofRequest.dispose(),
      () => registerRequest.dispose(),
    ],
    "Duplicate registration proof and cleanup failed"
  );
});
