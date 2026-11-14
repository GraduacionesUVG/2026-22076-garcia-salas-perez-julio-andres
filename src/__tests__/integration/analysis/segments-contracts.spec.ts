/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, request, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { createQaProjectFixture, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { closeQaSessions, createQaSessions, type QaSessions } from "@/__tests__/backend/sessions";
import {
  closeTask10Resources,
  segmentSelection,
  task10Route,
} from "@/__tests__/backend/task10-test-helpers";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects/:id/analysis/segments"],
  ["GET", "/api/projects/:id/documents/:documentId/segments"],
  ["POST", "/api/projects/:id/documents/:documentId/segments"],
  ["GET", "/api/projects/:id/documents/:documentId/segments/:segmentId"],
  ["PATCH", "/api/projects/:id/documents/:documentId/segments/:segmentId"],
  ["DELETE", "/api/projects/:id/documents/:documentId/segments/:segmentId"],
] as const;

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;
let anonymous: APIRequestContext | undefined;
let sequence = 0;

function documentsPath(projectId = fixture!.project.id): string {
  return task10Route("/api/projects/:id/documents", { id: projectId });
}

function documentPath(documentId: string, projectId = fixture!.project.id): string {
  return task10Route("/api/projects/:id/documents/:documentId", {
    id: projectId,
    documentId,
  });
}

function segmentsPath(documentId: string, projectId = fixture!.project.id): string {
  return task10Route("/api/projects/:id/documents/:documentId/segments", {
    id: projectId,
    documentId,
  });
}

function segmentPath(
  documentId: string,
  segmentId: string,
  projectId = fixture!.project.id
): string {
  return task10Route(
    "/api/projects/:id/documents/:documentId/segments/:segmentId",
    { id: projectId, documentId, segmentId }
  );
}

async function body(response: APIResponse): Promise<Record<string, any>> {
  expect(response.headers()["content-type"]).toContain("application/json");
  return response.json() as Promise<Record<string, any>>;
}

async function createDocument(
  content = "alpha \u{1F600} beta\r\ngamma delta",
  projectId = fixture!.project.id,
  marker = fixture!.marker
) {
  sequence += 1;
  const response = await sessions.owner.request.post(documentsPath(projectId), {
    data: { title: `${marker} segment document ${sequence}`, content },
  });
  expect(response.status()).toBe(201);
  return (await body(response)).document as Record<string, any>;
}

async function createSegment(
  document: Record<string, any>,
  selectedText: string,
  occurrence = 0,
  projectId = fixture!.project.id
) {
  const response = await sessions.owner.request.post(segmentsPath(document.id, projectId), {
    data: {
      base_document_revision: document.revision,
      ...segmentSelection(document.content, selectedText, occurrence),
    },
  });
  const value = await body(response);
  expect(response.status(), JSON.stringify(value)).toBe(201);
  return value.segment as Record<string, any>;
}

test.beforeAll(async ({ baseURL }) => {
  sessions = await createQaSessions();
  anonymous = await request.newContext({ baseURL });
});
test.beforeEach(async () => { fixture = await createQaProjectFixture(sessions); });
test.afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});
test.afterAll(async () => {
  await closeTask10Resources({ anonymous, sessions, closeSessions: closeQaSessions });
  anonymous = undefined;
});

test(actionEvidenceTitle(
  "corpus.document-segment.create",
  ["success", "persistence", "cleanup"],
  "persists normalized UTF-16 offsets for emoji and CRLF content"
), async () => {
  const document = await createDocument();
  expect(document.content).toBe("alpha \u{1F600} beta\ngamma delta");
  const emoji = await createSegment(document, "\u{1F600} beta");
  const secondLine = await createSegment(document, "gamma delta");
  expect(emoji).toMatchObject({ start_char: 6, end_char: 13, selected_text: "\u{1F600} beta", revision: 0 });
  expect(secondLine).toMatchObject({ start_char: 14, end_char: 25, selected_text: "gamma delta" });
  const emojiReadback = (await body(await sessions.viewer.request.get(
    segmentPath(document.id, emoji.id)
  ))).segment;
  expect(emojiReadback).toMatchObject({
    id: emoji.id,
    start_char: 6,
    end_char: 13,
    selected_text: "\u{1F600} beta",
  });
});

test("removes legacy segment titles from the public contract", async () => {
  const document = await createDocument("evidence without a title");
  const path = segmentsPath(document.id);
  const selection = segmentSelection(document.content, "without a title");

  const rejected = await sessions.owner.request.post(path, {
    data: {
      base_document_revision: document.revision,
      ...selection,
      label: "legacy title",
    },
  });
  expect(rejected.status()).toBe(400);

  const created = await createSegment(document, "without a title");
  expect(created).not.toHaveProperty("label");

  const patched = await sessions.owner.request.patch(
    segmentPath(document.id, created.id),
    { data: { base_revision: created.revision, label: "legacy title" } }
  );
  expect(patched.status()).toBe(400);
});

test(actionEvidenceTitle(
  "corpus.document-segment.create",
  ["validation"],
  "rejects negative, reversed, out-of-range, and mismatched selections"
), async () => {
  const document = await createDocument("0123456789");
  const cases = [
    { base_document_revision: 0, start_char: -1, end_char: 2, selected_text: "01" },
    { base_document_revision: 0, start_char: 5, end_char: 4, selected_text: "" },
    { base_document_revision: 0, start_char: 8, end_char: 11, selected_text: "89" },
    { base_document_revision: 0, start_char: 0, end_char: 2, selected_text: "xx" },
  ];
  for (const data of cases) {
    expect((await sessions.owner.request.post(segmentsPath(document.id), { data })).status()).toBe(400);
  }
});

test(actionEvidenceTitle(
  "corpus.document-segment.create",
  ["duplicate"],
  "allows distinct overlapping evidence but rejects an exact duplicate"
), async () => {
  const document = await createDocument("alpha beta gamma delta");
  await createSegment(document, "beta gamma");
  await createSegment(document, "gamma delta");
  const duplicate = await sessions.owner.request.post(segmentsPath(document.id), {
    data: { base_document_revision: document.revision, ...segmentSelection(document.content, "beta gamma") },
  });
  expect(duplicate.status()).toBe(409);
  expect(await body(duplicate)).toMatchObject({ error: "SEGMENT_ALREADY_EXISTS" });
});

test(actionEvidenceTitle(
  "corpus.document-segment.create",
  ["concurrency"],
  "returns one created segment and one exact-duplicate conflict for concurrent selections"
), async () => {
  const document = await createDocument("alpha beta gamma");
  const selection = {
    base_document_revision: document.revision,
    ...segmentSelection(document.content, "beta"),
  };
  const before = (await body(await sessions.owner.request.get(segmentsPath(document.id))))
    .segments as Array<Record<string, any>>;
  const responses = await Promise.all([
    sessions.owner.request.post(segmentsPath(document.id), { data: selection }),
    sessions.owner.request.post(segmentsPath(document.id), { data: selection }),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
  const winner = responses.find((response) => response.status() === 201)!;
  const loser = responses.find((response) => response.status() === 409)!;
  const created = (await body(winner)).segment;
  expect(await body(loser)).toEqual({ ok: false, error: "SEGMENT_ALREADY_EXISTS" });

  const after = (await body(await sessions.owner.request.get(segmentsPath(document.id))))
    .segments as Array<Record<string, any>>;
  expect(after).toHaveLength(before.length + 1);
  expect(after.filter((segment) => segment.selected_text === "beta")).toEqual([
    expect.objectContaining({ id: created.id, start_char: 6, end_char: 10 }),
  ]);
});

test([
  actionEvidenceTitle("corpus.document-segment.create", ["validation"], "rejects stale document revisions before segment creation"),
  actionEvidenceTitle("corpus.document-segment.update", ["success", "persistence", "validation", "cleanup"], "persists a segment update and rejects its stale revision"),
].join(" | "), async () => {
  const document = await createDocument("alpha beta");
  const staleCreate = await sessions.owner.request.post(segmentsPath(document.id), {
    data: { base_document_revision: document.revision + 1, ...segmentSelection(document.content, "beta") },
  });
  expect(staleCreate.status()).toBe(409);
  const segment = await createSegment(document, "beta");
  const path = segmentPath(document.id, segment.id);
  const update = await sessions.editor.request.patch(path, {
    data: { base_revision: segment.revision, note: "first" },
  });
  expect(update.status()).toBe(200);
  const updated = (await body(update)).segment;
  const updateReadback = (await body(await sessions.viewer.request.get(path))).segment;
  expect(updateReadback).toMatchObject({
    id: segment.id,
    note: "first",
    revision: updated.revision,
  });
  const stale = await sessions.owner.request.patch(path, { data: { base_revision: segment.revision, note: "stale" } });
  expect(stale.status()).toBe(409);
  expect(await body(stale)).toMatchObject({ error: "SEGMENT_REVISION_CONFLICT" });
});

test([
  actionEvidenceTitle("corpus.document-segments.list", ["success", "permissions"], "allows member segment lists and denies intruders and anonymous users"),
  actionEvidenceTitle("analysis.segments.list", ["success", "permissions"], "keeps the project analysis segment list available only to members"),
  actionEvidenceTitle("corpus.document-segment.create", ["permissions"], "allows segment creation to owners and editors only"),
  actionEvidenceTitle("corpus.document-segment.update", ["permissions"], "allows segment updates to owners and editors only"),
  actionEvidenceTitle("corpus.document-segment.delete", ["permissions"], "allows segment deletion to owners and editors only"),
].join(" | "), async () => {
  const document = await createDocument("owner editor viewer delete-one delete-two");
  const analysisCollection = task10Route("/api/projects/:id/analysis/segments", {
    id: fixture!.project.id,
  });
  expect((await sessions.owner.request.get(analysisCollection)).status()).toBe(200);
  expect((await sessions.viewer.request.get(analysisCollection)).status()).toBe(200);
  expect((await sessions.intruder.request.get(analysisCollection)).status()).toBe(403);
  expect((await anonymous!.get(analysisCollection)).status()).toBe(401);
  const ownerSegment = await createSegment(document, "owner");
  const viewerSegment = await createSegment(document, "viewer");
  const collection = segmentsPath(document.id);
  const item = segmentPath(document.id, viewerSegment.id);

  expect((await sessions.owner.request.get(collection)).status()).toBe(200);
  expect((await sessions.editor.request.get(item)).status()).toBe(200);
  expect((await sessions.viewer.request.get(collection)).status()).toBe(200);
  expect((await sessions.intruder.request.get(collection)).status()).toBe(403);
  expect((await anonymous!.get(item)).status()).toBe(401);

  const editorCreate = await sessions.editor.request.post(collection, {
    data: { base_document_revision: document.revision, ...segmentSelection(document.content, "editor") },
  });
  expect(editorCreate.status()).toBe(201);
  const editorSegment = (await body(editorCreate)).segment;
  for (const response of [
    await sessions.viewer.request.post(collection, { data: { base_document_revision: 0, start_char: 0, end_char: 5, selected_text: "owner" } }),
    await sessions.intruder.request.post(collection, { data: { base_document_revision: 0, start_char: 0, end_char: 5, selected_text: "owner" } }),
  ]) expect(response.status()).toBe(403);
  expect((await anonymous!.post(collection, { data: {} })).status()).toBe(401);

  expect((await sessions.owner.request.patch(segmentPath(document.id, ownerSegment.id), { data: { base_revision: ownerSegment.revision, note: "owner" } })).status()).toBe(200);
  expect((await sessions.editor.request.patch(segmentPath(document.id, editorSegment.id), { data: { base_revision: editorSegment.revision, note: "editor" } })).status()).toBe(200);
  expect((await sessions.viewer.request.patch(item, { data: { base_revision: 0, note: "denied" } })).status()).toBe(403);
  expect((await sessions.intruder.request.patch(item, { data: { base_revision: 0, note: "denied" } })).status()).toBe(403);
  expect((await anonymous!.patch(item, { data: {} })).status()).toBe(401);

  const ownerDelete = await createSegment(document, "delete-one");
  const editorDelete = await createSegment(document, "delete-two");
  expect((await sessions.owner.request.delete(segmentPath(document.id, ownerDelete.id))).status()).toBe(200);
  expect((await sessions.editor.request.delete(segmentPath(document.id, editorDelete.id))).status()).toBe(200);
  expect((await sessions.viewer.request.delete(item)).status()).toBe(403);
  expect((await sessions.intruder.request.delete(item)).status()).toBe(403);
  expect((await anonymous!.delete(item)).status()).toBe(401);
});

test([
  actionEvidenceTitle("corpus.document-segment.update", ["validation"], "rejects a foreign segment identifier for updates"),
  actionEvidenceTitle("corpus.document-segment.delete", ["validation"], "rejects a foreign segment identifier for deletion"),
].join(" | "), async () => {
  const localDocument = await createDocument("local text");
  const foreign = await createQaProjectFixture(sessions);
  try {
    const foreignDocument = await createDocument("foreign evidence", foreign.project.id, foreign.marker);
    const foreignSegment = await createSegment(foreignDocument, "evidence", 0, foreign.project.id);
    expect((await sessions.owner.request.get(segmentsPath(foreignDocument.id))).status()).toBe(404);

    const crossed = segmentPath(localDocument.id, foreignSegment.id);
    expect((await sessions.owner.request.get(crossed)).status()).toBe(404);
    expect((await sessions.owner.request.patch(crossed, { data: { base_revision: foreignSegment.revision, note: "crossed" } })).status()).toBe(404);
    expect((await sessions.owner.request.delete(crossed)).status()).toBe(404);

    const proof = (await body(await sessions.owner.request.get(
      segmentPath(foreignDocument.id, foreignSegment.id, foreign.project.id)
    ))).segment;
    expect(proof).toMatchObject({
      id: foreignSegment.id,
      selected_text: foreignSegment.selected_text,
      revision: foreignSegment.revision,
    });
    expect(proof.note).toBe(foreignSegment.note);
  } finally { await foreign.cleanup(); }
});

test(actionEvidenceTitle(
  "corpus.document-segment.delete",
  ["success", "persistence", "cleanup"],
  "soft deletes the exact disposable segment and blocks stale item mutations"
), async () => {
  const document = await createDocument("delete this evidence");
  const segment = await createSegment(document, "this evidence");
  const path = segmentPath(document.id, segment.id);
  expect((await sessions.editor.request.delete(path)).status()).toBe(200);
  expect((await sessions.owner.request.get(path)).status()).toBe(404);
  expect((await sessions.owner.request.patch(path, { data: { base_revision: segment.revision, note: "stale" } })).status()).toBe(404);
});

test("deleted documents do not remain mutable through analysis routes", async () => {
  const document = await createDocument("deleted evidence");
  const segment = await createSegment(document, "evidence");
  expect((await sessions.owner.request.delete(documentPath(document.id))).status()).toBe(200);
  const collection = segmentsPath(document.id);
  expect((await sessions.owner.request.get(collection)).status()).toBe(404);
  expect((await sessions.owner.request.post(collection, { data: { base_document_revision: document.revision, ...segmentSelection(document.content, "deleted") } })).status()).toBe(404);
  expect((await sessions.owner.request.patch(segmentPath(document.id, segment.id), { data: { base_revision: segment.revision, note: "must fail" } })).status()).toBe(404);
});
