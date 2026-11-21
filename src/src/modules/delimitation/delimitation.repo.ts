import { workflowRpc, withWorkflowResult, type WorkflowRestoreData } from "@/src/modules/security/workflow-transactions";
import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type {
  DelimitationItemCreate,
  DelimitationItemUpdate,
  DelimitationPatch,
} from "./delimitation.schema";

export type DelimitationVersionTriggerType =
  | "manual"
  | "auto_checkpoint"
  | "restore_backup";

export type DelimitationRow = {
  project_id: string;
  topic: string | null;
  context_place: string | null;
  population: string | null;
  time_period: string | null;
  resources: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type DelimitationItemRow = {
  id: string;
  kind: "include" | "exclude";
  text: string;
  created_at: string;
};

export type DelimitationVersionRow = {
  id: string;
  project_id: string;
  version_number: number;
  label: string | null;
  snapshot_topic: string | null;
  snapshot_context_place: string | null;
  snapshot_population: string | null;
  snapshot_time_period: string | null;
  snapshot_resources: string | null;
  trigger_type: DelimitationVersionTriggerType;
  content_hash: string | null;
  created_by: string | null;
  created_at: string;
};

export type CreateDelimitationVersionResult = {
  version: DelimitationVersionRow;
  created: boolean;
};

export type DelimitationVersionItemRow = {
  id: string;
  version_id: string;
  kind: "include" | "exclude";
  text: string;
  position: number;
  created_at: string;
};

export class DelimitationRevisionConflictError extends Error {
  status: number;
  code: string;
  latest: DelimitationRow | null;

  constructor(latest: DelimitationRow | null) {
    super("DELIMITATION_REVISION_CONFLICT");
    this.name = "DelimitationRevisionConflictError";
    this.status = 409;
    this.code = "DELIMITATION_REVISION_CONFLICT";
    this.latest = latest;
  }
}

const DELIMITATION_SELECT = `
  project_id,
  topic,
  context_place,
  population,
  time_period,
  resources,
  revision,
  created_at,
  updated_at,
  created_by,
  updated_by
`;

const VERSION_SELECT = `
  id,
  project_id,
  version_number,
  label,
  snapshot_topic,
  snapshot_context_place,
  snapshot_population,
  snapshot_time_period,
  snapshot_resources,
  trigger_type,
  content_hash,
  created_by,
  created_at
`;

export class DelimitationRepo {
  constructor(private readonly db: ServerSupabase) {}

  async restoreVersionTransaction(projectId: string, versionId: string, actorUserId: string | null, expectedRevision: number, createBackup: boolean) {
    return workflowRpc<WorkflowRestoreData<DelimitationRow, DelimitationItemRow, DelimitationVersionRow, DelimitationVersionItemRow>>(
      this.db, "delimitation", "restore_workflow_version", {
        p_project_id: projectId, p_version_id: versionId, p_actor_id: actorUserId,
        p_expected_revision: expectedRevision, p_create_backup: createBackup,
      }
    );
  }

  async getDelimitation(projectId: string): Promise<DelimitationRow | null> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation")
      .select(DELIMITATION_SELECT)
      .eq("project_id", projectId)
      .maybeSingle());

    if (error) throw error;

    return (data as DelimitationRow | null) ?? null;
  }

  async getItems(projectId: string): Promise<DelimitationItemRow[]> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation_items")
      .select("id, kind, text, created_at")
      .eq("project_id", projectId)
      .order("position", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }));

    if (error) throw error;

    return (data as DelimitationItemRow[] | null) ?? [];
  }

  async createDelimitation(
    projectId: string,
    patch: DelimitationPatch,
    actorUserId?: string | null
  ): Promise<DelimitationRow> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation")
      .insert({
        project_id: projectId,
        topic: patch.topic ?? "",
        context_place: patch.context_place ?? "",
        population: patch.population ?? "",
        time_period: patch.time_period ?? "",
        resources: patch.resources ?? "",
        revision: 1,
        created_by: actorUserId ?? null,
        updated_by: actorUserId ?? null,
      })
      .select(DELIMITATION_SELECT)
      .single());

    if (error) throw error;

    return data as DelimitationRow;
  }

  async updateDelimitationWithExpectedRevision(
    projectId: string,
    patch: DelimitationPatch,
    expectedRevision: number,
    actorUserId?: string | null
  ): Promise<DelimitationRow> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation")
      .update({
        ...patch,
        revision: expectedRevision + 1,
        updated_by: actorUserId ?? null,
      })
      .eq("project_id", projectId)
      .eq("revision", expectedRevision)
      .select(DELIMITATION_SELECT)
      .maybeSingle());

    if (error) throw error;

    if (!data) {
      const latest = await this.getDelimitation(projectId);
      throw new DelimitationRevisionConflictError(latest);
    }

    return data as DelimitationRow;
  }

  async saveDelimitationWithRevision(
    projectId: string,
    patch: DelimitationPatch,
    expectedRevision: number,
    actorUserId?: string | null
  ): Promise<DelimitationRow> {
    const current = await this.getDelimitation(projectId);

    if (!current) {
      if (expectedRevision !== 0) {
        throw new DelimitationRevisionConflictError(null);
      }

      try {
        return await this.createDelimitation(projectId, patch, actorUserId);
      } catch (error: unknown) {
        const dbError = error as { code?: string };
        if (dbError?.code === "23505") {
          const latest = await this.getDelimitation(projectId);
          throw new DelimitationRevisionConflictError(latest);
        }

        throw error;
      }
    }

    if (current.revision !== expectedRevision) {
      throw new DelimitationRevisionConflictError(current);
    }

    return this.updateDelimitationWithExpectedRevision(
      projectId,
      patch,
      expectedRevision,
      actorUserId
    );
  }

  async replaceCurrentDelimitation(
    projectId: string,
    snapshot: {
      topic: string;
      context_place: string;
      population: string;
      time_period: string;
      resources: string;
    },
    actorUserId?: string | null
  ): Promise<DelimitationRow> {
    const current = await this.getDelimitation(projectId);

    if (!current) {
      return this.createDelimitation(
        projectId,
        {
          topic: snapshot.topic,
          context_place: snapshot.context_place,
          population: snapshot.population,
          time_period: snapshot.time_period,
          resources: snapshot.resources,
        },
        actorUserId ?? null
      );
    }

    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation")
      .update({
        topic: snapshot.topic,
        context_place: snapshot.context_place,
        population: snapshot.population,
        time_period: snapshot.time_period,
        resources: snapshot.resources,
        revision: current.revision + 1,
        updated_by: actorUserId ?? null,
      })
      .eq("project_id", projectId)
      .select(DELIMITATION_SELECT)
      .single());

    if (error) throw error;

    return data as DelimitationRow;
  }

  async createItem(
    projectId: string,
    payload: DelimitationItemCreate
  ): Promise<DelimitationItemRow> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation_items")
      .insert({
        project_id: projectId,
        ...payload,
      })
      .select("id, kind, text, created_at")
      .single());

    if (error) throw error;

    return data as DelimitationItemRow;
  }

  async updateItem(
    projectId: string,
    itemId: string,
    payload: DelimitationItemUpdate
  ): Promise<DelimitationItemRow | null> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation_items")
      .update({
        text: payload.text,
      })
      .eq("project_id", projectId)
      .eq("id", itemId)
      .select("id, kind, text, created_at")
      .maybeSingle());

    if (error) throw error;

    return (data as DelimitationItemRow | null) ?? null;
  }

  async deleteItemReturning(
    projectId: string,
    itemId: string
  ): Promise<{ id: string }[]> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation_items")
      .delete()
      .eq("project_id", projectId)
      .eq("id", itemId)
      .select("id"));

    if (error) throw error;

    return (data as { id: string }[] | null) ?? [];
  }

  async getNextVersionNumber(projectId: string): Promise<number> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation_versions")
      .select("version_number")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1));

    if (error) throw error;

    const latest = data?.[0]?.version_number ?? 0;
    return Number(latest) + 1;
  }

  async getLatestVersion(projectId: string): Promise<DelimitationVersionRow | null> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation_versions")
      .select(VERSION_SELECT)
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle());

    if (error) throw error;

    return (data as DelimitationVersionRow | null) ?? null;
  }

  async createVersion(params: {
    projectId: string;
    versionNumber: number;
    label: string | null;
    createdBy: string | null;
    triggerType: DelimitationVersionTriggerType;
    contentHash: string;
    items: Array<{ kind: "include" | "exclude"; text: string; position: number }>;
    snapshot: {
      topic: string;
      context_place: string;
      population: string;
      time_period: string;
      resources: string;
    };
  }): Promise<CreateDelimitationVersionResult> {
    return workflowRpc<CreateDelimitationVersionResult>(this.db, "delimitation", "save_workflow_snapshot", {
      p_project_id: params.projectId, p_actor_id: params.createdBy, p_snapshot: params.snapshot,
      p_children: params.items, p_label: params.label, p_trigger_type: params.triggerType,
      p_content_hash: params.contentHash,
    });
  }

  async getVersionByContentHash(
    projectId: string,
    contentHash: string
  ): Promise<DelimitationVersionRow | null> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation_versions")
      .select(VERSION_SELECT)
      .eq("project_id", projectId)
      .eq("content_hash", contentHash)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle());

    if (error) throw error;

    return (data as DelimitationVersionRow | null) ?? null;
  }

  async createVersionItems(
    versionId: string,
    items: Array<{ kind: "include" | "exclude"; text: string; position: number }>
  ): Promise<void> {
    if (items.length === 0) return;

    const { error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation_version_items")
      .insert(
        items.map((item) => ({
          version_id: versionId,
          kind: item.kind,
          text: item.text,
          position: item.position,
        }))
      ));

    if (error) throw error;
  }

  async listVersions(projectId: string): Promise<DelimitationVersionRow[]> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation_versions")
      .select(VERSION_SELECT)
      .eq("project_id", projectId)
      .order("version_number", { ascending: false }));

    if (error) throw error;

    return (data as DelimitationVersionRow[] | null) ?? [];
  }

  async getVersionById(
    projectId: string,
    versionId: string
  ): Promise<DelimitationVersionRow | null> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation_versions")
      .select(VERSION_SELECT)
      .eq("project_id", projectId)
      .eq("id", versionId)
      .maybeSingle());

    if (error) throw error;

    return (data as DelimitationVersionRow | null) ?? null;
  }

  async getVersionItems(versionId: string): Promise<DelimitationVersionItemRow[]> {
    const { data, error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation_version_items")
      .select("id, version_id, kind, text, position, created_at")
      .eq("version_id", versionId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }));

    if (error) throw error;

    return (data as DelimitationVersionItemRow[] | null) ?? [];
  }

  async deleteCurrentItems(projectId: string): Promise<void> {
    const { error } = await withWorkflowResult("delimitation", () => this.db
      .from("project_delimitation_items")
      .delete()
      .eq("project_id", projectId));

    if (error) throw error;
  }

  async recreateCurrentItems(
    projectId: string,
    items: Array<{ kind: "include" | "exclude"; text: string }>
  ): Promise<void> {
    for (const item of items) {
      await this.createItem(projectId, {
        kind: item.kind,
        text: item.text,
      });
    }
  }
}
