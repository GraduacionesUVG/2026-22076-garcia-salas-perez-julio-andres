/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type APIResponse } from "@playwright/test";
import { createQaProjectFixture, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { closeQaSessions, createQaSessions, type QaSessions } from "@/__tests__/backend/sessions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import {
  classifyOneWinnerRace,
  codeFixtureData,
  codeDeletionPreservesReferenceIntegrity,
  hasAcyclicParentGraph,
  segmentSelection,
  task10Route,
} from "@/__tests__/backend/task10-test-helpers";

export const BACKEND_ROUTE_COVERAGE = [] as const;

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;
let sequence = 0;

function codesPath(projectId = fixture!.project.id): string {
  return task10Route("/api/projects/:id/analysis/codes", { id: projectId });
}

function codePath(codeId: string, projectId = fixture!.project.id): string {
  return task10Route("/api/projects/:id/analysis/codes/:codeId", {
    id: projectId,
    codeId,
  });
}

function documentsPath(): string {
  return task10Route("/api/projects/:id/documents", { id: fixture!.project.id });
}

function segmentsPath(documentId: string): string {
  return task10Route("/api/projects/:id/documents/:documentId/segments", {
    id: fixture!.project.id,
    documentId,
  });
}

function assignmentsPath(segmentId: string): string {
  return task10Route("/api/projects/:id/analysis/segments/:segmentId/codes", {
    id: fixture!.project.id,
    segmentId,
  });
}

async function body(response: APIResponse): Promise<Record<string, any>> {
  return response.json() as Promise<Record<string, any>>;
}

async function createCode(
  overrides: Record<string, unknown> = {},
  projectId = fixture!.project.id
) {
  sequence += 1;
  const response = await sessions.owner.request.post(codesPath(projectId), {
    data: codeFixtureData({ name: `${fixture!.marker} tree ${sequence}`, ...overrides }),
  });
  const value = await body(response);
  expect(response.status(), JSON.stringify(value)).toBe(201);
  return value.code as Record<string, any>;
}

async function assignCode(codeId: string) {
  const content = "evidence for guarded deletion";
  const documentResponse = await sessions.owner.request.post(documentsPath(), {
    data: { title: `${fixture!.marker} guarded`, content },
  });
  const document = (await body(documentResponse)).document;
  const segmentResponse = await sessions.owner.request.post(segmentsPath(document.id), {
    data: {
      base_document_revision: document.revision,
      ...segmentSelection(content, "evidence"),
    },
  });
  const segment = (await body(segmentResponse)).segment;
  const assignmentResponse = await sessions.owner.request.post(assignmentsPath(segment.id), {
    data: { code_id: codeId },
  });
  expect(assignmentResponse.status()).toBe(201);
  return { segment, assignment: (await body(assignmentResponse)).segment_code };
}

test.beforeAll(async () => { sessions = await createQaSessions(); });
test.beforeEach(async () => { fixture = await createQaProjectFixture(sessions); });
test.afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});
test.afterAll(async () => { await closeQaSessions(sessions); });

test(actionEvidenceTitle(
  "analysis.code.update",
  ["validation"],
  "rejects parenting beneath a descendant and preserves the original tree"
), async () => {
  const root = await createCode();
  const child = await createCode({ parent_code_id: root.id });
  const grandchild = await createCode({ parent_code_id: child.id });
  const response = await sessions.owner.request.patch(codePath(root.id), {
    data: { base_revision: root.revision, parent_code_id: grandchild.id },
  });
  expect(response.status()).toBe(409);
  expect(await body(response)).toMatchObject({ error: "CODE_PARENT_CYCLE" });
  expect((await body(await sessions.owner.request.get(codePath(root.id)))).code.parent_code_id).toBeNull();
});

test("rejects a parent belonging to another project", async () => {
  const local = await createCode();
  const foreign = await createQaProjectFixture(sessions);
  try {
    const foreignParent = await createCode({}, foreign.project.id);
    expect((await sessions.owner.request.patch(codePath(local.id), {
      data: { base_revision: local.revision, parent_code_id: foreignParent.id },
    })).status()).toBe(404);
  } finally { await foreign.cleanup(); }
});

test(actionEvidenceTitle(
  "analysis.code.update",
  ["concurrency"],
  "permits only one concurrent reparent at the same revision"
), async () => {
  const child = await createCode();
  const firstParent = await createCode();
  const secondParent = await createCode();
  const path = codePath(child.id);
  const responses = await Promise.all([
    sessions.owner.request.patch(path, { data: { base_revision: child.revision, parent_code_id: firstParent.id } }),
    sessions.editor.request.patch(path, { data: { base_revision: child.revision, parent_code_id: secondParent.id } }),
  ]);
  classifyOneWinnerRace(responses.map((response) => response.status()), 200, 409);
  const winner = responses.find((response) => response.status() === 200)!;
  const loser = responses.find((response) => response.status() === 409)!;
  const winningCode = (await body(winner)).code;
  expect(await body(loser)).toEqual({ ok: false, error: "CODE_REVISION_CONFLICT" });
  const current = (await body(await sessions.owner.request.get(path))).code;
  expect(current).toMatchObject({
    id: winningCode.id,
    parent_code_id: winningCode.parent_code_id,
    revision: winningCode.revision,
    updated_by: winningCode.updated_by,
  });
  expect(current.revision).toBe(child.revision + 1);
});

test("documents the current self-parent rejection contract", async () => {
  const code = await createCode();
  const response = await sessions.owner.request.patch(codePath(code.id), {
    data: { base_revision: code.revision, parent_code_id: code.id },
  });
  expect(response.status()).toBe(404);
  expect(await body(response)).toMatchObject({ error: "CODE_NOT_FOUND" });
});

test(actionEvidenceTitle(
  "analysis.code.delete",
  ["validation"],
  "rejects deletion or leaves no active orphaned hierarchy or assignment"
), async () => {
  const parent = await createCode();
  const child = await createCode({ parent_code_id: parent.id });
  const childDelete = await sessions.owner.request.delete(codePath(parent.id));
  const parentRead = await sessions.owner.request.get(codePath(parent.id));
  const childRead = await sessions.owner.request.get(codePath(child.id));
  const persistedChild = childRead.status() === 200 ? (await body(childRead)).code : undefined;
  expect(codeDeletionPreservesReferenceIntegrity({
    deleteStatus: childDelete.status(),
    targetCodeId: parent.id,
    targetCodeActive: parentRead.status() === 200,
    activeChildren: persistedChild ? [persistedChild] : [],
    activeAssignments: [],
  })).toBe(true);

  const assigned = await createCode();
  const { segment } = await assignCode(assigned.id);
  const assignmentDelete = await sessions.owner.request.delete(codePath(assigned.id));
  const assignedRead = await sessions.owner.request.get(codePath(assigned.id));
  const assignmentRows = (await body(
    await sessions.owner.request.get(assignmentsPath(segment.id))
  )).segment_codes;
  expect(codeDeletionPreservesReferenceIntegrity({
    deleteStatus: assignmentDelete.status(),
    targetCodeId: assigned.id,
    targetCodeActive: assignedRead.status() === 200,
    activeChildren: [],
    activeAssignments: assignmentRows,
  })).toBe(true);
});

test("simultaneous reciprocal reparenting commits one acyclic winner and no extra revision", async () => {
  const first = await createCode();
  const second = await createCode();
  const responses = await Promise.all([
    sessions.owner.request.patch(codePath(first.id), {
      data: { base_revision: first.revision, parent_code_id: second.id },
    }),
    sessions.editor.request.patch(codePath(second.id), {
      data: { base_revision: second.revision, parent_code_id: first.id },
    }),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
  const winner = responses.find((response) => response.status() === 200)!;
  const loser = responses.find((response) => response.status() === 409)!;
  const winningCode = (await body(winner)).code;
  expect(await body(loser)).toEqual({ ok: false, error: "CODE_PARENT_CYCLE" });

  const [persistedFirst, persistedSecond] = await Promise.all([
    sessions.owner.request.get(codePath(first.id)).then(body).then((value) => value.code),
    sessions.owner.request.get(codePath(second.id)).then(body).then((value) => value.code),
  ]);
  expect(hasAcyclicParentGraph([persistedFirst, persistedSecond])).toBe(true);
  expect(
    persistedFirst.parent_code_id === second.id &&
    persistedSecond.parent_code_id === first.id
  ).toBe(false);
  const persistedWinner = [persistedFirst, persistedSecond].find(
    (code) => code.id === winningCode.id
  )!;
  const persistedLoser = [persistedFirst, persistedSecond].find(
    (code) => code.id !== winningCode.id
  )!;
  expect(persistedWinner).toMatchObject({
    id: winningCode.id,
    parent_code_id: winningCode.parent_code_id,
    revision: winningCode.revision,
  });
  expect(persistedWinner.revision).toBe(1);
  expect(persistedLoser).toMatchObject({ parent_code_id: null, revision: 0 });
});
