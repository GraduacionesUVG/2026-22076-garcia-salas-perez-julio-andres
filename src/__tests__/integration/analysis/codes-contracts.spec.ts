/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, request, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { createQaProjectFixture, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { closeQaSessions, createQaSessions, type QaSessions } from "@/__tests__/backend/sessions";
import { closeTask10Resources, codeFixtureData, task10Route } from "@/__tests__/backend/task10-test-helpers";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects/:id/analysis/codes"],
  ["POST", "/api/projects/:id/analysis/codes"],
  ["GET", "/api/projects/:id/analysis/codes/:codeId"],
  ["PATCH", "/api/projects/:id/analysis/codes/:codeId"],
  ["DELETE", "/api/projects/:id/analysis/codes/:codeId"],
] as const;

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;
let anonymous: APIRequestContext | undefined;
let sequence = 0;

function codesPath(projectId = fixture!.project.id): string {
  return task10Route("/api/projects/:id/analysis/codes", { id: projectId });
}

function codePath(codeId: string, projectId = fixture!.project.id): string {
  return task10Route("/api/projects/:id/analysis/codes/:codeId", {
    id: projectId,
    codeId,
  });
}

async function body(response: APIResponse): Promise<Record<string, any>> {
  expect(response.headers()["content-type"]).toContain("application/json");
  return response.json() as Promise<Record<string, any>>;
}

async function createCode(overrides: Record<string, unknown> = {}, projectId = fixture!.project.id) {
  sequence += 1;
  const response = await sessions.owner.request.post(codesPath(projectId), {
    data: codeFixtureData({ name: `${fixture!.marker} code ${sequence}`, ...overrides }),
  });
  const value = await body(response);
  expect(response.status(), JSON.stringify(value)).toBe(201);
  return value.code as Record<string, any>;
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
  actionEvidenceTitle("analysis.code.create", ["success", "persistence", "cleanup"], "creates a code with its complete persisted contract"),
  actionEvidenceTitle("analysis.code.read", ["success"], "reads the exact created code"),
  actionEvidenceTitle("analysis.code.update", ["success", "persistence", "validation", "cleanup"], "persists one update and rejects a stale revision"),
].join(" | "), async () => {
  const code = await createCode({
    color: "#12ab34", position: 27, description: "description", definition: "definition",
    inclusion_criteria: "include", exclusion_criteria: "exclude", metadata: { source: "qa", nested: { count: 2 } },
  });
  expect(code).toMatchObject({ project_id: fixture!.project.id, color: "#12ab34", position: 27, metadata: { source: "qa", nested: { count: 2 } }, revision: 0 });
  const path = codePath(code.id);
  const read = await sessions.viewer.request.get(path);
  expect(read.status()).toBe(200);
  expect((await body(read)).code).toMatchObject({
    id: code.id,
    project_id: fixture!.project.id,
    color: "#12ab34",
    position: 27,
    description: "description",
    definition: "definition",
    inclusion_criteria: "include",
    exclusion_criteria: "exclude",
    metadata: { source: "qa", nested: { count: 2 } },
    revision: 0,
    created_by: sessions.owner.user.id,
    updated_by: sessions.owner.user.id,
  });
  const patch = await sessions.editor.request.patch(path, { data: { base_revision: code.revision, color: "rgb(1, 2, 3)", position: 4, metadata: { reviewed: true } } });
  expect(patch.status()).toBe(200);
  const updated = (await body(patch)).code;
  expect(updated).toMatchObject({ id: code.id, color: "rgb(1, 2, 3)", position: 4, metadata: { reviewed: true }, revision: 1 });
  const updateReadback = (await body(await sessions.viewer.request.get(path))).code;
  expect(updateReadback).toMatchObject({
    id: updated.id,
    color: updated.color,
    position: updated.position,
    metadata: updated.metadata,
    revision: updated.revision,
    updated_by: sessions.editor.user.id,
  });
  expect((await sessions.owner.request.patch(path, { data: { base_revision: 0, name: "stale" } })).status()).toBe(409);
});

test("@product-red omitting API-optional code text fields creates safe defaults", async () => {
  const response = await sessions.owner.request.post(codesPath(), {
    data: { name: `${fixture!.marker} API optional text defaults` },
  });
  const value = await body(response);
  expect(response.status(), JSON.stringify(value)).toBe(201);
  expect(value.code).toEqual(expect.objectContaining({
    description: expect.any(String),
    definition: expect.any(String),
    inclusion_criteria: expect.any(String),
    exclusion_criteria: expect.any(String),
  }));
});

test(actionEvidenceTitle(
  "analysis.code.create",
  ["duplicate", "validation"],
  "rejects duplicate names and invalid create fields"
), async () => {
  const code = await createCode({ name: `${fixture!.marker} duplicate` });
  const endpoint = codesPath();
  expect((await sessions.owner.request.post(endpoint, { data: codeFixtureData({ name: code.name }) })).status()).toBe(409);
  for (const data of [
    { name: "x".repeat(181) }, { name: "valid", color: "x".repeat(41) },
    { name: "valid", description: "x".repeat(10001) }, { name: "valid", position: -1 },
    { name: "valid", metadata: [] }, { name: "valid", unexpected: true },
  ]) expect((await sessions.owner.request.post(endpoint, { data })).status()).toBe(400);
  for (const query of ["limit=0", "limit=201", "offset=-1", "unknown=true", `search=${"x".repeat(121)}`]) {
    expect((await sessions.owner.request.get(`${endpoint}?${query}`)).status()).toBe(400);
  }
});

test(actionEvidenceTitle(
  "analysis.codes.list",
  ["success"],
  "searches and paginates codes without page overlap"
), async () => {
  const prefix = `${fixture!.marker} paged needle`;
  const codes = await Promise.all([createCode({ name: `${prefix} A`, position: 20 }), createCode({ name: `${prefix} B`, position: 21 })]);
  const endpoint = `${codesPath()}?search=${encodeURIComponent(prefix)}&limit=1`;
  const first = (await body(await sessions.viewer.request.get(`${endpoint}&offset=0`))).codes;
  const second = (await body(await sessions.viewer.request.get(`${endpoint}&offset=1`))).codes;
  expect(first).toHaveLength(1); expect(second).toHaveLength(1);
  expect(new Set([first[0].id, second[0].id])).toEqual(new Set(codes.map((code) => code.id)));
});

test("treats injection-like search strings as inert data", async () => {
  const hostile = `%_' OR 1=1 -- ${fixture!.marker}`;
  const matching = await createCode({ name: hostile });
  await createCode({ name: `${fixture!.marker} unrelated` });
  const response = await sessions.viewer.request.get(`${codesPath()}?search=${encodeURIComponent(hostile)}`);
  expect(response.status()).toBe(200);
  expect((await body(response)).codes).toEqual([expect.objectContaining({ id: matching.id, name: hostile })]);
});

test([
  actionEvidenceTitle("analysis.codes.list", ["permissions"], "allows member lists and denies non-members"),
  actionEvidenceTitle("analysis.code.read", ["permissions"], "allows member reads and denies non-members"),
  actionEvidenceTitle("analysis.code.create", ["permissions"], "allows owner and editor creation only"),
  actionEvidenceTitle("analysis.code.update", ["permissions"], "allows owner and editor updates only"),
  actionEvidenceTitle("analysis.code.delete", ["success", "persistence", "permissions", "cleanup"], "allows owner and editor deletion only and persists soft deletion"),
].join(" | "), async () => {
  const code = await createCode();
  const collection = codesPath();
  const path = codePath(code.id);
  for (const role of ["owner", "editor", "viewer"] as const) {
    expect((await sessions[role].request.get(collection)).status()).toBe(200);
    expect((await sessions[role].request.get(path)).status()).toBe(200);
  }
  expect((await sessions.intruder.request.get(collection)).status()).toBe(403);
  expect((await anonymous!.get(collection)).status()).toBe(401);
  expect((await sessions.intruder.request.get(path)).status()).toBe(403);
  expect((await anonymous!.get(path)).status()).toBe(401);

  expect((await sessions.owner.request.post(collection, { data: codeFixtureData({ name: `${fixture!.marker} owner create` }) })).status()).toBe(201);
  expect((await sessions.editor.request.post(collection, { data: codeFixtureData({ name: `${fixture!.marker} editor create` }) })).status()).toBe(201);
  expect((await sessions.viewer.request.post(collection, { data: { name: "denied" } })).status()).toBe(403);
  expect((await sessions.intruder.request.post(collection, { data: { name: "denied" } })).status()).toBe(403);
  expect((await anonymous!.post(collection, { data: { name: "denied" } })).status()).toBe(401);

  const ownerPatch = await createCode();
  const editorPatch = await createCode();
  expect((await sessions.owner.request.patch(codePath(ownerPatch.id), { data: { base_revision: ownerPatch.revision, description: "owner" } })).status()).toBe(200);
  expect((await sessions.editor.request.patch(codePath(editorPatch.id), { data: { base_revision: editorPatch.revision, description: "editor" } })).status()).toBe(200);
  expect((await sessions.viewer.request.patch(path, { data: { base_revision: 0, name: "denied" } })).status()).toBe(403);
  expect((await sessions.intruder.request.patch(path, { data: { base_revision: 0, name: "denied" } })).status()).toBe(403);
  expect((await anonymous!.patch(path, { data: {} })).status()).toBe(401);

  const ownerDelete = await createCode();
  const editorDelete = await createCode();
  expect((await sessions.owner.request.delete(codePath(ownerDelete.id))).status()).toBe(200);
  expect((await sessions.editor.request.delete(codePath(editorDelete.id))).status()).toBe(200);
  expect((await sessions.viewer.request.delete(path)).status()).toBe(403);
  expect((await sessions.intruder.request.delete(path)).status()).toBe(403);
  expect((await anonymous!.delete(path)).status()).toBe(401);
  expect((await sessions.editor.request.delete(path)).status()).toBe(200);
  expect((await sessions.owner.request.get(path)).status()).toBe(404);
  const deleted = await body(await sessions.owner.request.get(`${collection}?include_deleted=true`));
  expect(deleted.codes).toContainEqual(expect.objectContaining({ id: code.id, deleted_at: expect.any(String) }));
});

test([
  actionEvidenceTitle("analysis.code.update", ["validation"], "rejects a foreign code identifier without mutation"),
  actionEvidenceTitle("analysis.code.delete", ["validation"], "rejects a foreign code identifier without deletion"),
].join(" | "), async () => {
  const foreign = await createQaProjectFixture(sessions);
  try {
    const foreignCode = await createCode({ description: "unchanged" }, foreign.project.id);
    const crossed = codePath(foreignCode.id);
    expect((await sessions.owner.request.get(crossed)).status()).toBe(404);
    expect((await sessions.owner.request.patch(crossed, { data: { base_revision: foreignCode.revision, description: "crossed" } })).status()).toBe(404);
    expect((await sessions.owner.request.delete(crossed)).status()).toBe(404);

    const proof = (await body(await sessions.owner.request.get(
      codePath(foreignCode.id, foreign.project.id)
    ))).code;
    expect(proof).toMatchObject({
      id: foreignCode.id,
      description: "unchanged",
      revision: foreignCode.revision,
      deleted_at: null,
    });
  } finally { await foreign.cleanup(); }
});

test(actionEvidenceTitle(
  "analysis.code.create",
  ["concurrency"],
  "commits one of two simultaneous duplicate names and preserves one terminal row"
), async () => {
  const name = `${fixture!.marker} concurrent code`;
  const endpoint = codesPath();
  const responses = await Promise.all([
    sessions.owner.request.post(endpoint, { data: codeFixtureData({ name, color: "#112233" }) }),
    sessions.editor.request.post(endpoint, { data: codeFixtureData({ name, color: "#445566" }) }),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
  const winner = responses.find((response) => response.status() === 201)!;
  const loser = responses.find((response) => response.status() === 409)!;
  const created = (await body(winner)).code;
  expect(await body(loser)).toMatchObject({ ok: false, error: "CODE_ALREADY_EXISTS" });

  const readback = await body(await sessions.viewer.request.get(
    `${endpoint}?search=${encodeURIComponent(name)}`
  ));
  expect(readback.codes).toEqual([expect.objectContaining({
    id: created.id,
    name,
    color: created.color,
    revision: created.revision,
    created_by: created.created_by,
    updated_by: created.updated_by,
  })]);
});
