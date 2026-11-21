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
  ["GET", "/api/projects/:id/documents/:documentId/versions"],
  ["POST", "/api/projects/:id/documents/:documentId/versions"],
  ["GET", "/api/projects/:id/documents/:documentId/versions/:versionId"],
  ["POST", "/api/projects/:id/documents/:documentId/versions/:versionId/restore"],
] as const;

type Document = { id: string; title: string; content: string; revision: number };
type Version = {
  id: string;
  document_id: string;
  version_number: number;
  label: string | null;
  trigger_type: string;
  snapshot_title: string;
  snapshot_content?: string;
  snapshot_revision: number;
};
type ApiBody = {
  ok: boolean;
  error: string;
  document: Document;
  version: Version;
  versions: Version[];
};

let sessions: QaSessions | undefined;
let fixture: QaProjectFixture | undefined;
let anonymous: APIRequestContext | undefined;
let sequence = 0;

function route(template: string, params: Record<string, string>): string {
  return materializeRoute(template, params);
}

function documentPath(documentId: string, id = fixture!.project.id): string {
  return route("/api/projects/:id/documents/:documentId", { id, documentId });
}

function versionsPath(documentId: string, id = fixture!.project.id): string {
  return route("/api/projects/:id/documents/:documentId/versions", {
    id,
    documentId,
  });
}

function versionPath(documentId: string, versionId: string, id = fixture!.project.id): string {
  return route("/api/projects/:id/documents/:documentId/versions/:versionId", {
    id,
    documentId,
    versionId,
  });
}

async function body(response: APIResponse): Promise<ApiBody> {
  return (await readJsonObject(response)) as ApiBody;
}

async function createDocument(
  data: Record<string, unknown> = {},
  id = fixture!.project.id
): Promise<Document> {
  sequence += 1;
  const response = await sessions!.owner.request.post(
    route("/api/projects/:id/documents", { id }),
    { data: { title: `version-doc ${fixture!.marker.slice(-8)} ${sequence}`, ...data } }
  );
  expect(response.status(), JSON.stringify(await body(response))).toBe(201);
  return (await body(response)).document as Document;
}

async function createVersion(
  documentId: string,
  data: Record<string, unknown> = {},
  id = fixture!.project.id
): Promise<Version> {
  const response = await sessions!.owner.request.post(versionsPath(documentId, id), { data });
  expect(response.status(), JSON.stringify(await body(response))).toBe(201);
  return (await body(response)).version as Version;
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

test([
  actionEvidenceTitle("corpus.document-version.create", ["success", "persistence", "cleanup"], "creates independently readable manual versions"),
  actionEvidenceTitle("corpus.document-versions.list", ["success"], "lists and paginates manual versions"),
  actionEvidenceTitle("corpus.document-version.read", ["success"], "reads an exact manual-version snapshot"),
].join(" | "), async () => {
  const document = await createDocument({ content: "versión uno" });
  const first = await createVersion(document.id, { label: "  corte inicial  " });
  expect(first).toMatchObject({
    document_id: document.id,
    label: "corte inicial",
    trigger_type: "manual",
    snapshot_title: document.title,
    snapshot_revision: document.revision,
  });

  const detailResponse = await sessions!.viewer.request.get(versionPath(document.id, first.id));
  expect(detailResponse.status()).toBe(200);
  expect((await body(detailResponse)).version).toMatchObject({
    id: first.id,
    snapshot_content: "versión uno",
  });

  await createVersion(document.id, { label: "second" });
  const page = (await body(await sessions!.viewer.request.get(
    `${versionsPath(document.id)}?limit=1&offset=1`
  ))).versions as Version[];
  expect(page).toHaveLength(1);
  expect(page[0]!.id).toBe(first.id);
  expect(page[0]).not.toHaveProperty("snapshot_content");
});

test(actionEvidenceTitle(
  "corpus.document-version.create",
  ["validation"],
  "rejects a malformed manual-version label"
), async () => {
  const document = await createDocument();
  const response = await sessions!.owner.request.post(versionsPath(document.id), {
    data: { label: 42 },
  });
  expect(response.status()).toBe(400);
  expect(await body(response)).toMatchObject({ ok: false, error: expect.any(String) });
});

test(actionEvidenceTitle(
  "corpus.document-version.restore",
  ["success", "persistence", "cleanup"],
  "restores the requested version and persists one backup of the replaced document"
), async () => {
  const document = await createDocument({ title: `original ${sequence}`, content: "original" });
  const version = await createVersion(document.id, { label: "restore target" });
  const updateResponse = await sessions!.editor.request.patch(documentPath(document.id), {
    data: {
      base_revision: document.revision,
      title: `changed ${sequence}`,
      content: "changed",
    },
  });
  const changed = (await body(updateResponse)).document as Document;

  const restorePath = `${versionPath(document.id, version.id)}/restore`;
  const restoreResponse = await sessions!.owner.request.post(restorePath, {
    data: { base_revision: changed.revision },
  });
  expect(restoreResponse.status()).toBe(200);
  const restored = (await body(restoreResponse)).document as Document;
  expect(restored).toMatchObject({ title: document.title, content: "original" });
  expect(restored.revision).toBeGreaterThan(changed.revision);
  const restoredReadback = (await body(await sessions!.viewer.request.get(
    documentPath(document.id)
  ))).document;
  expect(restoredReadback).toMatchObject({
    id: document.id,
    title: document.title,
    content: "original",
    revision: restored.revision,
  });

  const versions = (await body(
    await sessions!.owner.request.get(versionsPath(document.id))
  )).versions as Version[];
  expect(versions).toEqual(expect.arrayContaining([
    expect.objectContaining({ trigger_type: "before_restore", snapshot_title: changed.title }),
  ]));
});

test(actionEvidenceTitle(
  "corpus.document-version.restore",
  ["validation"],
  "rejects a stale version restore before changing document state"
), async () => {
  const document = await createDocument({ content: "snapshot" });
  const version = await createVersion(document.id);
  const updated = (await body(await sessions!.owner.request.patch(documentPath(document.id), {
    data: { base_revision: document.revision, content: "current" },
  }))).document as Document;

  const stale = await sessions!.owner.request.post(`${versionPath(document.id, version.id)}/restore`, {
    data: { base_revision: document.revision },
  });
  expect(stale.status()).toBe(409);
  expect(await body(stale)).toMatchObject({ error: "DOCUMENT_REVISION_CONFLICT" });
  expect((await body(await sessions!.owner.request.get(documentPath(document.id)))).document)
    .toMatchObject({ content: "current", revision: updated.revision });
});

test("creates two bounded concurrent versions with unique sequence numbers", async () => {
  const document = await createDocument({ content: "concurrent snapshot" });
  const responses = await Promise.all([
    sessions!.owner.request.post(versionsPath(document.id), { data: { label: "race a" } }),
    sessions!.editor.request.post(versionsPath(document.id), { data: { label: "race b" } }),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([201, 201]);
  const versions = await Promise.all(responses.map(async (response) => (await body(response)).version as Version));
  expect(new Set(versions.map((version) => version.id)).size).toBe(2);
  expect(new Set(versions.map((version) => version.version_number)).size).toBe(2);
});

test([
  actionEvidenceTitle("corpus.document-versions.list", ["permissions"], "allows member version lists and denies intruders and anonymous users"),
  actionEvidenceTitle("corpus.document-version.read", ["permissions"], "allows member version detail reads and denies intruders and anonymous users"),
  actionEvidenceTitle("corpus.document-version.create", ["permissions"], "allows version creation to owners and editors only"),
  actionEvidenceTitle("corpus.document-version.restore", ["permissions"], "allows version restore to owners and editors only"),
].join(" | "), async () => {
  const localDocument = await createDocument();
  const localVersion = await createVersion(localDocument.id);
  expect((await sessions!.owner.request.get(versionsPath(localDocument.id))).status()).toBe(200);
  expect((await sessions!.editor.request.get(versionPath(localDocument.id, localVersion.id))).status()).toBe(200);
  expect((await sessions!.viewer.request.get(versionsPath(localDocument.id))).status()).toBe(200);
  expect((await sessions!.intruder.request.get(versionsPath(localDocument.id))).status()).toBe(403);
  expect((await anonymous!.get(versionsPath(localDocument.id))).status()).toBe(401);

  expect((await sessions!.owner.request.post(versionsPath(localDocument.id), { data: {} })).status()).toBe(201);
  expect((await sessions!.editor.request.post(versionsPath(localDocument.id), { data: {} })).status()).toBe(201);
  expect((await sessions!.viewer.request.post(versionsPath(localDocument.id), { data: {} })).status()).toBe(403);
  expect((await sessions!.intruder.request.post(versionsPath(localDocument.id), { data: {} })).status()).toBe(403);
  expect((await anonymous!.post(versionsPath(localDocument.id), { data: {} })).status()).toBe(401);

  const ownerRestoreDocument = await createDocument({ content: "owner restore" });
  const ownerRestoreVersion = await createVersion(ownerRestoreDocument.id);
  const editorRestoreDocument = await createDocument({ content: "editor restore" });
  const editorRestoreVersion = await createVersion(editorRestoreDocument.id);
  expect((await sessions!.owner.request.post(
    `${versionPath(ownerRestoreDocument.id, ownerRestoreVersion.id)}/restore`,
    { data: { base_revision: ownerRestoreDocument.revision } }
  )).status()).toBe(200);
  expect((await sessions!.editor.request.post(
    `${versionPath(editorRestoreDocument.id, editorRestoreVersion.id)}/restore`,
    { data: { base_revision: editorRestoreDocument.revision } }
  )).status()).toBe(200);
  expect((await sessions!.viewer.request.post(`${versionPath(localDocument.id, localVersion.id)}/restore`, {
    data: { base_revision: localDocument.revision },
  })).status()).toBe(403);
  expect((await sessions!.intruder.request.post(`${versionPath(localDocument.id, localVersion.id)}/restore`, {
    data: { base_revision: localDocument.revision },
  })).status()).toBe(403);
  expect((await anonymous!.post(`${versionPath(localDocument.id, localVersion.id)}/restore`, {
    data: { base_revision: localDocument.revision },
  })).status()).toBe(401);
});

test([
  actionEvidenceTitle("corpus.document-versions.list", ["validation"], "rejects a foreign document identifier for version lists"),
  actionEvidenceTitle("corpus.document-version.read", ["validation"], "rejects a foreign version identifier for reads"),
  actionEvidenceTitle("corpus.document-version.restore", ["validation"], "rejects a foreign version identifier for restore"),
].join(" | "), async () => {
  const localDocument = await createDocument();
  const foreign = await createQaProjectFixture(sessions!);
  try {
    const foreignDocument = await createDocument({}, foreign.project.id);
    const foreignVersion = await createVersion(foreignDocument.id, {}, foreign.project.id);
    expect((await sessions!.owner.request.get(versionsPath(foreignDocument.id))).status()).toBe(404);
    expect((await sessions!.owner.request.get(versionPath(localDocument.id, foreignVersion.id))).status()).toBe(404);
    expect((await sessions!.owner.request.post(`${versionPath(localDocument.id, foreignVersion.id)}/restore`, {
      data: { base_revision: localDocument.revision },
    })).status()).toBe(404);
  } finally {
    await foreign.cleanup();
  }
});

test(actionEvidenceTitle(
  "corpus.document-version.create",
  ["duplicate", "concurrency"],
  "persists two independent same-payload manual snapshots as distinct listed versions"
), async () => {
  const document = await createDocument({ content: "same immutable snapshot" });
  const before = (await body(await sessions!.owner.request.get(versionsPath(document.id))))
    .versions as Version[];
  const responses = await Promise.all([
    sessions!.owner.request.post(versionsPath(document.id), { data: { label: "same" } }),
    sessions!.owner.request.post(versionsPath(document.id), { data: { label: "same" } }),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([201, 201]);
  const created = await Promise.all(responses.map(async (response) => (await body(response)).version));
  const createdIds = new Set(created.map((version) => version.id));
  expect(createdIds.size).toBe(2);

  const after = (await body(await sessions!.owner.request.get(versionsPath(document.id))))
    .versions as Version[];
  const beforeIds = new Set(before.map((version) => version.id));
  const added = after.filter((version) => !beforeIds.has(version.id));
  expect(added).toHaveLength(2);
  expect(new Set(added.map((version) => version.id))).toEqual(createdIds);
  expect(added).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: created[0]!.id, label: "same", snapshot_revision: document.revision }),
    expect.objectContaining({ id: created[1]!.id, label: "same", snapshot_revision: document.revision }),
  ]));
  expect(after).toEqual(expect.arrayContaining(before));
});

test(actionEvidenceTitle(
  "corpus.document-version.restore",
  ["duplicate", "concurrency"],
  "makes two same-revision restores yield one winner and one conflict with one backup"
), async () => {
  const document = await createDocument({ content: "atomic target" });
  const version = await createVersion(document.id);
  const changed = (await body(await sessions!.owner.request.patch(documentPath(document.id), {
    data: { base_revision: document.revision, content: "race current" },
  }))).document as Document;
  const restorePath = `${versionPath(document.id, version.id)}/restore`;
  const before = (await body(await sessions!.owner.request.get(versionsPath(document.id))))
    .versions as Version[];

  const responses = await Promise.all([
    sessions!.owner.request.post(restorePath, { data: { base_revision: changed.revision } }),
    sessions!.editor.request.post(restorePath, { data: { base_revision: changed.revision } }),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
  const conflict = responses.find((response) => response.status() === 409)!;
  expect(await body(conflict)).toEqual({
    ok: false,
    error: "DOCUMENT_REVISION_CONFLICT",
  });
  const terminal = (await body(await sessions!.owner.request.get(documentPath(document.id)))).document;
  expect(terminal).toMatchObject({
    id: document.id,
    title: document.title,
    content: "atomic target",
    revision: changed.revision + 1,
  });
  const versions = (await body(await sessions!.owner.request.get(versionsPath(document.id))))
    .versions as Version[];
  expect(versions).toHaveLength(before.length + 1);
  const beforeIds = new Set(before.map((item) => item.id));
  const created = versions.filter((item) => !beforeIds.has(item.id));
  expect(created).toHaveLength(1);
  expect(versions).toEqual(expect.arrayContaining(before));
  const [createdBackup] = created;
  expect(createdBackup).toMatchObject({ snapshot_title: changed.title });
  expect(createdBackup!.trigger_type).toBe("before_restore");
  const backupDetail = (await body(await sessions!.owner.request.get(
    versionPath(document.id, createdBackup!.id)
  ))).version;
  expect(backupDetail).toMatchObject({ snapshot_content: "race current" });
});
