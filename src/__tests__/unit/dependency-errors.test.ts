import { normalizeDependencyError, withDependencyErrors } from "@/src/modules/security/dependency-errors";
import { UsersRepo } from "@/src/modules/users/users.repo";
import { getMe, updateMe } from "@/src/modules/users/users.service";
import { SUPABASE_FAILURE_CASES, freshProviderFailure } from "@/__tests__/backend/supabase-failure-cases";

describe("dependency error contract", () => {
  it.each(SUPABASE_FAILURE_CASES)("normalizes $name without retaining private fields", (fixture) => {
    const source = freshProviderFailure(fixture);
    const result = normalizeDependencyError(source);
    expect(result).toMatchObject({ status: 503, message: "DEPENDENCY_UNAVAILABLE" });
    expect(Object.keys(result as object)).toEqual(["status"]);
    expect(JSON.stringify(result)).not.toMatch(/select|https?:|provider-secret|details|hint|stack/i);
    expect(result).not.toBe(source);
  });
  it.each([400, 401, 403, 404, 409, 410])("preserves literal domain status %i even with transport-looking text", (status) => {
    const error = Object.assign(new Error("fetch failed"), { status, code: "ETIMEDOUT" });
    expect(normalizeDependencyError(error)).toBe(error);
  });
  it.each([null, undefined, "timeout", { code: "23505", message: "duplicate key" }, { code: "42501", message: "permission denied" }, new Error("application timeout policy"), new Error("logic failure")])("preserves nontransient input %#", (error) => {
    expect(normalizeDependencyError(error)).toBe(error);
  });
  it.each(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "08006", "PGRST002", "PGRST003"])("recognizes transport code %s", (code) => {
    expect(normalizeDependencyError({ code, message: "private" })).toMatchObject({ status: 503 });
  });
  it("preserves known database errors even when their message resembles transport failure", () => {
    for (const code of ["23505", "P0001", "42501"]) {
      for (const status of [undefined, 500, 501, 505]) {
        const error = { code, status, message: "fetch failed" };
        expect(normalizeDependencyError(error)).toBe(error);
      }
    }
  });
  it("normalizes the full provider5xx range but not statuses outside it", () => {
    for (let status = 500; status <= 599; status++) {
      expect(normalizeDependencyError({ status, message: "private upstream" })).toMatchObject({ status: 503, message: "DEPENDENCY_UNAVAILABLE" });
    }
    for (const status of [499, 600]) {
      const error = { status, message: "outside provider5xx" };
      expect(normalizeDependencyError(error)).toBe(error);
    }
  });
  it("recognizes fetch transport errors and nested transport cause", () => {
    expect(normalizeDependencyError(new TypeError("fetch failed"))).toMatchObject({ status: 503 });
    expect(normalizeDependencyError(Object.assign(new Error("request failed"), { cause: { code: "ETIMEDOUT" } }))).toMatchObject({ status: 503 });
  });
  it("awaits once and preserves the successful value", async () => {
    const value = { id: "result-1" };
    let calls = 0;
    await expect(withDependencyErrors(async () => { calls++; return value; })).resolves.toBe(value);
    expect(calls).toBe(1);
  });
  it("normalizes synchronous and rejected failures once without mutation retries", async () => {
    for (const synchronous of [true, false]) {
      let calls = 0;
      await expect(withDependencyErrors(() => {
        calls++;
        const error = { status: 429, message: "private" };
        if (synchronous) throw error;
        return Promise.reject(error);
      })).rejects.toMatchObject({ status: 503, message: "DEPENDENCY_UNAVAILABLE" });
      expect(calls).toBe(1);
    }
  });
});

function provider(result: unknown, thrown: boolean) {
  const mutations: unknown[] = [];
  const builder = {
    select: () => builder, eq: () => builder,
    update: (input: unknown) => { mutations.push(input); return builder; },
    insert: (input: unknown) => { mutations.push(input); return builder; },
    maybeSingle: () => thrown ? Promise.reject(result) : Promise.resolve(result),
    single: () => thrown ? Promise.reject(result) : Promise.resolve(result),
  };
  return { supabase: { from: () => builder }, mutations };
}

describe("real profile repository query failures", () => {
  it.each(SUPABASE_FAILURE_CASES)("normalizes returned and thrown $name and stops profile writes", async (fixture) => {
    for (const thrown of [false, true]) {
      const error = freshProviderFailure(fixture);
      const { supabase, mutations } = provider(thrown ? error : { data: null, error }, thrown);
      await expect(updateMe({ supabase: supabase as never, user: { id: "user-1", email: null }, input: { full_name: "Synthetic" } })).rejects.toMatchObject({ status: 503, message: "DEPENDENCY_UNAVAILABLE" });
      expect(mutations).toEqual([]);
    }
  });
  it("retains null optional profile and successful profile", async () => {
    for (const profile of [null, { id: "user-1", full_name: "Synthetic", role: "user", created_at: "2026-01-01" }]) {
      const { supabase } = provider({ data: profile, error: null }, false);
      await expect(getMe({ supabase: supabase as never, user: { id: "user-1", email: null } })).resolves.toEqual({ user: { id: "user-1", email: null }, profile });
    }
  });
  it("retains duplicate database failures for the existing route mapping", async () => {
    const error = { code: "23505", message: "duplicate key" };
    const { supabase } = provider({ data: null, error }, false);
    await expect(new UsersRepo(supabase as never).getProfileById("user-1")).rejects.toBe(error);
  });
});
