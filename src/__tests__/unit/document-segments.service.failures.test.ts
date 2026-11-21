import {
  SUPABASE_FAILURE_CASES,
  captureRejection,
  expectSafeDependencyFailure,
  freshProviderFailure,
} from "@/__tests__/backend/supabase-failure-cases";
import { DocumentSegmentsService } from "@/src/modules/documents/document-segments.service";

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    getDocumentById: jest.fn(),
    listByDocument: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    createEvent: jest.fn(),
    ...overrides,
  };
}

describe("DocumentSegmentsService dependency failures", () => {
  const document = { id: "document-1", content: "á😀 beta", revision: 2 };
  const base = { projectId: "project-1", documentId: "document-1", actorUserId: "actor" };
  const input = { start_char: 0, end_char: 3, selected_text: "á😀", note: "", base_document_revision: 2 };
  const segment = { id: "s", document_id: base.documentId, start_char: 0, end_char: 3, selected_text: "á😀", note: "", revision: 1 };
  const updateParams = { ...base, segmentId: "s", input: { base_revision: 1, note: "changed" } };
  it.each(["getById", "create", "update", "softDelete"] as const)("missing scoped parent prevents %s child effects", async method => {
    const repo = makeRepo({ getDocumentById: jest.fn().mockResolvedValue(null) });
    const args = method === "create" ? { ...base, input } : method === "update" ? updateParams : { ...base, segmentId: "s" };
    await expect((new DocumentSegmentsService(repo as never)[method] as (input: unknown) => Promise<unknown>)(args)).resolves.toBeNull();
    expect(repo.getDocumentById).toHaveBeenCalledWith({ projectId: base.projectId, documentId: base.documentId });
    expect(repo.getById).not.toHaveBeenCalled(); expect(repo.create).not.toHaveBeenCalled(); expect(repo.update).not.toHaveBeenCalled(); expect(repo.softDelete).not.toHaveBeenCalled(); expect(repo.createEvent).not.toHaveBeenCalled();
  });
  it.each(["getById", "update", "softDelete"] as const)("missing scoped segment returns null for %s with no audit", async method => {
    const repo = makeRepo({ getDocumentById: jest.fn().mockResolvedValue(document), getById: jest.fn().mockResolvedValue(null), softDelete: jest.fn().mockResolvedValue(null) });
    await expect((new DocumentSegmentsService(repo as never)[method] as (input: unknown) => Promise<unknown>)(method === "update" ? updateParams : { ...base, segmentId: "s" })).resolves.toBeNull();
    const reader = method === "softDelete" ? repo.softDelete : repo.getById;
    expect(reader).toHaveBeenCalledWith(method === "softDelete" ? { ...base, segmentId: "s" } : { projectId: base.projectId, documentId: base.documentId, segmentId: "s" });
    expect(repo.update).not.toHaveBeenCalled(); expect(repo.createEvent).not.toHaveBeenCalled();
  });
  it("deletes only after parent read and audits accepted deletion", async () => {
    const deleted = { ...segment, deleted_at: "date" };
    const repo = makeRepo({ getDocumentById: jest.fn().mockResolvedValue(document), softDelete: jest.fn().mockResolvedValue(deleted) });
    await expect(new DocumentSegmentsService(repo as never).softDelete({ ...base, segmentId: "s" })).resolves.toBe(deleted);
    expect(repo.softDelete).toHaveBeenCalledWith({ ...base, segmentId: "s" });
    expect(repo.createEvent).toHaveBeenCalledWith({ projectId: base.projectId, documentId: base.documentId, segmentId: "s", eventType: "segment_deleted", actorUserId: "actor", payload: { segment_id: "s", document_id: base.documentId, start_char: 0, end_char: 3, revision: 1, selected_text_length: 3, deleted: true } });
    expect(repo.getDocumentById.mock.invocationCallOrder[0]).toBeLessThan(repo.softDelete.mock.invocationCallOrder[0]);
    expect(repo.softDelete.mock.invocationCallOrder[0]).toBeLessThan(repo.createEvent.mock.invocationCallOrder[0]);
  });
  it.each([
    [{ start_char: 1, selected_text: "😀", base_document_revision: 2 }, { start_char: 1, end_char: 3, selected_text: "😀" }, ["start_char", "selected_text"]],
    [{ end_char: 4, selected_text: "á😀 ", base_document_revision: 2 }, { start_char: 0, end_char: 4, selected_text: "á😀 " }, ["end_char", "selected_text"]],
  ])("merges partial range fields against existing segment", async (patch, range, changed_fields) => {
    const updated = { ...segment, ...range, revision: 2 };
    const repo = makeRepo({ getDocumentById: jest.fn().mockResolvedValue(document), getById: jest.fn().mockResolvedValue(segment), update: jest.fn().mockResolvedValue(updated) });
    const args = { ...base, segmentId: "s", input: { base_revision: 1, ...patch } };
    await expect(new DocumentSegmentsService(repo as never).update(args)).resolves.toBe(updated);
    expect(repo.update).toHaveBeenCalledWith(args);
    expect(repo.createEvent).toHaveBeenCalledWith({ projectId: base.projectId, documentId: base.documentId, segmentId: "s", actorUserId: "actor", eventType: "segment_updated", payload: { segment_id: "s", document_id: base.documentId, start_char: range.start_char, end_char: range.end_char, selected_text_length: range.selected_text.length, revision: 2, changed_fields } });
  });
  it.each([
    [{ start_char: 1, base_document_revision: 2 }, "SELECTED_TEXT_DOES_NOT_MATCH_DOCUMENT", 400],
    [{ selected_text: "á😀" }, "DOCUMENT_REVISION_CONFLICT", 409],
  ])("rejects invalid partial range with no accepted mutation", async (patch, message, status) => {
    const repo = makeRepo({ getDocumentById: jest.fn().mockResolvedValue(document), getById: jest.fn().mockResolvedValue(segment) });
    await expect(new DocumentSegmentsService(repo as never).update({ ...base, segmentId: "s", input: { base_revision: 1, ...patch } })).rejects.toMatchObject({ message, status });
    expect(repo.update).not.toHaveBeenCalled(); expect(repo.createEvent).not.toHaveBeenCalled();
  });
  it.each(["create", "update", "softDelete"] as const)("post-read %s provider failure emits no success audit", async method => {
    const failure = freshProviderFailure(SUPABASE_FAILURE_CASES[0]);
    const repo = makeRepo({ getDocumentById: jest.fn().mockResolvedValue(document), getById: jest.fn().mockResolvedValue(segment), [method]: jest.fn().mockRejectedValue(failure) });
    const args = method === "create" ? { ...base, input } : method === "update" ? updateParams : { ...base, segmentId: "s" };
    const observed = await captureRejection((new DocumentSegmentsService(repo as never)[method] as (input: unknown) => Promise<unknown>)(args));
    expectSafeDependencyFailure(observed, SUPABASE_FAILURE_CASES[0]); expect(repo[method]).toHaveBeenCalledTimes(1); expect(repo.createEvent).not.toHaveBeenCalled();
  });
  it.each(["create", "update", "softDelete"] as const)("accepted %s followed by audit failure does not retry or roll back", async method => {
    const repo = makeRepo({ getDocumentById: jest.fn().mockResolvedValue(document), getById: jest.fn().mockResolvedValue(segment), [method]: jest.fn().mockResolvedValue(segment), createEvent: jest.fn().mockRejectedValue(freshProviderFailure(SUPABASE_FAILURE_CASES[0])) });
    const args = method === "create" ? { ...base, input } : method === "update" ? updateParams : { ...base, segmentId: "s" };
    const observed = await captureRejection((new DocumentSegmentsService(repo as never)[method] as (input: unknown) => Promise<unknown>)(args));
    expectSafeDependencyFailure(observed, SUPABASE_FAILURE_CASES[0]); expect(repo[method]).toHaveBeenCalledTimes(1); expect(repo.createEvent).toHaveBeenCalledTimes(1);
    for (const other of ["create", "update", "softDelete"] as const) if (other !== method) expect(repo[other]).not.toHaveBeenCalled();
    expect(repo[method].mock.invocationCallOrder[0]).toBeLessThan(repo.createEvent.mock.invocationCallOrder[0]);
  });

  it.each([
    [{ ...input, base_document_revision: 1 }, "DOCUMENT_REVISION_CONFLICT", 409],
    [{ ...input, end_char: 100 }, "SEGMENT_RANGE_OUTSIDE_DOCUMENT", 400],
    [{ ...input, end_char: 0 }, "INVALID_SEGMENT_RANGE", 400],
    [{ ...input, selected_text: "wrong" }, "SELECTED_TEXT_DOES_NOT_MATCH_DOCUMENT", 400],
  ])("rejects invalid document selection without write or audit", async (selection, message, status) => {
    const repo = makeRepo({ getDocumentById: jest.fn().mockResolvedValue(document) });
    await expect(new DocumentSegmentsService(repo as never).create({ ...base, input: selection as typeof input })).rejects.toMatchObject({ message, status });
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.createEvent).not.toHaveBeenCalled();
  });

  it("accepts exact Unicode UTF-16 slice and emits actor/range audit", async () => {
    const segment = { ...input, id: "segment-1", document_id: base.documentId, revision: 0 };
    const repo = makeRepo({ getDocumentById: jest.fn().mockResolvedValue(document), create: jest.fn().mockResolvedValue(segment) });
    await expect(new DocumentSegmentsService(repo as never).create({ ...base, input })).resolves.toBe(segment);
    expect(repo.create).toHaveBeenCalledWith({ ...base, input });
    expect(repo.createEvent).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "actor", segmentId: "segment-1", eventType: "segment_created", payload: expect.objectContaining({ selected_text_length: 3, start_char: 0, end_char: 3 }) }));
  });

  it.each([true, false])("rejects stale or lost-write segment revisions without audit (stale=%s)", async (stale) => {
    const repo = makeRepo({ getDocumentById: jest.fn().mockResolvedValue(document), getById: jest.fn().mockResolvedValue({ ...input, revision: stale ? 2 : 1 }), update: jest.fn().mockResolvedValue(null) });
    await expect(new DocumentSegmentsService(repo as never).update({ ...base, segmentId: "s", input: { base_revision: 1, note: "changed" } })).rejects.toMatchObject({ message: "SEGMENT_REVISION_CONFLICT", status: 409 });
    expect(repo.update).toHaveBeenCalledTimes(stale ? 0 : 1);
    expect(repo.createEvent).not.toHaveBeenCalled();
  });

  it("updates a note without demanding a document revision and records changed fields", async () => {
    const current = { ...input, id: "s", document_id: base.documentId, revision: 1 };
    const updated = { ...current, note: "new", revision: 2 };
    const repo = makeRepo({ getDocumentById: jest.fn().mockResolvedValue(document), getById: jest.fn().mockResolvedValue(current), update: jest.fn().mockResolvedValue(updated) });
    await expect(new DocumentSegmentsService(repo as never).update({ ...base, segmentId: "s", input: { base_revision: 1, note: "new" } })).resolves.toBe(updated);
    expect(repo.createEvent).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ changed_fields: ["note"] }) }));
  });
  it.each(SUPABASE_FAILURE_CASES)(
    "RED: translates $name before creating a segment or audit event",
    async (failureCase) => {
      const repo = makeRepo({
        getDocumentById: jest
          .fn()
          .mockRejectedValue(freshProviderFailure(failureCase)),
      });
      const service = new DocumentSegmentsService(repo as never);

      const observed = await captureRejection(
        service.create({
          projectId: "project-1",
          documentId: "document-1",
          actorUserId: "user-1",
          input: {
            start_char: 0,
            end_char: 5,
            selected_text: "alpha",
            note: "",
            base_document_revision: 0,
          },
        })
      );

      expectSafeDependencyFailure(observed, failureCase);
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.createEvent).not.toHaveBeenCalled();
    }
  );

  it("returns a missing document without querying or mutating segments", async () => {
    const repo = makeRepo({
      getDocumentById: jest.fn().mockResolvedValue(null),
    });
    const service = new DocumentSegmentsService(repo as never);

    await expect(
      service.listByDocument({
        projectId: "project-1",
        documentId: "missing",
        query: { limit: 20, offset: 0, include_deleted: false },
      })
    ).resolves.toBeNull();
    expect(repo.listByDocument).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.createEvent).not.toHaveBeenCalled();
  });
});
