import { loadBackendTestConfig } from "@/__tests__/backend/config";
import { createRunMarker } from "@/__tests__/backend/run-id";

const requiredCredentialNames = [
  "TEST_OWNER_EMAIL",
  "TEST_EDITOR_EMAIL",
  "TEST_VIEWER_EMAIL",
  "TEST_INTRUDER_EMAIL",
  "TEST_USER_PASSWORD",
] as const;

const qaEmailNames = requiredCredentialNames.slice(0, 4);

afterEach(() => {
  jest.restoreAllMocks();
});

function validEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://qa-ref.supabase.co",
    TEST_ALLOWED_SUPABASE_HOST: "qa-ref.supabase.co",
    TEST_OWNER_EMAIL: "qa_backend_owner@uvg.edu.gt",
    TEST_EDITOR_EMAIL: "qa_backend_editor@uvg.edu.gt",
    TEST_VIEWER_EMAIL: "qa_backend_viewer@uvg.edu.gt",
    TEST_INTRUDER_EMAIL: "qa_backend_intruder@uvg.edu.gt",
    TEST_USER_PASSWORD: "test-password-from-env",
    ...overrides,
  };
}

describe("loadBackendTestConfig", () => {
  it.each([
    "NEXT_PUBLIC_SUPABASE_URL",
    "TEST_ALLOWED_SUPABASE_HOST",
  ])("rejects missing required Supabase approval: %s", (missingName) => {
    const env = validEnv();
    delete env[missingName];

    expect(() => loadBackendTestConfig(env)).toThrow(
      "Supabase URL and TEST_ALLOWED_SUPABASE_HOST are required"
    );
  });

  it.each(["not-a-url", "http://qa-ref.supabase.co"])(
    "rejects unsafe Supabase URL before session creation: %s",
    (url) => {
      expect(() =>
        loadBackendTestConfig(validEnv({ NEXT_PUBLIC_SUPABASE_URL: url }))
      ).toThrow();
    }
  );

  test.each(requiredCredentialNames)(
    "rejects missing %s before making an HTTP call",
    (missingName) => {
      const env = validEnv();
      delete env[missingName];
      const fetchSpy = jest.spyOn(global, "fetch");

      expect(() => loadBackendTestConfig(env)).toThrow(missingName);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  test.each(qaEmailNames)(
    "rejects a non-QA account in %s before session creation",
    (emailName) => {
      const fetchSpy = jest.spyOn(global, "fetch");

      expect(() =>
        loadBackendTestConfig(validEnv({ [emailName]: "real@uvg.edu.gt" }))
      ).toThrow("must identify a QA account");
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  test.each([
    "qa_backend_owner",
    "qa_backend_owner@.",
    "qa_backend_owner@example..com",
  ])("rejects invalid email syntax: %s", (email) => {
    expect(() =>
      loadBackendTestConfig(validEnv({ TEST_OWNER_EMAIL: email }))
    ).toThrow("must be a valid email address");
  });

  it("returns only the configured QA credentials", () => {
    expect(loadBackendTestConfig(validEnv())).toEqual({
      supabaseHost: "qa-ref.supabase.co",
      ownerEmail: "qa_backend_owner@uvg.edu.gt",
      editorEmail: "qa_backend_editor@uvg.edu.gt",
      viewerEmail: "qa_backend_viewer@uvg.edu.gt",
      intruderEmail: "qa_backend_intruder@uvg.edu.gt",
      userPassword: "test-password-from-env",
    });
  });

  it("does not read a service-role key", () => {
    const env = new Proxy(validEnv(), {
      get(target, property, receiver) {
        if (String(property).toUpperCase().includes("SERVICE_ROLE")) {
          throw new Error("service-role key was read");
        }

        return Reflect.get(target, property, receiver);
      },
    });

    expect(() => loadBackendTestConfig(env)).not.toThrow();
  });
});

describe("createRunMarker", () => {
  it("formats an injected UTC timestamp and UUID", () => {
    expect(
      createRunMarker(
        new Date("2026-07-12T03:04:05.999Z"),
        "123e4567-e89b-12d3-a456-426614174000"
      )
    ).toBe("E2E_20260712T030405_123e4567-e89b-12d3-a456-426614174000");
  });

  it("generates a timestamped UUID marker by default", () => {
    expect(createRunMarker()).toMatch(
      /^E2E_\d{8}T\d{6}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
