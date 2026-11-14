import { assertSafeBackendEnvironment } from "@/__tests__/backend/environment-guard";

describe("assertSafeBackendEnvironment", () => {
  it("accepts only the explicitly approved Supabase host", () => {
    expect(
      assertSafeBackendEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://qa-ref.supabase.co",
        TEST_ALLOWED_SUPABASE_HOST: "qa-ref.supabase.co",
      })
    ).toEqual({ supabaseHost: "qa-ref.supabase.co" });

    expect(() =>
      assertSafeBackendEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://other-ref.supabase.co",
        TEST_ALLOWED_SUPABASE_HOST: "qa-ref.supabase.co",
      })
    ).toThrow("Supabase host is not approved for backend tests");
  });

  it.each([
    {},
    { NEXT_PUBLIC_SUPABASE_URL: "https://qa-ref.supabase.co" },
    { TEST_ALLOWED_SUPABASE_HOST: "qa-ref.supabase.co" },
  ])("rejects missing Supabase configuration", (env) => {
    expect(() => assertSafeBackendEnvironment(env)).toThrow(
      "Supabase URL and TEST_ALLOWED_SUPABASE_HOST are required"
    );
  });

  it.each(["not-a-url", "https://", "https://qa ref.supabase.co"])(
    "rejects malformed Supabase URLs: %s",
    (url) => {
      expect(() =>
        assertSafeBackendEnvironment({
          NEXT_PUBLIC_SUPABASE_URL: url,
          TEST_ALLOWED_SUPABASE_HOST: "qa-ref.supabase.co",
        })
      ).toThrow();
    }
  );

  it("rejects non-HTTPS remote Supabase URLs", () => {
    expect(() =>
      assertSafeBackendEnvironment({
        SUPABASE_URL: "http://qa-ref.supabase.co",
        TEST_ALLOWED_SUPABASE_HOST: "qa-ref.supabase.co",
      })
    ).toThrow("Remote Supabase test URLs must use HTTPS");
  });
});
