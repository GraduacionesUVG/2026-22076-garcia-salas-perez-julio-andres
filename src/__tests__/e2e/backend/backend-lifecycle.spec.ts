import { expect, test, type APIResponse } from "@playwright/test";
import {
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  closeQaSessions,
  createQaSessions,
  type QaSessions,
} from "@/__tests__/backend/sessions";

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;

async function json(response: APIResponse): Promise<Record<string, unknown>> {
  expect(response.headers()["content-type"]).toContain("application/json");
  return (await response.json()) as Record<string, unknown>;
}

test.beforeAll(async () => {
  sessions = await createQaSessions();
});

test.afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

test.afterAll(async () => {
  await closeQaSessions(sessions);
});

test("marked fixed-QA project crosses participant, document, and memo modules", async () => {
  fixture = await createQaProjectFixture(sessions);
  const projectId = fixture.project.id;

  const participantResponse = await sessions.editor.request.post(
    `/api/projects/${projectId}/participants`,
    { data: { alias: `${fixture.marker.slice(-8)}-lifecycle`, notes: "initial" } }
  );
  expect(participantResponse.status()).toBe(201);
  const participant = (await json(participantResponse)).participant as {
    id: string;
  };

  const documentResponse = await sessions.editor.request.post(
    `/api/projects/${projectId}/documents`,
    {
      data: {
        title: `${fixture.marker} lifecycle document`,
        content: "Backend-only lifecycle evidence",
        participant_id: participant.id,
      },
    }
  );
  expect(documentResponse.status()).toBe(201);
  const document = (await json(documentResponse)).document as { id: string };

  const memoResponse = await sessions.owner.request.post(
    `/api/projects/${projectId}/analysis/memos`,
    {
      data: {
        title: `${fixture.marker} lifecycle memo`,
        body: "Cross-module backend lifecycle",
        tags: ["backend-e2e"],
      },
    }
  );
  expect(memoResponse.status()).toBe(201);
  const memo = (await json(memoResponse)).memo as { id: string };

  const participantRead = await sessions.viewer.request.get(
    `/api/projects/${projectId}/participants/${participant.id}`
  );
  expect(participantRead.status()).toBe(200);
  expect((await json(participantRead)).participant).toMatchObject({
    id: participant.id,
    alias: `${fixture.marker.slice(-8)}-lifecycle`,
    notes: "initial",
    linked_document_count: 1,
  });

  const documentRead = await sessions.viewer.request.get(
    `/api/projects/${projectId}/documents/${document.id}`
  );
  expect(documentRead.status()).toBe(200);
  expect(await json(documentRead)).toMatchObject({
    ok: true,
    document: {
      id: document.id, project_id: projectId, participant_id: participant.id,
      title: `${fixture.marker} lifecycle document`, content: "Backend-only lifecycle evidence",
    },
  });
  const memoRead = await sessions.viewer.request.get(
    `/api/projects/${projectId}/analysis/memos/${memo.id}`
  );
  expect(memoRead.status()).toBe(200);
  expect(await json(memoRead)).toMatchObject({
    ok: true,
    memo: {
      id: memo.id, project_id: projectId, title: `${fixture.marker} lifecycle memo`,
      body: "Cross-module backend lifecycle", tags: ["backend-e2e"],
    },
  });
});
