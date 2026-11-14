import { DocumentVersionsService } from "@/src/modules/documents/document-versions.service";
import { DocumentVersionCreateSchema } from "@/src/modules/documents/document-versions.schema";

const document = {
  id: "doc-1",
  project_id: "project-1",
  title: "Current",
  content: "current text",
  revision: 1,
};

const version = {
  id: "version-1",
  document_id: "doc-1",
  project_id: "project-1",
  version_number: 1,
  snapshot_title: "Previous",
  snapshot_content: "previous text",
  label: "Checkpoint",
  trigger_type: "manual",
  snapshot_revision: 0,
  snapshot_word_count: 2,
  snapshot_character_count: 13,
};

function makeRepo() {
  return {
    getDocumentById: jest.fn().mockResolvedValue(document),
    getById: jest.fn().mockResolvedValue(version),
    restoreDocumentFromVersion: jest.fn().mockResolvedValue(null),
    createFromDocument: jest.fn(),
    createEvent: jest.fn(),
  };
}

describe("DocumentVersionsService", () => {
  const params = { projectId: "project-1", documentId: "doc-1", versionId: "version-1", input: { base_revision: 1 }, actorUserId: "actor" };
  it("reads a version scoped to its existing document", async () => {
    const repo = makeRepo();
    await expect(new DocumentVersionsService(repo as never).getById(params)).resolves.toBe(version);
    expect(repo.getById).toHaveBeenCalledWith(params);
  });
  it("creates a snapshot from current document and emits its audit", async () => {
    const repo = makeRepo(); repo.createFromDocument.mockResolvedValue(version);
    await expect(new DocumentVersionsService(repo as never).create({ ...params, input: DocumentVersionCreateSchema.parse({ label: "Checkpoint" }) })).resolves.toBe(version);
    expect(repo.createFromDocument).toHaveBeenCalledWith({ document, input: { label: "Checkpoint", trigger_type: "manual" }, actorUserId: "actor" });
    expect(repo.createEvent).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-1", documentId: "doc-1", actorUserId: "actor", eventType: "document_version_created", payload: expect.objectContaining({ version_id: "version-1", version_number: 1 }) }));
  });
  it.each(["listByDocument", "getById", "create", "restore"] as const)("returns missing parent without child effects for %s", async (method) => {
    const repo = makeRepo();
    repo.getDocumentById.mockResolvedValue(null as never);
    await expect((new DocumentVersionsService(repo as never)[method] as (input: unknown) => Promise<unknown>)({ ...params, query: { limit: 20, offset: 0 } })).resolves.toBeNull();
    expect(repo.getById).not.toHaveBeenCalled();
    expect(repo.createFromDocument).not.toHaveBeenCalled();
    expect(repo.restoreDocumentFromVersion).not.toHaveBeenCalled();
  });
  it("rejects stale restore before fetching version", async () => {
    const repo = makeRepo();
    await expect(new DocumentVersionsService(repo as never).restore({ ...params, input: { base_revision: 0 } })).rejects.toMatchObject({ status: 409, message: "DOCUMENT_REVISION_CONFLICT" });
    expect(repo.getById).not.toHaveBeenCalled();
  });
  it("rejects absent version without restoring or backing up", async () => {
    const repo = makeRepo(); repo.getById.mockResolvedValue(null as never);
    await expect(new DocumentVersionsService(repo as never).restore(params)).rejects.toMatchObject({ status: 404, message: "DOCUMENT_VERSION_NOT_FOUND" });
    expect(repo.restoreDocumentFromVersion).not.toHaveBeenCalled();
    expect(repo.createFromDocument).not.toHaveBeenCalled();
  });
  it("restores then backs up the original snapshot and audits both effects", async () => {
    const repo = makeRepo(); const restored = { ...document, revision: 2 }; const backup = { ...version, id: "backup", version_number: 2 };
    repo.restoreDocumentFromVersion.mockResolvedValue(restored as never);
    repo.createFromDocument.mockResolvedValue(backup);
    await expect(new DocumentVersionsService(repo as never).restore(params)).resolves.toBe(restored);
    expect(repo.getDocumentById).toHaveBeenCalledWith({ projectId: "project-1", documentId: "doc-1" });
    expect(repo.getById).toHaveBeenCalledWith({ projectId: "project-1", documentId: "doc-1", versionId: "version-1" });
    expect(repo.restoreDocumentFromVersion).toHaveBeenCalledWith({ projectId: "project-1", documentId: "doc-1", version, baseRevision: 1, actorUserId: "actor" });
    expect(repo.createFromDocument).toHaveBeenCalledWith({ document, input: { label: "Backup antes de restaurar versión 1", trigger_type: "before_restore" }, actorUserId: "actor" });
    expect(repo.createEvent).toHaveBeenNthCalledWith(1, { projectId: "project-1", documentId: "doc-1", eventType: "document_version_created", actorUserId: "actor", payload: { version_id: "backup", version_number: 2, document_id: "doc-1", label: "Checkpoint", trigger_type: "manual", snapshot_revision: 0, snapshot_word_count: 2, snapshot_character_count: 13, reason: "backup_before_restore" } });
    expect(repo.createEvent).toHaveBeenNthCalledWith(2, { projectId: "project-1", documentId: "doc-1", eventType: "document_version_restored", actorUserId: "actor", payload: { document_id: "doc-1", restored_revision: 2, restored_from_version_id: "version-1", restored_from_version_number: 1, backup_version_id: "backup", backup_version_number: 2 } });
    const order = [repo.getDocumentById, repo.getById, repo.restoreDocumentFromVersion, repo.createFromDocument].map(fn => fn.mock.invocationCallOrder[0]).concat(repo.createEvent.mock.invocationCallOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b)); expect(new Set(order).size).toBe(6);
  });
  it("does not create a restore backup when the compare-and-swap restore loses", async () => {
    const repo = makeRepo();
    const service = new DocumentVersionsService(repo as never);

    await expect(
      service.restore({
        projectId: "project-1",
        documentId: "doc-1",
        versionId: "version-1",
        input: { base_revision: 1 },
        actorUserId: "user-1",
      })
    ).rejects.toMatchObject({ status: 409, message: "DOCUMENT_REVISION_CONFLICT" });
    expect(repo.createFromDocument).not.toHaveBeenCalled();
    expect(repo.createEvent).not.toHaveBeenCalled();
  });
});
