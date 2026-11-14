import { expect, test, type APIResponse } from "@playwright/test";
import { strictE2eResidues } from "@/__tests__/backend/cleanup-audit";
import {
  closeQaSessions,
  createQaSessions,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import { closeTask10Resources } from "@/__tests__/backend/task10-test-helpers";

let sessions: QaSessions | undefined;

async function projectList(response: APIResponse): Promise<unknown> {
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  return response.json();
}

test.beforeAll(async () => {
  sessions = await createQaSessions();
});

test.afterAll(async () => {
  await closeTask10Resources({ sessions, closeSessions: closeQaSessions });
  sessions = undefined;
});

test("BACKEND CLEANUP AUDIT: owner and intruder lists contain no strict E2E marker residues", async () => {
  const [owner, intruder] = await Promise.all([
    projectList(await sessions!.owner.request.get("/api/projects")),
    projectList(await sessions!.intruder.request.get("/api/projects")),
  ]);

  expect(strictE2eResidues({ owner, intruder })).toEqual([]);
});
