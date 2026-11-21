import { expect, test, type APIResponse } from "@playwright/test";
import {
  cleanupQaProjectAndSessions,
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  HOSTILE_PAYLOAD_CASES,
  type HostilePayloadCaseName,
} from "@/__tests__/backend/payload-cases";
import {
  createQaSessions,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import { readTask8JsonBody } from "@/__tests__/backend/task8-test-helpers";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects/:id/documents/sources"],
  ["POST", "/api/projects/:id/documents/sources"],
  ["GET", "/api/projects/:id/documents/sources/:sourceId"],
  ["PATCH", "/api/projects/:id/documents/sources/:sourceId"],
  ["DELETE", "/api/projects/:id/documents/sources/:sourceId"],
] as const;

type DocumentSource = {
  id: string;
  project_id: string;
  code: string;
  label: string;
  description: string;
  is_default: boolean;
  is_active: boolean;
  position: number;
  deleted_at: string | null;
};

type ApiBody = {
  ok: boolean;
  error: string;
  source: DocumentSource;
  sources: DocumentSource[];
  document: Record<string, unknown>;
};

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;
let sequence = 0;

function collectionPath(projectId = fixture!.project.id): string {
  return `/api/projects/${projectId}/documents/sources`;
}

function itemPath(sourceId: string, projectId = fixture!.project.id): string {
  return `${collectionPath(projectId)}/${sourceId}`;
}

function uniqueCode(label = "source"): string {
  sequence += 1;
  return `qa_${label}_${fixture!.marker.slice(-8)}_${sequence}`.toLowerCase();
}

function uniqueLabel(label = "Source"): string {
  return `${label} ${fixture!.marker.slice(-8)} ${sequence}`;
}

function hostile(name: HostilePayloadCaseName): unknown {
  const payloadCase = HOSTILE_PAYLOAD_CASES.find((item) => item.name === name);
  if (!payloadCase) throw new Error(`Missing hostile payload case: ${name}`);
  return payloadCase.value;
}

async function body(response: APIResponse): Promise<ApiBody> {
  const value = await readTask8JsonBody(
    response,
    `document sources API response (${response.status()} ${response.url()})`
  );
  return value as unknown as ApiBody;
}

async function createSource(
  data: Record<string, unknown> = {},
  projectId = fixture!.project.id
): Promise<DocumentSource> {
  const code = uniqueCode();
  const response = await sessions.owner.request.post(collectionPath(projectId), {
    data: { code, label: uniqueLabel(), ...data },
  });
  const responseBody = await body(response);
  expect(response.status(), JSON.stringify(responseBody)).toBe(201);
  expect(responseBody).toMatchObject({
    ok: true,
    source: { id: expect.any(String), project_id: projectId },
  });
  return responseBody.source;
}

async function defaultSource(): Promise<DocumentSource> {
  const response = await sessions.owner.request.get(collectionPath());
  const responseBody = await body(response);
  expect(response.status()).toBe(200);
  const source = responseBody.sources.find((item) => item.is_default);
  expect(source, "A disposable project should be seeded with default sources").toBeDefined();
  return source!;
}

test.beforeAll(async () => {
  sessions = await createQaSessions();
  fixture = await createQaProjectFixture(sessions);
});

test.afterAll(async () => {
  if (sessions) await cleanupQaProjectAndSessions(fixture, sessions);
  fixture = undefined;
});

test(actionEvidenceTitle(
  "corpus.sources.list",
  ["success"],
  "lists the disposable project's seeded source defaults"
), async () => {
  const response = await sessions.viewer.request.get(collectionPath());
  const responseBody = await body(response);
  expect(response.status()).toBe(200);
  expect(responseBody.ok).toBe(true);

  const defaults = responseBody.sources.filter((source) => source.is_default);
  expect(defaults.length).toBeGreaterThan(0);
  for (const source of defaults) {
    expect(source).toMatchObject({
      id: expect.any(String),
      project_id: fixture!.project.id,
      code: expect.any(String),
      label: expect.any(String),
      description: expect.any(String),
      is_default: true,
      is_active: true,
      position: expect.any(Number),
      deleted_at: null,
    });
  }

  const itemResponse = await sessions.viewer.request.get(itemPath(defaults[0]!.id));
  expect(itemResponse.status()).toBe(200);
  expect((await body(itemResponse)).source).toEqual(defaults[0]);
});

test([
  actionEvidenceTitle(
    "corpus.source.create",
    ["success", "persistence", "cleanup"],
    "creates a custom source with its documented defaults"
  ),
  actionEvidenceTitle(
    "corpus.source.update",
    ["success", "persistence", "cleanup"],
    "persists source field updates before independent retrieval"
  ),
  actionEvidenceTitle(
    "corpus.source.delete",
    ["success", "persistence", "cleanup"],
    "soft deletes the exact disposable source and exposes it only when requested"
  ),
].join(" | "), async () => {
  const code = uniqueCode("crud");
  const label = uniqueLabel("CRUD source");
  const created = await createSource({ code, label });
  expect(created).toMatchObject({
    code,
    label,
    description: "",
    is_default: false,
    is_active: true,
    position: 100,
    deleted_at: null,
  });
  expect(created).not.toHaveProperty("revision");

  const patch = await sessions.editor.request.patch(itemPath(created.id), {
    data: {
      label: `${label} updated`,
      description: "Descripcion personalizada",
      is_active: false,
      position: 321,
    },
  });
  expect(patch.status()).toBe(200);
  expect((await body(patch)).source).toMatchObject({
    id: created.id,
    label: `${label} updated`,
    description: "Descripcion personalizada",
    is_active: false,
    position: 321,
  });
  const updatedReadback = await body(await sessions.viewer.request.get(itemPath(created.id)));
  expect(updatedReadback.source).toMatchObject({
    id: created.id,
    label: `${label} updated`,
    description: "Descripcion personalizada",
    is_active: false,
    position: 321,
    deleted_at: null,
  });

  const remove = await sessions.owner.request.delete(itemPath(created.id));
  expect(remove.status()).toBe(200);
  expect((await body(remove)).source).toMatchObject({
    id: created.id,
    is_active: false,
    deleted_at: expect.any(String),
  });
  expect((await sessions.owner.request.get(itemPath(created.id))).status()).toBe(404);

  const defaultList = await body(
    await sessions.owner.request.get(
      `${collectionPath()}?search=${encodeURIComponent(`${label} updated`)}`
    )
  );
  expect(defaultList.sources).toEqual([]);
  const deletedList = await body(
    await sessions.owner.request.get(
      `${collectionPath()}?include_deleted=true&search=${encodeURIComponent(`${label} updated`)}`
    )
  );
  expect(deletedList.sources).toEqual([
    expect.objectContaining({ id: created.id, deleted_at: expect.any(String) }),
  ]);
  expect((await sessions.owner.request.delete(itemPath(created.id))).status()).toBe(404);
});

test(actionEvidenceTitle(
  "corpus.source.create",
  ["duplicate"],
  "rejects a duplicate source code while retaining distinct source rows"
), async () => {
  const code = uniqueCode("duplicate");
  const label = uniqueLabel("Duplicate label");
  const first = await createSource({ code, label, position: 777 });

  const duplicateCode = await sessions.owner.request.post(collectionPath(), {
    data: { code, label: "Different label" },
  });
  expect(duplicateCode.status()).toBe(409);
  expect(await body(duplicateCode)).toMatchObject({
    ok: false,
    error: "DOCUMENT_SOURCE_CODE_ALREADY_EXISTS",
  });

  const second = await createSource({
    code: uniqueCode("same_position"),
    label,
    position: 777,
  });
  expect(second).toMatchObject({ label, position: 777 });

  const search = await body(
    await sessions.viewer.request.get(
      `${collectionPath()}?search=${encodeURIComponent(label)}`
    )
  );
  expect(new Set(search.sources.map((source) => source.id))).toEqual(
    new Set([first.id, second.id])
  );
});

test([
  actionEvidenceTitle("corpus.source.update", ["validation"], "rejects changes to a default source code"),
  actionEvidenceTitle("corpus.source.delete", ["validation"], "rejects deletion of a default source"),
].join(" | "), async () => {
  const original = await defaultSource();
  const changedCode = await sessions.owner.request.patch(itemPath(original.id), {
    data: { code: uniqueCode("protected") },
  });
  expect(changedCode.status()).toBe(409);
  expect(await body(changedCode)).toMatchObject({
    ok: false,
    error: "DEFAULT_SOURCE_CODE_CANNOT_BE_CHANGED",
  });

  const remove = await sessions.editor.request.delete(itemPath(original.id));
  expect(remove.status()).toBe(409);
  expect(await body(remove)).toMatchObject({
    ok: false,
    error: "DEFAULT_SOURCE_CANNOT_BE_DELETED",
  });

  const proof = await body(await sessions.viewer.request.get(itemPath(original.id)));
  expect(proof.source).toEqual(original);
});

test(actionEvidenceTitle(
  "corpus.source.create",
  ["validation"],
  "rejects invalid source creation payloads while preserving accepted hostile labels as data"
), async () => {
  for (const name of [
    "unicode",
    "html",
    "spreadsheet-formula",
    "sql-like",
  ] as const) {
    const value = hostile(name);
    const source = await createSource({ label: value });
    expect(source.label).toBe(value);
  }

  const invalidPayloads = [
    { code: uniqueCode("invalid"), label: hostile("whitespace") },
    { code: uniqueCode("invalid"), label: hostile("oversized-string") },
    { code: uniqueCode("invalid"), label: hostile("null") },
    { code: uniqueCode("invalid"), label: hostile("array") },
    { code: uniqueCode("invalid"), label: hostile("number") },
    { code: uniqueCode("invalid"), label: hostile("boolean") },
    {
      code: uniqueCode("strict"),
      label: uniqueLabel("Strict"),
      ...(hostile("unknown-object-key") as object),
    },
  ];
  for (const data of invalidPayloads) {
    const response = await sessions.owner.request.post(collectionPath(), { data });
    expect(response.status(), JSON.stringify(await body(response))).toBe(400);
  }
  expect(Object.isFrozen(HOSTILE_PAYLOAD_CASES)).toBe(true);
});

test("filters active state and paginates searched sources without overlap", async () => {
  const prefix = uniqueLabel("Page source");
  const active = await Promise.all([
    createSource({ label: `${prefix} A`, is_active: true, position: 800 }),
    createSource({ label: `${prefix} B`, is_active: true, position: 801 }),
  ]);
  const inactive = await createSource({
    label: `${prefix} C`,
    is_active: false,
    position: 802,
  });

  const first = await body(
    await sessions.viewer.request.get(
      `${collectionPath()}?search=${encodeURIComponent(prefix)}&active=true&limit=1&offset=0`
    )
  );
  const second = await body(
    await sessions.viewer.request.get(
      `${collectionPath()}?search=${encodeURIComponent(prefix)}&active=true&limit=1&offset=1`
    )
  );
  expect(first.sources).toHaveLength(1);
  expect(second.sources).toHaveLength(1);
  expect(first.sources[0]!.id).not.toBe(second.sources[0]!.id);
  expect(new Set([first.sources[0]!.id, second.sources[0]!.id])).toEqual(
    new Set(active.map((source) => source.id))
  );

  const inactiveResponse = await body(
    await sessions.viewer.request.get(
      `${collectionPath()}?search=${encodeURIComponent(prefix)}&active=false`
    )
  );
  expect(inactiveResponse.sources).toEqual([
    expect.objectContaining({ id: inactive.id, is_active: false }),
  ]);

  for (const query of ["limit=0", "limit=201", "offset=-1", "unknown=true"]) {
    expect(
      (await sessions.owner.request.get(`${collectionPath()}?${query}`)).status()
    ).toBe(400);
  }
});

test([
  actionEvidenceTitle("corpus.sources.list", ["permissions"], "allows source reads to members and denies intruders"),
  actionEvidenceTitle("corpus.source.create", ["permissions"], "allows source creation to owners and editors only"),
  actionEvidenceTitle("corpus.source.update", ["permissions"], "allows source updates to owners and editors only"),
  actionEvidenceTitle("corpus.source.delete", ["permissions"], "allows source deletion to owners and editors only"),
].join(" | "), async () => {
  const source = await createSource();
  expect((await sessions.viewer.request.get(collectionPath())).status()).toBe(200);
  expect((await sessions.viewer.request.get(itemPath(source.id))).status()).toBe(200);
  expect(
    (
      await sessions.viewer.request.post(collectionPath(), {
        data: { code: uniqueCode("viewer"), label: uniqueLabel("Viewer") },
      })
    ).status()
  ).toBe(403);
  expect((await sessions.intruder.request.post(collectionPath(), {
    data: { code: uniqueCode("intruder"), label: uniqueLabel("Intruder") },
  })).status()).toBe(403);
  expect(
    (
      await sessions.viewer.request.patch(itemPath(source.id), {
        data: { label: "forbidden" },
      })
    ).status()
  ).toBe(403);
  expect((await sessions.intruder.request.patch(itemPath(source.id), {
    data: { label: "intruder forbidden" },
  })).status()).toBe(403);
  expect((await sessions.viewer.request.delete(itemPath(source.id))).status()).toBe(403);
  expect((await sessions.intruder.request.delete(itemPath(source.id))).status()).toBe(403);
  expect((await sessions.intruder.request.get(collectionPath())).status()).toBe(403);
  expect((await sessions.intruder.request.get(itemPath(source.id))).status()).toBe(403);

  const editorSourceResponse = await sessions.editor.request.post(collectionPath(), {
    data: { code: uniqueCode("editor"), label: uniqueLabel("Editor") },
  });
  const editorSourceBody = await body(editorSourceResponse);
  expect(editorSourceResponse.status()).toBe(201);
  expect(
    (
      await sessions.editor.request.patch(itemPath(editorSourceBody.source.id), {
        data: { description: "editor update" },
      })
    ).status()
  ).toBe(200);
  expect(
    (await sessions.editor.request.delete(itemPath(editorSourceBody.source.id))).status()
  ).toBe(200);
});

test([
  actionEvidenceTitle("corpus.source.update", ["validation"], "rejects a foreign source identifier for updates"),
  actionEvidenceTitle("corpus.source.delete", ["validation"], "rejects a foreign source identifier for deletion"),
].join(" | "), async () => {
  const foreign = await createQaProjectFixture(sessions);
  try {
    const foreignSource = await createSource({}, foreign.project.id);
    const localPath = itemPath(foreignSource.id);
    expect((await sessions.owner.request.get(localPath)).status()).toBe(404);
    expect(
      (
        await sessions.owner.request.patch(localPath, {
          data: { description: "must not cross projects" },
        })
      ).status()
    ).toBe(404);
    expect((await sessions.owner.request.delete(localPath)).status()).toBe(404);

    const linked = await sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/documents`,
      {
        data: {
          title: uniqueLabel("Foreign source document"),
          source_id: foreignSource.id,
        },
      }
    );
    expect(linked.status()).toBe(400);
    expect(await body(linked)).toMatchObject({
      ok: false,
      error: "INVALID_DOCUMENT_SOURCE_FOR_PROJECT",
    });

    const proof = await body(
      await sessions.owner.request.get(itemPath(foreignSource.id, foreign.project.id))
    );
    expect(proof.source).toMatchObject({
      id: foreignSource.id,
      description: "",
      deleted_at: null,
    });
  } finally {
    await foreign.cleanup();
  }
});
