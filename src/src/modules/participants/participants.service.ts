import type {
  ParticipantCreateInput,
  ParticipantListQuery,
  ParticipantUpdateInput,
} from "./participants.schema";
import {
  ParticipantsRepo,
  type ProjectParticipantRow,
  type ProjectParticipantWithStatsRow,
} from "./participants.repo";

export class ParticipantRevisionConflict extends Error {
  readonly status = 409;
  constructor(readonly latestParticipant: ProjectParticipantRow) {
    super("PARTICIPANT_REVISION_CONFLICT");
  }
}

function normalizeParticipantEventPayload(
  participant: ProjectParticipantRow
): Record<string, unknown> {
  return {
    participant_id: participant.id,
    alias: participant.alias,
    status: participant.status,
  };
}

export class ParticipantsService {
  constructor(private readonly repo: ParticipantsRepo) {}

  private withDocumentStats(
    participant: ProjectParticipantRow,
    statsByParticipantId: Map<
      string,
      { linked_document_count: number; last_document_at: string | null }
    >
  ): ProjectParticipantWithStatsRow {
    const stats = statsByParticipantId.get(participant.id);

    return {
      ...participant,
      linked_document_count: stats?.linked_document_count ?? 0,
      last_document_at: stats?.last_document_at ?? null,
    };
  }

  async listByProject(
    projectId: string,
    query: ParticipantListQuery
  ): Promise<ProjectParticipantWithStatsRow[]> {
    const [participants, statsByParticipantId] = await Promise.all([
      this.repo.listByProject(projectId, query),
      this.repo.getDocumentStatsByParticipant(projectId),
    ]);

    return participants.map((participant) =>
      this.withDocumentStats(participant, statsByParticipantId)
    );
  }

  async getById(params: {
    projectId: string;
    participantId: string;
  }): Promise<ProjectParticipantWithStatsRow | null> {
    const [participant, statsByParticipantId] = await Promise.all([
      this.repo.getById({
        projectId: params.projectId,
        participantId: params.participantId,
      }),
      this.repo.getDocumentStatsByParticipant(params.projectId),
    ]);

    if (!participant) return null;

    return this.withDocumentStats(participant, statsByParticipantId);
  }

  async create(params: {
    projectId: string;
    input: ParticipantCreateInput;
    actorUserId: string;
  }): Promise<ProjectParticipantRow> {
    const participant = await this.repo.create(params);

    await this.repo.createEvent({
      projectId: params.projectId,
      eventType: "participant_created",
      actorUserId: params.actorUserId,
      payload: normalizeParticipantEventPayload(participant),
    });

    return participant;
  }

  async update(params: {
    projectId: string;
    participantId: string;
    input: ParticipantUpdateInput;
    actorUserId: string;
  }): Promise<ProjectParticipantRow | null> {
    const participant = await this.repo.update(params);

    if (!participant) {
      if (params.input.base_revision !== undefined) {
        // Scope the read exactly like the failed write: never disclose foreign
        // project or deleted rows, and never emit an event for a stale request.
        const latest = await this.repo.getById({
          projectId: params.projectId,
          participantId: params.participantId,
        });
        if (latest) throw new ParticipantRevisionConflict(latest);
      }
      return null;
    }

    await this.repo.createEvent({
      projectId: params.projectId,
      eventType: "participant_updated",
      actorUserId: params.actorUserId,
      payload: normalizeParticipantEventPayload(participant),
    });

    return participant;
  }

  async softDelete(params: {
    projectId: string;
    participantId: string;
    actorUserId: string;
  }): Promise<ProjectParticipantRow | null> {
    const participant = await this.repo.softDelete(params);

    if (!participant) return null;

    await this.repo.createEvent({
      projectId: params.projectId,
      eventType: "participant_updated",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeParticipantEventPayload(participant),
        deleted: true,
      },
    });

    return participant;
  }
}
