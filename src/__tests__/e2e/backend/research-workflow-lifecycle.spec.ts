import { expect, test } from "@playwright/test";
import { createQaProjectFixture, cleanupQaProjectAndSessions, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { createQaSessions } from "@/__tests__/backend/sessions";
import { readJson, objectField, numberField, stringField, arrayField } from "@/__tests__/integration/research-workflow/task7-test-helpers";

test("temporary research journey persists criteria, restores a snapshot, and advances workflow", async () => {
  test.setTimeout(180_000);
  const sessions = await createQaSessions();
  let fixture: QaProjectFixture | undefined;
  try {
    fixture = await createQaProjectFixture(sessions);
    const root = `/api/projects/${fixture.project.id}`;
    const reader = sessions.viewer.request;
    const writer = sessions.editor.request;
    const workflow = async () => {
      const response = await reader.get(`${root}/workflow`);
      expect(response.status()).toBe(200);
      return objectField(await readJson(response), "workflow");
    };
    const current = async (module: string, field: string) => {
      const response = await reader.get(`${root}/${module}`);
      expect(response.status()).toBe(200);
      return objectField(objectField(await readJson(response), "data"), field);
    };
    const initial = await workflow();
    expect(initial.progress).toBe(0);
    const delimitation = await current("delimitation", "delim");
    expect((await writer.put(`${root}/delimitation`, { data: {
      base_revision: numberField(delimitation, "revision"), topic: "Community fieldwork",
      context_place: "QA community", population: "QA adults", time_period: "QA period", resources: "QA interviews",
    } })).status()).toBe(200);
    expect(await current("delimitation", "delim")).toMatchObject({ topic: "Community fieldwork" });
    expect(objectField(objectField(await workflow(), "phaseMap"), "delimitation")).toMatchObject({ state: "in_progress", progress: 71 });
    for (const kind of ["include", "exclude"]) {
      expect((await writer.post(`${root}/delimitation/items`, { data: { kind, text: `${kind} QA criterion` } })).status()).toBe(201);
      const response = await reader.get(`${root}/delimitation`);
      expect(response.status()).toBe(200);
      expect(arrayField(objectField(await readJson(response), "data"), kind)).toContainEqual(expect.objectContaining({ kind, text: `${kind} QA criterion` }));
    }
    const snapshotResponse = await writer.post(`${root}/delimitation/versions`, { data: { label: "Journey delimitation snapshot" } });
    expect(snapshotResponse.status()).toBe(201);
    const snapshotId = stringField(objectField(await readJson(snapshotResponse), "version"), "id");
    expect((await reader.get(`${root}/delimitation/versions/${snapshotId}`)).status()).toBe(200);
    const beforeChange = await current("delimitation", "delim");
    expect((await writer.put(`${root}/delimitation`, { data: { base_revision: numberField(beforeChange, "revision"), topic: "Replaced topic" } })).status()).toBe(200);
    expect(await current("delimitation", "delim")).toMatchObject({ topic: "Replaced topic" });
    expect((await writer.post(`${root}/delimitation/versions/${snapshotId}/restore`)).status()).toBe(200);
    expect(await current("delimitation", "delim")).toMatchObject({ topic: "Community fieldwork" });
    const restoredRead = await reader.get(`${root}/delimitation`);
    expect(restoredRead.status()).toBe(200);
    const restored = objectField(await readJson(restoredRead), "data");
    for (const kind of ["include", "exclude"]) {
      expect(arrayField(restored, kind)).toContainEqual(expect.objectContaining({ text: `${kind} QA criterion` }));
    }
    expect(objectField(objectField(await workflow(), "phaseMap"), "delimitation")).toMatchObject({ state: "completed", progress: 100 });
    const design = await current("research-design", "design");
    expect((await writer.put(`${root}/research-design`, { data: { base_revision: numberField(design, "revision"), research_question: "How do QA communities collaborate?", general_objective: "Describe QA collaboration" } })).status()).toBe(200);
    expect(await current("research-design", "design")).toMatchObject({ general_objective: "Describe QA collaboration" });
    expect(objectField(objectField(await workflow(), "phaseMap"), "design")).toMatchObject({ state: "in_progress", progress: 67 });
    expect((await writer.post(`${root}/research-design/specific-objectives`, { data: { text: "Identify QA practices" } })).status()).toBe(201);
    const designRead = await reader.get(`${root}/research-design`);
    expect(designRead.status()).toBe(200);
    expect(arrayField(objectField(await readJson(designRead), "data"), "specific_objectives")).toContainEqual(expect.objectContaining({ text: "Identify QA practices" }));
    const designVersion = await writer.post(`${root}/research-design/versions`, { data: { label: "Journey design snapshot" } });
    expect(designVersion.status()).toBe(201);
    const designVersionId = stringField(objectField(await readJson(designVersion), "version"), "id");
    expect((await reader.get(`${root}/research-design/versions/${designVersionId}`)).status()).toBe(200);
    expect(objectField(objectField(await workflow(), "phaseMap"), "design")).toMatchObject({ state: "completed", progress: 100 });
    const sample = await current("sample-config", "config");
    const optionsRead = await reader.get(`${root}/sample-config/options`);
    expect(optionsRead.status()).toBe(200);
    const options = objectField(await readJson(optionsRead), "options");
    const approaches = arrayField(options, "main_approaches");
    const scopes = arrayField(options, "scopes");
    expect(approaches.length).toBeGreaterThan(0);
    expect(scopes.length).toBeGreaterThan(0);
    expect((await writer.put(`${root}/sample-config`, { data: { base_revision: numberField(sample, "revision"), main_approach_code: stringField(approaches[0], "code"), scope_code: stringField(scopes[0], "code"), target_sample_size: 4, sample_size_rationale: "Bounded QA sample", field_phase: "QA fieldwork", collection_techniques: [{ is_custom: true, custom_label: "QA interview", technique_code: null }] } })).status()).toBe(200);
    expect(await current("sample-config", "config")).toMatchObject({ target_sample_size: 4, sample_size_rationale: "Bounded QA sample" });
    const sampleVersion = await writer.post(`${root}/sample-config/versions`, { data: { label: "Journey sample snapshot" } });
    expect(sampleVersion.status()).toBe(201);
    const sampleVersionId = stringField(objectField(await readJson(sampleVersion), "version"), "id");
    expect((await reader.get(`${root}/sample-config/versions/${sampleVersionId}`)).status()).toBe(200);
    const final = await workflow();
    expect(objectField(objectField(final, "phaseMap"), "sample")).toMatchObject({ state: "completed", progress: 100, available: true });
    expect(objectField(objectField(final, "phaseMap"), "collection")).toMatchObject({ state: "not_started", available: true });
    expect(numberField(final, "progress")).toBeGreaterThan(numberField(initial, "progress"));
  } finally {
    await cleanupQaProjectAndSessions(fixture, sessions);
  }
});
