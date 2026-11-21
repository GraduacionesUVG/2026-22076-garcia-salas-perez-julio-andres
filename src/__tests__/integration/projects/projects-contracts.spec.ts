import { expect, test, type APIResponse } from "@playwright/test";
import {
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  closeQaSessions,
  createQaSessions,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import { parseMarkedProjectId } from "@/__tests__/backend/task6-test-helpers";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects"],
  ["POST", "/api/projects"],
  ["GET", "/api/projects/:id"],
  ["PATCH", "/api/projects/:id"],
  ["DELETE", "/api/projects/:id"],
  ["GET", "/api/projects/:id/workflow"],
] as const;

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;

async function body(response: APIResponse): Promise<Record<string, unknown>> {
  const value = await response.json();
  expect(response.headers()["content-type"]).toContain("application/json");
  return value as Record<string, unknown>;
}

test.beforeAll(async () => {
  sessions = await createQaSessions();
});

test.beforeEach(async () => {
  fixture = await createQaProjectFixture(sessions);
});

test.afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

test.afterAll(async () => {
  if (sessions) await closeQaSessions(sessions);
});

test(actionEvidenceTitle(
  "projects.projects.list",
  ["success", "cleanup"],
  "lists the marked project exactly once for every member role"
), async () => {
  for (const identity of ["owner", "editor", "viewer"] as const) {
    const response = await sessions[identity].request.get("/api/projects");
    const value = await body(response);
    expect(response.status()).toBe(200);
    const projects = value.projects as Array<Record<string, unknown>>;
    expect(projects.filter((project) => project.id === fixture!.project.id)).toEqual([
      expect.objectContaining({
        id: fixture!.project.id,
        name: fixture!.project.name,
        my_role: identity,
      }),
    ]);
  }
});

test(actionEvidenceTitle(
  "projects.project.create",
  ["success", "persistence", "cleanup"],
  "creates a trimmed marked project and reads it back"
), async () => {
  const name = `${fixture!.marker} create contract`;
  const create = await sessions.owner.request.post("/api/projects", {
    data: { name: `  ${name}  `, description: "  description  " },
  });
  const created = (await create.json()) as unknown;
  const projectId = parseMarkedProjectId(created, fixture!.marker);
  fixture!.registry.register({ kind: "project", id: projectId, marker: fixture!.marker });

  expect(create.headers()["content-type"]).toContain("application/json");
  expect(create.status()).toBe(201);
  const createdBody = created as Record<string, unknown>;
  expect(createdBody.project).toEqual(
    expect.objectContaining({ name, description: "description", my_role: "owner" })
  );

  const readback = await sessions.owner.request.get(`/api/projects/${projectId}`);
  expect(readback.status()).toBe(200);
  expect((await body(readback)).project).toEqual(
    expect.objectContaining({ id: projectId, name, description: "description", my_role: "owner" })
  );
});

test(actionEvidenceTitle(
  "projects.project.delete",
  ["success", "persistence", "cleanup"],
  "deletes the exact marked project without disclosing it afterward"
), async () => {
  const projectId = fixture!.project.id;
  const remove = await sessions.owner.request.delete(`/api/projects/${projectId}`);
  expect(remove.status()).toBe(200);
  expect(await body(remove)).toEqual({ ok: true });

  const confirmation = await sessions.owner.request.get(`/api/projects/${projectId}`);
  expect(confirmation.status()).toBe(403);

  const list = await sessions.owner.request.get("/api/projects");
  expect(list.status()).toBe(200);
  const projects = (await body(list)).projects as Array<Record<string, unknown>>;
  expect(projects.some((project) => project.id === projectId)).toBe(false);
  fixture!.registry.unregister("project", projectId);
});

test(actionEvidenceTitle(
  "workflow.project-workflow.read",
  ["success", "permissions", "cleanup"],
  "returns the evidence-based workflow summary to every project role"
), async () => {
  for (const identity of ["owner", "editor", "viewer"] as const) {
    const response = await sessions[identity].request.get(
      `/api/projects/${fixture!.project.id}/workflow`
    );
    const value = await body(response);

    expect(response.status()).toBe(200);
    expect(value).toMatchObject({
      ok: true,
      workflow: {
        progress: expect.any(Number),
        phases: expect.arrayContaining([
          expect.objectContaining({ key: "delimitation" }),
          expect.objectContaining({ key: "report" }),
        ]),
      },
    });
  }
});

for (const [data, label] of [
  [{ name: "" }, "empty name"],
  [{ name: "   " }, "whitespace name"],
  [{ name: "x".repeat(181) }, "oversized name"],
  [{ name: "valid", description: "x".repeat(1001) }, "oversized description"],
  [{ name: "valid", owner_id: "00000000-0000-4000-8000-000000000000" }, "extra key"],
  [{ name: 42 }, "wrong type"],
] as const) {
  test(actionEvidenceTitle(
    "projects.project.create",
    ["validation"],
    `rejects creation with ${label}`
  ), async () => {
    const response = await sessions.owner.request.post("/api/projects", { data });
    const value = await body(response);
    expect(response.status()).toBe(400);
    expect(value).toEqual(expect.objectContaining({ ok: false, error: expect.any(String) }));
  });
}

test("rejects malformed project JSON", async () => {
  const response = await sessions.owner.request.post("/api/projects", {
    data: Buffer.from("{"),
    headers: { "content-type": "application/json" },
  });
  expect(response.status()).toBe(400);
  expect(await body(response)).toMatchObject({ ok: false, error: "Invalid JSON body" });
});

test(actionEvidenceTitle("projects.project.read", ["success", "permissions"], "gets the same project contract for owner, editor, and viewer"), async () => {
  for (const identity of ["owner", "editor", "viewer"] as const) {
    const response = await sessions[identity].request.get(
      `/api/projects/${fixture!.project.id}`
    );
    const value = await body(response);
    expect(response.status()).toBe(200);
    expect(value.project).toEqual(
      expect.objectContaining({
        id: fixture!.project.id,
        name: fixture!.project.name,
        my_role: identity,
      })
    );
  }
});

test(actionEvidenceTitle(
  "projects.project.update",
  ["success", "persistence", "cleanup"],
  "patches and restores every mutable project field with independent reads"
), async () => {
  const changedName = `${fixture!.marker} changed`;
  const response = await sessions.owner.request.patch(
    `/api/projects/${fixture!.project.id}`,
    { data: { name: changedName, description: "changed", is_active: false } }
  );
  expect(response.status()).toBe(200);
  expect(await body(response)).toMatchObject({
    ok: true,
    project: { name: changedName, description: "changed", is_active: false },
  });

  const changed = await sessions.owner.request.get(`/api/projects/${fixture!.project.id}`);
  expect(changed.status()).toBe(200);
  expect((await body(changed)).project).toEqual(
    expect.objectContaining({ name: changedName, description: "changed", is_active: false })
  );

  const restore = await sessions.owner.request.patch(
    `/api/projects/${fixture!.project.id}`,
    { data: { name: fixture!.project.name, description: null, is_active: true } }
  );
  expect(restore.status()).toBe(200);

  const restored = await sessions.owner.request.get(`/api/projects/${fixture!.project.id}`);
  expect(restored.status()).toBe(200);
  expect((await body(restored)).project).toEqual(
    expect.objectContaining({ name: fixture!.project.name, description: null, is_active: true })
  );
});

for (const [index, data] of [
  {},
  { name: "" },
  { name: "x".repeat(181) },
  { description: "x".repeat(1001) },
  { owner_id: "00000000-0000-4000-8000-000000000000" },
  { is_active: "yes" },
] .entries()) {
  test(actionEvidenceTitle(
    "projects.project.update",
    ["validation"],
    `rejects invalid patch case ${index + 1}`
  ), async () => {
    const response = await sessions.owner.request.patch(
      `/api/projects/${fixture!.project.id}`,
      { data }
    );
    expect(response.status()).toBe(400);
    expect(await body(response)).toEqual(
      expect.objectContaining({ ok: false, error: "Validation error" })
    );
  });
}

test(actionEvidenceTitle(
  "projects.project.create",
  ["success", "persistence", "duplicate", "cleanup"],
  "creates two distinct marked projects for identical duplicate submissions"
), async () => {
  const name = `${fixture!.marker} duplicate create contract`;
  const payload = { name, description: "duplicate" };
  const createdIds: string[] = [];

  for (let submission = 0; submission < 2; submission += 1) {
    const response = await sessions.owner.request.post("/api/projects", {
      data: payload,
    });
    const value = await response.json();
    const projectId = parseMarkedProjectId(value, fixture!.marker);
    fixture!.registry.register({ kind: "project", id: projectId, marker: fixture!.marker });
    expect(response.status()).toBe(201);
    createdIds.push(projectId);
  }

  expect(new Set(createdIds).size).toBe(2);
  const list = await sessions.owner.request.get("/api/projects");
  expect(list.status()).toBe(200);
  const projects = (await body(list)).projects as Array<Record<string, unknown>>;
  const created = projects.filter((project) => createdIds.includes(String(project.id)));
  expect(created).toHaveLength(2);
  expect(created).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: createdIds[0], name, description: "duplicate" }),
      expect.objectContaining({ id: createdIds[1], name, description: "duplicate" }),
    ])
  );
});

for (const id of ["not-a-uuid", "00000000-0000-0000-0000-000000000000"]) {
  test(actionEvidenceTitle(
    "projects.project.delete",
    ["validation"],
    `rejects malformed or invalid project identity ${id} without mutation`
  ), async () => {
    for (const method of ["get", "patch", "delete"] as const) {
      const response = await sessions.owner.request[method](
        `/api/projects/${id}`,
        method === "patch" ? { data: { name: "never" } } : undefined
      );
      expect([400, 403, 404]).toContain(response.status());
    }
  });
}
