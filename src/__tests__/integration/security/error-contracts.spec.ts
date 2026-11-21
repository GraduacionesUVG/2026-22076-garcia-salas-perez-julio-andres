import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { assertDocumentedJsonError } from "@/__tests__/backend/error-assertions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import {
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  closeQaSessions,
  createQaSessions,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import { codeFixtureData } from "@/__tests__/backend/task10-test-helpers";
import {
  assignedResource,
  cleanupAfterSetupFailure,
  closeAssignedResources,
  createTask14OwnedProjectFixture,
} from "@/__tests__/integration/security/task14-test-helpers";

export const BACKEND_ROUTE_COVERAGE = [] as const;

// Streaming error framing is audited in backend-error-assertions.test.ts using
// the documented AI SDK v1 wire shape. These HTTP cases stop before providers.

type JsonObject = Record<string, unknown>;
type ErrorShape = "collection" | "item" | "foreign" | "conflict";

test.describe.serial("Task 14 documented error contracts", () => {
  test.setTimeout(120_000);

  const sessionsRef = assignedResource<QaSessions>(closeQaSessions);
  const anonymousRef = assignedResource<APIRequestContext>((value) => value.dispose());
  const fixtureRef = assignedResource<QaProjectFixture>((value) => value.cleanup());
  const foreignRef = assignedResource<QaProjectFixture>((value) => value.cleanup());
  const resources = [foreignRef, fixtureRef, anonymousRef, sessionsRef];
  const missingId = "00000000-0000-4000-8000-000000000099";
  let sequence = 0;

  const sessions = () => sessionsRef.current!;
  const fixture = () => fixtureRef.current!;
  const foreign = () => foreignRef.current!;

  async function json(response: APIResponse): Promise<JsonObject> {
    const value: unknown = await response.json();
    expect(value).toEqual(expect.any(Object));
    return value as JsonObject;
  }

  function objectField(value: JsonObject, key: string): JsonObject {
    expect(value[key]).toEqual(expect.any(Object));
    return value[key] as JsonObject;
  }

  async function staleAnalysisMutation(
    family: "codes" | "memos" | "insights"
  ): Promise<APIResponse> {
    sequence += 1;
    const base = `/api/projects/${fixture().project.id}/analysis/${family}`;
    const payloads = {
      codes: codeFixtureData({ name: `${fixture().marker} code ${sequence}` }),
      memos: { title: `${fixture().marker} memo ${sequence}`, body: "before" },
      insights: { title: `${fixture().marker} insight ${sequence}`, summary: "before" },
    } as const;
    const keys = { codes: "code", memos: "memo", insights: "insight" } as const;
    const createdResponse = await sessions().owner.request.post(base, {
      data: payloads[family],
    });
    expect(createdResponse.status()).toBe(201);
    const created = objectField(await json(createdResponse), keys[family]);
    const itemPath = `${base}/${created.id}`;
    const updates = {
      codes: { description: "winner" },
      memos: { body: "winner" },
      insights: { summary: "winner" },
    } as const;
    const staleUpdates = {
      codes: { description: "stale" },
      memos: { body: "stale" },
      insights: { summary: "stale" },
    } as const;
    const first = await sessions().owner.request.patch(itemPath, {
      data: { base_revision: created.revision, ...updates[family] },
    });
    expect(first.status()).toBe(200);
    return sessions().owner.request.patch(itemPath, {
      data: { base_revision: created.revision, ...staleUpdates[family] },
    });
  }

  async function duplicateSource(): Promise<APIResponse> {
    sequence += 1;
    const path = `/api/projects/${fixture().project.id}/documents/sources`;
    const code = `qa_error_${fixture().marker.slice(-8)}_${sequence}`.toLowerCase();
    const data = { code, label: `${fixture().marker} error source ${sequence}` };
    expect((await sessions().owner.request.post(path, { data })).status()).toBe(201);
    return sessions().owner.request.post(path, {
      data: { ...data, label: `${data.label} duplicate` },
    });
  }

  async function closeResources(): Promise<void> {
    await closeAssignedResources(resources, "Task 14 error audit cleanup failed");
  }

  test.beforeAll(async () => {
    try {
      const qaSessions = sessionsRef.assign(await createQaSessions());
      fixtureRef.assign(await createQaProjectFixture(qaSessions));
      foreignRef.assign(
        await createTask14OwnedProjectFixture(qaSessions.intruder.request)
      );
      const baseURL = process.env.BACKEND_TEST_BASE_URL ?? "http://localhost:3000";
      anonymousRef.assign(
        await playwrightRequest.newContext({
          baseURL,
          extraHTTPHeaders: { origin: new URL(baseURL).origin },
        })
      );
    } catch (error) {
      await cleanupAfterSetupFailure(
        error,
        resources,
        "Task 14 error audit setup and cleanup failed"
      );
    }
  });

  test.afterAll(closeResources);

  interface ErrorCase {
    family: string;
    shape: ErrorShape;
    expectedStatus: number;
    request(): Promise<APIResponse>;
  }

  const cases: ErrorCase[] = [
    {
      family: "auth raw-message handler",
      shape: "collection",
      expectedStatus: 401,
      request: () => anonymousRef.current!.get("/api/users/me"),
    },
    {
      family: "projects",
      shape: "item",
      expectedStatus: 400,
      request: () => sessions().owner.request.get("/api/projects/not-a-uuid"),
    },
    {
      family: "collaboration validation",
      shape: "collection",
      expectedStatus: 400,
      request: () =>
        sessions().owner.request.post(`/api/projects/${fixture().project.id}/team`, {
          data: { email: "not-an-email", role: "owner" },
        }),
    },
    {
      family: "collaboration isolation",
      shape: "foreign",
      expectedStatus: 403,
      request: () =>
        sessions().owner.request.get(`/api/projects/${foreign().project.id}/team`),
    },
    {
      family: "delimitation item",
      shape: "item",
      expectedStatus: 404,
      request: () =>
        sessions().owner.request.patch(
          `/api/projects/${fixture().project.id}/delimitation/items/${missingId}`,
          { data: { text: "missing" } }
        ),
    },
    {
      family: "delimitation versions raw-message handler",
      shape: "item",
      expectedStatus: 400,
      request: () =>
        sessions().owner.request.get(
          `/api/projects/${fixture().project.id}/delimitation/versions/not-a-uuid`
        ),
    },
    {
      family: "research design objective",
      shape: "item",
      expectedStatus: 404,
      request: () =>
        sessions().owner.request.patch(
          `/api/projects/${fixture().project.id}/research-design/specific-objectives/${missingId}`,
          { data: { base_revision: 0, text: "missing" } }
        ),
    },
    {
      family: "research design versions raw-message handler",
      shape: "item",
      expectedStatus: 400,
      request: () =>
        sessions().owner.request.get(
          `/api/projects/${fixture().project.id}/research-design/versions/not-a-uuid`
        ),
    },
    {
      family: "sample configuration versions raw-message handler",
      shape: "item",
      expectedStatus: 400,
      request: () =>
        sessions().owner.request.get(
          `/api/projects/${fixture().project.id}/sample-config/versions/not-a-uuid`
        ),
    },
    {
      family: "participants collection validation",
      shape: "collection",
      expectedStatus: 400,
      request: () =>
        sessions().owner.request.get(
          `/api/projects/${fixture().project.id}/participants?limit=0`
        ),
    },
    {
      family: "document sources duplicate conflict",
      shape: "conflict",
      expectedStatus: 409,
      request: duplicateSource,
    },
    {
      family: "documents item",
      shape: "item",
      expectedStatus: 404,
      request: () =>
        sessions().owner.request.patch(
          `/api/projects/${fixture().project.id}/documents/${missingId}`,
          { data: { base_revision: 0, title: "missing" } }
        ),
    },
    {
      family: "analysis codes stale conflict",
      shape: "conflict",
      expectedStatus: 409,
      request: () => staleAnalysisMutation("codes"),
    },
    {
      family: "analysis memos stale conflict",
      shape: "conflict",
      expectedStatus: 409,
      request: () => staleAnalysisMutation("memos"),
    },
    {
      family: "analysis insights stale conflict",
      shape: "conflict",
      expectedStatus: 409,
      request: () => staleAnalysisMutation("insights"),
    },
    {
      family: "analysis analytics isolation",
      shape: "foreign",
      expectedStatus: 403,
      request: () =>
        sessions().owner.request.get(
          `/api/projects/${foreign().project.id}/analysis/dashboard`
        ),
    },
    {
      family: "project exports validation before generation",
      shape: "collection",
      expectedStatus: 400,
      request: () =>
        sessions().owner.request.get(
          `/api/projects/${fixture().project.id}/exports/protocol?format=invalid`
        ),
    },
  ];

  for (const errorCase of cases) {
    test(`${errorCase.family} returns a safe ${errorCase.shape} error`, async () => {
      const response = await errorCase.request();
      expect(response.status()).toBe(errorCase.expectedStatus);
      await assertDocumentedJsonError(response);
    });
  }

  const workflowAiPreconditions = [
    [
      actionEvidenceTitle(
        "delimitation.chat",
        ["permissions", "validation", "dependency-failure", "cleanup"],
        "stops unauthorized, invalid-context, and missing-key chat requests before a provider call"
      ),
      "delimitation/chat",
      "No hay un proveedor de IA configurado en el entorno del proyecto.",
    ],
    [
      actionEvidenceTitle(
        "delimitation.review.evaluate",
        ["permissions", "validation", "dependency-failure", "cleanup"],
        "stops unauthorized, invalid-context, and invalid-payload review requests before a provider call"
      ),
      "delimitation/review",
      "Validation error",
    ],
    [
      actionEvidenceTitle(
        "research-design.chat",
        ["permissions", "validation", "dependency-failure", "cleanup"],
        "stops unauthorized, invalid-context, and missing-key chat requests before a provider call"
      ),
      "research-design/chat",
      "AI_GATEWAY_API_KEY no está configurada en el entorno del proyecto.",
    ],
    [
      actionEvidenceTitle(
        "research-design.review.generate",
        ["permissions", "validation", "dependency-failure", "cleanup"],
        "stops unauthorized, invalid-context, and invalid-payload review requests before a provider call"
      ),
      "research-design/review",
      "Validation error",
    ],
    [
      actionEvidenceTitle(
        "sample-config.chat",
        ["permissions", "validation", "dependency-failure", "cleanup"],
        "stops unauthorized, invalid-context, and missing-key chat requests before a provider call"
      ),
      "sample-config/chat",
      "AI_GATEWAY_API_KEY no está configurada en el entorno del proyecto.",
    ],
    [
      actionEvidenceTitle(
        "sample-config.review.generate",
        ["permissions", "validation", "dependency-failure", "cleanup"],
        "stops unauthorized, invalid-context, and invalid-payload review requests before a provider call"
      ),
      "sample-config/review",
      "Validation error",
    ],
  ] as const;

  for (const [title, suffix, missingKeyError] of workflowAiPreconditions) {
    test(title, async () => {
      const unauthorized = await anonymousRef.current!.post(
        `/api/projects/${fixture().project.id}/${suffix}`,
        { data: {} }
      );
      expect(unauthorized.status(), suffix).toBe(401);
      await assertDocumentedJsonError(unauthorized);

      const invalidContext = await anonymousRef.current!.post(
        `/api/projects/not-a-uuid/${suffix}`,
        { data: {} }
      );
      expect(invalidContext.status(), suffix).toBe(400);
      await assertDocumentedJsonError(invalidContext);

      const review = suffix.endsWith('/review');
      const dependencyFailure = await sessions().owner.request.post(
        `/api/projects/${fixture().project.id}/${suffix}`,
        { data: review ? { unexpected: true } : {} }
      );
      expect(dependencyFailure.status(), suffix).toBe(review ? 400 : 500);
      expect(dependencyFailure.headers()["content-type"], suffix).toContain("application/json");
      expect(dependencyFailure.headers()["x-vercel-ai-ui-message-stream"], suffix).toBeUndefined();
      expect(await json(dependencyFailure)).toMatchObject({
        ok: false,
        error: missingKeyError,
      });
    });
  }

  test("error audit includes every representative response shape", () => {
    expect(new Set(cases.map(({ shape }) => shape))).toEqual(
      new Set<ErrorShape>(["collection", "item", "foreign", "conflict"])
    );
  });
});
