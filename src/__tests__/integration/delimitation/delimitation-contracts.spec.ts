import { expect, test, type APIRequestContext } from "@playwright/test";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import {
  arrayField,
  closeTask7Fixture,
  createTask7Fixture,
  numberField,
  objectField,
  readJson,
  stringField,
  type JsonObject,
  type Task7Fixture,
} from "@/__tests__/integration/research-workflow/task7-test-helpers";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects/:id/delimitation"],
  ["PATCH", "/api/projects/:id/delimitation"],
  ["PUT", "/api/projects/:id/delimitation"],
  ["POST", "/api/projects/:id/delimitation/items"],
  ["PATCH", "/api/projects/:id/delimitation/items/:itemId"],
  ["DELETE", "/api/projects/:id/delimitation/items/:itemId"],
  ["GET", "/api/projects/:id/delimitation/versions"],
  ["POST", "/api/projects/:id/delimitation/versions"],
  ["GET", "/api/projects/:id/delimitation/versions/:versionId"],
  ["POST", "/api/projects/:id/delimitation/versions/:versionId/restore"],
] as const;

test.describe.serial("Task 7 delimitation contracts", () => {
  test.setTimeout(120_000);
  let fx: Task7Fixture;

  test.beforeAll(async () => {
    fx = await createTask7Fixture();
  });

  test.afterAll(async () => {
    await closeTask7Fixture(fx);
  });

  async function getCurrent(projectId = fx.primary.project.id): Promise<JsonObject> {
    const response = await fx.sessions.owner.request.get(
      `/api/projects/${projectId}/delimitation`
    );
    expect(response.status()).toBe(200);
    return objectField(await readJson(response), "data");
  }

  async function save(
    request: APIRequestContext,
    payload: JsonObject,
    projectId = fx.primary.project.id
  ) {
    return request.put(`/api/projects/${projectId}/delimitation`, {
      data: payload,
    });
  }

  test(actionEvidenceTitle(
    "delimitation.session.read",
    ["success", "permissions", "cleanup"],
    "allows project roles to read while rejecting intruder and anonymous sessions"
  ), async () => {
    const path = `/api/projects/${fx.primary.project.id}/delimitation`;
    const cases = [
      [fx.sessions.owner.request, 200],
      [fx.sessions.editor.request, 200],
      [fx.sessions.viewer.request, 200],
      [fx.sessions.intruder.request, 403],
      [fx.anonymous, 401],
    ] as const;

    for (const [request, status] of cases) {
      const response = await request.get(path);
      expect(response.status()).toBe(status);
      const body = await readJson(response);
      expect(body.ok).toBe(status === 200);
    }
  });

  test(actionEvidenceTitle(
    "delimitation.session.save",
    ["success", "persistence", "permissions", "cleanup"],
    "persists owner and editor saves while rejecting unauthorized writers"
  ), async () => {
    let current = await getCurrent();
    let delim = objectField(current, "delim");

    const ownerResponse = await save(fx.sessions.owner.request, {
      base_revision: numberField(delim, "revision"),
      topic: "Owner delimitation",
    });
    expect(ownerResponse.status()).toBe(200);

    current = await getCurrent();
    delim = objectField(current, "delim");
    const editorResponse = await save(fx.sessions.editor.request, {
      base_revision: numberField(delim, "revision"),
      population: "Editor population",
    });
    expect(editorResponse.status()).toBe(200);

    current = await getCurrent();
    const revision = numberField(objectField(current, "delim"), "revision");
    for (const [request, status] of [
      [fx.sessions.viewer.request, 403],
      [fx.sessions.intruder.request, 403],
      [fx.anonymous, 401],
    ] as const) {
      const response = await save(request, {
        base_revision: revision,
        topic: "Forbidden mutation",
      });
      expect(response.status()).toBe(status);
    }

    expect(stringField(objectField(await getCurrent(), "delim"), "topic")).toBe(
      "Owner delimitation"
    );

    const patchRevision = numberField(objectField(await getCurrent(), "delim"), "revision");
    const rootPatch = await fx.sessions.owner.request.patch(
      `/api/projects/${fx.primary.project.id}/delimitation`, {
      data: { base_revision: patchRevision, time_period: "Root PATCH exercised" },
      }
    );
    expect(rootPatch.status()).toBe(200);
    expect(stringField(objectField(await readJson(rootPatch), "delim"), "time_period")).toBe(
      "Root PATCH exercised"
    );
    expect(stringField(objectField(await getCurrent(), "delim"), "time_period")).toBe(
      "Root PATCH exercised"
    );
  });

  test(actionEvidenceTitle(
    "delimitation.session.save",
    ["validation"],
    "rejects malformed saves and enforces the 500-character boundary"
  ), async () => {
    const invalidPayloads: JsonObject[] = [
      { base_revision: 0 },
      { base_revision: 0, topic: "valid", extra: true },
      { base_revision: -1, topic: "valid" },
      { base_revision: 0.5, topic: "valid" },
      { base_revision: 0, topic: "x".repeat(501) },
    ];

    for (const payload of invalidPayloads) {
      const response = await save(fx.sessions.owner.request, payload);
      expect(response.status()).toBe(400);
      expect((await readJson(response)).error).toBe("Validation error");
    }
    expect((await fx.sessions.owner.request.put(
      `/api/projects/${fx.primary.project.id}/delimitation`,
      { data: "{", headers: { "content-type": "application/json" } }
    )).status()).toBe(400);

    const current = await getCurrent();
    const response = await save(fx.sessions.owner.request, {
      base_revision: numberField(objectField(current, "delim"), "revision"),
      resources: "x".repeat(500),
    });
    expect(response.status()).toBe(200);
    expect(stringField(objectField(await readJson(response), "delim"), "resources")).toHaveLength(500);
  });

  test("rejects stale revisions without losing the winning update", async () => {
    const revision = numberField(objectField(await getCurrent(), "delim"), "revision");
    const winner = await save(fx.sessions.owner.request, {
      base_revision: revision,
      context_place: "Winning context",
    });
    expect(winner.status()).toBe(200);

    const stale = await save(fx.sessions.editor.request, {
      base_revision: revision,
      context_place: "Stale context",
    });
    expect(stale.status()).toBe(409);
    const staleBody = await readJson(stale);
    expect(staleBody.code).toBe("DELIMITATION_REVISION_CONFLICT");
    expect(objectField(staleBody, "latest_delimitation").context_place).toBe(
      "Winning context"
    );
  });

  test(actionEvidenceTitle(
    "delimitation.criteria-item.create",
    ["success", "persistence", "permissions", "validation", "duplicate", "cleanup"],
    "creates durable include and exclude criteria with strict inputs"
  ), async () => {
    const base = `/api/projects/${fx.primary.project.id}/delimitation/items`;
    const includeResponse = await fx.sessions.owner.request.post(base, {
      data: { kind: "include", text: "i".repeat(300) },
    });
    expect(includeResponse.status()).toBe(201);
    const include = objectField(await readJson(includeResponse), "item");

    const excludeResponse = await fx.sessions.editor.request.post(base, {
      data: { kind: "exclude", text: "Excluded by design" },
    });
    expect(excludeResponse.status()).toBe(201);
    const duplicateResponse = await fx.sessions.owner.request.post(base, {
      data: { kind: "include", text: "Duplicate criterion" },
    });
    expect(duplicateResponse.status()).toBe(201);
    const duplicate = objectField(await readJson(duplicateResponse), "item");
    const repeatedDuplicateResponse = await fx.sessions.owner.request.post(base, {
      data: { kind: "include", text: "Duplicate criterion" },
    });
    expect(repeatedDuplicateResponse.status()).toBe(201);
    const repeatedDuplicate = objectField(await readJson(repeatedDuplicateResponse), "item");
    expect(repeatedDuplicate.id).not.toBe(duplicate.id);

    for (const payload of [
      { kind: "include", text: "" },
      { kind: "include", text: "x".repeat(301) },
      { kind: "other", text: "valid" },
      { kind: "include", text: "valid", extra: true },
    ]) {
      expect((await fx.sessions.owner.request.post(base, { data: payload })).status()).toBe(400);
    }

    expect((await fx.sessions.viewer.request.post(base, {
      data: { kind: "include", text: "viewer" },
    })).status()).toBe(403);

    const itemId = stringField(include, "id");
    const patch = await fx.sessions.editor.request.patch(`${base}/${itemId}`, {
      data: { text: "Updated include" },
    });
    expect(patch.status()).toBe(200);
    expect(stringField(objectField(await readJson(patch), "item"), "text")).toBe(
      "Updated include"
    );
    for (const data of [{ text: "" }, { text: "x".repeat(301) }, { text: "valid", extra: true }]) {
      expect((await fx.sessions.owner.request.patch(`${base}/${itemId}`, { data })).status()).toBe(400);
    }
    expect((await fx.sessions.viewer.request.delete(`${base}/${itemId}`)).status()).toBe(403);
    expect((await fx.sessions.owner.request.delete(`${base}/${itemId}`)).status()).toBe(200);
    expect(arrayField(await getCurrent(), "include").map((item) => item.id)).not.toContain(itemId);
  });

  test(actionEvidenceTitle(
    "delimitation.criteria-item.update",
    ["success", "persistence", "permissions", "validation", "cleanup"],
    "updates a criterion and reads the saved text back independently"
  ), async () => {
    const base = `/api/projects/${fx.primary.project.id}/delimitation/items`;
    const created = await fx.sessions.owner.request.post(base, {
      data: { kind: "include", text: "Update readback seed" },
    });
    expect(created.status()).toBe(201);
    const itemId = stringField(objectField(await readJson(created), "item"), "id");

    const updated = await fx.sessions.editor.request.patch(`${base}/${itemId}`, {
      data: { text: "Update readback winner" },
    });
    expect(updated.status()).toBe(200);
    expect(stringField(objectField(await readJson(updated), "item"), "text")).toBe(
      "Update readback winner"
    );
    expect(arrayField(await getCurrent(), "include")).toContainEqual(
      expect.objectContaining({ id: itemId, text: "Update readback winner" })
    );
    expect((await fx.sessions.viewer.request.patch(`${base}/${itemId}`, {
      data: { text: "Forbidden criterion update" },
    })).status()).toBe(403);
    expect((await fx.sessions.owner.request.patch(`${base}/${itemId}`, {
      data: { text: "" },
    })).status()).toBe(400);
    expect((await fx.sessions.owner.request.delete(`${base}/${itemId}`)).status()).toBe(200);
  });

  test(actionEvidenceTitle(
    "delimitation.criteria-item.delete",
    ["success", "persistence", "permissions", "validation", "cleanup"],
    "deletes an exact owned criterion without removing another criterion"
  ), async () => {
    const base = `/api/projects/${fx.primary.project.id}/delimitation/items`;
    const [targetResponse, retainedResponse] = await Promise.all([
      fx.sessions.owner.request.post(base, { data: { kind: "include", text: "Delete target" } }),
      fx.sessions.owner.request.post(base, { data: { kind: "include", text: "Delete retained" } }),
    ]);
    expect(targetResponse.status()).toBe(201);
    expect(retainedResponse.status()).toBe(201);
    const targetId = stringField(objectField(await readJson(targetResponse), "item"), "id");
    const retainedId = stringField(objectField(await readJson(retainedResponse), "item"), "id");

    expect((await fx.sessions.owner.request.delete(`${base}/${targetId}`)).status()).toBe(200);
    const ids = arrayField(await getCurrent(), "include").map((item) => item.id);
    expect(ids).not.toContain(targetId);
    expect(ids).toContain(retainedId);
    expect((await fx.sessions.viewer.request.delete(`${base}/${retainedId}`)).status()).toBe(403);
    expect((await fx.sessions.owner.request.delete(`${base}/not-a-uuid`)).status()).toBe(400);
    expect((await fx.sessions.owner.request.delete(`${base}/${retainedId}`)).status()).toBe(200);
  });

  test("foreign item IDs cannot be updated or deleted through another project", async () => {
    const foreignBase = `/api/projects/${fx.foreign.project.id}/delimitation/items`;
    const created = await fx.sessions.owner.request.post(foreignBase, {
      data: { kind: "include", text: "Foreign sentinel" },
    });
    const foreignId = stringField(objectField(await readJson(created), "item"), "id");
    const primaryPath = `/api/projects/${fx.primary.project.id}/delimitation/items/${foreignId}`;

    expect((await fx.sessions.owner.request.patch(primaryPath, {
      data: { text: "Cross-project overwrite" },
    })).status()).toBe(404);
    expect((await fx.sessions.owner.request.delete(primaryPath)).status()).toBe(404);

    const foreign = await getCurrent(fx.foreign.project.id);
    expect(arrayField(foreign, "include").map((item) => item.text)).toContain(
      "Foreign sentinel"
    );
  });
});
