import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import {
  assertNoBackendLeak,
  runWithCleanupAggregation,
} from "@/__tests__/backend/auth-test-helpers";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import { loadLocalBackendTestConfig } from "@/__tests__/backend/sessions";

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

function expectSafeError(body: unknown): void {
  expect(body).toEqual(
    expect.objectContaining({ ok: false, error: expect.any(String) })
  );
  assertNoBackendLeak(body, [config.userPassword]);
}

async function withContext(
  run: (request: APIRequestContext) => Promise<void>
): Promise<void> {
  const request = await playwrightRequest.newContext(contextOptions);
  await runWithCleanupAggregation(
    () => run(request),
    [() => request.dispose()],
    "Negative auth contract and cleanup failed"
  );
}

async function expectAnonymousError(
  request: APIRequestContext,
  method: "get" | "patch" | "post",
  path: string,
  data?: unknown
): Promise<void> {
  const response = await request[method](
    path,
    data === undefined ? {} : { data }
  );
  const body = await response.json();
  expectJson(response, 401);
  expectSafeError(body);
}

const anonymousProtectedCases = [
  ["anonymous auth me returns 401 independently", "get", "/api/auth/me", undefined],
  [actionEvidenceTitle("profile.me.read", ["permissions"], "denies anonymous users-me reads"), "get", "/api/users/me", undefined],
  [actionEvidenceTitle("profile.me.update", ["permissions"], "denies anonymous users-me updates"), "patch", "/api/users/me", { full_name: "No session" }],
  [actionEvidenceTitle("profile.me.read", ["permissions"], "denies anonymous compatibility-profile reads"), "get", "/api/profiles/me", undefined],
  [
    actionEvidenceTitle("profile.me.update", ["permissions"], "denies anonymous compatibility-profile updates"),
    "patch",
    "/api/profiles/me",
    { full_name: "No session" },
  ],
  [
    actionEvidenceTitle("profile.password.change", ["permissions"], "denies anonymous password changes"),
    "post",
    "/api/auth/change-password",
    { currentPassword: "unused", newPassword: "also-unused" },
  ],
  ["anonymous admin users returns 401 independently", "get", "/api/admin/users", undefined],
] as const;

for (const [name, method, path, data] of anonymousProtectedCases) {
  test(name, async () => {
    await withContext((request) =>
      expectAnonymousError(request, method, path, data)
    );
  });
}

test("anonymous reset-password independently requires recovery cookies", async () => {
  await withContext(async (request) => {
    const response = await request.post("/api/auth/reset-password", {
      data: { newPassword: "unused-password" },
    });
    const body = await response.json();
    expectJson(response, 403);
    expectSafeError(body);
  });
});

test("anonymous refresh independently reports no session", async () => {
  await withContext(async (request) => {
    const response = await request.post("/api/auth/refresh");
    const body = await response.json();
    expectJson(response, 200);
    expect(body).toEqual({ ok: true, hasSession: false, userId: null });
    assertNoBackendLeak(body, [config.userPassword]);
  });
});

test("anonymous logout independently remains idempotent", async () => {
  await withContext(async (request) => {
    const response = await request.post("/api/auth/logout");
    const body = await response.json();
    expectJson(response, 200);
    expect(body).toEqual({ ok: true });
    assertNoBackendLeak(body, [config.userPassword]);
  });
});

test(actionEvidenceTitle(
  "auth.login.submit",
  ["validation"],
  "rejects wrong, malformed, missing, and typed payloads"
), async () => {
  await withContext(async (request) => {
    const wrongResponse = await request.post("/api/auth/login", {
      data: { email: config.ownerEmail, password: "definitely-wrong-password" },
    });
    const wrongBody = await wrongResponse.json();
    expectJson(wrongResponse, 401);
    expect(wrongBody).toEqual({ ok: false, error: "Invalid credentials" });
    expectSafeError(wrongBody);

    const malformedResponse = await request.post("/api/auth/login", {
      data: Buffer.from("{"),
      headers: { "content-type": "application/json" },
    });
    const malformedBody = await malformedResponse.json();
    expectJson(malformedResponse, 400);
    expect(malformedBody).toEqual({ ok: false, error: "Invalid JSON body" });
    expectSafeError(malformedBody);

    for (const data of [{}, { email: 7, password: false }]) {
      const response = await request.post("/api/auth/login", { data });
      const body = await response.json();
      expectJson(response, 400);
      expectSafeError(body);
    }
  });
});

test("@product-red login rejects unexpected keys before credential checks", async () => {
  await withContext(async (request) => {
    const response = await request.post("/api/auth/login", {
      data: {
        email: config.ownerEmail,
        password: "wrong-password",
        unexpected: true,
      },
    });
    const body = await response.json();
    expectJson(response, 400);
    expectSafeError(body);
  });
});

test("email normalization logs into the existing QA account", async () => {
  await withContext(async (request) => {
    const response = await request.post("/api/auth/login", {
      data: {
        email: config.ownerEmail.toUpperCase(),
        password: config.userPassword,
      },
    });
    const body = await response.json();
    expectJson(response, 200);
    expect(body).toMatchObject({
      ok: true,
      user: { email: config.ownerEmail },
    });
    assertNoBackendLeak(body, [config.userPassword]);

    const logout = await request.post("/api/auth/logout");
    expectJson(logout, 200);
    assertNoBackendLeak(await logout.json(), [config.userPassword]);
  });
});

test(actionEvidenceTitle(
  "auth.register.submit",
  ["validation"],
  "rejects invalid payloads before side effects"
), async () => {
  await withContext(async (request) => {
    for (const [path, data] of [
      ["/api/auth/register", {}],
      ["/api/auth/register", { email: 7, password: false }],
    ] as const) {
      const response = await request.post(path, { data });
      const body = await response.json();
      expectJson(response, 400);
      expectSafeError(body);
    }
  });
});

test(actionEvidenceTitle(
  "auth.forgot-password.submit",
  ["validation", "cleanup"],
  "rejects invalid payloads before delivery"
), async () => {
  await withContext(async (request) => {
    for (const data of [{}, { email: "not-an-email" }]) {
      const response = await request.post("/api/auth/forgot-password", { data });
      const body = await response.json();
      expectJson(response, 400);
      expectSafeError(body);
    }
  });
});

test("callback open redirects stay contained", async () => {
  await withContext(async (request) => {
    const callbackResponse = await request.get(
      "/api/auth/callback?next=https%3A%2F%2Fevil.example%2Fsteal",
      { maxRedirects: 0 }
    );
    expect(callbackResponse.status()).toBe(307);
    expect(new URL(callbackResponse.headers().location).origin).toBe(
      new URL(baseURL).origin
    );
    expect(callbackResponse.headers().location).toContain("/login?e=missing_code");
    assertNoBackendLeak(callbackResponse.headers(), [config.userPassword]);
  });
});

test("protected diagnostics independently stay hidden", async () => {
  await withContext(async (request) => {
    const debugResponse = await request.get("/api/debug/auth");
    const debugBody = await debugResponse.json();
    expectJson(debugResponse, 404);
    expect(debugBody).toEqual({ ok: false, error: "Not found" });
    assertNoBackendLeak(debugBody, [config.userPassword]);
  });
});
