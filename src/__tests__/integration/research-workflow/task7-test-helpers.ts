import {
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import {
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import { createQaSessions, type QaSessions } from "@/__tests__/backend/sessions";

export type JsonObject = Record<string, unknown>;

export interface Task7Fixture {
  sessions: QaSessions;
  primary: QaProjectFixture;
  foreign: QaProjectFixture;
  anonymous: APIRequestContext;
}

async function disposeQaSessionContexts(sessions: QaSessions): Promise<void> {
  const failures: unknown[] = [];
  for (const session of [
    sessions.owner,
    sessions.editor,
    sessions.viewer,
    sessions.intruder,
  ]) {
    try {
      await session.request.dispose();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Task 7 QA contexts failed to dispose");
  }
}

export async function readJson(response: APIResponse): Promise<JsonObject> {
  const body = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error(`Expected JSON object from status ${response.status()}`);
  }
  return body as JsonObject;
}

export function objectField(body: JsonObject, field: string): JsonObject {
  const value = body[field];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected object field ${field}`);
  }
  return value as JsonObject;
}

export function arrayField(body: JsonObject, field: string): JsonObject[] {
  const value = body[field];
  if (!Array.isArray(value)) throw new Error(`Expected array field ${field}`);
  return value.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`Expected ${field} to contain objects`);
    }
    return item as JsonObject;
  });
}

export function stringField(body: JsonObject, field: string): string {
  const value = body[field];
  if (typeof value !== "string") throw new Error(`Expected string field ${field}`);
  return value;
}

export function numberField(body: JsonObject, field: string): number {
  const value = body[field];
  if (typeof value !== "number") throw new Error(`Expected number field ${field}`);
  return value;
}

export async function createTask7Fixture(): Promise<Task7Fixture> {
  const sessions = await createQaSessions();
  let primary: QaProjectFixture | undefined;
  let foreign: QaProjectFixture | undefined;
  let anonymous: APIRequestContext | undefined;

  try {
    primary = await createQaProjectFixture(sessions);
    foreign = await createQaProjectFixture(sessions);
    const baseURL = process.env.BACKEND_TEST_BASE_URL ?? "http://localhost:3000";
    anonymous = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { origin: new URL(baseURL).origin },
    });
    return { sessions, primary, foreign, anonymous };
  } catch (setupError) {
    const failures: unknown[] = [setupError];
    for (const resource of [foreign, primary]) {
      try {
        await resource?.cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      await anonymous?.dispose();
    } catch (error) {
      failures.push(error);
    }
    try {
      await disposeQaSessionContexts(sessions);
    } catch (error) {
      failures.push(error);
    }
    throw new AggregateError(failures, "Task 7 fixture setup failed");
  }
}

export async function closeTask7Fixture(
  fixture: Task7Fixture | undefined
): Promise<void> {
  if (!fixture) return;
  const failures: unknown[] = [];

  for (const cleanup of [
    () => fixture.foreign.cleanup(),
    () => fixture.primary.cleanup(),
    () => fixture.anonymous.dispose(),
    () => disposeQaSessionContexts(fixture.sessions),
  ]) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "Task 7 fixture cleanup failed");
  }
}
