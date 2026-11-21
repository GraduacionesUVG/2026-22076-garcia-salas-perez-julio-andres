import { ParticipantsService } from "@/src/modules/participants/participants.service";
import type { ParticipantsRepo } from "@/src/modules/participants/participants.repo";

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: "participant-1",
    project_id: "project-1",
    alias: "P01",
    display_name: "Participante 01",
    notes: "",
    attributes: {
      sample_group: "Mujeres adultas",
      participant_type: "Entrevista",
    },
    status: "active",
    revision: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    created_by: "user-1",
    updated_by: "user-1",
    ...overrides,
  };
}

describe("ParticipantsService", () => {
  it("enriches listed participants with linked document counts for sample tracking", async () => {
    const repo = {
      listByProject: jest.fn().mockResolvedValue([
        makeParticipant(),
        makeParticipant({
          id: "participant-2",
          alias: "P02",
          display_name: null,
          attributes: { sample_group: "Jovenes" },
        }),
      ]),
      getDocumentStatsByParticipant: jest.fn().mockResolvedValue(
        new Map([
          [
            "participant-1",
            {
              linked_document_count: 3,
              last_document_at: "2026-02-02T00:00:00.000Z",
            },
          ],
        ])
      ),
    };
    const service = new ParticipantsService(repo as unknown as ParticipantsRepo);

    const participants = await service.listByProject("project-1", {
      include_deleted: false,
      limit: 50,
      offset: 0,
    });

    expect(repo.getDocumentStatsByParticipant).toHaveBeenCalledWith("project-1");
    expect(participants).toEqual([
      expect.objectContaining({
        id: "participant-1",
        linked_document_count: 3,
        last_document_at: "2026-02-02T00:00:00.000Z",
      }),
      expect.objectContaining({
        id: "participant-2",
        linked_document_count: 0,
        last_document_at: null,
      }),
    ]);
  });
});
