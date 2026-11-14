import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import { withDependencyResult } from "@/src/modules/security/dependency-errors";
import type {
  ParticipantCreateInput,
  ParticipantListQuery,
  ParticipantUpdateInput,
} from "./participants.schema";

export type ParticipantStatus =
  | "active"
  | "inactive"
  | "withdrawn"
  | "archived";

export type ProjectParticipantRow = {
  id: string;
  project_id: string;
  alias: string;
  display_name: string | null;
  notes: string;
  attributes: Record<string, unknown>;
  status: ParticipantStatus;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

export type ParticipantDocumentStats = {
  linked_document_count: number;
  last_document_at: string | null;
};

export type ProjectParticipantWithStatsRow = ProjectParticipantRow &
  ParticipantDocumentStats;

const PARTICIPANT_SELECT = `
  id,
  project_id,
  alias,
  display_name,
  notes,
  attributes,
  status,
  revision,
  created_at,
  updated_at,
  deleted_at,
  created_by,
  updated_by
`;

function getParticipantPatch(input: ParticipantUpdateInput) {
  const patch: Record<string, unknown> = {};

  if (input.alias !== undefined) patch.alias = input.alias;
  if (input.display_name !== undefined) patch.display_name = input.display_name;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.attributes !== undefined) patch.attributes = input.attributes;
  if (input.status !== undefined) patch.status = input.status;

  return patch;
}

export class ParticipantsRepo {
  constructor(private readonly db: ServerSupabase) {}

  async listByProject(
    projectId: string,
    query: ParticipantListQuery
  ): Promise<ProjectParticipantRow[]> {
    let request = this.db
      .from("project_participants")
      .select(PARTICIPANT_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (!query.include_deleted) {
      request = request.is("deleted_at", null);
    }

    if (query.status) {
      request = request.eq("status", query.status);
    }

    if (query.search) {
      request = request.ilike("alias", `%${query.search}%`);
    }

    const { data, error } = await withDependencyResult(() => request);

    if (error) throw error;

    return (data as ProjectParticipantRow[] | null) ?? [];
  }

  async getDocumentStatsByParticipant(
    projectId: string
  ): Promise<Map<string, ParticipantDocumentStats>> {
    const { data, error } = await withDependencyResult(() => this.db
      .from("project_documents")
      .select("participant_id, updated_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .not("participant_id", "is", null));

    if (error) throw error;

    const stats = new Map<string, ParticipantDocumentStats>();

    for (const row of (data as Array<{
      participant_id: string | null;
      updated_at: string | null;
    }> | null) ?? []) {
      if (!row.participant_id) continue;

      const current =
        stats.get(row.participant_id) ??
        {
          linked_document_count: 0,
          last_document_at: null,
        };

      current.linked_document_count += 1;

      if (
        row.updated_at &&
        (!current.last_document_at || row.updated_at > current.last_document_at)
      ) {
        current.last_document_at = row.updated_at;
      }

      stats.set(row.participant_id, current);
    }

    return stats;
  }

  async getById(params: {
    projectId: string;
    participantId: string;
    includeDeleted?: boolean;
  }): Promise<ProjectParticipantRow | null> {
    const { projectId, participantId, includeDeleted = false } = params;

    let request = this.db
      .from("project_participants")
      .select(PARTICIPANT_SELECT)
      .eq("project_id", projectId)
      .eq("id", participantId);

    if (!includeDeleted) {
      request = request.is("deleted_at", null);
    }

    const { data, error } = await withDependencyResult(() => request.maybeSingle());

    if (error) throw error;

    return (data as ProjectParticipantRow | null) ?? null;
  }

  async create(params: {
    projectId: string;
    input: ParticipantCreateInput;
    actorUserId: string;
  }): Promise<ProjectParticipantRow> {
    const { projectId, input, actorUserId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_participants")
      .insert({
        project_id: projectId,
        alias: input.alias,
        display_name: input.display_name ?? null,
        notes: input.notes ?? "",
        attributes: input.attributes ?? {},
        status: input.status ?? "active",
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .select(PARTICIPANT_SELECT)
      .single());

    if (error) throw error;

    return data as ProjectParticipantRow;
  }

  async update(params: {
    projectId: string;
    participantId: string;
    input: ParticipantUpdateInput;
    actorUserId: string;
  }): Promise<ProjectParticipantRow | null> {
    const { projectId, participantId, input, actorUserId } = params;

    const patch = getParticipantPatch(input);

    let request = this.db
      .from("project_participants")
      .update({
        ...patch,
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", participantId)
      .is("deleted_at", null);

    // The database rechecks this predicate after acquiring the row lock. Never
    // turn this into a preflight read followed by an unconditional UPDATE.
    if (input.base_revision !== undefined) {
      request = request.eq("revision", input.base_revision);
    }

    const { data, error } = await withDependencyResult(() =>
      request.select(PARTICIPANT_SELECT).maybeSingle()
    );

    if (error) throw error;

    return (data as ProjectParticipantRow | null) ?? null;
  }

  async softDelete(params: {
    projectId: string;
    participantId: string;
    actorUserId: string;
  }): Promise<ProjectParticipantRow | null> {
    const { projectId, participantId, actorUserId } = params;

    const { data, error } = await withDependencyResult(() => this.db
      .from("project_participants")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: actorUserId,
      })
      .eq("project_id", projectId)
      .eq("id", participantId)
      .is("deleted_at", null)
      .select(PARTICIPANT_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as ProjectParticipantRow | null) ?? null;
  }

  async createEvent(params: {
    projectId: string;
    eventType: "participant_created" | "participant_updated";
    actorUserId: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const { projectId, eventType, actorUserId, payload = {} } = params;

    const { error } = await withDependencyResult(() => this.db.from("project_document_events").insert({
      project_id: projectId,
      event_type: eventType,
      event_payload: payload,
      created_by: actorUserId,
    }));

    if (error) throw error;
  }
}
