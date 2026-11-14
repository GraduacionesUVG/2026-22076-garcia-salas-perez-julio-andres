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
  ["GET", "/api/projects/:id/research-design"],
  ["PATCH", "/api/projects/:id/research-design"],
  ["PUT", "/api/projects/:id/research-design"],
  ["GET", "/api/projects/:id/research-design/evaluate"],
  ["POST", "/api/projects/:id/research-design/specific-objectives"],
  ["PATCH", "/api/projects/:id/research-design/specific-objectives/:objectiveId"],
  ["DELETE", "/api/projects/:id/research-design/specific-objectives/:objectiveId"],
  ["POST", "/api/projects/:id/research-design/specific-objectives/reorder"],
  ["GET", "/api/projects/:id/research-design/versions"],
  ["POST", "/api/projects/:id/research-design/versions"],
  ["GET", "/api/projects/:id/research-design/versions/:versionId"],
  ["POST", "/api/projects/:id/research-design/versions/:versionId/restore"],
] as const;

test.describe.serial("Task 7 research design contracts", () => {
  test.setTimeout(120_000);
  let fx: Task7Fixture;

  test.beforeAll(async () => {
    fx = await createTask7Fixture();
  });

  test.afterAll(async () => {
    await closeTask7Fixture(fx);
  });

  const pathFor = (projectId: string) =>
    `/api/projects/${projectId}/research-design`;

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

  async function createObjective(
    text: string,
    projectId = fx.primary.project.id
  ): Promise<JsonObject> {
    const response = await fx.sessions.owner.request.post(
      `${pathFor(projectId)}/specific-objectives`,
      { data: { text } }
    );
    expect(response.status()).toBe(201);
    return objectField(await readJson(response), "objective");
  }

  test(actionEvidenceTitle(
    "research-design.session.read",
    ["success", "permissions", "cleanup"],
    "allows project roles to read while rejecting intruder and anonymous sessions"
  ), async () => {
    const readCases = [
      [fx.sessions.owner.request, 200],
      [fx.sessions.editor.request, 200],
      [fx.sessions.viewer.request, 200],
      [fx.sessions.intruder.request, 403],
      [fx.anonymous, 401],
    ] as const;

    for (const suffix of ["", "/evaluate"]) {
      for (const [request, status] of readCases) {
        const response = await request.get(`${pathFor(fx.primary.project.id)}${suffix}`);
        expect(response.status()).toBe(status);
      }
    }

    const design = objectField(await getCurrent(), "design");
    expect((await save(fx.sessions.owner.request, {
      base_revision: numberField(design, "revision"),
      research_question: "How do participants describe the experience?",
    })).status()).toBe(200);

    const updated = objectField(await getCurrent(), "design");
    expect((await save(fx.sessions.editor.request, {
      base_revision: numberField(updated, "revision"),
      general_objective: "Understand the described experience",
    })).status()).toBe(200);

    const revision = numberField(objectField(await getCurrent(), "design"), "revision");
    for (const [request, status] of [
      [fx.sessions.viewer.request, 403],
      [fx.sessions.intruder.request, 403],
      [fx.anonymous, 401],
    ] as const) {
      expect((await save(request, {
        base_revision: revision,
        research_question: "Forbidden",
      })).status()).toBe(status);
    }

    const patchRevision = numberField(objectField(await getCurrent(), "design"), "revision");
    const rootPatch = await fx.sessions.editor.request.patch(pathFor(fx.primary.project.id), {
      data: {
        base_revision: patchRevision,
        research_question: "Does root PATCH update research design?",
      },
    });
    expect(rootPatch.status()).toBe(200);
    expect(objectField(await readJson(rootPatch), "design").research_question).toBe(
      "Does root PATCH update research design?"
    );
    expect(objectField(await getCurrent(), "design").research_question).toBe(
      "Does root PATCH update research design?"
    );
  });

  test(actionEvidenceTitle(
    "research-design.session.save",
    ["success", "persistence", "permissions", "cleanup"],
    "persists an owner save and rejects a viewer without losing the saved value"
  ), async () => {
    const before = objectField(await getCurrent(), "design");
    const saved = await save(fx.sessions.owner.request, {
      base_revision: numberField(before, "revision"),
      general_objective: "Save evidence objective",
    });
    expect(saved.status()).toBe(200);
    const after = objectField(await getCurrent(), "design");
    expect(after.general_objective).toBe("Save evidence objective");
    expect((await save(fx.sessions.viewer.request, {
      base_revision: numberField(after, "revision"),
      general_objective: "Forbidden save",
    })).status()).toBe(403);
  });

  test(actionEvidenceTitle(
    "research-design.session.save",
    ["validation"],
    "rejects malformed research-design saves"
  ), async () => {
    for (const payload of [
      { base_revision: 0 },
      { base_revision: 0, research_question: "valid", extra: true },
      { base_revision: -1, research_question: "valid" },
      { base_revision: 0, research_question: "q".repeat(5001) },
    ]) {
      expect((await save(fx.sessions.owner.request, payload)).status()).toBe(400);
    }
    expect((await fx.sessions.owner.request.put(pathFor(fx.primary.project.id), {
      data: "{",
      headers: { "content-type": "application/json" },
    })).status()).toBe(400);

    const current = objectField(await getCurrent(), "design");
    const boundary = await save(fx.sessions.owner.request, {
      base_revision: numberField(current, "revision"),
      research_question: "q".repeat(5000),
    });
    expect(boundary.status()).toBe(200);

    const objectivePath = `${pathFor(fx.primary.project.id)}/specific-objectives`;
    for (const payload of [
      { text: "" },
      { text: "   " },
      { text: "o".repeat(3001) },
      { text: "valid", extra: true },
    ]) {
      expect((await fx.sessions.owner.request.post(objectivePath, { data: payload })).status()).toBe(400);
    }
    const boundaryObjective = await fx.sessions.owner.request.post(objectivePath, {
      data: { text: "o".repeat(3000) },
    });
    expect(boundaryObjective.status()).toBe(201);
    const boundaryObjectiveId = stringField(
      objectField(await readJson(boundaryObjective), "objective"),
      "id"
    );
    expect((await fx.sessions.viewer.request.delete(`${objectivePath}/${boundaryObjectiveId}`)).status()).toBe(403);
    expect((await fx.sessions.owner.request.delete(`${objectivePath}/${boundaryObjectiveId}`)).status()).toBe(200);
    expect(arrayField(await getCurrent(), "specific_objectives").map((item) => item.id)).not.toContain(
      boundaryObjectiveId
    );
    expect((await fx.sessions.viewer.request.post(objectivePath, {
      data: { text: "viewer objective" },
    })).status()).toBe(403);
  });

  test(actionEvidenceTitle(
    "research-design.evaluation.read",
    ["success", "permissions", "cleanup"],
    "returns evaluation to project members without exposing it to intruders"
  ), async () => {
    const evaluatePath = `${pathFor(fx.primary.project.id)}/evaluate`;
    for (const [request, status] of [
      [fx.sessions.owner.request, 200],
      [fx.sessions.viewer.request, 200],
      [fx.sessions.intruder.request, 403],
      [fx.anonymous, 401],
    ] as const) {
      expect((await request.get(evaluatePath)).status()).toBe(status);
    }
  });

  test(actionEvidenceTitle(
    "research-design.specific-objective.create",
    ["success", "persistence", "permissions", "validation", "duplicate", "cleanup"],
    "creates an objective that remains available in an independent readback"
  ), async () => {
    const objective = await createObjective("Create readback objective");
    const objectiveId = stringField(objective, "id");
    expect(arrayField(await getCurrent(), "specific_objectives")).toContainEqual(
      expect.objectContaining({ id: objectiveId, text: "Create readback objective" })
    );
    expect((await fx.sessions.owner.request.delete(
      `${pathFor(fx.primary.project.id)}/specific-objectives/${objectiveId}`
    )).status()).toBe(200);
    const objectivePath = `${pathFor(fx.primary.project.id)}/specific-objectives`;
    expect((await fx.sessions.viewer.request.post(objectivePath, {
      data: { text: "Forbidden create" },
    })).status()).toBe(403);
    expect((await fx.sessions.owner.request.post(objectivePath, {
      data: { text: "" },
    })).status()).toBe(400);
    const firstDuplicate = await fx.sessions.owner.request.post(objectivePath, {
      data: { text: "Duplicate objective" },
    });
    const secondDuplicate = await fx.sessions.owner.request.post(objectivePath, {
      data: { text: "Duplicate objective" },
    });
    expect(firstDuplicate.status()).toBe(201);
    expect(secondDuplicate.status()).toBe(201);
    expect(stringField(objectField(await readJson(firstDuplicate), "objective"), "id")).not.toBe(
      stringField(objectField(await readJson(secondDuplicate), "objective"), "id")
    );
  });

  test(actionEvidenceTitle(
    "research-design.specific-objective.update",
    ["success", "persistence", "permissions", "validation", "cleanup"],
    "rejects stale objective writes after persisting the winning update"
  ), async () => {
    const design = objectField(await getCurrent(), "design");
    const revision = numberField(design, "revision");
    expect((await save(fx.sessions.owner.request, {
      base_revision: revision,
      general_objective: "Winning general objective",
    })).status()).toBe(200);

    const staleDesign = await save(fx.sessions.editor.request, {
      base_revision: revision,
      general_objective: "Stale general objective",
    });
    expect(staleDesign.status()).toBe(409);
    expect((await readJson(staleDesign)).code).toBe("RESEARCH_DESIGN_REVISION_CONFLICT");

    const objective = await createObjective("Versioned objective");
    const objectivePath = `${pathFor(fx.primary.project.id)}/specific-objectives/${stringField(objective, "id")}`;
    const objectiveRevision = numberField(objective, "revision");
    expect((await fx.sessions.owner.request.patch(objectivePath, {
      data: { base_revision: objectiveRevision, text: "Winning objective" },
    })).status()).toBe(200);
    expect(arrayField(await getCurrent(), "specific_objectives")).toContainEqual(
      expect.objectContaining({ id: stringField(objective, "id"), text: "Winning objective" })
    );
    expect((await fx.sessions.viewer.request.patch(objectivePath, {
      data: { base_revision: objectiveRevision + 1, text: "Forbidden objective" },
    })).status()).toBe(403);
    expect((await fx.sessions.owner.request.patch(objectivePath, {
      data: { base_revision: objectiveRevision + 1, text: "" },
    })).status()).toBe(400);

    const staleObjective = await fx.sessions.editor.request.patch(objectivePath, {
      data: { base_revision: objectiveRevision, text: "Stale objective" },
    });
    expect(staleObjective.status()).toBe(409);
    expect((await readJson(staleObjective)).code).toBe(
      "SPECIFIC_OBJECTIVE_REVISION_CONFLICT"
    );
  });

  test(actionEvidenceTitle(
    "research-design.specific-objectives.reorder",
    ["success", "persistence", "permissions", "validation", "cleanup"],
    "persists one exact objective permutation and rejects invalid orders"
  ), async () => {
    const first = await createObjective("Reorder first");
    const second = await createObjective("Reorder second");
    const foreign = await createObjective("Foreign objective", fx.foreign.project.id);
    const current = arrayField(await getCurrent(), "specific_objectives");
    const currentIds = current.map((item) => stringField(item, "id"));
    const reorderPath = `${pathFor(fx.primary.project.id)}/specific-objectives/reorder`;

    const invalidOrders = [
      [...currentIds.slice(0, -1), currentIds[0]],
      currentIds.slice(0, -1),
      [...currentIds.slice(0, -1), stringField(foreign, "id")],
    ];
    for (const ordered_ids of invalidOrders) {
      const response = await fx.sessions.owner.request.post(reorderPath, {
        data: { ordered_ids },
      });
      expect(response.status()).toBe(400);
    }

    expect(arrayField(await getCurrent(), "specific_objectives").map((item) => item.id)).toEqual(
      currentIds
    );

    const reversed = [...currentIds].reverse();
    const valid = await fx.sessions.editor.request.post(reorderPath, {
      data: { ordered_ids: reversed },
    });
    expect(valid.status()).toBe(200);
    const reordered = arrayField(await readJson(valid), "objectives");
    expect(reordered.map((item) => item.id)).toEqual(reversed);
    expect(reordered.map((item) => item.position)).toEqual(
      reversed.map((_, index) => index)
    );
    expect(reordered.map((item) => item.id)).toContain(stringField(first, "id"));
    expect(reordered.map((item) => item.id)).toContain(stringField(second, "id"));
    const persistedOrder = arrayField(await getCurrent(), "specific_objectives");
    expect(persistedOrder.map(item => ({ id: item.id, position: item.position }))).toEqual(
      reversed.map((id, position) => ({ id, position }))
    );
    for (const [actor, status] of [[fx.sessions.viewer.request, 403], [fx.sessions.intruder.request, 403], [fx.anonymous, 401]] as const) {
      const denied = await actor.post(reorderPath, { data: { ordered_ids: currentIds } });
      expect(denied.status()).toBe(status);
      expect(arrayField(await getCurrent(), "specific_objectives")).toEqual(persistedOrder);
    }
  });

  test(actionEvidenceTitle(
    "research-design.specific-objective.delete",
    ["success", "persistence", "permissions", "validation", "cleanup"],
    "keeps foreign objectives unavailable to mutation through another project"
  ), async () => {
    const primary = await createObjective("Delete success objective");
    const primaryId = stringField(primary, "id");
    const primaryPath = `${pathFor(fx.primary.project.id)}/specific-objectives/${primaryId}`;
    expect((await fx.sessions.viewer.request.delete(primaryPath)).status()).toBe(403);
    expect((await fx.sessions.owner.request.delete(primaryPath)).status()).toBe(200);
    expect(arrayField(await getCurrent(), "specific_objectives").map((item) => item.id)).not.toContain(primaryId);
    expect((await fx.sessions.owner.request.delete(
      `${pathFor(fx.primary.project.id)}/specific-objectives/not-a-uuid`
    )).status()).toBe(400);

    const foreign = await createObjective("Foreign mutation sentinel", fx.foreign.project.id);
    const foreignId = stringField(foreign, "id");
    const crossPath = `${pathFor(fx.primary.project.id)}/specific-objectives/${foreignId}`;

    expect((await fx.sessions.owner.request.patch(crossPath, {
      data: { base_revision: numberField(foreign, "revision"), text: "Cross overwrite" },
    })).status()).toBe(404);
    expect((await fx.sessions.owner.request.delete(crossPath)).status()).toBe(404);

    expect(arrayField(await getCurrent(fx.foreign.project.id), "specific_objectives").map((item) => item.text)).toContain(
      "Foreign mutation sentinel"
    );
  });
});
