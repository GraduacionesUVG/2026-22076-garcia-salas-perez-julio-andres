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
  readUtf8Download,
} from "@/__tests__/integration/documents/task9-test-helpers";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects/:id/documents/:documentId/export"],
] as const;

type Document = { id: string; title: string; revision: number };
type ApiBody = { ok: boolean; error: string; document: Document };

let sessions: QaSessions | undefined;
let fixture: QaProjectFixture | undefined;
let anonymous: APIRequestContext | undefined;
let sequence = 0;

function collectionPath(id = fixture!.project.id): string {
  return materializeRoute("/api/projects/:id/documents", { id });
}

function itemPath(documentId: string, id = fixture!.project.id): string {
  return materializeRoute("/api/projects/:id/documents/:documentId", { id, documentId });
}

function exportPath(documentId: string, id = fixture!.project.id): string {
  return materializeRoute("/api/projects/:id/documents/:documentId/export", {
    id,
    documentId,
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
  const response = await sessions!.owner.request.post(collectionPath(id), {
    data: { title: `export ${fixture!.marker.slice(-8)} ${sequence}`, ...data },
  });
  const responseBody = await body(response);
  expect(response.status(), JSON.stringify(responseBody)).toBe(201);
  return responseBody.document as Document;
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
  "corpus.document.export",
  ["success"],
  "exports metadata and formula-like Unicode content as literal UTF-8 text"
), async () => {
  const formula = "=HYPERLINK(\"https://invalid.example\",\"niñez\")";
  const document = await createDocument({
    title: "Entrevista Ñandú 01",
    content: `Primera línea\n${formula}\n+SUM(1,2)`,
    document_type: "interview",
    status: "reviewed",
    location: "Sololá",
    notes: "Consentimiento oral",
    metadata: { wave: 2, private_code: "kept in JSON only" },
  });
  const response = await sessions!.viewer.request.get(`${exportPath(document.id)}?format=txt`);
  const download = await readUtf8Download(response, "entrevista-nandu-01.txt");
  expect(download.bytes.length).toBeGreaterThan(0);
  expect(download.text).toContain("Entrevista Ñandú 01");
  expect(download.text).toContain("Tipo: interview");
  expect(download.text).toContain("Estado: reviewed");
  expect(download.text).toContain("Lugar: Sololá");
  expect(download.text).toContain("Notas: Consentimiento oral");
  expect(download.text).toContain("wave");
  expect(download.text).toContain("private_code");
  expect(download.text).toContain(formula);
  expect(download.text).toContain("+SUM(1,2)");
  expect(download.text).not.toContain("<a ");
  expect(response.headers()["cache-control"]).toBe("no-store");
});

test("uses the default txt format and a safe fallback filename", async () => {
  const document = await createDocument({ title: "你好", content: "contenido" });
  const response = await sessions!.owner.request.get(exportPath(document.id));
  const download = await readUtf8Download(response, "documento.txt");
  expect(download.text).toContain("你好");
});

test(actionEvidenceTitle(
  "corpus.document.export",
  ["validation"],
  "rejects unsupported export formats with JSON instead of mislabeled binary"
), async () => {
  const document = await createDocument();
  const response = await sessions!.owner.request.get(`${exportPath(document.id)}?format=pdf`);
  expect(response.status()).toBe(400);
  expect(await body(response)).toMatchObject({
    ok: false,
    error: "UNSUPPORTED_DOCUMENT_EXPORT_FORMAT",
  });
});

test(actionEvidenceTitle(
  "corpus.document.export",
  ["validation"],
  "rejects deleted and foreign documents without leaking their text"
), async () => {
  const deleted = await createDocument({ content: "DELETED_SENTINEL" });
  expect((await sessions!.owner.request.delete(itemPath(deleted.id))).status()).toBe(200);
  const deletedExport = await sessions!.owner.request.get(exportPath(deleted.id));
  expect(deletedExport.status()).toBe(404);
  expect(JSON.stringify(await body(deletedExport))).not.toContain("DELETED_SENTINEL");

  const foreign = await createQaProjectFixture(sessions!);
  try {
    const foreignDocument = await createDocument(
      { content: "FOREIGN_EXPORT_SENTINEL" },
      foreign.project.id
    );
    const crossed = await sessions!.owner.request.get(exportPath(foreignDocument.id));
    expect(crossed.status()).toBe(404);
    expect(JSON.stringify(await body(crossed))).not.toContain("FOREIGN_EXPORT_SENTINEL");
  } finally {
    await foreign.cleanup();
  }
});

test(actionEvidenceTitle(
  "corpus.document.export",
  ["permissions"],
  "allows document export to members and denies intruders and anonymous users"
), async () => {
  const document = await createDocument({ content: "role export" });
  expect((await sessions!.owner.request.get(exportPath(document.id))).status()).toBe(200);
  expect((await sessions!.editor.request.get(exportPath(document.id))).status()).toBe(200);
  expect((await sessions!.viewer.request.get(exportPath(document.id))).status()).toBe(200);
  expect((await sessions!.intruder.request.get(exportPath(document.id))).status()).toBe(403);
  expect((await anonymous!.get(exportPath(document.id))).status()).toBe(401);
});
