import { expect, test } from "@playwright/test";
import { createQaProjectFixture, cleanupQaProjectAndSessions, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { createQaSessions } from "@/__tests__/backend/sessions";
import { codeFixtureData, segmentSelection } from "@/__tests__/backend/task10-test-helpers";
import { readJson, objectField, stringField, arrayField } from "@/__tests__/integration/research-workflow/task7-test-helpers";

test("temporary corpus journey retains linked analysis through document archive and restore", async () => {
  test.setTimeout(180_000);
  const sessions = await createQaSessions();
  let fixture: QaProjectFixture | undefined;
  try {
    fixture = await createQaProjectFixture(sessions);
    const root = `/api/projects/${fixture.project.id}`;
    const writer = sessions.editor.request;
    const reader = sessions.viewer.request;
    const create = async (path: string, data: Record<string, unknown>, field: string) => {
      const response = await writer.post(`${root}/${path}`, { data });
      expect(response.status()).toBe(201);
      return objectField(await readJson(response), field);
    };
    const read = async (path: string) => {
      const response = await reader.get(`${root}/${path}`);
      expect(response.status()).toBe(200);
      return readJson(response);
    };
    const participant = await create("participants", { alias: `journey-${fixture.marker.slice(-8)}`, notes: "Temporary participant" }, "participant");
    const participantId = stringField(participant, "id");
    expect(objectField(await read(`participants/${participantId}`), "participant")).toMatchObject({ id: participantId, notes: "Temporary participant" });
    const source = await create("documents/sources", { code: `qa_${fixture.marker.slice(-8)}`, label: "Temporary interviews" }, "source");
    const sourceId = stringField(source, "id");
    expect(objectField(await read(`documents/sources/${sourceId}`), "source")).toMatchObject({ id: sourceId, label: "Temporary interviews" });
    const content = "alpha 😀 evidence omega";
    const document = await create("documents", { title: `${fixture.marker} analysis journey`, content, participant_id: participantId, source_id: sourceId, status: "ready_for_coding" }, "document");
    const documentId = stringField(document, "id");
    const documentPath = `documents/${documentId}`;
    expect(objectField(await read(documentPath), "document")).toMatchObject({ id: documentId, content, participant_id: participantId, source_id: sourceId });
    const version = await create(`${documentPath}/versions`, { label: "Journey corpus snapshot" }, "version");
    const versionId = stringField(version, "id");
    expect(objectField(await read(`${documentPath}/versions/${versionId}`), "version")).toMatchObject({ id: versionId });
    const segment = await create(`${documentPath}/segments`, { base_document_revision: document.revision, ...segmentSelection(content, "😀 evidence") }, "segment");
    const segmentId = stringField(segment, "id");
    expect(arrayField(await read(`${documentPath}/segments`), "segments")).toContainEqual(expect.objectContaining({ id: segmentId, selected_text: "😀 evidence" }));
    const code = await create("analysis/codes", codeFixtureData({ name: `${fixture.marker} journey code` }), "code");
    const codeId = stringField(code, "id");
    expect(objectField(await read(`analysis/codes/${codeId}`), "code")).toMatchObject({ id: codeId, definition: "QA code definition" });
    const assignmentPath = `analysis/segments/${segmentId}/codes`;
    const assignment = await create(assignmentPath, { code_id: codeId, is_quote: true }, "segment_code");
    expect(arrayField(await read(assignmentPath), "segment_codes")).toContainEqual(expect.objectContaining({ id: assignment.id, code_id: codeId, segment_id: segmentId }));
    const memo = await create("analysis/memos", { title: `${fixture.marker} journey memo`, body: "Evidence interpretation" }, "memo");
    const memoId = stringField(memo, "id");
    expect(objectField(await read(`analysis/memos/${memoId}`), "memo")).toMatchObject({ id: memoId, body: "Evidence interpretation" });
    const linkPath = `analysis/memos/${memoId}/links`;
    const link = await create(linkPath, { link_type: "segment", segment_id: segmentId }, "link");
    expect(arrayField(await read(linkPath), "links")).toContainEqual(expect.objectContaining({ id: link.id, segment_id: segmentId }));
    const before = objectField(await read("analysis/overview"), "overview");
    expect(before).toMatchObject({ documents_count: 1, segments_count: 1, codes_count: 1, memos_count: 1, coded_segments_count: 1 });
    expect((await writer.delete(`${root}/${documentPath}`)).status()).toBe(200);
    expect((await reader.get(`${root}/${documentPath}`)).status()).toBe(404);
    // Document soft-deletion does not delete its independently persisted analysis.
    expect(objectField(await read("analysis/overview"), "overview")).toMatchObject({ documents_count: 0, segments_count: 1, coded_segments_count: 1, codes_count: 1, memos_count: 1 });
    expect(arrayField(await read(linkPath), "links")).toContainEqual(expect.objectContaining({ id: link.id, segment_id: segmentId }));
    expect((await writer.post(`${root}/${documentPath}/restore`)).status()).toBe(200);
    expect(objectField(await read(documentPath), "document")).toMatchObject({ id: documentId, content, deleted_at: null });
    expect(objectField(await read("analysis/overview"), "overview")).toMatchObject({ documents_count: 1, segments_count: 1, coded_segments_count: 1 });
    expect(arrayField(await read(assignmentPath), "segment_codes")).toContainEqual(expect.objectContaining({ id: assignment.id, code_id: codeId }));
  } finally {
    await cleanupQaProjectAndSessions(fixture, sessions);
  }
});
