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
  ["GET", "/api/projects/:id/participants"],
  ["POST", "/api/projects/:id/participants"],
  ["GET", "/api/projects/:id/participants/:participantId"],
  ["PATCH", "/api/projects/:id/participants/:participantId"],
  ["DELETE", "/api/projects/:id/participants/:participantId"],
] as const;

type Participant = {
  id: string;
  project_id: string;
  alias: string;
  display_name: string | null;
  notes: string;
  attributes: Record<string, unknown>;
  status: "active" | "inactive" | "withdrawn" | "archived";
  deleted_at: string | null;
  linked_document_count?: number;
  last_document_at?: string | null;
  revision: number;
};

type ApiBody = {
  ok: boolean;
  error: string;
  participant: Participant;
  participants: Participant[];
  document: Record<string, unknown>;
};

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;
let sequence = 0;

function collectionPath(projectId = fixture!.project.id): string {
  return `/api/projects/${projectId}/participants`;
}

function itemPath(participantId: string, projectId = fixture!.project.id): string {
  return `${collectionPath(projectId)}/${participantId}`;
}

function uniqueAlias(label: string): string {
  sequence += 1;
  return `${label}-${fixture!.marker.slice(-8)}-${sequence}`;
}

function hostile(name: HostilePayloadCaseName): unknown {
  const payloadCase = HOSTILE_PAYLOAD_CASES.find((item) => item.name === name);
  if (!payloadCase) throw new Error(`Missing hostile payload case: ${name}`);
  return payloadCase.value;
}

async function body(response: APIResponse): Promise<ApiBody> {
  const value = await readTask8JsonBody(
    response,
    `participants API response (${response.status()} ${response.url()})`
  );
  return value as unknown as ApiBody;
}

async function createParticipant(
  data: Record<string, unknown> = {},
  projectId = fixture!.project.id
): Promise<Participant> {
  const response = await sessions.owner.request.post(collectionPath(projectId), {
    data: { alias: uniqueAlias("participant"), ...data },
  });
  const responseBody = await body(response);
  expect(response.status(), JSON.stringify(responseBody)).toBe(201);
  expect(responseBody).toMatchObject({
    ok: true,
    participant: { id: expect.any(String), project_id: projectId },
  });
  return responseBody.participant as Participant;
}

test.beforeAll(async () => {
  sessions = await createQaSessions();
  fixture = await createQaProjectFixture(sessions);
});

test.afterAll(async () => {
  if (sessions) await cleanupQaProjectAndSessions(fixture, sessions);
  fixture = undefined;
});

// Approved model is existing free-form attributes/subsamples, not formal groups.
// Read real persisted metadata; do not manufacture an unsupported groups[] field.
test(actionEvidenceTitle("corpus.participant.read", ["success"], "participants retain subsample metadata through independent member reads"), async () => {
  const attributes = { sample_group: 'Mujeres adultas', participant_type: 'Entrevista', nested: { wave: 2 } };
  const participant = await createParticipant({ attributes });
  const readback = await sessions.viewer.request.get(itemPath(participant.id));
  expect(readback.status()).toBe(200);
  expect((await body(readback)).participant.attributes).toEqual(attributes);
  const listed = await body(await sessions.viewer.request.get(`${collectionPath()}?search=${encodeURIComponent(participant.alias)}`));
  expect(listed.participants).toEqual([expect.objectContaining({ id: participant.id, attributes })]);
});

test("participants expose persisted revision and reject stale writes without changing independent readback", async () => {
  const participant = await createParticipant();
  expect(participant.revision).toBe(0);

  const first = await sessions.editor.request.patch(itemPath(participant.id), {
    data: { base_revision: participant.revision, notes: "first revision" },
  });
  expect(first.status()).toBe(200);
  expect((await body(first)).participant).toMatchObject({ revision: 1 });

  const stale = await sessions.owner.request.patch(itemPath(participant.id), {
    data: { base_revision: participant.revision, notes: "stale revision" },
  });
  expect(stale.status()).toBe(409);
  expect(await body(stale)).toMatchObject({
    ok: false,
    error: "PARTICIPANT_REVISION_CONFLICT",
    latest_participant: { id: participant.id, project_id: fixture!.project.id, revision: 1, notes: 'first revision' },
  });
  const proof = await sessions.viewer.request.get(itemPath(participant.id));
  expect(proof.status()).toBe(200);
  expect((await body(proof)).participant).toMatchObject({ revision: 1, notes: 'first revision' });
  const legacy = await sessions.editor.request.patch(itemPath(participant.id), { data: { notes: 'legacy compatible' } });
  expect(legacy.status()).toBe(200);
  expect((await body(legacy)).participant).toMatchObject({ revision: 2, notes: 'legacy compatible' });
});

test('simultaneous participant edits from one displayed revision have a single winner', async () => {
  const participant = await createParticipant();
  const responses = await Promise.all([
    sessions.owner.request.patch(itemPath(participant.id), { data: { base_revision: 0, notes: 'owner edit' } }),
    sessions.editor.request.patch(itemPath(participant.id), { data: { base_revision: 0, notes: 'editor edit' } }),
  ]);
  expect(responses.map(response => response.status()).sort()).toEqual([200, 409]);
  const winner = await body(responses.find(response => response.status() === 200)!);
  const loser = await body(responses.find(response => response.status() === 409)!);
  expect(loser).toMatchObject({ error: 'PARTICIPANT_REVISION_CONFLICT', latest_participant: winner.participant });
  const proof = await body(await sessions.viewer.request.get(itemPath(participant.id)));
  expect(proof.participant).toMatchObject({ revision: 1, notes: winner.participant.notes });
});

test(actionEvidenceTitle(
  "corpus.participant.create",
  ["success", "persistence", "cleanup"],
  "creates trimmed participant attributes for the disposable project"
), async () => {
  const alias = uniqueAlias("metadata");
  const createdResponse = await sessions.editor.request.post(collectionPath(), {
    data: {
      alias: `  ${alias}  `,
      display_name: "  Participante Uno  ",
      notes: "  notas de campo  ",
      attributes: {
        region: "rural",
        interview_wave: 1,
        nested: { consent: true },
      },
    },
  });
  const createdBody = await body(createdResponse);
  expect(createdResponse.status()).toBe(201);
  expect(createdBody.participant).toMatchObject({
    project_id: fixture!.project.id,
    alias,
    display_name: "Participante Uno",
    notes: "notas de campo",
    attributes: {
      region: "rural",
      interview_wave: 1,
      nested: { consent: true },
    },
    status: "active",
    deleted_at: null,
  });

  const patchResponse = await sessions.owner.request.patch(
    itemPath(createdBody.participant.id),
    {
      data: {
        attributes: { region: "urban", interview_wave: 2 },
        status: "inactive",
      },
    }
  );
  expect(patchResponse.status()).toBe(200);
  expect((await body(patchResponse)).participant).toMatchObject({
    attributes: { region: "urban", interview_wave: 2 },
    status: "inactive",
  });

  const getResponse = await sessions.viewer.request.get(
    itemPath(createdBody.participant.id)
  );
  expect(getResponse.status()).toBe(200);
  expect((await body(getResponse)).participant).toMatchObject({
    id: createdBody.participant.id,
    linked_document_count: 0,
    last_document_at: null,
  });
});

test(actionEvidenceTitle(
  "corpus.participant.create",
  ["validation"],
  "rejects invalid participant creation payloads while preserving accepted hostile strings as data"
), async () => {
  for (const name of [
    "unicode",
    "html",
    "spreadsheet-formula",
    "sql-like",
  ] as const) {
    const value = hostile(name);
    const participant = await createParticipant({ notes: value });
    expect(participant.notes).toBe(value);
  }

  const invalidPayloads = [
    { alias: hostile("whitespace") },
    { alias: hostile("oversized-string") },
    { alias: hostile("null") },
    { alias: hostile("array") },
    { alias: hostile("number") },
    { alias: hostile("boolean") },
    { alias: uniqueAlias("strict"), ...(hostile("unknown-object-key") as object) },
  ];

  for (const data of invalidPayloads) {
    const response = await sessions.owner.request.post(collectionPath(), { data });
    expect(response.status(), JSON.stringify(await body(response))).toBe(400);
  }

  expect(Object.isFrozen(HOSTILE_PAYLOAD_CASES)).toBe(true);
});

test(actionEvidenceTitle(
  "corpus.participant.create",
  ["duplicate"],
  "rejects a second participant alias within one project"
), async () => {
  const alias = uniqueAlias("duplicate");
  await createParticipant({ alias });
  const duplicate = await sessions.editor.request.post(collectionPath(), {
    data: { alias },
  });
  expect(duplicate.status()).toBe(409);
  expect(await body(duplicate)).toMatchObject({
    ok: false,
    error: "PARTICIPANT_ALIAS_ALREADY_EXISTS",
  });
});

test(actionEvidenceTitle(
  "corpus.participants.list",
  ["success"],
  "searches participant aliases case-insensitively and filters their status"
), async () => {
  const needle = uniqueAlias("SearchNeedle");
  const matching = await createParticipant({ alias: needle, status: "withdrawn" });
  await createParticipant({ alias: uniqueAlias("other"), status: "active" });

  const search = await sessions.viewer.request.get(
    `${collectionPath()}?search=${encodeURIComponent(needle.toLowerCase())}`
  );
  expect(search.status()).toBe(200);
  expect((await body(search)).participants).toEqual([
    expect.objectContaining({ id: matching.id, alias: needle }),
  ]);

  const filtered = await sessions.viewer.request.get(
    `${collectionPath()}?search=${encodeURIComponent(needle)}&status=withdrawn`
  );
  expect(filtered.status()).toBe(200);
  expect((await body(filtered)).participants).toEqual([
    expect.objectContaining({ id: matching.id, status: "withdrawn" }),
  ]);

  const mismatch = await sessions.viewer.request.get(
    `${collectionPath()}?search=${encodeURIComponent(needle)}&status=active`
  );
  expect((await body(mismatch)).participants).toEqual([]);
});

test("paginates a bounded participant result without overlap", async () => {
  const prefix = uniqueAlias("PageNeedle");
  const created = await Promise.all(
    [1, 2, 3].map((index) =>
      createParticipant({ alias: `${prefix}-${index}` })
    )
  );

  const firstBody = await body(
    await sessions.viewer.request.get(
      `${collectionPath()}?search=${encodeURIComponent(prefix)}&limit=2&offset=0`
    )
  );
  const secondBody = await body(
    await sessions.viewer.request.get(
      `${collectionPath()}?search=${encodeURIComponent(prefix)}&limit=2&offset=2`
    )
  );
  const firstIds = firstBody.participants.map((item: Participant) => item.id);
  const secondIds = secondBody.participants.map((item: Participant) => item.id);

  expect(firstIds).toHaveLength(2);
  expect(secondIds).toHaveLength(1);
  expect(firstIds).not.toEqual(expect.arrayContaining(secondIds));
  expect(new Set([...firstIds, ...secondIds])).toEqual(
    new Set(created.map((item) => item.id))
  );
});

test([
  actionEvidenceTitle(
    "corpus.participant.delete",
    ["success", "persistence", "cleanup"],
    "soft deletes the exact disposable participant and hides it by default"
  ),
  actionEvidenceTitle(
    "corpus.participant.update",
    ["success", "persistence", "cleanup"],
    "archives a participant while retaining its readable record"
  ),
].join(" | "), async () => {
  const archived = await createParticipant();
  const archive = await sessions.editor.request.patch(itemPath(archived.id), {
    data: { status: "archived", notes: "archived through the item route" },
  });
  expect(archive.status()).toBe(200);
  const archivedReadback = await body(await sessions.viewer.request.get(itemPath(archived.id)));
  expect(archivedReadback.participant).toMatchObject({
    id: archived.id,
    status: "archived",
    notes: "archived through the item route",
    deleted_at: null,
  });
  const archivedList = await body(
    await sessions.viewer.request.get(
      `${collectionPath()}?status=archived&search=${encodeURIComponent(archived.alias)}`
    )
  );
  expect(archivedList.participants).toEqual([
    expect.objectContaining({ id: archived.id, status: "archived", deleted_at: null }),
  ]);

  const remove = await sessions.editor.request.delete(itemPath(archived.id));
  expect(remove.status()).toBe(200);
  expect((await body(remove)).participant).toMatchObject({
    id: archived.id,
    status: "archived",
    deleted_at: expect.any(String),
  });
  expect((await sessions.viewer.request.get(itemPath(archived.id))).status()).toBe(404);

  const defaultList = await body(
    await sessions.viewer.request.get(
      `${collectionPath()}?search=${encodeURIComponent(archived.alias)}`
    )
  );
  expect(defaultList.participants).toEqual([]);
  const deletedList = await body(
    await sessions.viewer.request.get(
      `${collectionPath()}?include_deleted=true&search=${encodeURIComponent(archived.alias)}`
    )
  );
  expect(deletedList.participants).toEqual([
    expect.objectContaining({ id: archived.id, deleted_at: expect.any(String) }),
  ]);
  expect((await sessions.owner.request.delete(itemPath(archived.id))).status()).toBe(404);
});

test("reports linked document counts and rejects links to deleted participants", async () => {
  const participant = await createParticipant();
  const documentResponse = await sessions.editor.request.post(
    `/api/projects/${fixture!.project.id}/documents`,
    {
      data: {
        title: uniqueAlias("linked-document"),
        content: "Contenido de prueba",
        participant_id: participant.id,
      },
    }
  );
  expect(documentResponse.status(), JSON.stringify(await body(documentResponse))).toBe(201);

  const linked = await body(
    await sessions.viewer.request.get(itemPath(participant.id))
  );
  expect(linked.participant).toMatchObject({
    id: participant.id,
    linked_document_count: 1,
    last_document_at: expect.any(String),
  });

  expect((await sessions.owner.request.delete(itemPath(participant.id))).status()).toBe(200);
  const relink = await sessions.owner.request.post(
    `/api/projects/${fixture!.project.id}/documents`,
    {
      data: {
        title: uniqueAlias("deleted-link"),
        participant_id: participant.id,
      },
    }
  );
  expect(relink.status()).toBe(400);
  expect(await body(relink)).toMatchObject({
    ok: false,
    error: "INVALID_PARTICIPANT_FOR_PROJECT",
  });
});

test([
  actionEvidenceTitle(
    "corpus.participant.update",
    ["validation"],
    "rejects a foreign participant identifier without crossing project scope"
  ),
  actionEvidenceTitle(
    "corpus.participant.delete",
    ["validation"],
    "rejects deletion through a foreign participant identifier"
  ),
].join(" | "), async () => {
  const foreign = await createQaProjectFixture(sessions);
  try {
    const foreignParticipant = await createParticipant({}, foreign.project.id);
    const localPath = itemPath(foreignParticipant.id);

    expect((await sessions.owner.request.get(localPath)).status()).toBe(404);
    expect(
      (
        await sessions.owner.request.patch(localPath, {
          data: { notes: "must not cross projects" },
        })
      ).status()
    ).toBe(404);
    expect((await sessions.owner.request.delete(localPath)).status()).toBe(404);

    const linked = await sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/documents`,
      {
        data: {
          title: uniqueAlias("foreign-participant-document"),
          participant_id: foreignParticipant.id,
        },
      }
    );
    expect(linked.status()).toBe(400);
    expect(await body(linked)).toMatchObject({
      error: "INVALID_PARTICIPANT_FOR_PROJECT",
    });

    const proof = await body(
      await sessions.owner.request.get(
        itemPath(foreignParticipant.id, foreign.project.id)
      )
    );
    expect(proof.participant).toMatchObject({
      id: foreignParticipant.id,
      notes: "",
      deleted_at: null,
    });
  } finally {
    await foreign.cleanup();
  }
});

test([
  actionEvidenceTitle("corpus.participants.list", ["permissions"], "allows member reads and denies intruders"),
  actionEvidenceTitle("corpus.participant.read", ["permissions"], "allows member participant detail reads and denies intruders"),
  actionEvidenceTitle("corpus.participant.create", ["permissions"], "allows owner and editor participant creation only"),
  actionEvidenceTitle("corpus.participant.update", ["permissions"], "allows owner and editor participant updates only"),
  actionEvidenceTitle("corpus.participant.delete", ["permissions"], "allows owner and editor participant deletion only"),
].join(" | "), async () => {
  const participant = await createParticipant();
  expect((await sessions.owner.request.get(collectionPath())).status()).toBe(200);
  expect((await sessions.editor.request.get(collectionPath())).status()).toBe(200);
  expect((await sessions.viewer.request.get(collectionPath())).status()).toBe(200);
  expect((await sessions.viewer.request.get(itemPath(participant.id))).status()).toBe(200);
  expect(
    (
      await sessions.viewer.request.post(collectionPath(), {
        data: { alias: uniqueAlias("viewer-forbidden") },
      })
  ).status()
  ).toBe(403);

  const editorCreated = await sessions.editor.request.post(collectionPath(), {
    data: { alias: uniqueAlias("editor-allowed") },
  });
  expect(editorCreated.status()).toBe(201);
  expect((await sessions.intruder.request.post(collectionPath(), {
    data: { alias: uniqueAlias("intruder-forbidden") },
  })).status()).toBe(403);
  expect(
    (
      await sessions.viewer.request.patch(itemPath(participant.id), {
        data: { notes: "forbidden" },
      })
    ).status()
  ).toBe(403);
  expect((await sessions.viewer.request.delete(itemPath(participant.id))).status()).toBe(403);

  const ownerUpdated = await createParticipant();
  const editorUpdated = await createParticipant();
  expect((await sessions.owner.request.patch(itemPath(ownerUpdated.id), {
    data: { notes: "owner update" },
  })).status()).toBe(200);
  expect((await sessions.editor.request.patch(itemPath(editorUpdated.id), {
    data: { notes: "editor update" },
  })).status()).toBe(200);
  expect((await sessions.intruder.request.patch(itemPath(participant.id), {
    data: { notes: "intruder update" },
  })).status()).toBe(403);

  const ownerDeleted = await createParticipant();
  const editorDeleted = await createParticipant();
  expect((await sessions.owner.request.delete(itemPath(ownerDeleted.id))).status()).toBe(200);
  expect((await sessions.editor.request.delete(itemPath(editorDeleted.id))).status()).toBe(200);
  expect((await sessions.intruder.request.delete(itemPath(participant.id))).status()).toBe(403);

  expect((await sessions.intruder.request.get(collectionPath())).status()).toBe(403);
  expect((await sessions.intruder.request.get(itemPath(participant.id))).status()).toBe(403);
});
