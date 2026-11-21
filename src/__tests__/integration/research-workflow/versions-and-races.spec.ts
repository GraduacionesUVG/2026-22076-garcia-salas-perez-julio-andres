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

type WorkflowModule = "delimitation" | "research-design" | "sample-config";

test.describe("Task 7 workflow versions and bounded races", () => {
  // One configured live worker, but a failed workflow must not skip the others.
  test.describe.configure({ mode: "default" });
  test.setTimeout(180_000);
  let fx: Task7Fixture;

  test.beforeAll(async () => {
    fx = await createTask7Fixture();
  });

  test.afterAll(async () => {
    await closeTask7Fixture(fx);
  });

  const modulePath = (workflow: WorkflowModule, projectId = fx.primary.project.id) =>
    `/api/projects/${projectId}/${workflow}`;

  async function current(workflow: WorkflowModule, projectId = fx.primary.project.id) {
    const response = await fx.sessions.owner.request.get(modulePath(workflow, projectId));
    expect(response.status()).toBe(200);
    return objectField(await readJson(response), "data");
  }

  async function revision(workflow: WorkflowModule, projectId = fx.primary.project.id) {
    const data = await current(workflow, projectId);
    const record = objectField(
      data,
      workflow === "delimitation" ? "delim" : workflow === "research-design" ? "design" : "config"
    );
    return numberField(record, "revision");
  }

  async function update(
    workflow: WorkflowModule,
    request: APIRequestContext,
    payload: JsonObject,
    projectId = fx.primary.project.id
  ) {
    return request.put(modulePath(workflow, projectId), { data: payload });
  }

  async function createVersion(
    workflow: WorkflowModule,
    projectId = fx.primary.project.id,
    label = `${workflow} snapshot`
  ) {
    return fx.sessions.owner.request.post(`${modulePath(workflow, projectId)}/versions`, {
      data: { label },
    });
  }

  const versionReadEvidence = [
    {
      workflow: "delimitation" as const,
      listTitle: actionEvidenceTitle(
        "delimitation.versions.list", ["success", "permissions", "cleanup"],
        "lists versions only for project roles"
      ),
      detailTitle: actionEvidenceTitle(
        "delimitation.version-detail.read", ["success", "permissions", "cleanup"],
        "reads a version only for project roles"
      ),
    },
    {
      workflow: "research-design" as const,
      listTitle: actionEvidenceTitle(
        "research-design.versions.list", ["success", "permissions", "cleanup"],
        "lists versions only for project roles"
      ),
      detailTitle: actionEvidenceTitle(
        "research-design.version.create", ["success", "persistence", "permissions", "cleanup"],
        "creates a version used to verify reader access"
      ),
    },
    {
      workflow: "sample-config" as const,
      listTitle: actionEvidenceTitle(
        "sample-config.versions.list", ["success", "permissions", "cleanup"],
        "lists versions only for project roles"
      ),
      detailTitle: actionEvidenceTitle(
        "sample-config.version.create", ["success", "persistence", "permissions", "cleanup"],
        "creates a version used to verify reader access"
      ),
    },
  ];

  for (const { workflow, listTitle, detailTitle } of versionReadEvidence) {
    test.describe(detailTitle, () => {
      test(listTitle, async () => {
      const listPath = `${modulePath(workflow)}/versions`;
      const baseRevision = await revision(workflow);
      const seedPayload = workflow === "delimitation"
        ? { base_revision: baseRevision, topic: "Version role seed" }
        : workflow === "research-design"
          ? { base_revision: baseRevision, research_question: "How does the role seed behave?" }
          : { base_revision: baseRevision, sample_size_rationale: "Version role seed" };
      expect((await update(workflow, fx.sessions.owner.request, seedPayload)).status()).toBe(200);
      for (const [request, status] of [
        [fx.sessions.owner.request, 200],
        [fx.sessions.editor.request, 200],
        [fx.sessions.viewer.request, 200],
        [fx.sessions.intruder.request, 403],
        [fx.anonymous, 401],
      ] as const) {
        expect((await request.get(listPath)).status()).toBe(status);
      }

      for (const [request, status] of [
        [fx.sessions.viewer.request, 403],
        [fx.sessions.intruder.request, 403],
        [fx.anonymous, 401],
      ] as const) {
        expect((await request.post(listPath, { data: { label: "forbidden" } })).status()).toBe(status);
      }

      const editorCreate = await fx.sessions.editor.request.post(listPath, {
        data: { label: `${workflow} editor role proof` },
      });
      expect([200, 201]).toContain(editorCreate.status());
      const editorCreateBody = await readJson(editorCreate);
      const editorVersion = workflow === "delimitation"
        ? objectField(objectField(editorCreateBody, "data"), "version")
        : objectField(editorCreateBody, "version");
      const editorVersionId = stringField(editorVersion, "id");
      expect((await fx.sessions.viewer.request.get(`${listPath}/${editorVersionId}`)).status()).toBe(200);
      const restoreData = workflow === "delimitation" ? undefined : {};
      expect((await fx.sessions.editor.request.post(
        `${listPath}/${editorVersionId}/restore`,
        restoreData === undefined ? undefined : { data: restoreData }
      )).status()).toBe(200);
      });
    });
  }

  const versionPermissionEvidence = [
    [
      "delimitation" as const,
      actionEvidenceTitle("delimitation.version.create", ["permissions"], "allows editors but rejects unauthorized snapshot creation"),
      actionEvidenceTitle("delimitation.version.restore", ["permissions"], "allows editors but rejects unauthorized snapshot restoration"),
    ],
    [
      "research-design" as const,
      actionEvidenceTitle("research-design.version.create", ["permissions"], "allows editors but rejects unauthorized snapshot creation"),
      actionEvidenceTitle("research-design.version.restore", ["permissions"], "allows editors but rejects unauthorized snapshot restoration"),
    ],
    [
      "sample-config" as const,
      actionEvidenceTitle("sample-config.version.create", ["permissions"], "allows editors but rejects unauthorized snapshot creation"),
      actionEvidenceTitle("sample-config.version.restore", ["permissions"], "allows editors but rejects unauthorized snapshot restoration"),
    ],
  ] as const;

  for (const [workflow, createTitle, restoreTitle] of versionPermissionEvidence) {
    test.describe(restoreTitle, () => {
      test(createTitle, async () => {
        const listPath = `${modulePath(workflow)}/versions`;
        const created = await fx.sessions.owner.request.post(listPath, {
          data: { label: `${workflow} permission proof` },
        });
        expect([200, 201]).toContain(created.status());
        const versionId = stringField(objectField(await readJson(created), "version"), "id");

        for (const [request, status] of [
          [fx.sessions.viewer.request, 403],
          [fx.sessions.intruder.request, 403],
          [fx.anonymous, 401],
        ] as const) {
          expect((await request.post(listPath, { data: { label: "forbidden" } })).status()).toBe(status);
          expect((await request.post(
            `${listPath}/${versionId}/restore`,
            workflow === "delimitation" ? undefined : { data: {} }
          )).status()).toBe(status);
        }

        expect((await fx.sessions.editor.request.post(
          `${listPath}/${versionId}/restore`,
          workflow === "delimitation" ? undefined : { data: {} }
        )).status()).toBe(200);
      });
    });
  }

  const versionValidationEvidence = [
    [
      "delimitation" as const,
      actionEvidenceTitle("delimitation.version.create", ["validation"], "rejects malformed snapshot payloads"),
      actionEvidenceTitle("delimitation.version.restore", ["validation"], "rejects malformed version identifiers"),
    ],
    [
      "research-design" as const,
      actionEvidenceTitle("research-design.version.create", ["validation"], "rejects malformed snapshot payloads"),
      actionEvidenceTitle("research-design.version.restore", ["validation"], "rejects malformed version identifiers and payloads"),
    ],
    [
      "sample-config" as const,
      actionEvidenceTitle("sample-config.version.create", ["validation"], "rejects malformed snapshot payloads"),
      actionEvidenceTitle("sample-config.version.restore", ["validation"], "rejects malformed version identifiers and payloads"),
    ],
  ] as const;

  for (const [workflow, createTitle, restoreTitle] of versionValidationEvidence) {
    test.describe(restoreTitle, () => {
      test(createTitle, async () => {
      const listPath = `${modulePath(workflow)}/versions`;
      for (const data of [
        { label: "x".repeat(121) },
        { label: "valid", unexpected: true },
        ...(workflow === "delimitation"
          ? []
          : [{ label: "valid", trigger_type: "unknown" }]),
      ]) {
        expect((await fx.sessions.owner.request.post(listPath, { data })).status()).toBe(400);
      }
      expect((await fx.sessions.owner.request.get(`${listPath}/not-a-uuid`)).status()).toBe(400);
      expect((await fx.sessions.owner.request.post(`${listPath}/not-a-uuid/restore`, { data: {} })).status()).toBe(400);

      if (workflow !== "delimitation") {
        const created = await createVersion(workflow, undefined, `${workflow} strict restore`);
        const versionId = stringField(objectField(await readJson(created), "version"), "id");
        expect((await fx.sessions.owner.request.post(`${listPath}/${versionId}/restore`, {
          data: { create_backup_of_current: true, unexpected: true },
        })).status()).toBe(400);
      }
      });
    });
  }

  test("delimitation snapshots, restores, and retains a backup of the replaced state", async () => {
    let baseRevision = await revision("delimitation");
    expect((await update("delimitation", fx.sessions.owner.request, {
      base_revision: baseRevision,
      topic: "Delimitation snapshot A",
    })).status()).toBe(200);
    const itemResponse = await fx.sessions.owner.request.post(
      `${modulePath("delimitation")}/items`,
      { data: { kind: "include", text: "Snapshot include A" } }
    );
    expect(itemResponse.status()).toBe(201);

    const versionResponse = await createVersion("delimitation", undefined, "Delimitation A");
    expect(versionResponse.status()).toBe(201);
    const version = objectField(await readJson(versionResponse), "version");
    const versionId = stringField(version, "id");

    baseRevision = await revision("delimitation");
    expect((await update("delimitation", fx.sessions.editor.request, {
      base_revision: baseRevision,
      topic: "Delimitation state B",
    })).status()).toBe(200);

    const inspect = await fx.sessions.viewer.request.get(
      `${modulePath("delimitation")}/versions/${versionId}`
    );
    expect(inspect.status()).toBe(200);
    const inspected = objectField(await readJson(inspect), "data");
    expect(objectField(inspected, "delim").topic).toBe("Delimitation snapshot A");
    expect(arrayField(inspected, "include").map((item) => item.text)).toContain(
      "Snapshot include A"
    );

    expect((await fx.sessions.viewer.request.post(
      `${modulePath("delimitation")}/versions/${versionId}/restore`
    )).status()).toBe(403);
    const restoredResponse = await fx.sessions.owner.request.post(
      `${modulePath("delimitation")}/versions/${versionId}/restore`
    );
    expect(restoredResponse.status()).toBe(200);
    const restored = objectField(await readJson(restoredResponse), "data");
    expect(objectField(objectField(restored, "current"), "delim").topic).toBe(
      "Delimitation snapshot A"
    );
    expect(restored.backupCreated).toBe(true);

    const backupId = stringField(objectField(restored, "backupVersion"), "id");
    const backupResponse = await fx.sessions.owner.request.get(
      `${modulePath("delimitation")}/versions/${backupId}`
    );
    expect(objectField(objectField(await readJson(backupResponse), "data"), "delim").topic).toBe(
      "Delimitation state B"
    );
  });

  test("research design snapshots restore objective order and retain a backup", async () => {
    let baseRevision = await revision("research-design");
    expect((await update("research-design", fx.sessions.owner.request, {
      base_revision: baseRevision,
      research_question: "Research snapshot A?",
      general_objective: "Understand snapshot A",
    })).status()).toBe(200);
    const objectiveResponse = await fx.sessions.owner.request.post(
      `${modulePath("research-design")}/specific-objectives`,
      { data: { text: "Objective snapshot first" } }
    );
    expect(objectiveResponse.status()).toBe(201);
    const firstObjective = objectField(await readJson(objectiveResponse), "objective");
    const secondObjectiveResponse = await fx.sessions.owner.request.post(
      `${modulePath("research-design")}/specific-objectives`,
      { data: { text: "Objective snapshot second" } }
    );
    expect(secondObjectiveResponse.status()).toBe(201);
    const secondObjective = objectField(await readJson(secondObjectiveResponse), "objective");
    const existingObjectives = arrayField(await current("research-design"), "specific_objectives");
    const orderedIds = [
      stringField(secondObjective, "id"),
      stringField(firstObjective, "id"),
      ...existingObjectives
        .map((item) => stringField(item, "id"))
        .filter((id) => id !== firstObjective.id && id !== secondObjective.id),
    ];
    expect((await fx.sessions.owner.request.post(
      `${modulePath("research-design")}/specific-objectives/reorder`,
      { data: { ordered_ids: orderedIds } }
    )).status()).toBe(200);

    const versionResponse = await createVersion("research-design", undefined, "Design A");
    expect(versionResponse.status()).toBe(201);
    const versionId = stringField(objectField(await readJson(versionResponse), "version"), "id");

    baseRevision = await revision("research-design");
    expect((await update("research-design", fx.sessions.editor.request, {
      base_revision: baseRevision,
      research_question: "Research state B?",
    })).status()).toBe(200);
    expect((await fx.sessions.editor.request.post(
      `${modulePath("research-design")}/specific-objectives`,
      { data: { text: "Objective state B" } }
    )).status()).toBe(201);

    const inspect = await fx.sessions.viewer.request.get(
      `${modulePath("research-design")}/versions/${versionId}`
    );
    expect(inspect.status()).toBe(200);
    const snapshot = objectField(await readJson(inspect), "snapshot");
    expect(objectField(snapshot, "version").snapshot_research_question).toBe(
      "Research snapshot A?"
    );
    const snapshotOrder = arrayField(snapshot, "items").map((item) => item.text);
    expect(snapshotOrder.slice(0, 2)).toEqual([
      "Objective snapshot second",
      "Objective snapshot first",
    ]);

    const restore = await fx.sessions.owner.request.post(
      `${modulePath("research-design")}/versions/${versionId}/restore`,
      { data: { create_backup_of_current: true } }
    );
    expect(restore.status()).toBe(200);
    const restored = objectField(await readJson(restore), "restored");
    const data = objectField(restored, "data");
    expect(objectField(data, "design").research_question).toBe("Research snapshot A?");
    expect(arrayField(data, "specific_objectives").map((item) => item.text)).toEqual(
      snapshotOrder
    );

    const backupId = stringField(objectField(restored, "backup_version"), "id");
    const backup = objectField(
      await readJson(
        await fx.sessions.owner.request.get(
          `${modulePath("research-design")}/versions/${backupId}`
        )
      ),
      "snapshot"
    );
    expect(objectField(backup, "version").snapshot_research_question).toBe(
      "Research state B?"
    );
    expect(arrayField(backup, "items").map((item) => item.text)).toContain(
      "Objective state B"
    );
  });

  test("sample configuration snapshots restore techniques and retain a backup", async () => {
    const options = objectField(await current("sample-config"), "options");
    const code = stringField(arrayField(options, "collection_technique_options")[0], "code");
    let baseRevision = await revision("sample-config");
    expect((await update("sample-config", fx.sessions.owner.request, {
      base_revision: baseRevision,
      target_sample_size: 12,
      collection_techniques: [
        { technique_code: code, custom_label: null, is_custom: false },
      ],
    })).status()).toBe(200);

    const versionResponse = await createVersion("sample-config", undefined, "Sample A");
    expect(versionResponse.status()).toBe(201);
    const versionId = stringField(objectField(await readJson(versionResponse), "version"), "id");

    baseRevision = await revision("sample-config");
    expect((await update("sample-config", fx.sessions.editor.request, {
      base_revision: baseRevision,
      target_sample_size: 24,
      collection_techniques: [
        { technique_code: null, custom_label: "State B custom", is_custom: true },
      ],
    })).status()).toBe(200);

    const inspect = objectField(
      await readJson(
        await fx.sessions.viewer.request.get(
          `${modulePath("sample-config")}/versions/${versionId}`
        )
      ),
      "snapshot"
    );
    expect(objectField(inspect, "version").snapshot_target_sample_size).toBe(12);
    expect(arrayField(inspect, "techniques")).toHaveLength(1);

    const restore = await fx.sessions.owner.request.post(
      `${modulePath("sample-config")}/versions/${versionId}/restore`,
      { data: { create_backup_of_current: true } }
    );
    expect(restore.status()).toBe(200);
    const restored = objectField(await readJson(restore), "restored");
    const restoredCurrent = objectField(restored, "current");
    expect(objectField(restoredCurrent, "config").target_sample_size).toBe(12);
    expect(arrayField(restoredCurrent, "collection_techniques")[0].technique_code).toBe(code);

    const backupId = stringField(objectField(restored, "backup_version"), "id");
    const backup = objectField(
      await readJson(
        await fx.sessions.owner.request.get(
          `${modulePath("sample-config")}/versions/${backupId}`
        )
      ),
      "snapshot"
    );
    expect(objectField(backup, "version").snapshot_target_sample_size).toBe(24);
    expect(arrayField(backup, "techniques")[0].custom_label).toBe("State B custom");
  });

  test("foreign version IDs cannot be inspected or restored through another project", async () => {
    const foreignPayloads: Record<WorkflowModule, JsonObject> = {
      delimitation: {
        base_revision: await revision("delimitation", fx.foreign.project.id),
        topic: "Foreign delimitation",
      },
      "research-design": {
        base_revision: await revision("research-design", fx.foreign.project.id),
        research_question: "Foreign question?",
      },
      "sample-config": {
        base_revision: await revision("sample-config", fx.foreign.project.id),
        target_sample_size: 7,
      },
    };

    for (const workflow of ["delimitation", "research-design", "sample-config"] as const) {
      expect((await update(
        workflow,
        fx.sessions.owner.request,
        foreignPayloads[workflow],
        fx.foreign.project.id
      )).status()).toBe(200);
      const created = await createVersion(workflow, fx.foreign.project.id, "Foreign version");
      expect(created.status()).toBe(201);
      const versionId = stringField(objectField(await readJson(created), "version"), "id");
      expect((await fx.sessions.owner.request.get(
        `${modulePath(workflow)}/versions/${versionId}`
      )).status()).toBe(404);
      expect((await fx.sessions.owner.request.post(
        `${modulePath(workflow)}/versions/${versionId}/restore`,
        { data: {} }
      )).status()).toBe(404);
    }
  });

  test("two stale writes produce one winner and one conflict per workflow", async () => {
    const cases: Array<[WorkflowModule, (baseRevision: number, value: string) => JsonObject]> = [
      ["delimitation", (base_revision, value) => ({ base_revision, resources: value })],
      ["research-design", (base_revision, value) => ({ base_revision, general_objective: value })],
      ["sample-config", (base_revision, value) => ({ base_revision, sample_size_rationale: value })],
    ];

    for (const [workflow, payload] of cases) {
      const baseRevision = await revision(workflow);
      const responses = await Promise.all([
        update(workflow, fx.sessions.owner.request, payload(baseRevision, "Race A")),
        update(workflow, fx.sessions.editor.request, payload(baseRevision, "Race B")),
      ]);
      expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
    }
  });

  const versionDeduplicationEvidence = [
    ["delimitation" as const, actionEvidenceTitle("delimitation.version.create", ["duplicate"], "returns the existing version for an unchanged snapshot")],
    ["research-design" as const, actionEvidenceTitle("research-design.version.create", ["duplicate"], "returns the existing version for an unchanged snapshot")],
    ["sample-config" as const, actionEvidenceTitle("sample-config.version.create", ["duplicate"], "returns the existing version for an unchanged snapshot")],
  ] as const;

  for (const [workflow, title] of versionDeduplicationEvidence) {
    test(title, async () => {
      const first = await createVersion(workflow, undefined, `${workflow} dedupe first`);
      const second = await createVersion(workflow, undefined, `${workflow} dedupe second`);
      const firstBody = await readJson(first);
      const secondBody = await readJson(second);
      expect.soft(second.status(), `${workflow} duplicate status`).toBe(200);
      expect.soft(
        stringField(objectField(secondBody, "version"), "id"),
        `${workflow} duplicate version id`
      ).toBe(stringField(objectField(firstBody, "version"), "id"));
    });
  }

  const versionCreateRaceEvidence = [
    [
      "delimitation" as const,
      actionEvidenceTitle(
        "delimitation.version.create",
        ["success", "persistence", "duplicate", "concurrency", "cleanup"],
        "converges simultaneous unchanged snapshots on one persisted version"
      ),
    ],
    [
      "research-design" as const,
      actionEvidenceTitle(
        "research-design.version.create",
        ["success", "persistence", "duplicate", "concurrency", "cleanup"],
        "converges simultaneous unchanged snapshots on one persisted version"
      ),
    ],
    [
      "sample-config" as const,
      actionEvidenceTitle(
        "sample-config.version.create",
        ["success", "persistence", "duplicate", "concurrency", "cleanup"],
        "converges simultaneous unchanged snapshots on one persisted version"
      ),
    ],
  ] as const;

  for (const [workflow, title] of versionCreateRaceEvidence) {
    test(title, async () => {
      const baseRevision = await revision(workflow);
      const racePayload: Record<WorkflowModule, JsonObject> = {
        delimitation: {
          base_revision: baseRevision,
          time_period: "Delimitation version race content",
        },
        "research-design": {
          base_revision: baseRevision,
          research_question: "Research design version race content?",
        },
        "sample-config": {
          base_revision: baseRevision,
          field_phase: "Sample configuration version race content",
        },
      };
      expect((await update(
        workflow,
        fx.sessions.owner.request,
        racePayload[workflow]
      )).status()).toBe(200);

      const beforeResponse = await fx.sessions.owner.request.get(`${modulePath(workflow)}/versions`);
      expect(beforeResponse.status()).toBe(200);
      const before = arrayField(await readJson(beforeResponse), "versions");
      const responses = await Promise.all([
        createVersion(workflow, undefined, `${workflow} race A`),
        createVersion(workflow, undefined, `${workflow} race B`),
      ]);
      expect(responses.map((response) => response.status()).sort()).toEqual([200, 201]);
      const versions = await Promise.all(
        responses.map(async (response) => objectField(await readJson(response), "version"))
      );
      const versionId = stringField(versions[0], "id");
      const versionNumber = numberField(versions[0], "version_number");
      expect(stringField(versions[1], "id")).toBe(versionId);
      expect(numberField(versions[1], "version_number")).toBe(versionNumber);

      const afterResponse = await fx.sessions.owner.request.get(`${modulePath(workflow)}/versions`);
      expect(afterResponse.status()).toBe(200);
      const after = arrayField(await readJson(afterResponse), "versions");
      expect(after.length - before.length).toBe(1);
      const beforeIds = new Set(before.map((version) => stringField(version, "id")));
      const newVersions = after.filter((version) => !beforeIds.has(stringField(version, "id")));
      expect(newVersions).toEqual([
        expect.objectContaining({ id: versionId, version_number: versionNumber }),
      ]);
    });
  }

  const versionRestoreRaceEvidence = [
    {
      workflow: "delimitation" as const,
      title: actionEvidenceTitle(
        "delimitation.version.restore",
        ["success", "persistence", "duplicate", "concurrency", "cleanup"],
        "makes two restores of one revision yield one winner and one conflict"
      ),
      conflictCode: "DELIMITATION_REVISION_CONFLICT",
      latestKey: "latest_delimitation",
    },
    {
      workflow: "research-design" as const,
      title: actionEvidenceTitle(
        "research-design.version.restore",
        ["success", "persistence", "duplicate", "concurrency", "cleanup"],
        "makes two restores of one revision yield one winner and one conflict"
      ),
      conflictCode: "RESEARCH_DESIGN_REVISION_CONFLICT",
      latestKey: "latest_design",
    },
    {
      workflow: "sample-config" as const,
      title: actionEvidenceTitle(
        "sample-config.version.restore",
        ["success", "persistence", "duplicate", "concurrency", "cleanup"],
        "makes two restores of one revision yield one winner and one conflict"
      ),
      conflictCode: "SAMPLE_CONFIG_REVISION_CONFLICT",
      latestKey: "latest_config",
    },
  ] as const;

  for (const { workflow, title, conflictCode, latestKey } of versionRestoreRaceEvidence) {
    test(title, async () => {
      const initialRevision = await revision(workflow);
      const payload: Record<WorkflowModule, JsonObject> = {
        delimitation: { base_revision: initialRevision, topic: "Restore race snapshot" },
        "research-design": { base_revision: initialRevision, research_question: "Restore race snapshot?" },
        "sample-config": { base_revision: initialRevision, field_phase: "Restore race snapshot" },
      };
      expect((await update(workflow, fx.sessions.owner.request, payload[workflow])).status()).toBe(200);
      const created = await createVersion(workflow, undefined, `${workflow} restore race`);
      expect(created.status()).toBe(201);
      const versionId = stringField(objectField(await readJson(created), "version"), "id");

      const changedRevision = await revision(workflow);
      const changedPayload: Record<WorkflowModule, JsonObject> = {
        delimitation: { base_revision: changedRevision, topic: "Restore race changed" },
        "research-design": { base_revision: changedRevision, research_question: "Restore race changed?" },
        "sample-config": { base_revision: changedRevision, field_phase: "Restore race changed" },
      };
      expect((await update(workflow, fx.sessions.editor.request, changedPayload[workflow])).status()).toBe(200);

      const path = `${modulePath(workflow)}/versions/${versionId}/restore`;
      // Explicit client state, unlike a legacy omitted/server-observed revision.
      const restoreOptions = { data: { base_revision: await revision(workflow), create_backup_of_current: true } };
      const beforeRestoreVersions = arrayField(
        await readJson(await fx.sessions.owner.request.get(`${modulePath(workflow)}/versions`)),
        "versions"
      );
      const responses = await Promise.all([
        fx.sessions.owner.request.post(path, restoreOptions),
        fx.sessions.editor.request.post(path, restoreOptions),
      ]);
      expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
      const successful = responses.find((response) => response.status() === 200)!;
      const conflict = responses.find((response) => response.status() === 409)!;
      const successBody = await readJson(successful);
      const conflictBody = await readJson(conflict);
      expect(conflictBody.ok).toBe(false);
      expect(conflictBody.error).toBe(conflictCode);
      expect(conflictBody.code).toBe(conflictCode);

      const terminal = await current(workflow);
      const terminalRecord = objectField(
        terminal,
        workflow === "delimitation" ? "delim" : workflow === "research-design" ? "design" : "config"
      );
      const expectedValue = workflow === "research-design"
        ? "Restore race snapshot?"
        : "Restore race snapshot";
      const field = workflow === "delimitation"
        ? "topic"
        : workflow === "research-design"
          ? "research_question"
          : "field_phase";
      expect(terminalRecord[field]).toBe(expectedValue);
      expect(numberField(terminalRecord, "revision")).toBe(changedRevision + 2);
      const latest = objectField(conflictBody, latestKey);
      expect(numberField(latest, "revision")).toBe(numberField(terminalRecord, "revision"));
      expect(latest[field]).toBe(terminalRecord[field]);

      const afterRestoreVersions = arrayField(
        await readJson(await fx.sessions.owner.request.get(`${modulePath(workflow)}/versions`)),
        "versions"
      );
      const newBackups = afterRestoreVersions.filter((version) =>
        !beforeRestoreVersions.some((before) => before.id === version.id) &&
        version.trigger_type === "restore_backup"
      );
      expect(newBackups).toHaveLength(1);
      const backup = newBackups[0];
      // Delimitation lists expose database snapshot fields; design and sample
      // lists expose their public payload under snapshot instead.
      const backupSnapshot = workflow === "delimitation" ? backup : objectField(backup, "snapshot");
      const backupField = workflow === "delimitation"
        ? "snapshot_topic"
        : workflow === "research-design"
          ? "research_question"
          : "field_phase";
      const changedValue = workflow === "research-design" ? "Restore race changed?" : "Restore race changed";
      expect(backupSnapshot[backupField]).toBe(changedValue);

      if (workflow === "delimitation") {
        const restored = objectField(successBody, "data");
        expect(restored.backupCreated).toBe(true);
      } else {
        const restored = objectField(successBody, "restored");
        const backup = objectField(restored, "backup_version");
        expect(afterRestoreVersions.filter((version) => version.id === backup.id)).toHaveLength(1);
      }
    });
  }
});
