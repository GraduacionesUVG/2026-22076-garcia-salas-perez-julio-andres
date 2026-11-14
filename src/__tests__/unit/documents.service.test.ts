import { DocumentsService } from "@/src/modules/documents/documents.service";
import { DocumentCreateSchema } from "@/src/modules/documents/documents.schema";
import type { DocumentsRepo } from "@/src/modules/documents/documents.repo";
import {
  SUPABASE_FAILURE_CASES,
  captureRejection,
  expectSafeDependencyFailure,
  freshProviderFailure,
} from "@/__tests__/backend/supabase-failure-cases";

function createRepo(overrides: Record<string, unknown> = {}) {
  return {
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    hasActiveSegments: jest.fn().mockResolvedValue(false),
    softDelete: jest.fn(),
    restore: jest.fn(),
    listByProject: jest.fn(),
    listDeletedByProject: jest.fn(),
    getStatsRows: jest.fn(),
    createEvent: jest.fn(),
    ...overrides,
  };
}

describe("DocumentsService", () => {
  const current = { id: "doc", project_id: "p", title: "Title", content: "á😀", revision: 1, word_count: 1, character_count: 3, deleted_at: null, document_type: "interview", status: "draft", source_id: null, participant_id: null };
  const params = { projectId: "p", documentId: "doc", actorUserId: "actor" };
  it("allows unchanged content with active segments without running segment check", async () => {
    const updated = { ...current, title: "new", revision: 2 };
    const repo = createRepo({ getById: jest.fn().mockResolvedValue(current), hasActiveSegments: jest.fn().mockResolvedValue(true), update: jest.fn().mockResolvedValue(updated) });
    await expect(new DocumentsService(repo as never).update({ ...params, input: { base_revision: 1, content: current.content, title: "new" } })).resolves.toBe(updated);
    expect(repo.hasActiveSegments).not.toHaveBeenCalled();
    expect(repo.createEvent).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "actor", payload: expect.objectContaining({ changed_fields: ["title"], content_changed: false }) }));
  });
  it("rejects stale revision before querying segments or writing", async () => {
    const repo = createRepo({ getById: jest.fn().mockResolvedValue(current) });
    await expect(new DocumentsService(repo as never).update({ ...params, input: { base_revision: 0, content: "" } })).rejects.toMatchObject({ status: 409, message: "DOCUMENT_REVISION_CONFLICT" });
    expect(repo.hasActiveSegments).not.toHaveBeenCalled(); expect(repo.update).not.toHaveBeenCalled(); expect(repo.createEvent).not.toHaveBeenCalled();
  });
  it.each(["softDelete", "restore"] as const)("returns and audits %s, missing result emits no audit", async method => {
    const repo = createRepo({ [method]: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(null) });
    const service = new DocumentsService(repo as never);
    await expect(service[method](params)).resolves.toBe(current);
    expect(repo.createEvent).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "actor", eventType: method === "restore" ? "document_restored" : "document_soft_deleted", payload: expect.objectContaining(method === "restore" ? { restored: true } : { deleted: true }) }));
    await expect(service[method](params)).resolves.toBeNull(); expect(repo.createEvent).toHaveBeenCalledTimes(1);
  });
  it("excludes trash from active statistics and groups unassigned evidence", async () => {
    const repo = createRepo({ getStatsRows: jest.fn().mockResolvedValue([current, { ...current, id: "trash", deleted_at: "date", word_count: 100 }]) });
    await expect(new DocumentsService(repo as never).getStats("p")).resolves.toEqual({ total_documents: 1, deleted_documents: 1, total_words: 1, total_characters: 3, average_words_per_document: 1, average_characters_per_document: 3, by_type: [{ key: "interview", count: 1, word_count: 1, character_count: 3 }], by_status: [{ key: "draft", count: 1, word_count: 1, character_count: 3 }], by_source: [{ key: "unassigned", count: 1, word_count: 1, character_count: 3 }], by_participant: [{ key: "unassigned", count: 1, word_count: 1, character_count: 3 }] });
  });
  it("preserves accepted write when subsequent audit fails", async () => {
    const repo = createRepo({ create: jest.fn().mockResolvedValue(current), createEvent: jest.fn().mockRejectedValue(new Error("audit failed")) });
    await expect(new DocumentsService(repo as never).create({ projectId: "p", actorUserId: "actor", input: DocumentCreateSchema.parse({ title: "Title", content: "" }) })).rejects.toThrow("audit failed");
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
  it("duplicates a document with content, metadata and a copied title", async () => {
    const original = {
      id: "doc-1",
      project_id: "project-1",
      title: "Entrevista 1",
      content: "Texto cualitativo",
      document_type: "interview",
      source_id: "source-1",
      participant_id: "participant-1",
      interview_date: "2026-06-01",
      field_date: "2026-06-02",
      location: "Guatemala",
      language: "es",
      notes: "Notas",
      metadata: { contexto: "urbano" },
      status: "ready_for_coding",
      character_count: 17,
      word_count: 2,
      revision: 1,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      deleted_at: null,
      created_by: "user-1",
      updated_by: "user-1",
    };
    const duplicate = { ...original, id: "doc-2", title: "Entrevista 1 (copia)" };
    const repo = createRepo({
      getById: jest.fn().mockResolvedValue(original),
      create: jest.fn().mockResolvedValue(duplicate),
    });
    const service = new DocumentsService(repo as unknown as DocumentsRepo);

    const result = await service.duplicate({
      projectId: "project-1",
      documentId: "doc-1",
      actorUserId: "user-2",
    });

    expect(result).toBe(duplicate);
    expect(repo.create).toHaveBeenCalledWith({
      projectId: "project-1",
      actorUserId: "user-2",
      input: expect.objectContaining({
        title: "Entrevista 1 (copia)",
        content: "Texto cualitativo",
        document_type: "interview",
        participant_id: "participant-1",
        metadata: { contexto: "urbano", duplicated_from_document_id: "doc-1" },
      }),
    });
    expect(repo.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "document_duplicated",
        documentId: "doc-2",
      })
    );
  });

  it("returns null when duplicating a missing document", async () => {
    const repo = createRepo({
      getById: jest.fn().mockResolvedValue(null),
    });
    const service = new DocumentsService(repo as unknown as DocumentsRepo);

    await expect(
      service.duplicate({
        projectId: "project-1",
        documentId: "missing",
        actorUserId: "user-2",
      })
    ).resolves.toBeNull();
  });

  it("rejects content changes while the document has active segments", async () => {
    const current = {
      id: "doc-1",
      project_id: "project-1",
      title: "Entrevista",
      content: "alpha beta",
      document_type: "interview",
      source_id: null,
      participant_id: null,
      interview_date: null,
      field_date: null,
      location: "",
      language: "es",
      notes: "",
      metadata: {},
      status: "draft",
      character_count: 10,
      word_count: 2,
      revision: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      deleted_at: null,
      created_by: "user-1",
      updated_by: "user-1",
    };
    const repo = createRepo({
      getById: jest.fn().mockResolvedValue(current),
      hasActiveSegments: jest.fn().mockResolvedValue(true),
    });
    const service = new DocumentsService(repo as unknown as DocumentsRepo);

    await expect(
      service.update({
        projectId: "project-1",
        documentId: "doc-1",
        actorUserId: "user-1",
        input: { base_revision: 0, content: "xxxxx beta" },
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "DOCUMENT_HAS_ACTIVE_SEGMENTS",
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it.each(SUPABASE_FAILURE_CASES)(
    "RED: translates $name before checking or updating a document",
    async (failureCase) => {
      const repo = createRepo({
        getById: jest.fn().mockRejectedValue(freshProviderFailure(failureCase)),
      });
      const service = new DocumentsService(repo as unknown as DocumentsRepo);

      const observed = await captureRejection(
        service.update({
          projectId: "project-1",
          documentId: "doc-1",
          actorUserId: "user-1",
          input: { base_revision: 0, title: "Nuevo título" },
        })
      );

      expectSafeDependencyFailure(observed, failureCase);
      expect(repo.hasActiveSegments).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
      expect(repo.createEvent).not.toHaveBeenCalled();
    }
  );

  it("does not emit an event when the conditional document update loses its revision", async () => {
    const current = {
      id: "doc-1",
      project_id: "project-1",
      title: "Entrevista",
      content: "alpha beta",
      revision: 0,
    };
    const repo = createRepo({
      getById: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockResolvedValue(null),
    });
    const service = new DocumentsService(repo as unknown as DocumentsRepo);

    await expect(
      service.update({
        projectId: "project-1",
        documentId: "doc-1",
        actorUserId: "user-1",
        input: { base_revision: 0, title: "Nuevo título" },
      })
    ).rejects.toMatchObject({
      status: 409,
      message: "DOCUMENT_REVISION_CONFLICT",
    });
    expect(repo.createEvent).not.toHaveBeenCalled();
  });
});
