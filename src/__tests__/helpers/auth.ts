import { expect, type APIRequestContext } from "@playwright/test";

export async function registerAndLogin(
  request: APIRequestContext,
  overrides?: {
    email?: string;
    password?: string;
    full_name?: string;
  }
) {
  const email = overrides?.email ?? `test_${Date.now()}@example.com`;
  const password = overrides?.password ?? "12345678";
  const full_name = overrides?.full_name ?? "Test User";

  const reg = await request.post("/api/auth/register", {
    data: { email, password, full_name },
  });

  const regJson = await reg.json().catch(() => ({}));

  expect(reg.ok()).toBeTruthy();
  expect(regJson.ok).toBe(true);

  return { email, password, full_name };
}

export async function assertAuthenticated(
  request: APIRequestContext,
  email: string
) {
  const res = await request.get("/api/auth/me");
  const json = await res.json().catch(() => ({}));

  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  expect(json.user?.email).toBe(email);

  return json.user;
}

export async function logout(request: APIRequestContext) {
  const lo = await request.post("/api/auth/logout");
  const loJson = await lo.json().catch(() => ({}));

  expect(lo.ok()).toBeTruthy();
  expect(loJson.ok).toBe(true);
}

export async function expectUnauthorized(
  request: APIRequestContext,
  path = "/api/auth/me"
) {
  const res = await request.get(path);
  expect(res.status()).toBe(401);
}