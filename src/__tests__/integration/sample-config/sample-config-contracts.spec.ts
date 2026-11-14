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
  ["GET", "/api/projects/:id/sample-config"],
  ["PATCH", "/api/projects/:id/sample-config"],
  ["PUT", "/api/projects/:id/sample-config"],
  ["GET", "/api/projects/:id/sample-config/options"],
  ["GET", "/api/projects/:id/sample-config/versions"],
  ["POST", "/api/projects/:id/sample-config/versions"],
  ["GET", "/api/projects/:id/sample-config/versions/:versionId"],
  ["POST", "/api/projects/:id/sample-config/versions/:versionId/restore"],
] as const;

test.describe.serial("Task 7 sample configuration contracts", () => {
  test.setTimeout(120_000);
  let fx: Task7Fixture;

  test.beforeAll(async () => {
    fx = await createTask7Fixture();
  });

  test.afterAll(async () => {
    await closeTask7Fixture(fx);
  });

  const pathFor = (projectId: string) =>
    `/api/projects/${projectId}/sample-config`;

  async function getCurrent(projectId = fx.primary.project.id): Promise<JsonObject> {
    const response = await fx.sessions.owner.request.get(pathFor(projectId));
    expect(response.status()).toBe(200);
    return objectField(await readJson(response), "data");
  }

  async function save(
    request: APIRequestContext,
    payload: JsonObject,
    projectId = fx.primary.project.id
  ) {
    return request.put(pathFor(projectId), { data: payload });
  }

  test(actionEvidenceTitle(
    "sample-config.session.read",
    ["success", "permissions", "cleanup"],
    "allows project roles to read configuration while rejecting intruder and anonymous sessions"
  ), async () => {
    for (const suffix of ["", "/options"]) {
      for (const [request, status] of [
        [fx.sessions.owner.request, 200],
        [fx.sessions.editor.request, 200],
        [fx.sessions.viewer.request, 200],
        [fx.sessions.intruder.request, 403],
        [fx.anonymous, 401],
      ] as const) {
        expect((await request.get(`${pathFor(fx.primary.project.id)}${suffix}`)).status()).toBe(status);
      }
    }

    const optionsResponse = await fx.sessions.viewer.request.get(
      `${pathFor(fx.primary.project.id)}/options`
    );
    const options = objectField(await readJson(optionsResponse), "options");
    expect(arrayField(options, "main_approaches").length).toBeGreaterThan(0);
    expect(arrayField(options, "scopes").length).toBeGreaterThan(0);
    expect(arrayField(options, "collection_technique_options").length).toBeGreaterThan(0);

    const config = objectField(await getCurrent(), "config");
    expect((await save(fx.sessions.owner.request, {
      base_revision: numberField(config, "revision"),
      field_phase: "Owner field phase",
    })).status()).toBe(200);

    const updated = objectField(await getCurrent(), "config");
    expect((await save(fx.sessions.editor.request, {
      base_revision: numberField(updated, "revision"),
      sample_size_rationale: "Editor rationale",
    })).status()).toBe(200);

    const revision = numberField(objectField(await getCurrent(), "config"), "revision");
    for (const [request, status] of [
      [fx.sessions.viewer.request, 403],
      [fx.sessions.intruder.request, 403],
      [fx.anonymous, 401],
    ] as const) {
      expect((await save(request, {
        base_revision: revision,
        field_phase: "Forbidden",
      })).status()).toBe(status);
    }

    const patchRevision = numberField(objectField(await getCurrent(), "config"), "revision");
    const rootPatch = await fx.sessions.owner.request.patch(pathFor(fx.primary.project.id), {
      data: { base_revision: patchRevision, field_phase: "Root PATCH exercised" },
    });
    expect(rootPatch.status()).toBe(200);
    expect(objectField(objectField(await readJson(rootPatch), "data"), "config").field_phase).toBe(
      "Root PATCH exercised"
    );
    expect(objectField(await getCurrent(), "config").field_phase).toBe(
      "Root PATCH exercised"
    );
  });

  test(actionEvidenceTitle(
    "sample-config.session.update",
    ["success", "persistence", "permissions", "validation", "cleanup"],
    "persists configuration updates while enforcing strict payload boundaries"
  ), async () => {
    for (const payload of [
      { base_revision: 0 },
      { base_revision: 0, field_phase: "valid", extra: true },
      { base_revision: -1, field_phase: "valid" },
      { base_revision: 0, field_phase: "x".repeat(5001) },
      { base_revision: 0, target_sample_size: 0 },
      { base_revision: 0, target_sample_size: -1 },
      { base_revision: 0, target_sample_size: 1.5 },
    ]) {
      expect((await save(fx.sessions.owner.request, payload)).status()).toBe(400);
    }
    expect((await fx.sessions.owner.request.put(pathFor(fx.primary.project.id), {
      data: "{",
      headers: { "content-type": "application/json" },
    })).status()).toBe(400);

    let config = objectField(await getCurrent(), "config");
    const boundary = await save(fx.sessions.owner.request, {
      base_revision: numberField(config, "revision"),
      field_phase: "x".repeat(5000),
      target_sample_size: "1",
    });
    expect(boundary.status()).toBe(200);
    let saved = objectField(objectField(await readJson(boundary), "data"), "config");
    expect(stringField(saved, "field_phase")).toHaveLength(5000);
    expect(saved.target_sample_size).toBe(1);

    config = objectField(await getCurrent(), "config");
    const cleared = await save(fx.sessions.owner.request, {
      base_revision: numberField(config, "revision"),
      target_sample_size: null,
    });
    expect(cleared.status()).toBe(200);
    saved = objectField(objectField(await readJson(cleared), "data"), "config");
    expect(saved.target_sample_size).toBeNull();
  });

  test(actionEvidenceTitle(
    "sample-config.session.update",
    ["persistence", "validation"],
    "preserves standard and custom collection technique invariants"
  ), async () => {
    const options = objectField(await getCurrent(), "options");
    const techniqueCode = stringField(
      arrayField(options, "collection_technique_options")[0],
      "code"
    );
    const config = objectField(await getCurrent(), "config");
    const response = await save(fx.sessions.owner.request, {
      base_revision: numberField(config, "revision"),
      collection_techniques: [
        { technique_code: techniqueCode, custom_label: null, is_custom: false },
        { technique_code: null, custom_label: "Community mapping", is_custom: true },
      ],
    });
    expect(response.status()).toBe(200);
    const techniques = arrayField(objectField(await readJson(response), "data"), "collection_techniques");
    expect(techniques.map((item) => item.position)).toEqual([0, 1]);
    expect(techniques[0]).toMatchObject({
      technique_code: techniqueCode,
      custom_label: null,
      is_custom: false,
    });
    expect(techniques[1]).toMatchObject({
      technique_code: null,
      custom_label: "Community mapping",
      is_custom: true,
    });

    const invalidCollections = [
      [{ technique_code: null, custom_label: null, is_custom: true }],
      [{ technique_code: techniqueCode, custom_label: "Both", is_custom: true }],
      [{ technique_code: null, custom_label: null, is_custom: false }],
      [{ technique_code: techniqueCode, custom_label: "Both", is_custom: false }],
      [{ technique_code: techniqueCode, custom_label: null, is_custom: false, extra: true }],
    ];
    for (const collection_techniques of invalidCollections) {
      const latest = objectField(await getCurrent(), "config");
      expect((await save(fx.sessions.owner.request, {
        base_revision: numberField(latest, "revision"),
        collection_techniques,
      })).status()).toBe(400);
    }

    expect(arrayField(await getCurrent(), "collection_techniques")).toHaveLength(2);
  });

  test(actionEvidenceTitle(
    "sample-config.session.update",
    ["concurrency"],
    "rejects stale revisions without replacing techniques"
  ), async () => {
    const before = await getCurrent();
    const config = objectField(before, "config");
    const revision = numberField(config, "revision");
    expect((await save(fx.sessions.owner.request, {
      base_revision: revision,
      sample_size_rationale: "Winning rationale",
    })).status()).toBe(200);

    const stale = await save(fx.sessions.editor.request, {
      base_revision: revision,
      sample_size_rationale: "Stale rationale",
      collection_techniques: [],
    });
    expect(stale.status()).toBe(409);
    expect((await readJson(stale)).code).toBe("SAMPLE_CONFIG_REVISION_CONFLICT");
    expect(arrayField(await getCurrent(), "collection_techniques")).toHaveLength(2);
  });

  test("rejects sample sizes beyond JavaScript's safe integer boundary", async () => {
    const config = objectField(await getCurrent(), "config");
    const response = await save(fx.sessions.owner.request, {
      base_revision: numberField(config, "revision"),
      target_sample_size: Number.MAX_SAFE_INTEGER + 1,
    });
    expect(response.status()).toBe(400);
  });

  test(actionEvidenceTitle(
    "sample-config.session.read",
    ["success", "permissions", "cleanup"],
    "exposes actual sample values and participant groups in the current contract"
  ), async () => {
    const current = await getCurrent();
    const config = objectField(current, "config");
    expect(config).toHaveProperty("actual_sample_size");
    expect(current).toHaveProperty("participant_groups");
    expect(Array.isArray(current.participant_groups)).toBe(true);
  });

  test(actionEvidenceTitle(
    "sample-config.options.read",
    ["success", "permissions", "cleanup"],
    "returns selectable configuration options only to project members"
  ), async () => {
    const optionsPath = `${pathFor(fx.primary.project.id)}/options`;
    for (const [request, status] of [
      [fx.sessions.owner.request, 200],
      [fx.sessions.viewer.request, 200],
      [fx.sessions.intruder.request, 403],
      [fx.anonymous, 401],
    ] as const) {
      expect((await request.get(optionsPath)).status()).toBe(status);
    }
  });
});
