import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import {
  createQaProjectFixture,
  cleanupQaProjectAndSessions,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  createQaSessions,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import { assertDocumentedJsonError } from "@/__tests__/backend/error-assertions";

/**
 * Cross-cutting resilience checks. Domain specs already own the happy paths
 * and field-level schemas; this suite exercises the ways a client can drift
 * outside those assumptions without creating a resource or leaking a 500.
 */
export const BACKEND_ROUTE_COVERAGE = [] as const;

type JsonObject = Record<string, unknown>;

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;

function projectPath(suffix: string): string {
  return `/api/projects/${fixture!.project.id}${suffix}`;
}

async function jsonBody(response: APIResponse): Promise<JsonObject> {
  const contentType = response.headers()["content-type"] ?? "";
  expect(contentType).toMatch(/^application\/json(?:;|$)/u);
  const body: unknown = await response.json();
  expect(body).toEqual(expect.any(Object));
  return body as JsonObject;
}

async function assertValidationError(response: APIResponse, expectedError: string): Promise<void> {
  await assertDocumentedJsonError(response, { expectedStatus: 400, expectedError });
}

function collectionRequests(): Array<{
  path: string;
  request: APIRequestContext;
  field: string;
  validationError: string;
}> {
  return [
    {
      path: projectPath("/participants"),
      request: sessions.owner.request,
      field: "participants", validationError: "Validation error",
    },
    {
      path: projectPath("/documents"),
      request: sessions.owner.request,
      field: "documents", validationError: "Validation error",
    },
    {
      path: projectPath("/analysis/codes"),
      request: sessions.owner.request,
      field: "codes", validationError: "VALIDATION_ERROR",
    },
    {
      path: projectPath("/analysis/memos"),
      request: sessions.owner.request,
      field: "memos", validationError: "VALIDATION_ERROR",
    },
    {
      path: projectPath("/analysis/insights"),
      request: sessions.owner.request,
      field: "insights", validationError: "VALIDATION_ERROR",
    },
  ];
}

test.describe.serial("Unexpected client behavior and resilience", () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    sessions = await createQaSessions();
    fixture = await createQaProjectFixture(sessions);
  });

  test.afterAll(async () => {
    if (sessions) await cleanupQaProjectAndSessions(fixture, sessions);
    fixture = undefined;
  });

  test("rejects JSON primitives and arrays consistently across mutation families", async () => {
    const unexpectedBodies: unknown[] = [null, [], "text", 0, true];

    for (const endpoint of collectionRequests()) {
      for (const data of unexpectedBodies) {
        const response = await endpoint.request.post(endpoint.path, {
          data: JSON.stringify(data),
          headers: { "content-type": "application/json" },
        });
        await assertValidationError(response, endpoint.validationError);
      }
      const read = await endpoint.request.get(endpoint.path);
      expect(read.status()).toBe(200);
      expect(await jsonBody(read)).toMatchObject({ ok: true, [endpoint.field]: [] });
    }
  });

  test("returns a JSON client error for malformed bodies regardless of content type", async () => {
    for (const endpoint of collectionRequests()) {
      const response = await endpoint.request.post(endpoint.path, {
        data: "not-json",
        headers: { "content-type": "text/plain" },
      });
      await assertValidationError(response, "Invalid JSON body");
    }
  });

  test("pins acceptance and rejection of adversarial pagination values", async () => {
    // Existing parseInt/last-value-wins behavior accepts the first four cases.
    // Empty collections establish acceptance, not the normalized page size.
    const queryValues = [
      { query: "limit=1.5", status: 200 },
      { query: "limit=1e9", status: 200 },
      { query: "offset=NaN", status: 200 },
      { query: "limit=1&limit=2", status: 200 },
      { query: "offset=0&offset=-1", status: 400 },
      { query: "unknown_filter=1", status: 400 },
    ] as const;

    for (const endpoint of collectionRequests()) {
      for (const { query, status } of queryValues) {
        const response = await endpoint.request.get(`${endpoint.path}?${query}`);
        expect(response.status(), `${endpoint.path}?${query}`).toBe(status);
        if (status === 400) {
          await assertValidationError(response, endpoint.validationError);
        } else {
          expect(await jsonBody(response)).toMatchObject({ ok: true, [endpoint.field]: [] });
        }
      }
    }
  });

  test("returns method-not-allowed instead of executing an unsupported mutation", async () => {
    const response = await sessions.owner.request.fetch(
      projectPath("/analysis/codes"),
      { method: "PUT", data: { name: "must-not-be-created" } }
    );

    expect(response.status()).toBe(405);
    // Next's generated 405 response is intentionally bodyless; the important
    // contract here is that the unsupported method never reaches the handler.
    expect(await response.text()).toBe("");
    const codes = await sessions.owner.request.get(projectPath("/analysis/codes"));
    expect(codes.status()).toBe(200);
    expect(await jsonBody(codes)).toMatchObject({ ok: true, codes: [] });
  });

  test("keeps failed mutations side-effect free", async () => {
    const before = await sessions.owner.request.get(
      `${projectPath("/analysis/memos")}?search=side-effect-probe`
    );
    const beforeBody = await jsonBody(before);
    expect(before.status()).toBe(200);
    expect(beforeBody).toMatchObject({ ok: true, memos: [] });

    const failed = await sessions.owner.request.post(
      projectPath("/analysis/memos"),
      { data: { title: "side-effect-probe", tags: ["valid", 42] } }
    );
    await assertValidationError(failed, "VALIDATION_ERROR");

    const after = await sessions.owner.request.get(
      `${projectPath("/analysis/memos")}?search=side-effect-probe`
    );
    const afterBody = await jsonBody(after);
    expect(after.status()).toBe(200);
    expect(afterBody).toEqual(beforeBody);
  });
});
