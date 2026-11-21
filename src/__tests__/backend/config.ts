import { z } from "zod";
import {
  assertSafeBackendEnvironment,
  type SafeBackendEnvironment,
} from "@/__tests__/backend/environment-guard";

export interface BackendTestConfig extends SafeBackendEnvironment {
  ownerEmail: string;
  editorEmail: string;
  viewerEmail: string;
  intruderEmail: string;
  userPassword: string;
}

type TestEnvironment = Record<string, string | undefined>;

const EMAIL_VARIABLES = [
  ["TEST_OWNER_EMAIL", "ownerEmail"],
  ["TEST_EDITOR_EMAIL", "editorEmail"],
  ["TEST_VIEWER_EMAIL", "viewerEmail"],
  ["TEST_INTRUDER_EMAIL", "intruderEmail"],
] as const;

const EMAIL_SCHEMA = z.string().email();

function requireValue(env: TestEnvironment, name: string): string {
  const value = env[name];

  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function loadBackendTestConfig(env: TestEnvironment): BackendTestConfig {
  const safeEnvironment = assertSafeBackendEnvironment(env);
  const config = {} as Pick<
    BackendTestConfig,
    "ownerEmail" | "editorEmail" | "viewerEmail" | "intruderEmail"
  >;

  for (const [variableName, propertyName] of EMAIL_VARIABLES) {
    const email = requireValue(env, variableName).trim();

    if (!EMAIL_SCHEMA.safeParse(email).success) {
      throw new Error(`${variableName} must be a valid email address`);
    }

    const localPart = email.slice(0, email.indexOf("@"));
    if (!localPart.startsWith("qa_backend_")) {
      throw new Error(`${variableName} must identify a QA account`);
    }

    config[propertyName] = email;
  }

  return {
    ...safeEnvironment,
    ...config,
    userPassword: requireValue(env, "TEST_USER_PASSWORD"),
  };
}
