import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { createQaProjectFixture, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { closeQaSessions, createQaSessions, type QaSessions } from "@/__tests__/backend/sessions";
import { assignedResource, cleanupAfterSetupFailure, closeAssignedResources } from "@/__tests__/integration/security/task14-test-helpers";
import { assertKeylessAiResponse } from "@/__tests__/backend/keyless-ai-contract";

export const BACKEND_ROUTE_COVERAGE = [
  ["POST", "/api/projects/:id/analysis/chat"], ["POST", "/api/projects/:id/delimitation/chat"],
  ["POST", "/api/projects/:id/delimitation/review"], ["POST", "/api/projects/:id/research-design/chat"],
  ["POST", "/api/projects/:id/research-design/review"], ["POST", "/api/projects/:id/sample-config/chat"],
  ["POST", "/api/projects/:id/sample-config/review"],
] as const;

const suffixes = ["analysis/chat", "delimitation/chat", "delimitation/review", "research-design/chat", "research-design/review", "sample-config/chat", "sample-config/review"];
const nonexistentProjectId = "00000000-0000-4000-8000-000000000099";
const ownedSessions = assignedResource<QaSessions>(closeQaSessions);
const ownedAnonymous = assignedResource<APIRequestContext>(context => context.dispose());
const ownedFixture = assignedResource<QaProjectFixture>(fixture => fixture.cleanup());
const resources = [ownedFixture, ownedAnonymous, ownedSessions];
// Read-only/keyless cases share one temporary fixture per worker lifetime. Default
// (not serial) tests continue after a failure in a fresh worker/fixture.
test.beforeAll(async ({ baseURL }) => {
  try {
    const sessions = ownedSessions.assign(await createQaSessions({ baseURL }));
    ownedAnonymous.assign(await request.newContext({ baseURL }));
    ownedFixture.assign(await createQaProjectFixture(sessions));
  } catch (error) { await cleanupAfterSetupFailure(error, resources, "AI contract setup/cleanup failed"); }
});
test.afterAll(() => closeAssignedResources(resources, "AI contract cleanup failed"));

for (const suffix of suffixes) for (const boundary of ["anonymous", "intruder", "missing-project", "malformed-project"] as const) {
  test(`${suffix} rejects ${boundary} before provider handling`, async () => {
    const actor = boundary === "anonymous" ? ownedAnonymous.current! : boundary === "intruder" ? ownedSessions.current!.intruder.request : ownedSessions.current!.owner.request;
    const project = boundary === "missing-project" ? nonexistentProjectId : boundary === "malformed-project" ? "not-a-uuid" : ownedFixture.current!.project.id;
    const status = boundary === "anonymous" ? 401 : boundary === "malformed-project" ? 400 : 403;
    expect((await actor.post(`/api/projects/${project}/${suffix}`, { data: {} })).status()).toBe(status);
  });
}

// Separate tests preserve every route/role outcome even if one contract regresses.
for (const suffix of suffixes) for (const role of ["owner", "editor", "viewer"] as const) {
  test(`keyless ${suffix} preserves its review-validation or chat-unavailable contract for ${role}`, async () => {
    const review = suffix.endsWith('/review');
    const response = await ownedSessions.current![role].request.post(`/api/projects/${ownedFixture.current!.project.id}/${suffix}`, { data: review ? { unexpected: true } : {} });
    if (review) {
      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, error: 'Validation error' });
    } else {
      assertKeylessAiResponse(response.status(), await response.json());
    }
  });
}
