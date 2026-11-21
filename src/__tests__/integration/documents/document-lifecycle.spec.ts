import {
  expect,
  request,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import {
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  closeQaSessions,
  createQaSessions,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import {
  closeTask9Resources,
  materializeRoute,
  readJsonObject,
} from "@/__tests__/integration/documents/task9-test-helpers";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";

export const BACKEND_ROUTE_COVERAGE = [
  ["POST", "/api/projects/:id/documents/:documentId/duplicate"],
  ["POST", "/api/projects/:id/documents/:documentId/restore"],
  ["GET", "/api/projects/:id/documents/trash"],
] as const;

type Document = {
  id: string;
  project_id: string;
  title: string;
  content: string;
  document_type: string;
  source_id: string | null;
  participant_id: string | null;
  status: string;
  metadata: Record<string, unknown>;
  revision: number;
  deleted_at: string | null;
};
type ApiBody = {
  ok: boolean;
  error: string;
  document: Document;
  documents: Document[];
};

let sessions: QaSessions | undefined;
let fixture: QaProjectFixture | undefined;
let anonymous: APIRequestContext | undefined;
let sequence = 0;

function collectionPath(id = fixture!.project.id): string {
  return materializeRoute("/api/projects/:id/documents", { id });
}

function itemPath(documentId: string, id = fixture!.project.id): string {
  return materializeRoute("/api/projects/:id/documents/:documentId", {
    id,
    documentId,
  });
}

function lifecyclePath(documentId: string, action: "duplicate" | "restore", id = fixture!.project.id) {
  return `${itemPath(documentId, id)}/${action}`;
}

async function body(response: APIResponse): Promise<ApiBody> {
  return (await readJsonObject(response)) as ApiBody;
}

async function createDocument(
  data: Record<string, unknown> = {},
  id = fixture!.project.id
): Promise<Document> {
  sequence += 1;
  const response = await sessions!.owner.request.post(collectionPath(id), {
    data: {
      title: `lifecycle ${fixture!.marker.slice(-8)} ${sequence}`,
      content: "contenido de ciclo",
      ...data,
    },
  });
  const responseBody = await body(response);
  expect(response.status(), JSON.stringify(responseBody)).toBe(201);
  return responseBody.document as Document;
}

async function defaultSourceId(): Promise<string> {
  const response = await sessions!.owner.request.get(`${collectionPath()}/sources`);
  const sources = (await readJsonObject(response)).sources as Array<{
    id: string;
    is_default: boolean;
  }>;
  return sources.find((source) => source.is_default)!.id;
}

async function createParticipant(): Promise<string> {
  sequence += 1;
  const response = await sessions!.owner.request.post(
    materializeRoute("/api/projects/:id/participants", { id: fixture!.project.id }),
    { data: { alias: `duplicate-ref ${fixture!.marker.slice(-8)} ${sequence}` } }
  );
  expect(response.status()).toBe(201);
  return ((await readJsonObject(response)).participant as { id: string }).id;
}

test.beforeAll(async ({ baseURL }) => {
  sessions = await createQaSessions();
  anonymous = await request.newContext({ baseURL });
  fixture = await createQaProjectFixture(sessions);
  expect(fixture.registry.get("project", fixture.project.id)?.marker).toBe(fixture.marker);
});

test.afterAll(async () => {
  await closeTask9Resources({ fixture, anonymous, sessions, closeSessions: closeQaSessions });
  fixture = undefined;
  anonymous = undefined;
  sessions = undefined;
});

test(actionEvidenceTitle(
  "corpus.document.duplicate",
  ["success", "persistence", "cleanup"],
  "duplicates content, status, references, and metadata into an independently readable document"
), async () => {
  const sourceId = await defaultSourceId();
  const participantId = await createParticipant();
  const original = await createDocument({
    document_type: "focus_group",
    status: "ready_for_coding",
    source_id: sourceId,
    participant_id: participantId,
    metadata: { wave: 3, nested: { site: "north" } },
  });
  const response = await sessions!.editor.request.post(lifecyclePath(original.id, "duplicate"));
  const duplicate = (await body(response)).document as Document;
  expect(response.status()).toBe(201);
  expect(duplicate).toMatchObject({
    project_id: original.project_id,
    title: `${original.title} (copia)`,
    content: original.content,
    document_type: original.document_type,
    source_id: original.source_id,
    participant_id: original.participant_id,
    status: original.status,
    metadata: {
      wave: 3,
      nested: { site: "north" },
      duplicated_from_document_id: original.id,
    },
    deleted_at: null,
  });
  expect(duplicate.id).not.toBe(original.id);
  const duplicateReadback = (await body(await sessions!.viewer.request.get(itemPath(duplicate.id)))).document;
  expect(duplicateReadback).toMatchObject({
    id: duplicate.id,
    content: original.content,
    metadata: expect.objectContaining({ duplicated_from_document_id: original.id }),
  });

  const changed = await sessions!.owner.request.patch(itemPath(duplicate.id), {
    data: { base_revision: duplicate.revision, content: "duplicate changed" },
  });
  expect(changed.status()).toBe(200);
  expect((await body(await sessions!.viewer.request.get(itemPath(original.id)))).document.content)
    .toBe(original.content);
});

test([
  actionEvidenceTitle("corpus.document.delete", ["success", "persistence", "cleanup"], "soft deletes the exact disposable document and hides it from active reads"),
  actionEvidenceTitle("corpus.trash.read", ["success"], "lists the deleted document only through the trash collection"),
  actionEvidenceTitle("corpus.document.restore", ["success", "persistence"], "restores the exact deleted document to active reads"),
].join(" | "), async () => {
  const document = await createDocument({ title: `trash needle ${sequence}` });
  const remove = await sessions!.editor.request.delete(itemPath(document.id));
  expect(remove.status()).toBe(200);
  expect((await body(remove)).document).toMatchObject({
    id: document.id,
    deleted_at: expect.any(String),
  });
  expect((await sessions!.viewer.request.get(itemPath(document.id))).status()).toBe(404);

  const activeList = (await body(await sessions!.viewer.request.get(
    `${collectionPath()}?search=${encodeURIComponent(document.title)}`
  ))).documents as Document[];
  expect(activeList).toEqual([]);
  const trashPath = `${collectionPath()}/trash?search=${encodeURIComponent(document.title)}`;
  const trash = (await body(await sessions!.viewer.request.get(trashPath))).documents as Document[];
  expect(trash).toEqual([expect.objectContaining({ id: document.id, deleted_at: expect.any(String) })]);

  expect((await sessions!.owner.request.delete(itemPath(document.id))).status()).toBe(404);
  const restore = await sessions!.owner.request.post(lifecyclePath(document.id, "restore"));
  expect(restore.status()).toBe(200);
  expect((await body(restore)).document).toMatchObject({ id: document.id, deleted_at: null });
  expect((await sessions!.owner.request.post(lifecyclePath(document.id, "restore"))).status()).toBe(404);
  expect((await sessions!.viewer.request.get(itemPath(document.id))).status()).toBe(200);
});

test(actionEvidenceTitle(
  "corpus.document.duplicate",
  ["validation"],
  "rejects duplicate requests for a deleted document"
), async () => {
  const document = await createDocument();
  expect((await sessions!.owner.request.delete(itemPath(document.id))).status()).toBe(200);
  expect((await sessions!.owner.request.post(lifecyclePath(document.id, "duplicate"))).status()).toBe(404);
});

test(actionEvidenceTitle(
  "corpus.document.duplicate",
  ["duplicate", "concurrency"],
  "persists two independent duplicate requests as distinct listed copies"
), async () => {
  const original = await createDocument({ content: "double-click duplicate sentinel" });
  const before = (await body(await sessions!.owner.request.get(collectionPath()))).documents as Document[];
  const responses = await Promise.all([
    sessions!.owner.request.post(lifecyclePath(original.id, "duplicate")),
    sessions!.owner.request.post(lifecyclePath(original.id, "duplicate")),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([201, 201]);
  const copies = await Promise.all(responses.map(async (response) => (await body(response)).document));
  const copyIds = new Set(copies.map((copy) => copy.id));
  expect(copyIds.size).toBe(2);
  expect(copies).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: copies[0]!.id, content: "double-click duplicate sentinel" }),
    expect.objectContaining({ id: copies[1]!.id, content: "double-click duplicate sentinel" }),
  ]));

  const after = (await body(await sessions!.owner.request.get(collectionPath()))).documents as Document[];
  const beforeIds = new Set(before.map((document) => document.id));
  const added = after.filter((document) => !beforeIds.has(document.id));
  const created = after.filter((document) =>
    document.metadata.duplicated_from_document_id === original.id
  );
  expect(added).toHaveLength(2);
  expect(new Set(added.map((document) => document.id))).toEqual(copyIds);
  expect(created).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: copies[0]!.id }),
    expect.objectContaining({ id: copies[1]!.id }),
  ]));
  expect(after).toEqual(expect.arrayContaining(before));
});

test(actionEvidenceTitle(
  "corpus.document.restore",
  ["duplicate", "concurrency", "cleanup"],
  "returns one restored document and one not-deleted response for concurrent restores"
), async () => {
  const document = await createDocument({ title: "double-click restore sentinel" });
  expect((await sessions!.owner.request.delete(itemPath(document.id))).status()).toBe(200);
  const responses = await Promise.all([
    sessions!.owner.request.post(lifecyclePath(document.id, "restore")),
    sessions!.owner.request.post(lifecyclePath(document.id, "restore")),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([200, 404]);
  const winner = responses.find((response) => response.status() === 200)!;
  const loser = responses.find((response) => response.status() === 404)!;
  expect((await body(winner)).document).toMatchObject({ id: document.id, deleted_at: null });
  expect(await body(loser)).toEqual({
    ok: false,
    error: "DOCUMENT_NOT_FOUND_OR_NOT_DELETED",
  });

  const active = (await body(await sessions!.owner.request.get(
    `${collectionPath()}?search=${encodeURIComponent(document.title)}`
  ))).documents as Document[];
  expect(active).toEqual([expect.objectContaining({ id: document.id, deleted_at: null })]);
  const trash = (await body(await sessions!.owner.request.get(
    `${collectionPath()}/trash?search=${encodeURIComponent(document.title)}`
  ))).documents as Document[];
  expect(trash).toEqual([]);
});

test([
  actionEvidenceTitle("corpus.trash.read", ["permissions"], "allows member trash reads and denies intruders and anonymous users"),
  actionEvidenceTitle("corpus.document.duplicate", ["permissions"], "allows duplicate requests to owners and editors only"),
  actionEvidenceTitle("corpus.document.restore", ["permissions"], "allows restore requests to owners and editors only"),
].join(" | "), async () => {
  const document = await createDocument();
  expect((await sessions!.owner.request.get(`${collectionPath()}/trash`)).status()).toBe(200);
  expect((await sessions!.editor.request.get(`${collectionPath()}/trash`)).status()).toBe(200);
  expect((await sessions!.viewer.request.get(`${collectionPath()}/trash`)).status()).toBe(200);
  expect((await sessions!.intruder.request.get(`${collectionPath()}/trash`)).status()).toBe(403);
  expect((await anonymous!.get(`${collectionPath()}/trash`)).status()).toBe(401);

  expect((await sessions!.owner.request.post(lifecyclePath(document.id, "duplicate"))).status()).toBe(201);
  expect((await sessions!.editor.request.post(lifecyclePath(document.id, "duplicate"))).status()).toBe(201);
  expect((await sessions!.viewer.request.post(lifecyclePath(document.id, "duplicate"))).status()).toBe(403);
  expect((await sessions!.intruder.request.post(lifecyclePath(document.id, "duplicate"))).status()).toBe(403);
  expect((await anonymous!.post(lifecyclePath(document.id, "duplicate"))).status()).toBe(401);

  expect((await sessions!.owner.request.delete(itemPath(document.id))).status()).toBe(200);
  expect((await sessions!.viewer.request.post(lifecyclePath(document.id, "restore"))).status()).toBe(403);
  expect((await sessions!.intruder.request.post(lifecyclePath(document.id, "restore"))).status()).toBe(403);
  expect((await anonymous!.post(lifecyclePath(document.id, "restore"))).status()).toBe(401);

  const ownerRestore = await createDocument();
  const editorRestore = await createDocument();
  expect((await sessions!.owner.request.delete(itemPath(ownerRestore.id))).status()).toBe(200);
  expect((await sessions!.owner.request.delete(itemPath(editorRestore.id))).status()).toBe(200);
  expect((await sessions!.owner.request.post(lifecyclePath(ownerRestore.id, "restore"))).status()).toBe(200);
  expect((await sessions!.editor.request.post(lifecyclePath(editorRestore.id, "restore"))).status()).toBe(200);
});

test([
  actionEvidenceTitle("corpus.document.duplicate", ["validation"], "rejects a foreign document identifier for duplication"),
  actionEvidenceTitle("corpus.document.restore", ["validation"], "rejects a foreign document identifier for restoration"),
].join(" | "), async () => {
  const foreign = await createQaProjectFixture(sessions!);
  try {
    const foreignDocument = await createDocument({ title: `foreign lifecycle ${sequence}` }, foreign.project.id);
    expect((await sessions!.owner.request.post(lifecyclePath(foreignDocument.id, "duplicate"))).status()).toBe(404);
    expect((await sessions!.owner.request.delete(itemPath(foreignDocument.id, foreign.project.id))).status()).toBe(200);
    expect((await sessions!.owner.request.post(lifecyclePath(foreignDocument.id, "restore"))).status()).toBe(404);

    const localTrash = (await body(await sessions!.owner.request.get(
      `${collectionPath()}/trash?search=${encodeURIComponent(foreignDocument.title)}`
    ))).documents as Document[];
    expect(localTrash).toEqual([]);

    const proof = (await body(await sessions!.owner.request.get(
      `${collectionPath(foreign.project.id)}/trash?search=${encodeURIComponent(foreignDocument.title)}`
    ))).documents as Document[];
    expect(proof).toEqual([expect.objectContaining({ id: foreignDocument.id })]);
  } finally {
    await foreign.cleanup();
  }
});
