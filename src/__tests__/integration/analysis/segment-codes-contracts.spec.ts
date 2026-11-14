/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, request, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { createQaProjectFixture, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { closeQaSessions, createQaSessions, type QaSessions } from "@/__tests__/backend/sessions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import {
  classifyOneWinnerRace,
  closeTask10Resources,
  codeFixtureData,
  segmentSelection,
  task10Route,
} from "@/__tests__/backend/task10-test-helpers";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects/:id/analysis/segments/:segmentId/codes"],
  ["POST", "/api/projects/:id/analysis/segments/:segmentId/codes"],
  ["PATCH", "/api/projects/:id/analysis/segments/:segmentId/codes/:segmentCodeId"],
  ["DELETE", "/api/projects/:id/analysis/segments/:segmentId/codes/:segmentCodeId"],
] as const;

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;
let anonymous: APIRequestContext | undefined;
let sequence = 0;

function documentsPath(projectId: string): string {
  return task10Route("/api/projects/:id/documents", { id: projectId });
}

function segmentsPath(projectId: string, documentId: string): string {
  return task10Route("/api/projects/:id/documents/:documentId/segments", {
    id: projectId,
    documentId,
  });
}

function codesPath(projectId: string): string {
  return task10Route("/api/projects/:id/analysis/codes", { id: projectId });
}

function assignmentsPath(segmentId: string, projectId = fixture!.project.id): string {
  return task10Route("/api/projects/:id/analysis/segments/:segmentId/codes", {
    id: projectId,
    segmentId,
  });
}

function assignmentPath(
  segmentId: string,
  segmentCodeId: string,
  projectId = fixture!.project.id
): string {
  return task10Route(
    "/api/projects/:id/analysis/segments/:segmentId/codes/:segmentCodeId",
    { id: projectId, segmentId, segmentCodeId }
  );
}

async function body(response: APIResponse): Promise<Record<string, any>> {
  expect(response.headers()["content-type"]).toContain("application/json");
  return response.json() as Promise<Record<string, any>>;
}

async function createCode(projectId = fixture!.project.id) {
  sequence += 1;
  const response = await sessions.owner.request.post(codesPath(projectId), {
    data: codeFixtureData({ name: `${fixture!.marker} assignment code ${sequence}` }),
  });
  const value = await body(response);
  expect(response.status(), JSON.stringify(value)).toBe(201);
  return value.code as Record<string, any>;
}

async function createSegment(projectId = fixture!.project.id, marker = fixture!.marker) {
  sequence += 1;
  const content = `alpha evidence ${sequence} omega`;
  const documentResponse = await sessions.owner.request.post(documentsPath(projectId), {
    data: { title: `${marker} assignment document ${sequence}`, content },
  });
  const documentValue = await body(documentResponse);
  expect(documentResponse.status()).toBe(201);
  const document = documentValue.document;
  const segmentResponse = await sessions.owner.request.post(segmentsPath(projectId, document.id), {
    data: {
      base_document_revision: document.revision,
      ...segmentSelection(content, `evidence ${sequence}`),
    },
  });
  const segmentValue = await body(segmentResponse);
  expect(segmentResponse.status()).toBe(201);
  return segmentValue.segment as Record<string, any>;
}

async function assign(
  segmentId: string,
  codeId: string,
  overrides: Record<string, unknown> = {},
  projectId = fixture!.project.id
) {
  const response = await sessions.owner.request.post(assignmentsPath(segmentId, projectId), {
    data: { code_id: codeId, ...overrides },
  });
  const value = await body(response);
  expect(response.status(), JSON.stringify(value)).toBe(201);
  return value.segment_code as Record<string, any>;
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

test([
  actionEvidenceTitle("analysis.segment-code.create", ["success", "persistence", "cleanup"], "persists quote fields, notes, metadata, and audit identity"),
  actionEvidenceTitle("analysis.segment-codes.list", ["success"], "reads the exact persisted segment-code assignment"),
].join(" | "), async () => {
  const segment = await createSegment();
  const code = await createCode();
  const assignment = await assign(segment.id, code.id, {
    analytic_note: "Interpretive note",
    is_quote: true,
    quote_label: "Key quotation",
    metadata: { confidence: "high" },
  });
  expect(assignment).toMatchObject({
    project_id: fixture!.project.id,
    segment_id: segment.id,
    code_id: code.id,
    analytic_note: "Interpretive note",
    is_quote: true,
    quote_label: "Key quotation",
    metadata: { confidence: "high" },
    created_by: sessions.owner.user.id,
    revision: 0,
  });
  const list = await body(await sessions.viewer.request.get(
    `${assignmentsPath(segment.id)}?code_id=${code.id}&limit=1&offset=0`
  ));
  expect(list.segment_codes).toEqual([expect.objectContaining({
    id: assignment.id,
    project_id: fixture!.project.id,
    segment_id: segment.id,
    code_id: code.id,
    analytic_note: "Interpretive note",
    is_quote: true,
    quote_label: "Key quotation",
    metadata: { confidence: "high" },
    revision: 0,
    created_by: sessions.owner.user.id,
    updated_by: sessions.owner.user.id,
  })]);
});

test(actionEvidenceTitle(
  "analysis.segment-code.create",
  ["duplicate", "validation"],
  "rejects a duplicate assignment without duplicating the terminal row"
), async () => {
  const segment = await createSegment();
  const code = await createCode();
  await assign(segment.id, code.id);
  const endpoint = assignmentsPath(segment.id);
  const duplicate = await sessions.owner.request.post(endpoint, { data: { code_id: code.id } });
  expect(duplicate.status()).toBe(409);
  expect(await body(duplicate)).toMatchObject({ error: "SEGMENT_CODE_ALREADY_EXISTS" });
  expect((await body(await sessions.owner.request.get(endpoint))).segment_codes).toHaveLength(1);
});

test([
  actionEvidenceTitle("analysis.segment-code.create", ["validation"], "rejects foreign segment and code identifiers"),
  actionEvidenceTitle("analysis.segment-code.update", ["validation"], "rejects a foreign assignment identifier without mutation"),
  actionEvidenceTitle("analysis.segment-code.delete", ["validation"], "rejects a foreign assignment identifier without deletion"),
].join(" | "), async () => {
  const localSegment = await createSegment();
  const localCode = await createCode();
  const foreign = await createQaProjectFixture(sessions);
  try {
    const foreignCode = await createCode(foreign.project.id);
    const foreignSegment = await createSegment(foreign.project.id, foreign.marker);
    const foreignAssignment = await assign(
      foreignSegment.id,
      foreignCode.id,
      { analytic_note: "unchanged" },
      foreign.project.id
    );

    expect((await sessions.owner.request.post(assignmentsPath(localSegment.id), { data: { code_id: foreignCode.id } })).status()).toBe(404);
    expect((await sessions.owner.request.post(assignmentsPath(foreignSegment.id), { data: { code_id: localCode.id } })).status()).toBe(404);
    expect((await sessions.owner.request.get(assignmentsPath(foreignSegment.id))).status()).toBe(404);

    const crossed = assignmentPath(localSegment.id, foreignAssignment.id);
    expect((await sessions.owner.request.patch(crossed, { data: { base_revision: foreignAssignment.revision, analytic_note: "crossed" } })).status()).toBe(404);
    expect((await sessions.owner.request.delete(crossed)).status()).toBe(404);
    const localRows = (await body(await sessions.owner.request.get(assignmentsPath(localSegment.id)))).segment_codes;
    expect(localRows).not.toContainEqual(expect.objectContaining({ id: foreignAssignment.id }));

    const foreignRows = (await body(await sessions.owner.request.get(
      assignmentsPath(foreignSegment.id, foreign.project.id)
    ))).segment_codes;
    expect(foreignRows).toContainEqual(expect.objectContaining({
      id: foreignAssignment.id,
      code_id: foreignCode.id,
      analytic_note: "unchanged",
      revision: foreignAssignment.revision,
      deleted_at: null,
    }));
  } finally { await foreign.cleanup(); }
});

test([
  actionEvidenceTitle("analysis.segment-code.update", ["success", "persistence", "validation", "cleanup"], "persists one update and rejects its stale revision"),
  actionEvidenceTitle("analysis.segment-code.delete", ["success", "persistence", "cleanup"], "deletes the exact matching assignment"),
].join(" | "), async () => {
  const segment = await createSegment();
  const code = await createCode();
  const assignment = await assign(segment.id, code.id);
  const path = assignmentPath(segment.id, assignment.id);
  const update = await sessions.editor.request.patch(path, {
    data: { base_revision: assignment.revision, analytic_note: "updated", is_quote: true, quote_label: "quote", metadata: { pass: 2 } },
  });
  expect(update.status()).toBe(200);
  const updated = (await body(update)).segment_code;
  expect(updated).toMatchObject({ id: assignment.id, analytic_note: "updated", revision: 1 });
  const persisted = (await body(
    await sessions.viewer.request.get(assignmentsPath(segment.id))
  )).segment_codes;
  expect(persisted).toEqual([expect.objectContaining({
    id: updated.id,
    segment_id: segment.id,
    code_id: code.id,
    analytic_note: updated.analytic_note,
    is_quote: updated.is_quote,
    quote_label: updated.quote_label,
    metadata: updated.metadata,
    revision: updated.revision,
    updated_by: sessions.editor.user.id,
  })]);
  const stale = await sessions.owner.request.patch(path, { data: { base_revision: assignment.revision, analytic_note: "stale" } });
  expect(stale.status()).toBe(409);
  expect(await body(stale)).toMatchObject({ error: "SEGMENT_CODE_REVISION_CONFLICT" });
  const otherSegment = await createSegment();
  expect((await sessions.owner.request.delete(assignmentPath(otherSegment.id, assignment.id))).status()).toBe(404);
  expect((await sessions.owner.request.delete(path)).status()).toBe(200);
  expect((await body(await sessions.owner.request.get(assignmentsPath(segment.id)))).segment_codes).toEqual([]);
});

test([
  actionEvidenceTitle("analysis.segment-codes.list", ["permissions"], "allows member reads and denies non-members"),
  actionEvidenceTitle("analysis.segment-code.create", ["permissions"], "allows owner and editor assignment creation only"),
  actionEvidenceTitle("analysis.segment-code.update", ["permissions"], "allows owner and editor assignment updates only"),
  actionEvidenceTitle("analysis.segment-code.delete", ["permissions"], "allows owner and editor assignment deletion only"),
].join(" | "), async () => {
  const segment = await createSegment();
  const ownerCode = await createCode();
  const editorCode = await createCode();
  const viewerCode = await createCode();
  const ownerAssignment = await assign(segment.id, ownerCode.id);
  const endpoint = assignmentsPath(segment.id);
  const item = assignmentPath(segment.id, ownerAssignment.id);

  expect((await sessions.owner.request.get(endpoint)).status()).toBe(200);
  expect((await sessions.editor.request.get(endpoint)).status()).toBe(200);
  expect((await sessions.viewer.request.get(endpoint)).status()).toBe(200);
  expect((await sessions.intruder.request.get(endpoint)).status()).toBe(403);
  expect((await anonymous!.get(endpoint)).status()).toBe(401);

  const editorCreate = await sessions.editor.request.post(endpoint, { data: { code_id: editorCode.id } });
  expect(editorCreate.status()).toBe(201);
  const editorAssignment = (await body(editorCreate)).segment_code;
  expect((await sessions.viewer.request.post(endpoint, { data: { code_id: viewerCode.id } })).status()).toBe(403);
  expect((await sessions.intruder.request.post(endpoint, { data: { code_id: viewerCode.id } })).status()).toBe(403);
  expect((await anonymous!.post(endpoint, { data: { code_id: viewerCode.id } })).status()).toBe(401);

  expect((await sessions.owner.request.patch(item, { data: { base_revision: ownerAssignment.revision, analytic_note: "owner" } })).status()).toBe(200);
  expect((await sessions.editor.request.patch(assignmentPath(segment.id, editorAssignment.id), { data: { base_revision: editorAssignment.revision, analytic_note: "editor" } })).status()).toBe(200);
  expect((await sessions.viewer.request.patch(item, { data: { base_revision: 0 } })).status()).toBe(403);
  expect((await sessions.intruder.request.patch(item, { data: { base_revision: 0 } })).status()).toBe(403);
  expect((await anonymous!.patch(item, { data: {} })).status()).toBe(401);

  const ownerDelete = await assign(segment.id, await createCode().then((code) => code.id));
  const editorDelete = await assign(segment.id, await createCode().then((code) => code.id));
  expect((await sessions.owner.request.delete(assignmentPath(segment.id, ownerDelete.id))).status()).toBe(200);
  expect((await sessions.editor.request.delete(assignmentPath(segment.id, editorDelete.id))).status()).toBe(200);
  expect((await sessions.viewer.request.delete(item)).status()).toBe(403);
  expect((await sessions.intruder.request.delete(item)).status()).toBe(403);
  expect((await anonymous!.delete(item)).status()).toBe(401);
});

test(actionEvidenceTitle(
  "analysis.segment-code.create",
  ["concurrency"],
  "commits exactly one of two simultaneous identical assignments"
), async () => {
  const segment = await createSegment();
  const code = await createCode();
  const endpoint = assignmentsPath(segment.id);
  const responses = await Promise.all([
    sessions.owner.request.post(endpoint, { data: { code_id: code.id, analytic_note: "owner" } }),
    sessions.editor.request.post(endpoint, { data: { code_id: code.id, analytic_note: "editor" } }),
  ]);
  classifyOneWinnerRace(responses.map((response) => response.status()), 201, 409);
  const winner = responses.find((response) => response.status() === 201)!;
  const loser = responses.find((response) => response.status() === 409)!;
  const created = (await body(winner)).segment_code;
  expect(await body(loser)).toEqual({ ok: false, error: "SEGMENT_CODE_ALREADY_EXISTS" });
  const rows = (await body(await sessions.owner.request.get(endpoint))).segment_codes;
  expect(rows).toEqual([expect.objectContaining({
    id: created.id,
    segment_id: segment.id,
    code_id: code.id,
    analytic_note: created.analytic_note,
    revision: created.revision,
    created_by: created.created_by,
    updated_by: created.updated_by,
  })]);
});
