import {
  assertNoBackendLeak,
  loginQaSessionWithOneTransientRetry,
  restoreValueAndVerify,
  runWithCleanupAggregation,
} from "@/__tests__/backend/auth-test-helpers";
import { loginQaSession } from "@/__tests__/backend/sessions";
import fs from "node:fs";

jest.mock("@/__tests__/backend/sessions", () => ({
  loginQaSession: jest.fn(),
}));

describe("environment-only backend QA configuration", () => {
  const syntheticEnv = {
    NODE_ENV: "test" as const,
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
    TEST_ALLOWED_SUPABASE_HOST: "synthetic.supabase.co",
    TEST_OWNER_EMAIL: "qa_backend_owner@synthetic.test",
    TEST_EDITOR_EMAIL: "qa_backend_editor@synthetic.test",
    TEST_VIEWER_EMAIL: "qa_backend_viewer@synthetic.test",
    TEST_INTRUDER_EMAIL: "qa_backend_intruder@synthetic.test",
    TEST_USER_PASSWORD: "synthetic-env-only-password",
  };
  let runtimeEnv: NodeJS.ProcessEnv;
  let loadLocalBackendTestConfig: typeof import("@/__tests__/backend/sessions").loadLocalBackendTestConfig;

  beforeEach(() => {
    runtimeEnv = process.env;
    process.env = { ...syntheticEnv };
    loadLocalBackendTestConfig = jest.requireActual("@/__tests__/backend/sessions").loadLocalBackendTestConfig;
    // Prove both default filenames are absent without touching a real local env.
    jest.spyOn(fs, "existsSync").mockReturnValue(false);
    jest.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw Object.assign(new Error("synthetic missing config"), { code: "ENOENT" });
    });
  });
  afterEach(() => {
    process.env = runtimeEnv;
    jest.restoreAllMocks();
  });

  it("uses validated environment configuration when neither default file exists", () => {
    expect(loadLocalBackendTestConfig()).toEqual({
      supabaseHost: "synthetic.supabase.co",
      ownerEmail: "qa_backend_owner@synthetic.test",
      editorEmail: "qa_backend_editor@synthetic.test",
      viewerEmail: "qa_backend_viewer@synthetic.test",
      intruderEmail: "qa_backend_intruder@synthetic.test",
      userPassword: "synthetic-env-only-password",
    });
    expect(process.env).toEqual(syntheticEnv);
  });

  it("does not fall back when an explicitly supplied path is missing", () => {
    expect(() => loadLocalBackendTestConfig("/synthetic/missing/config.env"))
      .toThrow("synthetic missing config");
  });

  it.each([
    ["plural", true, ".env.backend-tests.local"],
    ["legacy", false, ".env.backend-test.local"],
  ])("preserves %s local-file precedence over the environment", (_name, plural, filename) => {
    jest.mocked(fs.existsSync).mockImplementation(file => String(file).endsWith(
      plural ? ".env.backend-tests.local" : ".env.backend-test.local"
    ));
    jest.mocked(fs.readFileSync).mockReturnValue("TEST_USER_PASSWORD=synthetic-local-password");
    expect(loadLocalBackendTestConfig().userPassword).toBe("synthetic-local-password");
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringMatching(filename.replaceAll(".", "\\.") + "$"), "utf8");
    expect(process.env.TEST_USER_PASSWORD).toBe("synthetic-env-only-password");
  });

  it.each([
    ["TEST_ALLOWED_SUPABASE_HOST", "unapproved.supabase.co", "Supabase host is not approved"],
    ["TEST_OWNER_EMAIL", "ordinary@synthetic.test", "TEST_OWNER_EMAIL must identify a QA account"],
    ["TEST_USER_PASSWORD", "", "TEST_USER_PASSWORD is required"],
  ])("retains validation of environment-only %s", (key, value, message) => {
    process.env[key] = value;
    expect(() => loadLocalBackendTestConfig()).toThrow(message);
  });
});

describe("backend auth contract helpers", () => {
  it.each([
    [{ message: "Select an option" }],
    [{ message: "Select an option from the list" }],
    [{ authorization_status: "pending" }],
  ])("accepts benign response content %#", (body) => {
    expect(() => assertNoBackendLeak(body)).not.toThrow();
  });

  it.each([
    ["duplicate key value violates unique constraint profiles_pkey"],
    ["unique constraint profiles_email_key"],
    ["insert violates constraint profiles_role_check"],
    ["permission denied for table profiles"],
    ["relation profiles_private does not exist"],
    ["syntax error at or near SELECT"],
    ["Error\n    at handler (app/api/auth/login/route.ts:10:4)"],
    [{ access_token: "secret" }],
    [{ nested: { refresh_token: "secret" } }],
    [{ error: "SUPABASE_SERVICE_ROLE_KEY=secret" }],
    [{ authorization: "Bearer secret" }],
  ])("rejects backend leakage %#", (body) => {
    expect(() => assertNoBackendLeak(body)).toThrow("Backend leakage detected");
  });

  it("retries exactly once for an approved transient Supabase login failure", async () => {
    jest
      .mocked(loginQaSession)
      .mockRejectedValueOnce(
        Object.assign(new Error("owner login failed with status 500"), {
          status: 500,
          backendError: "fetch failed: ConnectTimeoutError",
        })
      )
      .mockResolvedValueOnce({ user: { id: "owner" } } as never);

    await expect(
      loginQaSessionWithOneTransientRetry({ identity: "owner" } as never)
    ).resolves.toEqual({ user: { id: "owner" } });
    expect(loginQaSession).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, "Invalid credentials"],
    [500, "Server error"],
    [503, "upstream unavailable"],
  ])("does not retry non-approved login failure %s", async (status, backendError) => {
    jest.mocked(loginQaSession).mockRejectedValueOnce(
      Object.assign(new Error(`owner login failed with status ${status}`), {
        status,
        backendError,
      })
    );

    await expect(
      loginQaSessionWithOneTransientRetry({ identity: "owner" } as never)
    ).rejects.toThrow(`owner login failed with status ${status}`);
    expect(loginQaSession).toHaveBeenCalledTimes(1);
  });

  it("aggregates operation, restoration, and close failures without masking", async () => {
    const operation = jest.fn().mockRejectedValue(new Error("test failed"));
    const restore = jest.fn().mockRejectedValue(new Error("restore failed"));
    const close = jest.fn().mockRejectedValue(new Error("close failed"));

    let caught: unknown;
    try {
      await runWithCleanupAggregation(
        operation,
        [restore, close],
        "profile contract and cleanup failed"
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([
      expect.objectContaining({ message: "test failed" }),
      expect.objectContaining({ message: "restore failed" }),
      expect.objectContaining({ message: "close failed" }),
    ]);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rethrows a lone operation failure without obscuring its diagnostic", async () => {
    const original = new Error("expected 400, received 401");

    await expect(
      runWithCleanupAggregation(
        async () => {
          throw original;
        },
        [async () => undefined],
        "cleanup wrapper"
      )
    ).rejects.toBe(original);
  });

  it("restores a changed value and verifies it with a fresh read", async () => {
    const read = jest
      .fn<Promise<string | null>, []>()
      .mockResolvedValueOnce("changed")
      .mockResolvedValueOnce("original");
    const restore = jest.fn().mockResolvedValue(undefined);

    await restoreValueAndVerify({
      read,
      restore,
      expected: "original",
      equals: Object.is,
      message: "profile restore failed",
    });

    expect(restore).toHaveBeenCalledWith("original");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("still performs final verification after restore transport failure", async () => {
    const read = jest
      .fn<Promise<string | null>, []>()
      .mockResolvedValueOnce("changed")
      .mockResolvedValueOnce("original");
    const restore = jest.fn().mockRejectedValue(new Error("transport failed"));

    await expect(
      restoreValueAndVerify({
        read,
        restore,
        expected: "original",
        equals: Object.is,
        message: "profile restore failed",
      })
    ).rejects.toThrow("transport failed");
    expect(read).toHaveBeenCalledTimes(2);
  });
});
