import { withDependencyErrors } from "@/src/modules/security/dependency-errors";
import { createHash } from "crypto";
import {
  ResearchDesignRepo,
  type ResearchDesignRow,
  type ResearchDesignVersionItemRow,
  type ResearchDesignVersionRow,
  type SpecificObjectiveRow,
} from "./research-design.repo";
import type {
  ResearchDesignCreateVersion,
  ResearchDesignRestoreVersion,
  ResearchDesignSave,
  SpecificObjectiveCreate,
  SpecificObjectiveSave,
} from "./research-design.schema";

export type ResearchDesignFullPayload = {
  design: ResearchDesignRow;
  specific_objectives: SpecificObjectiveRow[];
};

export type ResearchDesignVersionDetail = {
  version: ResearchDesignVersionRow;
  items: ResearchDesignVersionItemRow[];
};

export type ResearchDesignVersionSnapshotPayload = {
  research_question: string;
  general_objective: string;
  specific_objectives: Array<{
    id: string;
    text: string;
    position: number;
  }>;
};

export type ResearchDesignVersionPayload = {
  id: string;
  project_id: string;
  version_number: number;
  label: string | null;
  created_by: string | null;
  created_at: string;
  trigger_type: ResearchDesignVersionRow["trigger_type"];
  content_hash: string | null;
  snapshot: ResearchDesignVersionSnapshotPayload;
};

export type ResearchDesignCreateVersionResult = {
  version: ResearchDesignVersionPayload;
  created: boolean;
  reason: "duplicate_snapshot" | null;
};

type MutationActorOptions = {
  actorUserId?: string | null;
};

type HttpError = Error & { status: number };

function badRequestError(message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = 400;
  return error;
}

function notFoundError(message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = 404;
  return error;
}

function normalizeResearchDesign(
  projectId: string,
  design: ResearchDesignRow | null
): ResearchDesignRow {
  return (
    design ?? {
      project_id: projectId,
      research_question: "",
      general_objective: "",
      revision: 0,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      created_by: null,
      updated_by: null,
    }
  );
}

function arraysHaveSameMembers(a: string[], b: string[]) {
  if (a.length !== b.length) return false;

  const aSorted = [...a].sort();
  const bSorted = [...b].sort();

  return aSorted.every((value, index) => value === bSorted[index]);
}

function hasMeaningfulDesignContent(data: ResearchDesignFullPayload): boolean {
  return (
    (data.design.research_question ?? "").trim().length > 0 ||
    (data.design.general_objective ?? "").trim().length > 0 ||
    data.specific_objectives.length > 0
  );
}

function buildSnapshotHash(
  design: ResearchDesignRow,
  specificObjectives: Array<{ text: string; position: number }>
): string {
  const payload = {
    research_question: (design.research_question ?? "").trim(),
    general_objective: (design.general_objective ?? "").trim(),
    specific_objectives: [...specificObjectives]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        text: item.text.trim(),
        position: item.position,
      })),
  };

  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export class ResearchDesignService {
  constructor(private readonly repo: ResearchDesignRepo) {}

  async getFull(projectId: string): Promise<ResearchDesignFullPayload> {
    const [design, specificObjectives] = await Promise.all([
      withDependencyErrors(() => this.repo.getResearchDesign(projectId)),
      withDependencyErrors(() => this.repo.getSpecificObjectives(projectId)),
    ]);

    return {
      design: normalizeResearchDesign(projectId, design),
      specific_objectives: specificObjectives,
    };
  }

  async update(
    projectId: string,
    payload: ResearchDesignSave,
    options?: MutationActorOptions
  ): Promise<ResearchDesignRow> {
    const { base_revision, ...patch } = payload;

    if (Object.keys(patch).length === 0) {
      const current = await withDependencyErrors(() => this.repo.getResearchDesign(projectId));
      return normalizeResearchDesign(projectId, current);
    }

    return withDependencyErrors(() => this.repo.saveResearchDesignWithRevision(
      projectId,
      patch,
      base_revision,
      options?.actorUserId ?? null
    ));
  }

  async addSpecificObjective(
    projectId: string,
    payload: SpecificObjectiveCreate,
    options?: MutationActorOptions
  ): Promise<SpecificObjectiveRow> {
    return withDependencyErrors(() => this.repo.createSpecificObjective(
      projectId,
      payload,
      options?.actorUserId ?? null
    ));
  }

  async updateSpecificObjective(
    projectId: string,
    objectiveId: string,
    payload: SpecificObjectiveSave,
    options?: MutationActorOptions
  ): Promise<SpecificObjectiveRow | null> {
    return withDependencyErrors(() => this.repo.saveSpecificObjectiveWithRevision(
      projectId,
      objectiveId,
      payload.text,
      payload.base_revision,
      options?.actorUserId ?? null
    ));
  }

  private async normalizeSpecificObjectivePositions(
    projectId: string,
    actorUserId?: string | null
  ): Promise<SpecificObjectiveRow[]> {
    const current = await withDependencyErrors(() => this.repo.getSpecificObjectives(projectId));

    for (let index = 0; index < current.length; index += 1) {
      const item = current[index];
      if (item.position !== index) {
        await withDependencyErrors(() => this.repo.updateSpecificObjectivePosition(
          projectId,
          item.id,
          index,
          actorUserId ?? null
        ));
      }
    }

    return withDependencyErrors(() => this.repo.getSpecificObjectives(projectId));
  }

  async removeSpecificObjectiveWithCount(
    projectId: string,
    objectiveId: string,
    options?: MutationActorOptions
  ) {
    const deleted = await withDependencyErrors(() => this.repo.deleteSpecificObjectiveReturning(
      projectId,
      objectiveId
    ));

    if (deleted.length > 0) {
      await this.normalizeSpecificObjectivePositions(
        projectId,
        options?.actorUserId ?? null
      );
    }

    return {
      deletedCount: deleted.length,
    };
  }

  async reorderSpecificObjectives(
    projectId: string,
    orderedIds: string[],
    options?: MutationActorOptions
  ): Promise<SpecificObjectiveRow[]> {
    const current = await withDependencyErrors(() => this.repo.getSpecificObjectives(projectId));

    if (current.length === 0) {
      throw badRequestError("NO_SPECIFIC_OBJECTIVES");
    }

    const currentIds = current.map((item) => item.id);

    if (!arraysHaveSameMembers(currentIds, orderedIds)) {
      throw badRequestError("INVALID_OBJECTIVE_ORDER");
    }

    for (let index = 0; index < orderedIds.length; index += 1) {
      const objectiveId = orderedIds[index];
      const currentItem = current.find((item) => item.id === objectiveId);

      if (!currentItem) {
        throw badRequestError("INVALID_OBJECTIVE_ORDER");
      }

      if (currentItem.position !== index) {
        await withDependencyErrors(() => this.repo.updateSpecificObjectivePosition(
          projectId,
          objectiveId,
          index,
          options?.actorUserId ?? null
        ));
      }
    }

    return withDependencyErrors(() => this.repo.getSpecificObjectives(projectId));
  }

  private buildVersionSnapshot(
    version: ResearchDesignVersionRow,
    items: ResearchDesignVersionItemRow[]
  ): ResearchDesignVersionSnapshotPayload {
    return {
      research_question: version.snapshot_research_question ?? "",
      general_objective: version.snapshot_general_objective ?? "",
      specific_objectives: [...items]
        .sort((a, b) => a.position - b.position)
        .map((item) => ({
          id: item.id,
          text: item.text ?? "",
          position: item.position,
        })),
    };
  }

  private toVersionPayload(
    detail: ResearchDesignVersionDetail
  ): ResearchDesignVersionPayload {
    return {
      id: detail.version.id,
      project_id: detail.version.project_id,
      version_number: detail.version.version_number,
      label: detail.version.label ?? null,
      created_by: detail.version.created_by ?? null,
      created_at: detail.version.created_at,
      trigger_type: detail.version.trigger_type,
      content_hash: detail.version.content_hash ?? null,
      snapshot: this.buildVersionSnapshot(detail.version, detail.items),
    };
  }

  async listVersions(projectId: string): Promise<ResearchDesignVersionPayload[]> {
    const versions = await withDependencyErrors(() => this.repo.listVersions(projectId));
    const versionIds = versions.map((version) => version.id);
    const items = await withDependencyErrors(() => this.repo.getVersionItemsForVersions(versionIds));
    const itemsByVersionId = new Map<string, ResearchDesignVersionItemRow[]>();

    for (const item of items) {
      const group = itemsByVersionId.get(item.version_id) ?? [];
      group.push(item);
      itemsByVersionId.set(item.version_id, group);
    }

    return versions.map((version) =>
      this.toVersionPayload({
        version,
        items: itemsByVersionId.get(version.id) ?? [],
      })
    );
  }

  async getVersion(
    projectId: string,
    versionId: string
  ): Promise<ResearchDesignVersionDetail> {
    const version = await withDependencyErrors(() => this.repo.getVersionById(projectId, versionId));

    if (!version) {
      throw notFoundError("RESEARCH_DESIGN_VERSION_NOT_FOUND");
    }

    const items = await withDependencyErrors(() => this.repo.getVersionItems(version.id));

    return {
      version,
      items,
    };
  }

  async createVersion(
    projectId: string,
    payload: ResearchDesignCreateVersion,
    options?: MutationActorOptions
  ): Promise<ResearchDesignCreateVersionResult> {
    const current = await this.getFull(projectId);

    if (!hasMeaningfulDesignContent(current)) {
      throw badRequestError("RESEARCH_DESIGN_NOTHING_TO_SNAPSHOT");
    }

    const snapshotObjectives = current.specific_objectives.map((item) => ({
      text: item.text.trim(),
      position: item.position,
    }));

    const contentHash = buildSnapshotHash(current.design, snapshotObjectives);

    const creation = await withDependencyErrors(() => this.repo.createVersionSnapshot(
      projectId,
      {
        label: normalizeOptionalText(payload.label),
        trigger_type: payload.trigger_type ?? "manual",
        snapshot_research_question: (
          current.design.research_question ?? ""
        ).trim(),
        snapshot_general_objective: (
          current.design.general_objective ?? ""
        ).trim(),
        specific_objectives: snapshotObjectives,
        content_hash: contentHash,
      },
      options?.actorUserId ?? null
    ));

    if (!creation.created) {
      return {
        version: this.toVersionPayload({
          version: creation.version,
          items: await withDependencyErrors(() => this.repo.getVersionItems(creation.version.id)),
        }),
        created: false,
        reason: "duplicate_snapshot",
      };
    }

    const items = await withDependencyErrors(() => this.repo.getVersionItems(creation.version.id));

    return {
      version: this.toVersionPayload({
        version: creation.version,
        items,
      }),
      created: true,
      reason: null,
    };
  }

  async restoreVersion(
    projectId: string, versionId: string, payload: ResearchDesignRestoreVersion, options?: MutationActorOptions
  ) {
    // Omission provides only server-observed optimistic concurrency, not displayed-state protection.
    const expected = payload.base_revision ?? (await withDependencyErrors(() => this.repo.getResearchDesign(projectId)))?.revision ?? 0;
    const result = await withDependencyErrors(() => this.repo.restoreVersionTransaction(
      projectId, versionId, options?.actorUserId ?? null, expected, payload.create_backup_of_current ?? true
    ));
    return { restored_from_version: result.target.version, backup_version: result.backup?.version ?? null,
      data: { design: result.parent, specific_objectives: result.children } };
  }
}
