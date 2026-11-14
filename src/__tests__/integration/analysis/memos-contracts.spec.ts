/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, request, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import { createQaProjectFixture, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { closeQaSessions, createQaSessions, type QaSessions } from "@/__tests__/backend/sessions";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects/:id/analysis/memos"],
  ["POST", "/api/projects/:id/analysis/memos"],
  ["GET", "/api/projects/:id/analysis/memos/:memoId"],
  ["PATCH", "/api/projects/:id/analysis/memos/:memoId"],
  ["DELETE", "/api/projects/:id/analysis/memos/:memoId"],
] as const;

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;
let anonymous: APIRequestContext | undefined;

async function json(response: APIResponse) {
  expect(response.headers()["content-type"]).toContain("application/json");
  return (await response.json()) as Record<string, any>;
}

async function createMemo(overrides: Record<string, unknown> = {}) {
  const response = await sessions.owner.request.post(`/api/projects/${fixture!.project.id}/analysis/memos`, {
    data: { title: `${fixture!.marker} analytic memo`, body: "Observed pattern", tags: ["alpha", "field"], ...overrides },
  });
  expect(response.status()).toBe(201);
  return (await json(response)).memo as Record<string, any>;
}

test.beforeAll(async ({ baseURL }) => {
  sessions = await createQaSessions();
  anonymous = await request.newContext({ baseURL });
});
test.beforeEach(async () => { fixture = await createQaProjectFixture(sessions); });
test.afterEach(async () => { await fixture?.cleanup(); fixture = undefined; });
test.afterAll(async () => {
  await anonymous?.dispose();
  anonymous = undefined;
  await closeQaSessions(sessions);
});

test(actionEvidenceTitle(
  "analysis.memo.create",
  ["success", "persistence", "permissions", "cleanup"],
  "allows owner and editor creation with immutable author and audit fields"
), async () => {
  const ownerMemo = await createMemo({ status: "draft" });
  expect(ownerMemo).toMatchObject({ project_id: fixture!.project.id, created_by: sessions.owner.user.id, status: "draft", revision: 0 });
  const ownerReadback = await sessions.viewer.request.get(
    `/api/projects/${fixture!.project.id}/analysis/memos/${ownerMemo.id}`
  );
  expect(ownerReadback.status()).toBe(200);
  expect((await json(ownerReadback)).memo).toMatchObject({
    id: ownerMemo.id,
    project_id: fixture!.project.id,
    title: ownerMemo.title,
    body: "Observed pattern",
    status: "draft",
    tags: ["alpha", "field"],
    revision: 0,
    created_by: sessions.owner.user.id,
    updated_by: sessions.owner.user.id,
  });

  const editorCreate = await sessions.editor.request.post(`/api/projects/${fixture!.project.id}/analysis/memos`, {
    data: { title: `${fixture!.marker} editor memo`, body: "Editor body" },
  });
  expect(editorCreate.status()).toBe(201);
  const editorMemo = (await json(editorCreate)).memo;
  expect(editorMemo).toMatchObject({ created_by: sessions.editor.user.id, updated_by: sessions.editor.user.id });
  const editorReadback = await sessions.owner.request.get(
    `/api/projects/${fixture!.project.id}/analysis/memos/${editorMemo.id}`
  );
  expect(editorReadback.status()).toBe(200);
  expect((await json(editorReadback)).memo).toMatchObject({
    id: editorMemo.id,
    title: `${fixture!.marker} editor memo`,
    body: "Editor body",
    revision: 0,
    created_by: sessions.editor.user.id,
    updated_by: sessions.editor.user.id,
  });
});

test([
  actionEvidenceTitle("analysis.memos.list", ["permissions"], "allows member lists and denies non-members"),
  actionEvidenceTitle("analysis.memo.read", ["success", "permissions"], "allows member detail reads and denies non-members"),
  actionEvidenceTitle("analysis.memo.create", ["permissions"], "denies viewer, intruder, and anonymous creation"),
  actionEvidenceTitle("analysis.memo.update", ["permissions"], "denies viewer, intruder, and anonymous updates"),
  actionEvidenceTitle("analysis.memo.delete", ["permissions"], "denies viewer, intruder, and anonymous deletion"),
].join(" | "), async () => {
  const memo = await createMemo();
  const collection = `/api/projects/${fixture!.project.id}/analysis/memos`;
  const path = `${collection}/${memo.id}`;
  for (const role of ["owner", "editor", "viewer"] as const) {
    expect((await sessions[role].request.get(collection)).status()).toBe(200);
    expect((await sessions[role].request.get(path)).status()).toBe(200);
  }
  expect((await sessions.intruder.request.get(collection)).status()).toBe(403);
  expect((await anonymous!.get(collection)).status()).toBe(401);
  expect((await sessions.intruder.request.get(path)).status()).toBe(403);
  expect((await anonymous!.get(path)).status()).toBe(401);
  for (const requestContext of [sessions.viewer.request, sessions.intruder.request]) {
    expect((await requestContext.post(collection, { data: { title: "denied" } })).status()).toBe(403);
    expect((await requestContext.patch(path, { data: { base_revision: memo.revision, title: "denied" } })).status()).toBe(403);
    expect((await requestContext.delete(path)).status()).toBe(403);
  }
  expect((await anonymous!.post(collection, { data: { title: "denied" } })).status()).toBe(401);
  expect((await anonymous!.patch(path, { data: {} })).status()).toBe(401);
  expect((await anonymous!.delete(path)).status()).toBe(401);
});

test(actionEvidenceTitle(
  "analysis.memos.list",
  ["success"],
  "filters by search, status, type, and bounded pagination"
), async () => {
  await createMemo({ title: `${fixture!.marker} Needle`, memo_type: "field", status: "reviewed", tags: ["rare-tag"] });
  await createMemo({ title: `${fixture!.marker} Other`, memo_type: "analytic", tags: ["common"] });
  const response = await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/memos?search=Needle&memo_type=field&status=reviewed&limit=1&offset=0`);
  expect(response.status()).toBe(200);
  expect((await json(response)).memos).toEqual([expect.objectContaining({ title: `${fixture!.marker} Needle` })]);
  expect((await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/memos?limit=201`)).status()).toBe(400);
});

test(actionEvidenceTitle(
  "analysis.memo.update",
  ["success", "persistence", "validation", "cleanup"],
  "persists status and tags once and rejects a stale revision"
), async () => {
  const memo = await createMemo();
  const path = `/api/projects/${fixture!.project.id}/analysis/memos/${memo.id}`;
  const update = await sessions.editor.request.patch(path, { data: { base_revision: memo.revision, status: "confirmed", tags: ["confirmed"] } });
  expect(update.status()).toBe(200);
  const updated = (await json(update)).memo;
  expect(updated).toMatchObject({ id: memo.id, status: "confirmed", tags: ["confirmed"], revision: memo.revision + 1, updated_by: sessions.editor.user.id });
  const updateReadback = (await json(await sessions.viewer.request.get(path))).memo;
  expect(updateReadback).toMatchObject({
    id: updated.id,
    status: updated.status,
    tags: updated.tags,
    revision: updated.revision,
    created_by: memo.created_by,
    updated_by: sessions.editor.user.id,
  });
  const stale = await sessions.owner.request.patch(path, { data: { base_revision: memo.revision, title: "stale" } });
  expect(stale.status()).toBe(409);
  expect(await json(stale)).toMatchObject({ ok: false, error: "MEMO_REVISION_CONFLICT" });
  const boundary = await sessions.owner.request.patch(path, { data: { base_revision: memo.revision + 1, title: "m".repeat(250) } });
  expect(boundary.status()).toBe(200);
  const boundaryMemo = (await json(boundary)).memo;
  expect(boundaryMemo.title).toHaveLength(250);
  expect((await json(await sessions.owner.request.get(path))).memo).toMatchObject({
    id: boundaryMemo.id,
    title: boundaryMemo.title,
    status: boundaryMemo.status,
    tags: boundaryMemo.tags,
    revision: boundaryMemo.revision,
    updated_by: sessions.owner.user.id,
  });
  for (const data of [
    { base_revision: boundaryMemo.revision, title: "m".repeat(251) },
    { base_revision: boundaryMemo.revision, title: "valid", immutable: true },
    { title: "missing revision" },
  ]) expect((await sessions.owner.request.patch(path, { data })).status()).toBe(400);
});

test(actionEvidenceTitle(
  "analysis.memo.delete",
  ["success", "persistence", "cleanup"],
  "soft deletes the exact memo and hides it from active reads"
), async () => {
  const memo = await createMemo();
  const path = `/api/projects/${fixture!.project.id}/analysis/memos/${memo.id}`;
  expect((await sessions.owner.request.delete(path)).status()).toBe(200);
  expect((await sessions.owner.request.get(path)).status()).toBe(404);
  const normal = await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/memos`));
  expect((normal.memos as Array<{ id: string }>).some((row) => row.id === memo.id)).toBe(false);
  const deleted = await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/memos?include_deleted=true`));
  expect(deleted.memos).toContainEqual(expect.objectContaining({ id: memo.id, deleted_at: expect.any(String) }));
  expect((await sessions.intruder.request.get(path)).status()).toBe(403);
});

test(actionEvidenceTitle(
  "analysis.memo.create",
  ["validation"],
  "rejects strict invalid payloads and malformed JSON"
), async () => {
  const endpoint = `/api/projects/${fixture!.project.id}/analysis/memos`;
  for (const data of [{ title: "" }, { title: "x".repeat(251) }, { title: "valid", created_by: sessions.owner.user.id }, { title: "valid", tags: Array(101).fill("tag") }]) {
    expect((await sessions.owner.request.post(endpoint, { data })).status()).toBe(400);
  }
  expect((await sessions.owner.request.post(endpoint, { data: "{", headers: { "content-type": "application/json" } })).status()).toBe(400);
});

test("PRODUCT GAP (out of presentation scope): memo listing does not yet support filtering by tag", async () => {
  await createMemo({ title: `${fixture!.marker} tagged`, tags: ["rare-tag"] });
  await createMemo({ title: `${fixture!.marker} untagged`, tags: ["other-tag"] });
  const response = await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/memos?tag=rare-tag`);
  expect(response.status()).toBe(200);
  expect((await json(response)).memos).toEqual([
    expect.objectContaining({ tags: expect.arrayContaining(["rare-tag"]) }),
  ]);
});

test(actionEvidenceTitle(
  "analysis.memo.create",
  ["duplicate", "concurrency"],
  "persists two distinct memos when simultaneous creates intentionally share content"
), async () => {
  const title = `${fixture!.marker} intentionally repeated memo`;
  const endpoint = `/api/projects/${fixture!.project.id}/analysis/memos`;
  const responses = await Promise.all([
    sessions.owner.request.post(endpoint, { data: { title, body: "same" } }),
    sessions.editor.request.post(endpoint, { data: { title, body: "same" } }),
  ]);
  expect(responses.map((response) => response.status())).toEqual([201, 201]);
  const created = await Promise.all(responses.map(async (response) => (await json(response)).memo));
  const ids = created.map((memo) => memo.id);
  expect(new Set(ids).size).toBe(2);
  const rows = (await json(await sessions.viewer.request.get(
    `${endpoint}?search=${encodeURIComponent(title)}`
  ))).memos as Array<Record<string, any>>;
  expect(rows).toHaveLength(2);
  for (const memo of created) {
    expect(rows).toContainEqual(expect.objectContaining({
      id: memo.id,
      title,
      body: "same",
      revision: memo.revision,
      created_by: memo.created_by,
      updated_by: memo.updated_by,
    }));
  }
});

test([
  actionEvidenceTitle("analysis.memo.read", ["validation"], "rejects a foreign memo identifier"),
  actionEvidenceTitle("analysis.memo.update", ["validation"], "rejects a foreign memo identifier without mutation"),
  actionEvidenceTitle("analysis.memo.delete", ["validation"], "rejects a foreign memo identifier without deletion"),
].join(" | "), async () => {
  const foreign = await createQaProjectFixture(sessions);
  try {
    const response = await sessions.owner.request.post(
      `/api/projects/${foreign.project.id}/analysis/memos`,
      { data: { title: `${foreign.marker} unchanged` } }
    );
    expect(response.status()).toBe(201);
    const foreignMemo = (await json(response)).memo;
    const crossed = `/api/projects/${fixture!.project.id}/analysis/memos/${foreignMemo.id}`;
    expect((await sessions.owner.request.get(crossed)).status()).toBe(404);
    expect((await sessions.owner.request.patch(crossed, {
      data: { base_revision: foreignMemo.revision, title: "crossed" },
    })).status()).toBe(404);
    expect((await sessions.owner.request.delete(crossed)).status()).toBe(404);
    const proof = await sessions.owner.request.get(
      `/api/projects/${foreign.project.id}/analysis/memos/${foreignMemo.id}`
    );
    expect(proof.status()).toBe(200);
    expect((await json(proof)).memo).toMatchObject({
      id: foreignMemo.id,
      title: `${foreign.marker} unchanged`,
      deleted_at: null,
    });
  } finally {
    await foreign.cleanup();
  }
});
