/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, request, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import { createQaProjectFixture, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { closeQaSessions, createQaSessions, type QaSessions } from "@/__tests__/backend/sessions";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects/:id/analysis/insights"], ["POST", "/api/projects/:id/analysis/insights"],
  ["GET", "/api/projects/:id/analysis/insights/:insightId"], ["PATCH", "/api/projects/:id/analysis/insights/:insightId"],
  ["DELETE", "/api/projects/:id/analysis/insights/:insightId"],
] as const;

let sessions: QaSessions; let fixture: QaProjectFixture | undefined; let anonymous: APIRequestContext | undefined;
async function json(response: APIResponse) { expect(response.headers()["content-type"]).toContain("application/json"); return (await response.json()) as Record<string, any>; }
async function createInsight(overrides: Record<string, unknown> = {}) {
  const response = await sessions.owner.request.post(`/api/projects/${fixture!.project.id}/analysis/insights`, { data: { title: `${fixture!.marker} finding`, summary: "Deterministic summary", tags: ["alpha"], ...overrides } });
  expect(response.status()).toBe(201); return (await json(response)).insight as Record<string, any>;
}
test.beforeAll(async ({ baseURL }) => { sessions = await createQaSessions(); anonymous = await request.newContext({ baseURL }); });
test.beforeEach(async () => { fixture = await createQaProjectFixture(sessions); });
test.afterEach(async () => { await fixture?.cleanup(); fixture = undefined; });
test.afterAll(async () => { await anonymous?.dispose(); anonymous = undefined; await closeQaSessions(sessions); });

test([
  actionEvidenceTitle("analysis.insight.create", ["success", "persistence", "cleanup"], "creates an insight with author and audit identity"),
  actionEvidenceTitle("analysis.insight.read", ["success"], "reads the exact persisted insight"),
].join(" | "), async () => {
  const insight = await createInsight({ insight_type: "contrast", confidence: "high", status: "draft" });
  expect(insight).toMatchObject({ project_id: fixture!.project.id, created_by: sessions.owner.user.id, updated_by: sessions.owner.user.id, revision: 0 });
  for (const role of ["owner", "editor", "viewer"] as const) {
    const response = await sessions[role].request.get(`/api/projects/${fixture!.project.id}/analysis/insights/${insight.id}`);
    expect(response.status()).toBe(200);
    expect((await json(response)).insight).toMatchObject({
      id: insight.id,
      project_id: fixture!.project.id,
      title: insight.title,
      summary: "Deterministic summary",
      insight_type: "contrast",
      confidence: "high",
      status: "draft",
      tags: ["alpha"],
      revision: 0,
      created_by: sessions.owner.user.id,
      updated_by: sessions.owner.user.id,
    });
  }
});

test([
  actionEvidenceTitle("analysis.insights.list", ["permissions"], "allows member lists and denies non-members"),
  actionEvidenceTitle("analysis.insight.read", ["permissions"], "allows member detail reads and denies non-members"),
  actionEvidenceTitle("analysis.insight.create", ["permissions"], "allows owner and editor creation only"),
  actionEvidenceTitle("analysis.insight.update", ["permissions"], "allows owner and editor updates only"),
  actionEvidenceTitle("analysis.insight.delete", ["permissions"], "allows owner and editor deletion only"),
].join(" | "), async () => {
  const insight = await createInsight(); const path = `/api/projects/${fixture!.project.id}/analysis/insights/${insight.id}`;
  const collection = `/api/projects/${fixture!.project.id}/analysis/insights`;
  for (const role of ["owner", "editor", "viewer"] as const) {
    expect((await sessions[role].request.get(collection)).status()).toBe(200);
    expect((await sessions[role].request.get(path)).status()).toBe(200);
  }
  expect((await sessions.intruder.request.get(collection)).status()).toBe(403);
  expect((await anonymous!.get(collection)).status()).toBe(401);
  expect((await sessions.intruder.request.get(path)).status()).toBe(403);
  expect((await anonymous!.get(path)).status()).toBe(401);
  expect((await sessions.editor.request.post(collection, {
    data: { title: `${fixture!.marker} editor insight` },
  })).status()).toBe(201);
  for (const requestContext of [sessions.viewer.request, sessions.intruder.request]) {
    expect((await requestContext.post(collection, { data: { title: "denied" } })).status()).toBe(403);
    expect((await requestContext.patch(path, { data: { base_revision: insight.revision, title: "denied" } })).status()).toBe(403);
    expect((await requestContext.delete(path)).status()).toBe(403);
  }
  expect((await anonymous!.post(collection, { data: { title: "denied" } })).status()).toBe(401);
  expect((await anonymous!.patch(path, { data: {} })).status()).toBe(401);
  expect((await anonymous!.delete(path)).status()).toBe(401);
});

test(actionEvidenceTitle(
  "analysis.insights.list",
  ["success"],
  "filters search, type, confidence, status, links, and caps"
), async () => {
  await createInsight({ title: `${fixture!.marker} Needle`, insight_type: "contrast", confidence: "low", status: "reviewed", tags: ["rare"] });
  await createInsight({ title: `${fixture!.marker} Other`, insight_type: "pattern", confidence: "high" });
  const response = await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/insights?search=Needle&insight_type=contrast&confidence=low&status=reviewed&include_links=true&limit=1`);
  expect(response.status()).toBe(200); const value = await json(response);
  expect(value.insights).toEqual([expect.objectContaining({ title: `${fixture!.marker} Needle` })]); expect(value.links).toEqual([]);
  expect((await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/insights?limit=201`)).status()).toBe(400);
});

test(actionEvidenceTitle(
  "analysis.insight.update",
  ["success", "persistence", "validation", "concurrency", "cleanup"],
  "commits one status transition and rejects a concurrent stale revision"
), async () => {
  const insight = await createInsight(); const path = `/api/projects/${fixture!.project.id}/analysis/insights/${insight.id}`;
  const [first, second] = await Promise.all([
    sessions.owner.request.patch(path, { data: { base_revision: insight.revision, status: "confirmed", tags: ["winner"] } }),
    sessions.editor.request.patch(path, { data: { base_revision: insight.revision, status: "archived", tags: ["loser"] } }),
  ]);
  expect([first.status(), second.status()].sort()).toEqual([200, 409]);
  const winner = [first, second].find((response) => response.status() === 200)!;
  const loser = [first, second].find((response) => response.status() === 409)!;
  const winningInsight = (await json(winner)).insight;
  expect(await json(loser)).toEqual({ ok: false, error: "INSIGHT_REVISION_CONFLICT" });
  const current = (await json(await sessions.owner.request.get(path))).insight;
  expect(current).toMatchObject({
    id: winningInsight.id,
    status: winningInsight.status,
    tags: winningInsight.tags,
    revision: winningInsight.revision,
    updated_by: winningInsight.updated_by,
  });
  expect(current.revision).toBe(insight.revision + 1);
  const boundary = await sessions.owner.request.patch(path, { data: { base_revision: current.revision, title: "i".repeat(250) } });
  expect(boundary.status()).toBe(200);
  const updated = (await json(boundary)).insight;
  expect(updated.title).toHaveLength(250);
  for (const data of [
    { base_revision: updated.revision, title: "i".repeat(251) },
    { base_revision: updated.revision, title: "valid", immutable: true },
    { title: "missing revision" },
  ]) expect((await sessions.owner.request.patch(path, { data })).status()).toBe(400);
});

test(actionEvidenceTitle(
  "analysis.insight.delete",
  ["success", "persistence", "cleanup"],
  "soft deletes the exact insight and hides it from active reads"
), async () => {
  const insight = await createInsight(); const path = `/api/projects/${fixture!.project.id}/analysis/insights/${insight.id}`;
  expect((await sessions.editor.request.delete(path)).status()).toBe(200); expect((await sessions.owner.request.get(path)).status()).toBe(404);
  const normal = await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/insights`));
  expect((normal.insights as Array<{ id: string }>).some((row) => row.id === insight.id)).toBe(false);
  const deleted = await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/insights?include_deleted=true`));
  expect(deleted.insights).toContainEqual(expect.objectContaining({ id: insight.id, deleted_at: expect.any(String) }));
});

test(actionEvidenceTitle(
  "analysis.insight.create",
  ["validation"],
  "rejects extra keys, invalid enums, empty titles, and malformed JSON"
), async () => {
  const endpoint = `/api/projects/${fixture!.project.id}/analysis/insights`;
  for (const data of [{ title: "" }, { title: "valid", status: "published" }, { title: "valid", confidence: "certain" }, { title: "valid", project_id: fixture!.project.id }]) {
    expect((await sessions.owner.request.post(endpoint, { data })).status()).toBe(400);
  }
  expect((await sessions.owner.request.post(endpoint, { data: "{", headers: { "content-type": "application/json" } })).status()).toBe(400);
});

test("PRODUCT GAP (out of presentation scope): insight listing does not yet support filtering by tag", async () => {
  await createInsight({ title: `${fixture!.marker} tagged`, tags: ["rare-tag"] });
  await createInsight({ title: `${fixture!.marker} untagged`, tags: ["other-tag"] });
  const response = await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/insights?tag=rare-tag`);
  expect(response.status()).toBe(200);
  expect((await json(response)).insights).toEqual([
    expect.objectContaining({ tags: expect.arrayContaining(["rare-tag"]) }),
  ]);
});

test(actionEvidenceTitle(
  "analysis.insight.create",
  ["duplicate", "concurrency"],
  "persists two distinct insights when simultaneous creates intentionally share content"
), async () => {
  const title = `${fixture!.marker} intentionally repeated insight`;
  const endpoint = `/api/projects/${fixture!.project.id}/analysis/insights`;
  const responses = await Promise.all([
    sessions.owner.request.post(endpoint, { data: { title, summary: "same" } }),
    sessions.editor.request.post(endpoint, { data: { title, summary: "same" } }),
  ]);
  expect(responses.map((response) => response.status())).toEqual([201, 201]);
  const created = await Promise.all(responses.map(async (response) => (await json(response)).insight));
  const ids = created.map((insight) => insight.id);
  expect(new Set(ids).size).toBe(2);
  const rows = (await json(await sessions.viewer.request.get(
    `${endpoint}?search=${encodeURIComponent(title)}`
  ))).insights as Array<Record<string, any>>;
  expect(rows).toHaveLength(2);
  for (const insight of created) {
    expect(rows).toContainEqual(expect.objectContaining({
      id: insight.id,
      title,
      summary: "same",
      revision: insight.revision,
      created_by: insight.created_by,
      updated_by: insight.updated_by,
    }));
  }
});

test([
  actionEvidenceTitle("analysis.insight.read", ["validation"], "rejects a foreign insight identifier"),
  actionEvidenceTitle("analysis.insight.update", ["validation"], "rejects a foreign insight identifier without mutation"),
  actionEvidenceTitle("analysis.insight.delete", ["validation"], "rejects a foreign insight identifier without deletion"),
].join(" | "), async () => {
  const foreign = await createQaProjectFixture(sessions);
  try {
    const response = await sessions.owner.request.post(
      `/api/projects/${foreign.project.id}/analysis/insights`,
      { data: { title: `${foreign.marker} unchanged` } }
    );
    expect(response.status()).toBe(201);
    const foreignInsight = (await json(response)).insight;
    const crossed = `/api/projects/${fixture!.project.id}/analysis/insights/${foreignInsight.id}`;
    expect((await sessions.owner.request.get(crossed)).status()).toBe(404);
    expect((await sessions.owner.request.patch(crossed, {
      data: { base_revision: foreignInsight.revision, title: "crossed" },
    })).status()).toBe(404);
    expect((await sessions.owner.request.delete(crossed)).status()).toBe(404);
    const proof = await sessions.owner.request.get(
      `/api/projects/${foreign.project.id}/analysis/insights/${foreignInsight.id}`
    );
    expect(proof.status()).toBe(200);
    expect((await json(proof)).insight).toMatchObject({
      id: foreignInsight.id,
      title: `${foreign.marker} unchanged`,
      deleted_at: null,
    });
  } finally {
    await foreign.cleanup();
  }
});
