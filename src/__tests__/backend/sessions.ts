import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import {
  loadBackendTestConfig,
  type BackendTestConfig,
} from "@/__tests__/backend/config";

export type QaIdentity = "owner" | "editor" | "viewer" | "intruder";

export interface QaSession {
  email: string;
  request: APIRequestContext;
  user: { id: string; email: string };
}

export interface QaSessions {
  config: BackendTestConfig;
  owner: QaSession;
  editor: QaSession;
  viewer: QaSession;
  intruder: QaSession;
}

export class QaLoginError extends Error {
  constructor(
    identity: QaIdentity,
    readonly status: number,
    readonly backendError: string | undefined
  ) {
    super(`${identity} login failed with status ${status}`);
    this.name = "QaLoginError";
  }
}

const LOCAL_ENV_PATH = resolve(process.cwd(), ".env.backend-tests.local");
const LEGACY_LOCAL_ENV_PATH = resolve(process.cwd(), ".env.backend-test.local");

function parseLocalEnv(source: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);
    if (!match) {
      throw new Error(`Invalid local backend test config at line ${index + 1}`);
    }

    const [, name, rawValue] = match;
    let value = rawValue.trim();
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      if (value.length < 2 || value.at(-1) !== quote) {
        throw new Error(`Invalid local backend test config at line ${index + 1}`);
      }
      value = value.slice(1, -1);
    }

    if (Object.hasOwn(values, name)) {
      throw new Error(`Duplicate ${name} in local backend test config`);
    }
    values[name] = value;
  }

  return values;
}

export function loadLocalBackendTestConfig(
  path?: string
): BackendTestConfig {
  // Keep the documented plural filename while accepting the singular name
  // used by older local setups so the whole backend suite is runnable after a
  // fresh checkout without copying credentials or weakening validation.
  const configPath = path ?? (
    existsSync(LOCAL_ENV_PATH) ? LOCAL_ENV_PATH :
    existsSync(LEGACY_LOCAL_ENV_PATH) ? LEGACY_LOCAL_ENV_PATH : undefined
  );
  if (configPath === undefined) return loadBackendTestConfig(process.env);
  const localValues = parseLocalEnv(readFileSync(configPath, "utf8"));
  return loadBackendTestConfig({ ...process.env, ...localValues });
}

async function responseBody(response: APIResponse): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null);
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

function isExistingAccountConflict(
  response: APIResponse,
  body: Record<string, unknown>
): boolean {
  if (response.status() === 409) return true;
  if (response.status() !== 400 || typeof body.error !== "string") return false;

  return ["user already registered", "account already exists"].includes(
    body.error.trim().toLowerCase()
  );
}

function appendFailure(failures: unknown[], error: unknown): void {
  if (error instanceof AggregateError) {
    for (const nested of error.errors) appendFailure(failures, nested);
    return;
  }
  failures.push(error);
}

function throwFailures(message: string, failures: unknown[]): never {
  if (failures.length === 1) throw failures[0];
  throw new AggregateError(failures, message);
}

function authenticatedUser(
  identity: QaIdentity,
  email: string,
  response: APIResponse,
  body: Record<string, unknown>
): QaSession["user"] {
  const user = body.user;
  if (
    !response.ok() ||
    body.ok !== true ||
    typeof user !== "object" ||
    user === null ||
    !("id" in user) ||
    !("email" in user) ||
    typeof user.id !== "string" ||
    typeof user.email !== "string" ||
    user.email.toLowerCase() !== email.toLowerCase()
  ) {
    throw new QaLoginError(
      identity,
      response.status(),
      typeof body.error === "string" ? body.error : undefined
    );
  }

  return { id: user.id, email: user.email };
}

export async function loginQaSession(params: {
  identity: QaIdentity;
  email: string;
  password: string;
  request: APIRequestContext;
}): Promise<QaSession> {
  const { request } = params;

  const loginResponse = await request.post("/api/auth/login", {
    data: { email: params.email, password: params.password },
  });
  const loginBody = await responseBody(loginResponse);

  return {
    email: params.email,
    request,
    user: authenticatedUser(
      params.identity,
      params.email,
      loginResponse,
      loginBody
    ),
  };
}

export async function bootstrapQaAccount(params: {
  identity: QaIdentity;
  email: string;
  password: string;
  request: APIRequestContext;
}): Promise<QaSession> {
  try {
    return await loginQaSession(params);
  } catch (error) {
    if (
      !(error instanceof QaLoginError) ||
      error.status !== 401 ||
      error.backendError !== "Invalid credentials"
    ) {
      throw error;
    }
  }

  const registerResponse = await params.request.post("/api/auth/register", {
    data: {
      email: params.email,
      password: params.password,
      full_name: `Backend QA ${params.identity}`,
    },
  });
  const registerBody = await responseBody(registerResponse);
  const registered = registerResponse.ok() && registerBody.ok === true;

  if (!registered && !isExistingAccountConflict(registerResponse, registerBody)) {
    throw new Error(
      `${params.identity} registration failed with status ${registerResponse.status()}`
    );
  }

  return loginQaSession(params);
}

async function createQaSession(params: {
  identity: QaIdentity;
  email: string;
  password: string;
  baseURL: string;
}): Promise<QaSession> {
  const request = await playwrightRequest.newContext({
    baseURL: params.baseURL,
    extraHTTPHeaders: { origin: new URL(params.baseURL).origin },
  });

  try {
    return await loginQaSession({
      identity: params.identity,
      email: params.email,
      password: params.password,
      request,
    });
  } catch (error) {
    try {
      await request.dispose();
    } catch (disposeError) {
      throw new AggregateError(
        [error, disposeError],
        `${params.identity} setup and disposal both failed`
      );
    }
    throw error;
  }
}

export async function createQaSessions(options: {
  config?: BackendTestConfig;
  baseURL?: string;
} = {}): Promise<QaSessions> {
  const config = options.config ?? loadLocalBackendTestConfig();
  const baseURL = options.baseURL ?? process.env.BACKEND_TEST_BASE_URL ?? "http://localhost:3000";
  const created: QaSession[] = [];

  const create = async (identity: QaIdentity, email: string) => {
    const session = await createQaSession({
      identity,
      email,
      password: config.userPassword,
      baseURL,
    });
    created.push(session);
    return session;
  };

  try {
    const owner = await create("owner", config.ownerEmail);
    const editor = await create("editor", config.editorEmail);
    const viewer = await create("viewer", config.viewerEmail);
    const intruder = await create("intruder", config.intruderEmail);

    return { config, owner, editor, viewer, intruder };
  } catch (error) {
    const failures: unknown[] = [];
    appendFailure(failures, error);

    for (const session of created) {
      try {
        await closeQaSession(session);
      } catch (closeError) {
        appendFailure(failures, closeError);
      }
    }

    throwFailures("QA session setup and partial cleanup failed", failures);
  }
}

export async function closeQaSession(session: QaSession): Promise<void> {
  const failures: unknown[] = [];

  try {
    const response = await session.request.post("/api/auth/logout");
    if (!response.ok()) {
      failures.push(
        new Error(`QA logout failed with status ${response.status()}`)
      );
    }
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      await session.request.dispose();
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "QA session failed to close");
  }
}

export async function closeQaSessions(sessions: QaSessions): Promise<void> {
  const failures: unknown[] = [];

  for (const session of [
    sessions.owner,
    sessions.editor,
    sessions.viewer,
    sessions.intruder,
  ]) {
    try {
      await closeQaSession(session);
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "One or more QA sessions failed to close");
  }
}
