import { workflowRpc, withWorkflowResult, type WorkflowRestoreData } from "@/src/modules/security/workflow-transactions";
import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type {
  SampleCollectionTechniqueInput,
  SampleConfigPatch,
  SampleConfigVersionTriggerType,
} from "./sample-config.schema";

export type SampleConfigRow = {
  project_id: string;
  main_approach_code: string | null;
  scope_code: string | null;
  field_phase: string | null;
  target_sample_size: number | null;
  sample_size_rationale: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type SampleCollectionTechniqueRow = {
  id: string;
  project_id: string;
  technique_code: string | null;
  custom_label: string | null;
  is_custom: boolean;
  position: number;
  revision: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type SampleOptionRow = {
  code: string;
  label: string;
  description: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
};

export type SampleParticipantSummaryRow = {
  alias: string;
  display_name: string | null;
  attributes: Record<string, unknown>;
  status: string;
};

export type SampleConfigVersionRow = {
  id: string;
  project_id: string;
  version_number: number;
  label: string | null;
  snapshot_main_approach_code: string | null;
  snapshot_scope_code: string | null;
  snapshot_field_phase: string;
  snapshot_target_sample_size: number | null;
  snapshot_sample_size_rationale: string;
  created_by: string | null;
  created_at: string;
  trigger_type: SampleConfigVersionTriggerType;
  content_hash: string | null;
};

export type CreateSampleConfigVersionResult = {
  version: SampleConfigVersionRow;
  created: boolean;
};

export type SampleConfigVersionTechniqueRow = {
  id: string;
  version_id: string;
  technique_code: string | null;
  custom_label: string | null;
  is_custom: boolean;
  position: number;
  created_at: string;
};

export class SampleConfigRevisionConflictError extends Error {
  status: number;
  code: string;
  latest: SampleConfigRow | null;

  constructor(latest: SampleConfigRow | null) {
    super("SAMPLE_CONFIG_REVISION_CONFLICT");
    this.name = "SampleConfigRevisionConflictError";
    this.status = 409;
    this.code = "SAMPLE_CONFIG_REVISION_CONFLICT";
    this.latest = latest;
  }
}

const SAMPLE_CONFIG_SELECT = `
  project_id,
  main_approach_code,
  scope_code,
  field_phase,
  target_sample_size,
  sample_size_rationale,
  revision,
  created_at,
  updated_at,
  created_by,
  updated_by
`;

const SAMPLE_TECHNIQUE_SELECT = `
  id,
  project_id,
  technique_code,
  custom_label,
  is_custom,
  position,
  revision,
  created_at,
  updated_at,
  created_by,
  updated_by
`;

const SAMPLE_OPTION_SELECT = `
  code,
  label,
  description,
  is_active,
  position,
  created_at
`;

const SAMPLE_VERSION_SELECT = `
  id,
  project_id,
  version_number,
  label,
  snapshot_main_approach_code,
  snapshot_scope_code,
  snapshot_field_phase,
  snapshot_target_sample_size,
  snapshot_sample_size_rationale,
  created_by,
  created_at,
  trigger_type,
  content_hash
`;

const SAMPLE_VERSION_TECHNIQUE_SELECT = `
  id,
  version_id,
  technique_code,
  custom_label,
  is_custom,
  position,
  created_at
`;

function buildConfigInsertPayload(
  projectId: string,
  patch: SampleConfigPatch,
  actorUserId?: string | null
) {
  return {
    project_id: projectId,
    main_approach_code: patch.main_approach_code ?? null,
    scope_code: patch.scope_code ?? null,
    field_phase: patch.field_phase ?? "",
    target_sample_size: patch.target_sample_size ?? null,
    sample_size_rationale: patch.sample_size_rationale ?? "",
    revision: 1,
    created_by: actorUserId ?? null,
    updated_by: actorUserId ?? null,
  };
}

function buildConfigUpdatePayload(
  patch: SampleConfigPatch,
  revision: number,
  actorUserId?: string | null
) {
  const next: Record<string, unknown> = {
    revision,
    updated_by: actorUserId ?? null,
  };

  if (Object.prototype.hasOwnProperty.call(patch, "main_approach_code")) {
    next.main_approach_code = patch.main_approach_code ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "scope_code")) {
    next.scope_code = patch.scope_code ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "field_phase")) {
    next.field_phase = patch.field_phase ?? "";
  }

  if (Object.prototype.hasOwnProperty.call(patch, "target_sample_size")) {
    next.target_sample_size = patch.target_sample_size ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "sample_size_rationale")) {
    next.sample_size_rationale = patch.sample_size_rationale ?? "";
  }

  return next;
}

export class SampleConfigRepo {
  constructor(private readonly db: ServerSupabase) {}

  async restoreVersionTransaction(projectId: string, versionId: string, actorUserId: string | null, expectedRevision: number, createBackup: boolean) {
    return workflowRpc<WorkflowRestoreData<SampleConfigRow, SampleCollectionTechniqueRow, SampleConfigVersionRow, SampleConfigVersionTechniqueRow>>(
      this.db, "sample-config", "restore_workflow_version", {
        p_project_id: projectId, p_version_id: versionId, p_actor_id: actorUserId,
        p_expected_revision: expectedRevision, p_create_backup: createBackup,
      }
    );
  }

  async getSampleConfig(projectId: string): Promise<SampleConfigRow | null> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_config")
      .select(SAMPLE_CONFIG_SELECT)
      .eq("project_id", projectId)
      .maybeSingle());

    if (error) throw error;

    return (data as SampleConfigRow | null) ?? null;
  }

  async getCollectionTechniques(
    projectId: string
  ): Promise<SampleCollectionTechniqueRow[]> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_collection_techniques")
      .select(SAMPLE_TECHNIQUE_SELECT)
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("workflow_order", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }));

    if (error) throw error;

    return (data as SampleCollectionTechniqueRow[] | null) ?? [];
  }

  async getSampleParticipants(
    projectId: string
  ): Promise<SampleParticipantSummaryRow[]> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_participants")
      .select("alias, display_name, attributes, status")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }));

    if (error) throw error;

    return (data as SampleParticipantSummaryRow[] | null) ?? [];
  }

  async createSampleConfig(
    projectId: string,
    patch: SampleConfigPatch,
    actorUserId?: string | null
  ): Promise<SampleConfigRow> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_config")
      .insert(buildConfigInsertPayload(projectId, patch, actorUserId))
      .select(SAMPLE_CONFIG_SELECT)
      .single());

    if (error) throw error;

    return data as SampleConfigRow;
  }

  async updateSampleConfigWithExpectedRevision(
    projectId: string,
    patch: SampleConfigPatch,
    expectedRevision: number,
    actorUserId?: string | null
  ): Promise<SampleConfigRow> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_config")
      .update(
        buildConfigUpdatePayload(patch, expectedRevision + 1, actorUserId)
      )
      .eq("project_id", projectId)
      .eq("revision", expectedRevision)
      .select(SAMPLE_CONFIG_SELECT)
      .maybeSingle());

    if (error) throw error;

    if (!data) {
      const latest = await this.getSampleConfig(projectId);
      throw new SampleConfigRevisionConflictError(latest);
    }

    return data as SampleConfigRow;
  }

  async saveSampleConfigWithRevision(
    projectId: string,
    patch: SampleConfigPatch,
    expectedRevision: number,
    actorUserId?: string | null
  ): Promise<SampleConfigRow> {
    const current = await this.getSampleConfig(projectId);

    if (!current) {
      if (expectedRevision !== 0) {
        throw new SampleConfigRevisionConflictError(null);
      }

      try {
        return await this.createSampleConfig(projectId, patch, actorUserId);
      } catch (error: unknown) {
        const maybeError = error as { code?: string };
        if (maybeError.code === "23505") {
          const latest = await this.getSampleConfig(projectId);
          throw new SampleConfigRevisionConflictError(latest);
        }
        throw error;
      }
    }

    if (current.revision !== expectedRevision) {
      throw new SampleConfigRevisionConflictError(current);
    }

    return this.updateSampleConfigWithExpectedRevision(
      projectId,
      patch,
      expectedRevision,
      actorUserId
    );
  }

  async upsertSampleConfigForce(
    projectId: string,
    patch: SampleConfigPatch,
    actorUserId?: string | null
  ): Promise<SampleConfigRow> {
    const current = await this.getSampleConfig(projectId);

    if (!current) {
      return this.createSampleConfig(projectId, patch, actorUserId);
    }

    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_config")
      .update(buildConfigUpdatePayload(patch, current.revision + 1, actorUserId))
      .eq("project_id", projectId)
      .select(SAMPLE_CONFIG_SELECT)
      .single());

    if (error) throw error;

    return data as SampleConfigRow;
  }

  async replaceCollectionTechniques(
    projectId: string,
    techniques: SampleCollectionTechniqueInput[],
    actorUserId?: string | null
  ): Promise<SampleCollectionTechniqueRow[]> {
    const { error: deleteError } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_collection_techniques")
      .delete()
      .eq("project_id", projectId));

    if (deleteError) throw deleteError;

    if (techniques.length === 0) {
      return [];
    }

    const rows = techniques.map((item, index) => ({
      project_id: projectId,
      technique_code: item.is_custom ? null : item.technique_code ?? null,
      custom_label: item.is_custom ? item.custom_label ?? null : null,
      is_custom: item.is_custom,
      position: index,
      revision: 0,
      created_by: actorUserId ?? null,
      updated_by: actorUserId ?? null,
    }));

    const { error: insertError } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_collection_techniques")
      .insert(rows));

    if (insertError) throw insertError;

    return this.getCollectionTechniques(projectId);
  }

  async getMainApproachOptions(): Promise<SampleOptionRow[]> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("sample_main_approach_options")
      .select(SAMPLE_OPTION_SELECT)
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("label", { ascending: true }));

    if (error) throw error;

    return (data as SampleOptionRow[] | null) ?? [];
  }

  async getScopeOptions(): Promise<SampleOptionRow[]> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("sample_scope_options")
      .select(SAMPLE_OPTION_SELECT)
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("label", { ascending: true }));

    if (error) throw error;

    return (data as SampleOptionRow[] | null) ?? [];
  }

  async getCollectionTechniqueOptions(): Promise<SampleOptionRow[]> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("sample_collection_technique_options")
      .select(SAMPLE_OPTION_SELECT)
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("label", { ascending: true }));

    if (error) throw error;

    return (data as SampleOptionRow[] | null) ?? [];
  }

  async listVersions(projectId: string): Promise<SampleConfigVersionRow[]> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_config_versions")
      .select(SAMPLE_VERSION_SELECT)
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .order("created_at", { ascending: false }));

    if (error) throw error;

    return (data as SampleConfigVersionRow[] | null) ?? [];
  }

  async getLatestVersion(
    projectId: string
  ): Promise<SampleConfigVersionRow | null> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_config_versions")
      .select(SAMPLE_VERSION_SELECT)
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle());

    if (error) throw error;

    return (data as SampleConfigVersionRow | null) ?? null;
  }

  async getVersionById(
    projectId: string,
    versionId: string
  ): Promise<SampleConfigVersionRow | null> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_config_versions")
      .select(SAMPLE_VERSION_SELECT)
      .eq("project_id", projectId)
      .eq("id", versionId)
      .maybeSingle());

    if (error) throw error;

    return (data as SampleConfigVersionRow | null) ?? null;
  }

  async getVersionTechniques(
    versionId: string
  ): Promise<SampleConfigVersionTechniqueRow[]> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_config_version_techniques")
      .select(SAMPLE_VERSION_TECHNIQUE_SELECT)
      .eq("version_id", versionId)
      .order("position", { ascending: true })
      .order("workflow_order", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }));

    if (error) throw error;

    return (data as SampleConfigVersionTechniqueRow[] | null) ?? [];
  }

  async getVersionTechniquesForVersions(
    versionIds: string[]
  ): Promise<SampleConfigVersionTechniqueRow[]> {
    if (versionIds.length === 0) return [];

    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_config_version_techniques")
      .select(SAMPLE_VERSION_TECHNIQUE_SELECT)
      .in("version_id", versionIds)
      .order("version_id", { ascending: true })
      .order("position", { ascending: true })
      .order("workflow_order", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }));

    if (error) throw error;

    return (data as SampleConfigVersionTechniqueRow[] | null) ?? [];
  }

  async getNextVersionNumber(projectId: string): Promise<number> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_config_versions")
      .select("version_number")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1));

    if (error) throw error;

    const highest = data?.[0]?.version_number ?? 0;
    return Number(highest) + 1;
  }

  async createVersionSnapshot(
    projectId: string,
    payload: {
      label: string | null;
      trigger_type: SampleConfigVersionTriggerType;
      content_hash: string;
      snapshot_main_approach_code: string | null;
      snapshot_scope_code: string | null;
      snapshot_field_phase: string;
      snapshot_target_sample_size: number | null;
      snapshot_sample_size_rationale: string;
      collection_techniques: Array<{
        technique_code: string | null;
        custom_label: string | null;
        is_custom: boolean;
        position: number;
      }>;
    },
    actorUserId?: string | null
  ): Promise<CreateSampleConfigVersionResult> {
    return workflowRpc<CreateSampleConfigVersionResult>(this.db, "sample-config", "save_workflow_snapshot", {
      p_project_id: projectId, p_actor_id: actorUserId ?? null,
      p_snapshot: { main_approach_code: payload.snapshot_main_approach_code, scope_code: payload.snapshot_scope_code, field_phase: payload.snapshot_field_phase, target_sample_size: payload.snapshot_target_sample_size, sample_size_rationale: payload.snapshot_sample_size_rationale },
      p_children: payload.collection_techniques,
      p_label: payload.label ?? null, p_trigger_type: payload.trigger_type, p_content_hash: payload.content_hash ?? null,
    });
  }

  async getVersionByContentHash(
    projectId: string,
    contentHash: string
  ): Promise<SampleConfigVersionRow | null> {
    const { data, error } = await withWorkflowResult("sample-config", () => this.db
      .from("project_sample_config_versions")
      .select(SAMPLE_VERSION_SELECT)
      .eq("project_id", projectId)
      .eq("content_hash", contentHash)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle());

    if (error) throw error;

    return (data as SampleConfigVersionRow | null) ?? null;
  }
}
