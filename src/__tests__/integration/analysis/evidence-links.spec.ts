/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, request, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { createQaProjectFixture, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { closeQaSessions, createQaSessions, type QaSessions } from "@/__tests__/backend/sessions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import { codeFixtureData } from "@/__tests__/backend/task10-test-helpers";
import { cleanupTask11Fixtures } from "@/__tests__/integration/analysis/task11-test-helpers";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects/:id/analysis/memos/:memoId/links"], ["POST", "/api/projects/:id/analysis/memos/:memoId/links"],
  ["DELETE", "/api/projects/:id/analysis/memos/:memoId/links/:linkId"], ["GET", "/api/projects/:id/analysis/insights/:insightId/links"],
  ["POST", "/api/projects/:id/analysis/insights/:insightId/links"], ["DELETE", "/api/projects/:id/analysis/insights/:insightId/links/:linkId"],
] as const;
let sessions: QaSessions; let fixture: QaProjectFixture | undefined; let foreign: QaProjectFixture | undefined; let anonymous: APIRequestContext;
async function json(response: APIResponse) { return (await response.json()) as Record<string, any>; }
async function create(path: string, data: Record<string, unknown>, key: string) { const response = await sessions.owner.request.post(path, { data }); expect(response.status()).toBe(201); return (await json(response))[key] as Record<string, any>; }
test.beforeAll(async ({ baseURL }) => { sessions = await createQaSessions(); anonymous = await request.newContext({ baseURL }); });
test.beforeEach(async () => { fixture = await createQaProjectFixture(sessions); foreign = await createQaProjectFixture(sessions); });
test.afterEach(async () => { await cleanupTask11Fixtures(fixture, foreign); foreign = fixture = undefined; });
test.afterAll(async () => { await anonymous.dispose(); await closeQaSessions(sessions); });

test([
  actionEvidenceTitle("analysis.memo-link.create", ["success", "persistence", "cleanup"], "persists document, segment, code, and participant evidence links"),
  actionEvidenceTitle("analysis.memo-links.list", ["success"], "lists every persisted memo evidence link"),
  actionEvidenceTitle("analysis.memo-link.delete", ["success", "persistence", "permissions", "cleanup"], "allows an editor-created link to be deleted only by writers"),
].join(" | "), async () => {
  const document = await create(`/api/projects/${fixture!.project.id}/documents`, { title: `${fixture!.marker} evidence`, content: "evidence text" }, "document");
  const segment = await create(`/api/projects/${fixture!.project.id}/documents/${document.id}/segments`, { base_document_revision: document.revision, start_char: 0, end_char: 8, selected_text: "evidence" }, "segment");
  const code = await create(`/api/projects/${fixture!.project.id}/analysis/codes`, codeFixtureData({ name: `${fixture!.marker} evidence code`, color: "#234567" }), "code");
  const participant = await create(`/api/projects/${fixture!.project.id}/participants`, { alias: `${fixture!.marker} participant` }, "participant");
  const memo = await create(`/api/projects/${fixture!.project.id}/analysis/memos`, { title: `${fixture!.marker} memo` }, "memo");
  const endpoint = `/api/projects/${fixture!.project.id}/analysis/memos/${memo.id}/links`;
  const targets = [
    { link_type: "document", document_id: document.id },
    { link_type: "segment", segment_id: segment.id },
    { link_type: "code", code_id: code.id },
    { link_type: "participant", participant_id: participant.id },
  ];
  const links = [];
  for (const data of targets) {
    const response = await sessions.editor.request.post(endpoint, { data });
    expect(response.status()).toBe(201);
    links.push((await json(response)).link);
  }
  const listed = (await json(await sessions.viewer.request.get(endpoint))).links;
  for (const target of targets) expect(listed).toContainEqual(expect.objectContaining(target));
  expect((await sessions.viewer.request.delete(`${endpoint}/${links[0].id}`)).status()).toBe(403);
  expect((await sessions.intruder.request.delete(`${endpoint}/${links[0].id}`)).status()).toBe(403);
  expect((await anonymous.delete(`${endpoint}/${links[0].id}`)).status()).toBe(401);
  for (const link of links) expect((await sessions.owner.request.delete(`${endpoint}/${link.id}`)).status()).toBe(200);
  expect((await json(await sessions.owner.request.get(endpoint))).links).toEqual([]);
});

test([
  actionEvidenceTitle("analysis.memo-links.list", ["permissions"], "allows member reads and denies anonymous users and intruders"),
  actionEvidenceTitle("analysis.memo-link.create", ["permissions"], "allows writers and denies viewer, anonymous, and intruder creation"),
  actionEvidenceTitle("analysis.insight-links.list", ["permissions"], "allows member reads and denies anonymous users and intruders"),
  actionEvidenceTitle("analysis.insight-link.create", ["permissions"], "allows writers and denies viewer, anonymous, and intruder creation"),
].join(" | "), async () => {
  const memo = await create(`/api/projects/${fixture!.project.id}/analysis/memos`, { title: `${fixture!.marker} protected memo` }, "memo");
  const insight = await create(`/api/projects/${fixture!.project.id}/analysis/insights`, { title: `${fixture!.marker} protected insight` }, "insight");
  for (const endpoint of [
    `/api/projects/${fixture!.project.id}/analysis/memos/${memo.id}/links`,
    `/api/projects/${fixture!.project.id}/analysis/insights/${insight.id}/links`,
  ]) {
    for (const role of ["owner", "editor", "viewer"] as const) {
      expect((await sessions[role].request.get(endpoint)).status()).toBe(200);
    }
    expect((await anonymous.get(endpoint)).status()).toBe(401);
    expect((await sessions.intruder.request.get(endpoint)).status()).toBe(403);
    expect((await sessions.viewer.request.post(endpoint, { data: { link_type: "document", document_id: memo.id } })).status()).toBe(403);
    expect((await anonymous.post(endpoint, { data: { link_type: "document", document_id: memo.id } })).status()).toBe(401);
    expect((await sessions.intruder.request.post(endpoint, { data: { link_type: "document", document_id: memo.id } })).status()).toBe(403);
  }
});

test([
  actionEvidenceTitle("analysis.insight-link.create", ["success", "persistence", "validation", "cleanup"], "persists a local memo target and rejects a foreign target"),
  actionEvidenceTitle("analysis.insight-links.list", ["success"], "lists the exact persisted insight link"),
  actionEvidenceTitle("analysis.insight-link.delete", ["success", "persistence", "permissions", "cleanup", "duplicate"], "allows writers to delete the exact insight link and makes a retry a no-op conflict"),
].join(" | "), async () => {
  const memo = await create(`/api/projects/${fixture!.project.id}/analysis/memos`, { title: `${fixture!.marker} local memo` }, "memo");
  const foreignMemo = await create(`/api/projects/${foreign!.project.id}/analysis/memos`, { title: `${foreign!.marker} foreign memo` }, "memo");
  const insight = await create(`/api/projects/${fixture!.project.id}/analysis/insights`, { title: `${fixture!.marker} insight` }, "insight");
  const endpoint = `/api/projects/${fixture!.project.id}/analysis/insights/${insight.id}/links`;
  const createResponse = await sessions.owner.request.post(endpoint, { data: { link_type: "memo", memo_id: memo.id } });
  expect(createResponse.status()).toBe(201);
  const link = (await json(createResponse)).link;
  expect((await json(await sessions.viewer.request.get(endpoint))).links).toEqual([
    expect.objectContaining({ id: link.id, link_type: "memo", memo_id: memo.id }),
  ]);
  const cross = await sessions.owner.request.post(endpoint, { data: { link_type: "memo", memo_id: foreignMemo.id } });
  expect(cross.status()).toBe(400); expect(await json(cross)).toMatchObject({ ok: false, error: "INVALID_LINK_TARGET" });
  expect((await sessions.viewer.request.delete(`${endpoint}/${link.id}`)).status()).toBe(403);
  expect((await sessions.intruder.request.delete(`${endpoint}/${link.id}`)).status()).toBe(403);
  expect((await anonymous.delete(`${endpoint}/${link.id}`)).status()).toBe(401);
  expect((await sessions.editor.request.delete(`${endpoint}/${link.id}`)).status()).toBe(200);
  expect((await sessions.owner.request.delete(`${endpoint}/${link.id}`)).status()).toBe(404);
  expect((await json(await sessions.owner.request.get(endpoint))).links).toEqual([]);
});

test([
  actionEvidenceTitle("analysis.memo-link.create", ["validation"], "rejects missing, mismatched, malformed, and unsupported targets"),
  actionEvidenceTitle("analysis.memo-link.delete", ["validation"], "rejects a missing memo link identifier"),
  actionEvidenceTitle("analysis.insight-link.delete", ["validation"], "rejects a missing insight link identifier"),
].join(" | "), async () => {
  const memo = await create(`/api/projects/${fixture!.project.id}/analysis/memos`, { title: `${fixture!.marker} memo` }, "memo");
  const endpoint = `/api/projects/${fixture!.project.id}/analysis/memos/${memo.id}/links`;
  const uuid = "00000000-0000-4000-8000-000000000001";
  for (const data of [
    { link_type: "document" }, { link_type: "document", code_id: uuid }, { link_type: "document", document_id: uuid },
    { link_type: "matrix_cell", matrix_cell_id: uuid }, { link_type: "visual", visual_id: uuid },
  ]) expect((await sessions.owner.request.post(endpoint, { data })).status()).toBe(400);
  const missing = "00000000-0000-4000-8000-000000000002";
  expect((await sessions.owner.request.delete(`${endpoint}/${missing}`)).status()).toBe(404);
  const insight = await create(`/api/projects/${fixture!.project.id}/analysis/insights`, { title: `${fixture!.marker} delete validation` }, "insight");
  expect((await sessions.owner.request.delete(
    `/api/projects/${fixture!.project.id}/analysis/insights/${insight.id}/links/${missing}`
  )).status()).toBe(404);
});

test(actionEvidenceTitle(
  "analysis.insight-link.create",
  ["duplicate", "concurrency"],
  "commits one of two simultaneous identical links and preserves one terminal row"
), async () => {
  const document = await create(`/api/projects/${fixture!.project.id}/documents`, { title: `${fixture!.marker} race doc` }, "document");
  const insight = await create(`/api/projects/${fixture!.project.id}/analysis/insights`, { title: `${fixture!.marker} race insight` }, "insight");
  const endpoint = `/api/projects/${fixture!.project.id}/analysis/insights/${insight.id}/links`;
  const responses = await Promise.all([sessions.owner.request.post(endpoint, { data: { link_type: "document", document_id: document.id } }), sessions.editor.request.post(endpoint, { data: { link_type: "document", document_id: document.id } })]);
  expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
  const winner = responses.find((response) => response.status() === 201)!;
  const loser = responses.find((response) => response.status() === 409)!;
  const created = (await json(winner)).link;
  expect(await json(loser)).toMatchObject({
    ok: false,
    error: "INSIGHT_LINK_ALREADY_EXISTS",
  });
  expect((await json(await sessions.owner.request.get(endpoint))).links).toEqual([
    expect.objectContaining({
      id: created.id,
      insight_id: insight.id,
      link_type: "document",
      document_id: document.id,
      created_by: created.created_by,
    }),
  ]);
});

test([
  actionEvidenceTitle("analysis.memo-link.create", ["duplicate", "concurrency"], "rejects a duplicate memo link without creating a second row"),
  actionEvidenceTitle("analysis.memo-link.delete", ["duplicate"], "returns not found when deletion is retried"),
].join(" | "), async () => {
  const document = await create(`/api/projects/${fixture!.project.id}/documents`, { title: `${fixture!.marker} duplicate doc` }, "document");
  const memo = await create(`/api/projects/${fixture!.project.id}/analysis/memos`, { title: `${fixture!.marker} duplicate memo` }, "memo");
  const endpoint = `/api/projects/${fixture!.project.id}/analysis/memos/${memo.id}/links`;
  const responses = await Promise.all([
    sessions.owner.request.post(endpoint, { data: { link_type: "document", document_id: document.id } }),
    sessions.editor.request.post(endpoint, { data: { link_type: "document", document_id: document.id } }),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
  const created = responses.find((response) => response.status() === 201)!;
  const rejected = responses.find((response) => response.status() === 409)!;
  const link = (await json(created)).link;
  expect(await json(rejected)).toMatchObject({ ok: false, error: "MEMO_LINK_ALREADY_EXISTS" });
  expect((await json(await sessions.owner.request.get(endpoint))).links).toEqual([
    expect.objectContaining({
      id: link.id,
      memo_id: memo.id,
      link_type: "document",
      document_id: document.id,
      created_by: link.created_by,
    }),
  ]);
  expect((await sessions.owner.request.delete(`${endpoint}/${link.id}`)).status()).toBe(200);
  expect((await sessions.owner.request.delete(`${endpoint}/${link.id}`)).status()).toBe(404);
});
