import { workflowRpc, withWorkflowResult, type WorkflowRestoreData } from "@/src/modules/security/workflow-transactions";
import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type {
  ResearchDesignPatch,
  ResearchDesignVersionTriggerType,
  SpecificObjectiveCreate,
} from "./research-design.schema";

export type ResearchDesignRow = {
  project_id: string;
  research_question: string | null;
  general_objective: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type SpecificObjectiveRow = {
  id: string;
  project_id: string;
  text: string;
  position: number;
  revision: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type ResearchDesignVersionRow = {
  id: string;
  project_id: string;
  version_number: number;
  label: string | null;
  snapshot_research_question: string;
  snapshot_general_objective: string;
  created_by: string | null;
  created_at: string;
  trigger_type: ResearchDesignVersionTriggerType;
  content_hash: string | null;
};

export type CreateResearchDesignVersionResult = {
  version: ResearchDesignVersionRow;
  created: boolean;
};

export type ResearchDesignVersionItemRow = {
  id: string;
  version_id: string;
  text: string;
  position: number;
  created_at: string;
};

export class ResearchDesignRevisionConflictError extends Error {
  status: number;
  code: string;
  latest: ResearchDesignRow | null;

  constructor(latest: ResearchDesignRow | null) {
    super("RESEARCH_DESIGN_REVISION_CONFLICT");
    this.name = "ResearchDesignRevisionConflictError";
    this.status = 409;
    this.code = "RESEARCH_DESIGN_REVISION_CONFLICT";
    this.latest = latest;
  }
}

export class SpecificObjectiveRevisionConflictError extends Error {
  status: number;
  code: string;
  latest: SpecificObjectiveRow | null;

  constructor(latest: SpecificObjectiveRow | null) {
    super("SPECIFIC_OBJECTIVE_REVISION_CONFLICT");
    this.name = "SpecificObjectiveRevisionConflictError";
    this.status = 409;
    this.code = "SPECIFIC_OBJECTIVE_REVISION_CONFLICT";
    this.latest = latest;
  }
}

const RESEARCH_DESIGN_SELECT = `
  project_id,
  research_question,
  general_objective,
  revision,
  created_at,
  updated_at,
  created_by,
  updated_by
`;

const SPECIFIC_OBJECTIVE_SELECT = `
  id,
  project_id,
  text,
  position,
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
  snapshot_research_question,
  snapshot_general_objective,
  created_by,
  created_at,
  trigger_type,
  content_hash
`;

const VERSION_ITEM_SELECT = `
  id,
  version_id,
  text,
  position,
  created_at
`;

export class ResearchDesignRepo {
  constructor(private readonly db: ServerSupabase) {}

  async restoreVersionTransaction(projectId: string, versionId: string, actorUserId: string | null, expectedRevision: number, createBackup: boolean) {
    return workflowRpc<WorkflowRestoreData<ResearchDesignRow, SpecificObjectiveRow, ResearchDesignVersionRow, ResearchDesignVersionItemRow>>(
      this.db, "research-design", "restore_workflow_version", {
        p_project_id: projectId, p_version_id: versionId, p_actor_id: actorUserId,
        p_expected_revision: expectedRevision, p_create_backup: createBackup,
      }
    );
  }

  async getResearchDesign(projectId: string): Promise<ResearchDesignRow | null> {
    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_research_design")
      .select(RESEARCH_DESIGN_SELECT)
      .eq("project_id", projectId)
      .maybeSingle());

    if (error) throw error;

    return (data as ResearchDesignRow | null) ?? null;
  }

  async createResearchDesign(
    projectId: string,
    patch: ResearchDesignPatch,
    actorUserId?: string | null
  ): Promise<ResearchDesignRow> {
    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_research_design")
      .insert({
        project_id: projectId,
        research_question: patch.research_question ?? "",
        general_objective: patch.general_objective ?? "",
        revision: 1,
        created_by: actorUserId ?? null,
        updated_by: actorUserId ?? null,
      })
      .select(RESEARCH_DESIGN_SELECT)
      .single());

    if (error) throw error;

    return data as ResearchDesignRow;
  }

  async updateResearchDesignWithExpectedRevision(
    projectId: string,
    patch: ResearchDesignPatch,
    expectedRevision: number,
    actorUserId?: string | null
  ): Promise<ResearchDesignRow> {
    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_research_design")
      .update({
        ...patch,
        revision: expectedRevision + 1,
        updated_by: actorUserId ?? null,
      })
      .eq("project_id", projectId)
      .eq("revision", expectedRevision)
      .select(RESEARCH_DESIGN_SELECT)
      .maybeSingle());

    if (error) throw error;

    if (!data) {
      const latest = await this.getResearchDesign(projectId);
      throw new ResearchDesignRevisionConflictError(latest);
    }

    return data as ResearchDesignRow;
  }

  async saveResearchDesignWithRevision(
    projectId: string,
    patch: ResearchDesignPatch,
    expectedRevision: number,
    actorUserId?: string | null
  ): Promise<ResearchDesignRow> {
    const current = await this.getResearchDesign(projectId);

    if (!current) {
      if (expectedRevision !== 0) {
        throw new ResearchDesignRevisionConflictError(null);
      }

      try {
        return await this.createResearchDesign(projectId, patch, actorUserId);
      } catch (error: unknown) {
        const maybeError = error as { code?: string };
        if (maybeError.code === "23505") {
          const latest = await this.getResearchDesign(projectId);
          throw new ResearchDesignRevisionConflictError(latest);
        }
        throw error;
      }
    }

    if (current.revision !== expectedRevision) {
      throw new ResearchDesignRevisionConflictError(current);
    }

    return this.updateResearchDesignWithExpectedRevision(
      projectId,
      patch,
      expectedRevision,
      actorUserId
    );
  }

  async upsertResearchDesignForce(
    projectId: string,
    patch: ResearchDesignPatch,
    actorUserId?: string | null
  ): Promise<ResearchDesignRow> {
    const current = await this.getResearchDesign(projectId);

    if (!current) {
      return this.createResearchDesign(projectId, patch, actorUserId);
    }

    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_research_design")
      .update({
        ...patch,
        revision: current.revision + 1,
        updated_by: actorUserId ?? null,
      })
      .eq("project_id", projectId)
      .select(RESEARCH_DESIGN_SELECT)
      .single());

    if (error) throw error;

    return data as ResearchDesignRow;
  }

  async getSpecificObjectives(projectId: string): Promise<SpecificObjectiveRow[]> {
    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_specific_objectives")
      .select(SPECIFIC_OBJECTIVE_SELECT)
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("workflow_order", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }));

    if (error) throw error;

    return (data as SpecificObjectiveRow[] | null) ?? [];
  }

  async getSpecificObjectiveById(
    projectId: string,
    objectiveId: string
  ): Promise<SpecificObjectiveRow | null> {
    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_specific_objectives")
      .select(SPECIFIC_OBJECTIVE_SELECT)
      .eq("project_id", projectId)
      .eq("id", objectiveId)
      .maybeSingle());

    if (error) throw error;

    return (data as SpecificObjectiveRow | null) ?? null;
  }

  async getNextSpecificObjectivePosition(projectId: string): Promise<number> {
    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_specific_objectives")
      .select("position")
      .eq("project_id", projectId)
      .order("position", { ascending: false })
      .limit(1));

    if (error) throw error;

    const highest = data?.[0]?.position ?? -1;
    return Number(highest) + 1;
  }

  async createSpecificObjective(
    projectId: string,
    payload: SpecificObjectiveCreate,
    actorUserId?: string | null
  ): Promise<SpecificObjectiveRow> {
    const nextPosition = await this.getNextSpecificObjectivePosition(projectId);

    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_specific_objectives")
      .insert({
        project_id: projectId,
        text: payload.text,
        position: nextPosition,
        created_by: actorUserId ?? null,
        updated_by: actorUserId ?? null,
      })
      .select(SPECIFIC_OBJECTIVE_SELECT)
      .single());

    if (error) throw error;

    return data as SpecificObjectiveRow;
  }

  async updateSpecificObjectiveWithExpectedRevision(
  projectId: string,
  objectiveId: string,
  text: string,
  expectedRevision: number,
  actorUserId?: string | null
): Promise<SpecificObjectiveRow | null> {
  const { data, error } = await withWorkflowResult("research-design", () => this.db
    .from("project_specific_objectives")
    .update({
      text,
      revision: expectedRevision + 1,
      updated_by: actorUserId ?? null,
    })
    .eq("project_id", projectId)
    .eq("id", objectiveId)
    .eq("revision", expectedRevision)
    .select(SPECIFIC_OBJECTIVE_SELECT)
    .maybeSingle());

  if (error) throw error;

  if (!data) {
    const latest = await this.getSpecificObjectiveById(projectId, objectiveId);

    if (!latest) {
      return null;
    }

    throw new SpecificObjectiveRevisionConflictError(latest);
  }

  return data as SpecificObjectiveRow;
}

async saveSpecificObjectiveWithRevision(
  projectId: string,
  objectiveId: string,
  text: string,
  expectedRevision: number,
  actorUserId?: string | null
): Promise<SpecificObjectiveRow | null> {
  const current = await this.getSpecificObjectiveById(projectId, objectiveId);

  if (!current) {
    return null;
  }

  if (current.revision !== expectedRevision) {
    throw new SpecificObjectiveRevisionConflictError(current);
  }

  return this.updateSpecificObjectiveWithExpectedRevision(
    projectId,
    objectiveId,
    text,
    expectedRevision,
    actorUserId
  );
}

  async updateSpecificObjectivePosition(
    projectId: string,
    objectiveId: string,
    position: number,
    actorUserId?: string | null
  ): Promise<SpecificObjectiveRow | null> {
    const current = await this.getSpecificObjectiveById(projectId, objectiveId);

    if (!current) {
      return null;
    }

    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_specific_objectives")
      .update({
        position,
        revision: current.revision + 1,
        updated_by: actorUserId ?? null,
      })
      .eq("project_id", projectId)
      .eq("id", objectiveId)
      .select(SPECIFIC_OBJECTIVE_SELECT)
      .maybeSingle());

    if (error) throw error;

    return (data as SpecificObjectiveRow | null) ?? null;
  }

  async replaceSpecificObjectives(
    projectId: string,
    objectives: Array<{ text: string; position: number }>,
    actorUserId?: string | null
  ): Promise<SpecificObjectiveRow[]> {
    const { error: deleteError } = await withWorkflowResult("research-design", () => this.db
      .from("project_specific_objectives")
      .delete()
      .eq("project_id", projectId));

    if (deleteError) throw deleteError;

    if (objectives.length === 0) {
      return [];
    }

    const ordered = [...objectives].sort((a, b) => a.position - b.position);

    const { error: insertError } = await withWorkflowResult("research-design", () => this.db
      .from("project_specific_objectives")
      .insert(
        ordered.map((item) => ({
          project_id: projectId,
          text: item.text,
          position: item.position,
          revision: 0,
          created_by: actorUserId ?? null,
          updated_by: actorUserId ?? null,
        }))
      ));

    if (insertError) throw insertError;

    return this.getSpecificObjectives(projectId);
  }

  async deleteSpecificObjectiveReturning(
    projectId: string,
    objectiveId: string
  ): Promise<{ id: string }[]> {
    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_specific_objectives")
      .delete()
      .eq("project_id", projectId)
      .eq("id", objectiveId)
      .select("id"));

    if (error) throw error;

    return (data as { id: string }[] | null) ?? [];
  }

  async listVersions(projectId: string): Promise<ResearchDesignVersionRow[]> {
    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_research_design_versions")
      .select(VERSION_SELECT)
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .order("created_at", { ascending: false }));

    if (error) throw error;

    return (data as ResearchDesignVersionRow[] | null) ?? [];
  }

  async getVersionById(
    projectId: string,
    versionId: string
  ): Promise<ResearchDesignVersionRow | null> {
    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_research_design_versions")
      .select(VERSION_SELECT)
      .eq("project_id", projectId)
      .eq("id", versionId)
      .maybeSingle());

    if (error) throw error;

    return (data as ResearchDesignVersionRow | null) ?? null;
  }

  async getVersionItems(
    versionId: string
  ): Promise<ResearchDesignVersionItemRow[]> {
    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_research_design_version_items")
      .select(VERSION_ITEM_SELECT)
      .eq("version_id", versionId)
      .order("position", { ascending: true })
      .order("workflow_order", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }));

    if (error) throw error;

    return (data as ResearchDesignVersionItemRow[] | null) ?? [];
  }

  async getVersionItemsForVersions(
    versionIds: string[]
  ): Promise<ResearchDesignVersionItemRow[]> {
    if (versionIds.length === 0) return [];

    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_research_design_version_items")
      .select(VERSION_ITEM_SELECT)
      .in("version_id", versionIds)
      .order("version_id", { ascending: true })
      .order("position", { ascending: true })
      .order("workflow_order", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }));

    if (error) throw error;

    return (data as ResearchDesignVersionItemRow[] | null) ?? [];
  }

  async getNextVersionNumber(projectId: string): Promise<number> {
    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_research_design_versions")
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
      label?: string | null;
      trigger_type: ResearchDesignVersionTriggerType;
      snapshot_research_question: string;
      snapshot_general_objective: string;
      specific_objectives: Array<{ text: string; position: number }>;
      content_hash?: string | null;
    },
    actorUserId?: string | null
  ): Promise<CreateResearchDesignVersionResult> {
    return workflowRpc<CreateResearchDesignVersionResult>(this.db, "research-design", "save_workflow_snapshot", {
      p_project_id: projectId, p_actor_id: actorUserId ?? null,
      p_snapshot: { research_question: payload.snapshot_research_question, general_objective: payload.snapshot_general_objective },
      p_children: payload.specific_objectives,
      p_label: payload.label ?? null, p_trigger_type: payload.trigger_type, p_content_hash: payload.content_hash ?? null,
    });
  }

  async getVersionByContentHash(
    projectId: string,
    contentHash: string | null | undefined
  ): Promise<ResearchDesignVersionRow | null> {
    if (!contentHash) return null;

    const { data, error } = await withWorkflowResult("research-design", () => this.db
      .from("project_research_design_versions")
      .select(VERSION_SELECT)
      .eq("project_id", projectId)
      .eq("content_hash", contentHash)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle());

    if (error) throw error;

    return (data as ResearchDesignVersionRow | null) ?? null;
  }
}
