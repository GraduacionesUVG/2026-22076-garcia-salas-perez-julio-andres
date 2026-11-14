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
  documentEditPreservesSegmentIntegrity,
  materializeRoute,
  readJsonObject,
} from "@/__tests__/integration/documents/task9-test-helpers";
import { DocumentCreateSchema } from "@/src/modules/documents/documents.schema";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects/:id/documents"],
  ["POST", "/api/projects/:id/documents"],
  ["GET", "/api/projects/:id/documents/:documentId"],
  ["PATCH", "/api/projects/:id/documents/:documentId"],
  ["DELETE", "/api/projects/:id/documents/:documentId"],
  ["GET", "/api/projects/:id/documents/stats"],
] as const;

const DOCUMENT_TYPES = [
  "interview",
  "focus_group",
  "field_note",
  "observation",
  "diary",
  "archival_document",
  "open_text",
  "other",
] as const;
const DOCUMENT_STATUSES = [
  "draft",
  "transcribed",
  "cleaned",
  "reviewed",
  "ready_for_coding",
  "archived",
] as const;

type Document = {
  id: string;
  project_id: string;
  title: string;
  content: string;
  document_type: (typeof DOCUMENT_TYPES)[number];
  status: (typeof DOCUMENT_STATUSES)[number];
  source_id: string | null;
  participant_id: string | null;
  interview_date: string | null;
  field_date: string | null;
  location: string;
  language: string;
  notes: string;
  metadata: Record<string, unknown>;
  revision: number;
  deleted_at: string | null;
};

type ApiBody = {
  ok: boolean;
  error: string;
  document: Document;
  documents: Document[];
  participant: { id: string };
  sources: Array<{ id: string; is_default: boolean }>;
  stats: Record<string, unknown>;
  segment: Record<string, unknown>;
};

let sessions: QaSessions | undefined;
let fixture: QaProjectFixture | undefined;
let anonymous: APIRequestContext | undefined;
let sequence = 0;

function projectId(): string {
  return fixture!.project.id;
}

function documentsPath(id = projectId()): string {
  return materializeRoute("/api/projects/:id/documents", { id });
}

function documentPath(documentId: string, id = projectId()): string {
  return materializeRoute("/api/projects/:id/documents/:documentId", {
    id,
    documentId,
  });
}

function uniqueTitle(label: string): string {
  sequence += 1;
  return `${label} ${fixture!.marker.slice(-8)} ${sequence}`;
}

async function body(response: APIResponse): Promise<ApiBody> {
  return (await readJsonObject(response)) as ApiBody;
}

async function createDocument(
  data: Record<string, unknown> = {},
  id = projectId()
): Promise<Document> {
  const response = await sessions!.owner.request.post(documentsPath(id), {
    data: { title: uniqueTitle("document"), ...data },
  });
  const responseBody = await body(response);
  expect(response.status(), JSON.stringify(responseBody)).toBe(201);
  expect(responseBody).toMatchObject({
    ok: true,
    document: { id: expect.any(String), project_id: id },
  });
  return responseBody.document as Document;
}

async function defaultSourceId(id = projectId()): Promise<string> {
  const response = await sessions!.owner.request.get(
    materializeRoute("/api/projects/:id/documents/sources", { id })
  );
  const sources = (await body(response)).sources as Array<{
    id: string;
    is_default: boolean;
  }>;
  return sources.find((source) => source.is_default)!.id;
}

async function createParticipant(id = projectId()): Promise<string> {
  const response = await sessions!.owner.request.post(
    materializeRoute("/api/projects/:id/participants", { id }),
    { data: { alias: uniqueTitle("participant") } }
  );
  expect(response.status()).toBe(201);
  return ((await body(response)).participant as { id: string }).id;
}

test.beforeAll(async ({ baseURL }) => {
  sessions = await createQaSessions();
  anonymous = await request.newContext({ baseURL });
  fixture = await createQaProjectFixture(sessions);
  expect(fixture.registry.get("project", fixture.project.id)).toEqual({
    kind: "project",
    id: fixture.project.id,
    marker: fixture.marker,
  });
});

test.afterAll(async () => {
  await closeTask9Resources({
    fixture,
    anonymous,
    sessions,
    closeSessions: closeQaSessions,
  });
  fixture = undefined;
  anonymous = undefined;
  sessions = undefined;
});

test([
  actionEvidenceTitle("corpus.document.create", ["success", "persistence", "cleanup"], "creates every document type and status in the disposable project"),
  actionEvidenceTitle("corpus.document.read", ["success"], "reads each created document with its exact type and status"),
].join(" | "), async () => {
  for (const [index, documentType] of DOCUMENT_TYPES.entries()) {
    const status = DOCUMENT_STATUSES[index % DOCUMENT_STATUSES.length]!;
    const document = await createDocument({
      document_type: documentType,
      status,
      content: `contenido ${documentType}`,
    });
    expect(document).toMatchObject({ document_type: documentType, status });
    expect((await body(await sessions!.viewer.request.get(documentPath(document.id)))).document)
      .toMatchObject({ id: document.id, document_type: documentType, status });
  }
});

test(actionEvidenceTitle(
  "corpus.document.create",
  ["duplicate", "concurrency"],
  "persists two independent same-payload document creates as distinct listed rows"
), async () => {
  const title = uniqueTitle("double-click create");
  const payload = { title, content: "double-click create sentinel" };
  const before = (await body(await sessions!.owner.request.get(documentsPath()))).documents as Document[];
  const responses = await Promise.all([
    sessions!.owner.request.post(documentsPath(), { data: payload }),
    sessions!.owner.request.post(documentsPath(), { data: payload }),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([201, 201]);
  const created = await Promise.all(responses.map(async (response) => (await body(response)).document));
  const createdIds = new Set(created.map((document) => document.id));
  expect(createdIds.size).toBe(2);
  expect(created).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: created[0]!.id, title, content: "double-click create sentinel" }),
    expect.objectContaining({ id: created[1]!.id, title, content: "double-click create sentinel" }),
  ]));

  const after = (await body(await sessions!.owner.request.get(documentsPath()))).documents as Document[];
  const beforeIds = new Set(before.map((document) => document.id));
  const added = after.filter((document) => !beforeIds.has(document.id));
  expect(added).toHaveLength(2);
  expect(new Set(added.map((document) => document.id))).toEqual(createdIds);
  expect(added).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: created[0]!.id, title }),
    expect.objectContaining({ id: created[1]!.id, title }),
  ]));
  expect(after).toEqual(expect.arrayContaining(before));
});

test(actionEvidenceTitle(
  "corpus.document.create",
  ["validation"],
  "rejects oversized content and malformed document dates while normalizing valid values"
), async () => {
  const sourceId = await defaultSourceId();
  const participantId = await createParticipant();
  const exactContent = "x".repeat(1_000_000);
  const document = await createDocument({
    content: exactContent,
    source_id: sourceId,
    participant_id: participantId,
    interview_date: "2024-02-29",
    field_date: "2026-07-12",
    location: "  Ciudad de Guatemala  ",
    language: "  es-GT  ",
    notes: "  nota Unicode: niñez  ",
    metadata: { wave: 2, consent: true, nested: { region: "central" } },
  });
  expect(document).toMatchObject({
    content: exactContent,
    source_id: sourceId,
    participant_id: participantId,
    interview_date: "2024-02-29",
    field_date: "2026-07-12",
    location: "Ciudad de Guatemala",
    language: "es-GT",
    notes: "nota Unicode: niñez",
    metadata: { wave: 2, consent: true, nested: { region: "central" } },
  });

  const tooLarge = await sessions!.owner.request.post(documentsPath(), {
    data: { title: uniqueTitle("too-large"), content: "x".repeat(1_000_001) },
  });
  expect(tooLarge.status()).toBe(400);

  for (const invalidDate of ["07/12/2026", "2026-7-12", "20260712"]) {
    const invalid = await sessions!.owner.request.post(documentsPath(), {
      data: { title: uniqueTitle("invalid-date-format"), field_date: invalidDate },
    });
    expect(invalid.status()).toBe(400);
  }

  const defaults = await createDocument({
    source_id: "",
    participant_id: "  ",
    interview_date: "",
    field_date: null,
    location: null,
    language: null,
    notes: null,
    metadata: null,
  });
  expect(defaults).toMatchObject({
    source_id: null,
    participant_id: null,
    interview_date: null,
    field_date: null,
    location: "",
    language: "es",
    notes: "",
    metadata: {},
  });
});

test(actionEvidenceTitle(
  "corpus.documents.list",
  ["success"],
  "filters the disposable documents by search, type, status, source, participant, and page"
), async () => {
  const sourceId = await defaultSourceId();
  const participantId = await createParticipant();
  const first = await createDocument({
    title: uniqueTitle("needle alpha"),
    document_type: "field_note",
    status: "reviewed",
    source_id: sourceId,
    participant_id: participantId,
  });
  const second = await createDocument({
    title: uniqueTitle("needle beta"),
    document_type: "field_note",
    status: "reviewed",
    source_id: sourceId,
    participant_id: participantId,
  });
  const query = new URLSearchParams({
    search: "needle",
    document_type: "field_note",
    status: "reviewed",
    source_id: sourceId,
    participant_id: participantId,
    limit: "1",
    offset: "1",
  });
  const listed = (await body(
    await sessions!.viewer.request.get(`${documentsPath()}?${query}`)
  )).documents as Document[];
  expect(listed).toHaveLength(1);
  expect([first.id, second.id]).toContain(listed[0]!.id);
});

test(actionEvidenceTitle(
  "corpus.document.update",
  ["success", "persistence", "validation", "cleanup"],
  "persists a revisioned document update and rejects the stale revision"
), async () => {
  const document = await createDocument({ content: "before" });
  const update = await sessions!.editor.request.patch(documentPath(document.id), {
    data: {
      base_revision: String(document.revision),
      title: `  ${uniqueTitle("updated")}  `,
      content: "after",
      status: "cleaned",
    },
  });
  const updated = (await body(update)).document as Document;
  expect(update.status()).toBe(200);
  expect(updated).toMatchObject({ content: "after", status: "cleaned" });
  expect(updated.revision).toBeGreaterThan(document.revision);
  const readback = (await body(await sessions!.viewer.request.get(documentPath(document.id)))).document;
  expect(readback).toMatchObject({
    id: document.id,
    title: updated.title,
    content: "after",
    status: "cleaned",
    revision: updated.revision,
  });

  const stale = await sessions!.owner.request.patch(documentPath(document.id), {
    data: { base_revision: document.revision, notes: "stale" },
  });
  expect(stale.status()).toBe(409);
  expect(await body(stale)).toMatchObject({ error: "DOCUMENT_REVISION_CONFLICT" });
});

test([
  actionEvidenceTitle("corpus.document.create", ["validation"], "rejects foreign source and participant references"),
  actionEvidenceTitle("corpus.document.read", ["validation"], "rejects a foreign document identifier for reads"),
  actionEvidenceTitle("corpus.document.update", ["validation"], "rejects a foreign document identifier for updates"),
  actionEvidenceTitle("corpus.document.delete", ["validation"], "rejects a foreign document identifier for deletion"),
].join(" | "), async () => {
  const foreign = await createQaProjectFixture(sessions!);
  try {
    const foreignDocument = await createDocument(
      { title: uniqueTitle("foreign-document"), notes: "unchanged" },
      foreign.project.id
    );
    const foreignSource = await defaultSourceId(foreign.project.id);
    const foreignParticipant = await createParticipant(foreign.project.id);

    expect((await sessions!.owner.request.get(documentPath(foreignDocument.id))).status()).toBe(404);
    expect((await sessions!.owner.request.patch(documentPath(foreignDocument.id), {
      data: { base_revision: foreignDocument.revision, notes: "crossed" },
    })).status()).toBe(404);
    expect((await sessions!.owner.request.delete(documentPath(foreignDocument.id))).status()).toBe(404);

    for (const data of [
      { source_id: foreignSource },
      { participant_id: foreignParticipant },
    ]) {
      const response = await sessions!.owner.request.post(documentsPath(), {
        data: { title: uniqueTitle("foreign-ref"), ...data },
      });
      expect(response.status()).toBe(400);
    }

    const proof = (await body(await sessions!.owner.request.get(
      documentPath(foreignDocument.id, foreign.project.id)
    ))).document as Document;
    expect(proof.notes).toBe("unchanged");
  } finally {
    await foreign.cleanup();
  }
});

test([
  actionEvidenceTitle("corpus.documents.list", ["permissions"], "allows member document lists and denies intruders and anonymous users"),
  actionEvidenceTitle("corpus.document.read", ["permissions"], "allows member document reads and denies intruders and anonymous users"),
  actionEvidenceTitle("corpus.document.create", ["permissions"], "allows document creation to owners and editors only"),
  actionEvidenceTitle("corpus.document.update", ["permissions"], "allows document updates to owners and editors only"),
  actionEvidenceTitle("corpus.document.delete", ["permissions"], "allows document deletion to owners and editors only"),
].join(" | "), async () => {
  const document = await createDocument({ content: "role matrix" });
  expect((await sessions!.owner.request.get(documentsPath())).status()).toBe(200);
  expect((await sessions!.editor.request.get(documentPath(document.id))).status()).toBe(200);
  expect((await sessions!.viewer.request.get(documentsPath())).status()).toBe(200);
  expect((await sessions!.viewer.request.get(documentPath(document.id))).status()).toBe(200);
  expect((await sessions!.intruder.request.get(documentsPath())).status()).toBe(403);
  expect((await anonymous!.get(documentsPath())).status()).toBe(401);
  expect((await anonymous!.get(documentPath(document.id))).status()).toBe(401);

  const ownerCreate = await sessions!.owner.request.post(documentsPath(), {
    data: { title: uniqueTitle("owner-create") },
  });
  const editorCreate = await sessions!.editor.request.post(documentsPath(), {
    data: { title: uniqueTitle("editor-create") },
  });
  expect(ownerCreate.status()).toBe(201);
  expect(editorCreate.status()).toBe(201);
  expect((await sessions!.viewer.request.post(documentsPath(), {
    data: { title: uniqueTitle("viewer") },
  })).status()).toBe(403);
  expect((await sessions!.intruder.request.post(documentsPath(), {
    data: { title: uniqueTitle("intruder") },
  })).status()).toBe(403);
  expect((await anonymous!.post(documentsPath(), {
    data: { title: uniqueTitle("anonymous") },
  })).status()).toBe(401);

  const ownerPatchDocument = await createDocument();
  const editorPatchDocument = await createDocument();
  expect((await sessions!.owner.request.patch(documentPath(ownerPatchDocument.id), {
    data: { base_revision: ownerPatchDocument.revision, notes: "owner" },
  })).status()).toBe(200);
  expect((await sessions!.editor.request.patch(documentPath(editorPatchDocument.id), {
    data: { base_revision: editorPatchDocument.revision, notes: "editor" },
  })).status()).toBe(200);
  expect((await sessions!.viewer.request.patch(documentPath(document.id), {
    data: { base_revision: document.revision, notes: "forbidden" },
  })).status()).toBe(403);
  expect((await sessions!.intruder.request.patch(documentPath(document.id), {
    data: { base_revision: document.revision, notes: "forbidden" },
  })).status()).toBe(403);
  expect((await anonymous!.patch(documentPath(document.id), {
    data: { base_revision: document.revision, notes: "forbidden" },
  })).status()).toBe(401);

  const ownerDeleteDocument = await createDocument();
  const editorDeleteDocument = await createDocument();
  expect((await sessions!.owner.request.delete(documentPath(ownerDeleteDocument.id))).status()).toBe(200);
  expect((await sessions!.editor.request.delete(documentPath(editorDeleteDocument.id))).status()).toBe(200);
  expect((await sessions!.viewer.request.delete(documentPath(document.id))).status()).toBe(403);
  expect((await sessions!.intruder.request.delete(documentPath(document.id))).status()).toBe(403);
  expect((await anonymous!.delete(documentPath(document.id))).status()).toBe(401);
});

test(actionEvidenceTitle(
  "corpus.stats.read",
  ["success", "permissions"],
  "returns active document statistics to a viewer and denies intruders and anonymous users"
), async () => {
  await createDocument({ document_type: "diary", status: "transcribed", content: "one two" });
  const response = await sessions!.viewer.request.get(
    materializeRoute("/api/projects/:id/documents/stats", { id: projectId() })
  );
  const stats = (await body(response)).stats;
  expect(response.status()).toBe(200);
  expect(stats).toMatchObject({
    total_documents: expect.any(Number),
    total_words: expect.any(Number),
    total_characters: expect.any(Number),
    by_type: expect.any(Array),
    by_status: expect.any(Array),
  });
  const statsPath = materializeRoute("/api/projects/:id/documents/stats", { id: projectId() });
  expect((await sessions!.intruder.request.get(statsPath)).status()).toBe(403);
  expect((await anonymous!.get(statsPath)).status()).toBe(401);
});

test("documents the current permissive integer coercion contract", async () => {
  for (const query of ["limit=2items", "offset=1.5"]) {
    expect((await sessions!.owner.request.get(`${documentsPath()}?${query}`)).status()).toBe(200);
  }
  const document = await createDocument();
  expect((await sessions!.owner.request.patch(documentPath(document.id), {
    data: { base_revision: `${document.revision}stale`, notes: "coerced" },
  })).status()).toBe(200);
});

test("documents the current ISO-shape-only date validation contract", () => {
  for (const interviewDate of ["2025-02-29", "2026-04-31", "2026-13-01"]) {
    expect(DocumentCreateSchema.safeParse({
      title: "calendar validation product gap",
      interview_date: interviewDate,
    }).success).toBe(true);
  }
});

test("content edits reject or reconcile every active persisted segment", async () => {
  const document = await createDocument({ content: "alpha beta" });
  const segmentPath = `${documentPath(document.id)}/segments`;
  const segmentResponse = await sessions!.owner.request.post(segmentPath, {
    data: {
      base_document_revision: document.revision,
      start_char: 0,
      end_char: 5,
      selected_text: "alpha",
    },
  });
  expect(segmentResponse.status()).toBe(201);
  const segment = (await body(segmentResponse)).segment as { id: string };

  const update = await sessions!.owner.request.patch(documentPath(document.id), {
    data: { base_revision: document.revision, content: "xxxxx beta" },
  });
  if (update.status() >= 400 && update.status() < 500) {
    expect(documentEditPreservesSegmentIntegrity({ editStatus: update.status() })).toBe(true);
    return;
  }

  expect(update.status()).toBe(200);
  const current = (await body(await sessions!.owner.request.get(documentPath(document.id))))
    .document as Document;
  const segmentRead = await sessions!.owner.request.get(`${segmentPath}/${segment.id}`);
  const persisted = segmentRead.status() === 200
    ? (await body(segmentRead)).segment as {
        start_char: number;
        end_char: number;
        selected_text: string;
      }
    : undefined;
  expect(
    documentEditPreservesSegmentIntegrity({
      editStatus: update.status(),
      documentContent: current.content,
      segmentReadStatus: segmentRead.status(),
      segment: persisted,
    })
  ).toBe(true);
});
