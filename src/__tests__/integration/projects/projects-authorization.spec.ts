import { expect, request as playwrightRequest, test } from "@playwright/test";
import {
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  closeQaSessions,
  createQaSessions,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;

test.beforeAll(async () => {
  sessions = await createQaSessions();
});

test.beforeEach(async () => {
  fixture = await createQaProjectFixture(sessions);
});

test.afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

test.afterAll(async () => {
  if (sessions) await closeQaSessions(sessions);
});

test(actionEvidenceTitle(
  "projects.project.delete",
  ["permissions"],
  "denies project deletion to an editor"
), async () => {
  const update = await sessions.editor.request.patch(
    `/api/projects/${fixture!.project.id}`,
    { data: { description: "editor contract" } }
  );
  expect(update.status()).toBe(200);
  expect((await update.json()).project.my_role).toBe("editor");

  const remove = await sessions.editor.request.delete(
    `/api/projects/${fixture!.project.id}`
  );
  expect(remove.status()).toBe(403);

  const proof = await sessions.owner.request.get(`/api/projects/${fixture!.project.id}`);
  expect(proof.status()).toBe(200);
});

test(actionEvidenceTitle(
  "projects.project.update",
  ["permissions"],
  "denies project updates and deletion to a viewer"
), async () => {
  expect(
    (await sessions.viewer.request.get(`/api/projects/${fixture!.project.id}`)).status()
  ).toBe(200);
  expect(
    (
      await sessions.viewer.request.patch(`/api/projects/${fixture!.project.id}`, {
        data: { name: "forbidden" },
      })
    ).status()
  ).toBe(403);
  expect(
    (await sessions.viewer.request.delete(`/api/projects/${fixture!.project.id}`)).status()
  ).toBe(403);
});

test([actionEvidenceTitle(
  "projects.projects.list",
  ["permissions"],
  "does not list a foreign project for an intruder"
), actionEvidenceTitle("projects.project.read", ["permissions"], "denies intruder project detail reads")].join(" | "), async () => {
  const list = await sessions.intruder.request.get("/api/projects");
  expect(list.status()).toBe(200);
  expect((await list.json()).projects).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: fixture!.project.id })])
  );

  const responses = [
    await sessions.intruder.request.get(`/api/projects/${fixture!.project.id}`),
    await sessions.intruder.request.patch(`/api/projects/${fixture!.project.id}`, {
      data: { name: "forbidden" },
    }),
    await sessions.intruder.request.delete(`/api/projects/${fixture!.project.id}`),
  ];
  for (const response of responses) expect([403, 404]).toContain(response.status());

  const proof = await sessions.owner.request.get(`/api/projects/${fixture!.project.id}`);
  expect((await proof.json()).project.name).toBe(fixture!.project.name);
});

test(actionEvidenceTitle(
  "projects.project.create",
  ["permissions"],
  "denies anonymous project enumeration and mutation"
), async () => {
  const baseURL = process.env.BACKEND_TEST_BASE_URL ?? "http://localhost:3000";
  const anonymous = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { origin: new URL(baseURL).origin },
  });
  try {
    const responses = [
      await anonymous.get("/api/projects"),
      await anonymous.post("/api/projects", { data: { name: "forbidden" } }),
      await anonymous.get(`/api/projects/${fixture!.project.id}`),
      await anonymous.patch(`/api/projects/${fixture!.project.id}`, {
        data: { name: "forbidden" },
      }),
      await anonymous.delete(`/api/projects/${fixture!.project.id}`),
    ];
    for (const response of responses) expect(response.status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
});

test("one project fixture never grants access to another project id", async () => {
  const foreignSessions: QaSessions = {
    owner: sessions.intruder,
    editor: sessions.owner,
    viewer: sessions.editor,
    intruder: sessions.viewer,
    config: {
      ...sessions.config,
      ownerEmail: sessions.config.intruderEmail,
      editorEmail: sessions.config.ownerEmail,
      viewerEmail: sessions.config.editorEmail,
      intruderEmail: sessions.config.viewerEmail,
    },
  };
  const foreign = await createQaProjectFixture(foreignSessions);
  try {
    const update = await sessions.viewer.request.patch(
      `/api/projects/${foreign.project.id}`,
      { data: { name: "forbidden" } }
    );
    expect([403, 404]).toContain(update.status());

    const foreignProof = await sessions.intruder.request.get(
      `/api/projects/${foreign.project.id}`
    );
    expect(foreignProof.status()).toBe(200);
    expect((await foreignProof.json()).project.name).toBe(foreign.project.name);

    const original = await sessions.owner.request.get(
      `/api/projects/${fixture!.project.id}`
    );
    expect((await original.json()).project.name).toBe(fixture!.project.name);
  } finally {
    await foreign.cleanup();
  }
});
