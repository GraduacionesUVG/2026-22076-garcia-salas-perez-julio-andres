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
  restoreValueAndVerify,
  runWithCleanupAggregation,
} from "@/__tests__/backend/auth-test-helpers";
import {
  closeQaSession,
  loadLocalBackendTestConfig,
  type QaSession,
} from "@/__tests__/backend/sessions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/profiles/me"],
  ["PATCH", "/api/profiles/me"],
  ["GET", "/api/users/me"],
  ["PATCH", "/api/users/me"],
] as const;

type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  created_at: string;
};

type MeBody = {
  ok: true;
  user: { id: string; email: string };
  profile: Profile;
};

type ProfileFixture = {
  request: APIRequestContext;
  session: QaSession;
  original: MeBody;
};

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

async function readMe(request: APIRequestContext): Promise<MeBody> {
  const response = await request.get("/api/users/me");
  const body = await response.json();
  expectJson(response, 200);
  expect(body).toMatchObject({
    ok: true,
    user: { id: expect.any(String), email: config.ownerEmail },
    profile: {
      id: expect.any(String),
      role: expect.any(String),
      created_at: expect.any(String),
    },
  });
  const candidate = body as { profile?: { full_name?: unknown } };
  expect(
    candidate.profile?.full_name === null ||
      typeof candidate.profile?.full_name === "string"
  ).toBe(true);
  assertNoBackendLeak(body, [config.userPassword]);
  return body as MeBody;
}

async function restoreAndVerifyProfile(
  request: APIRequestContext,
  original: MeBody
): Promise<void> {
  await restoreValueAndVerify({
    read: async () => (await readMe(request)).profile.full_name,
    restore: async (fullName) => {
      const response = await request.patch("/api/profiles/me", {
        data: { full_name: fullName },
      });
      const body = await response.json();
      expectJson(response, 200);
      expect(body).toMatchObject({
        ok: true,
        profile: {
          id: original.profile.id,
          full_name: original.profile.full_name,
          role: original.profile.role,
          created_at: original.profile.created_at,
        },
      });
      assertNoBackendLeak(body, [config.userPassword]);
    },
    expected: original.profile.full_name,
    equals: Object.is,
    message: "Profile restoration and verification failed",
  });

  const restored = await readMe(request);
  expect(restored).toEqual(original);
}

async function withRestoredOwnerProfile(
  run: (fixture: ProfileFixture) => Promise<void>
): Promise<void> {
  const request = await playwrightRequest.newContext(contextOptions);
  let session: QaSession | undefined;
  let original: MeBody | undefined;

  await runWithCleanupAggregation(
    async () => {
      session = await loginQaSessionWithOneTransientRetry({
        identity: "owner",
        email: config.ownerEmail,
        password: config.userPassword,
        request,
      });
      original = await readMe(request);
      await run({ request, session, original });
    },
    [
      async () => {
        if (original) await restoreAndVerifyProfile(request, original);
      },
      async () => {
        if (session) await closeQaSession(session);
        else await request.dispose();
      },
    ],
    "Profile contract, restoration, and session cleanup failed"
  );
}

test(actionEvidenceTitle(
  "profile.me.read",
  ["success", "cleanup"],
  "returns the same profile from canonical and compatibility routes"
), async () => {
  await withRestoredOwnerProfile(async ({ request, original }) => {
    const response = await request.get("/api/profiles/me");
    const body = await response.json();
    expectJson(response, 200);
    expect(body).toEqual({ ok: true, profile: original.profile });
    assertNoBackendLeak(body, [config.userPassword]);
  });
});

test(actionEvidenceTitle(
  "profile.me.update",
  ["validation"],
  "rejects an invalid full_name type without mutation"
), async () => {
  await withRestoredOwnerProfile(async ({ request, original }) => {
    const response = await request.patch("/api/users/me", {
      data: { full_name: 123 },
    });
    const body = await response.json();
    expectJson(response, 400);
    expect(body).toMatchObject({ ok: false, error: "Validation error" });
    assertNoBackendLeak(body, [config.userPassword]);
    expect(await readMe(request)).toEqual(original);
  });
});

test("121-character full_name is rejected without mutation", async () => {
  await withRestoredOwnerProfile(async ({ request, original }) => {
    const response = await request.patch("/api/users/me", {
      data: { full_name: "L".repeat(121) },
    });
    const body = await response.json();
    expectJson(response, 400);
    expect(body).toMatchObject({ ok: false, error: "Validation error" });
    assertNoBackendLeak(body, [config.userPassword]);
    expect(await readMe(request)).toEqual(original);
  });
});

test("@product-red role is rejected independently and remains unchanged", async () => {
  await withRestoredOwnerProfile(async ({ request, original }) => {
    const response = await request.patch("/api/users/me", {
      data: {
        full_name: original.profile.full_name,
        role: original.profile.role === "admin" ? "user" : "admin",
      },
    });
    const body = await response.json();
    expect.soft(response.status()).toBe(400);
    expect.soft(body).toMatchObject({ ok: false, error: "Validation error" });
    assertNoBackendLeak(body, [config.userPassword]);
    expect(await readMe(request)).toEqual(original);
  });
});

test("@product-red email is rejected independently and remains unchanged", async () => {
  await withRestoredOwnerProfile(async ({ request, original }) => {
    const response = await request.patch("/api/users/me", {
      data: {
        full_name: original.profile.full_name,
        email: "changed@example.test",
      },
    });
    const body = await response.json();
    expect.soft(response.status()).toBe(400);
    expect.soft(body).toMatchObject({ ok: false, error: "Validation error" });
    assertNoBackendLeak(body, [config.userPassword]);
    expect(await readMe(request)).toEqual(original);
  });
});

test(actionEvidenceTitle(
  "profile.me.update",
  ["success", "persistence", "cleanup"],
  "accepts a 120-character full_name and compatibility reads it back"
), async () => {
  await withRestoredOwnerProfile(async ({ request, original }) => {
    const fullName = "N".repeat(120);
    const response = await request.patch("/api/users/me", {
      data: { full_name: fullName },
    });
    const body = await response.json();
    expectJson(response, 200);
    expect(body).toMatchObject({
      ok: true,
      user: original.user,
      profile: { ...original.profile, full_name: fullName },
    });
    assertNoBackendLeak(body, [config.userPassword]);

    const compatibility = await request.get("/api/profiles/me");
    const compatibilityBody = await compatibility.json();
    expectJson(compatibility, 200);
    expect(compatibilityBody).toEqual({ ok: true, profile: body.profile });
    assertNoBackendLeak(compatibilityBody, [config.userPassword]);
  });
});
