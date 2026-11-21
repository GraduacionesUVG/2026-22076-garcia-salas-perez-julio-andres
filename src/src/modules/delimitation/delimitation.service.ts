import { withDependencyErrors } from "@/src/modules/security/dependency-errors";
import { createHash } from "crypto";
import {
  DelimitationRepo,
  type DelimitationItemRow,
  type DelimitationRow,
  type DelimitationVersionRow,
  type DelimitationVersionTriggerType,
} from "./delimitation.repo";
import type {
  DelimitationItemCreate,
  DelimitationItemUpdate,
  DelimitationPatch,
  DelimitationSave,
} from "./delimitation.schema";

export type DelimitationFullPayload = {
  delim: DelimitationRow;
  include: DelimitationItemRow[];
  exclude: DelimitationItemRow[];
};

export type DelimitationVersionDetailPayload = {
  version: DelimitationVersionRow;
  delim: DelimitationRow;
  include: Array<{ kind: "include"; text: string; position: number }>;
  exclude: Array<{ kind: "exclude"; text: string; position: number }>;
};

export type SaveVersionResult = {
  created: boolean;
  reason: "duplicate_snapshot" | null;
  version: DelimitationVersionRow;
};

export type DelimitationRestorePayload = {
  restoredFromVersion: DelimitationVersionRow;
  backupVersion: DelimitationVersionRow | null;
  backupCreated: boolean;
  current: DelimitationFullPayload;
};

type VersionSourceSnapshot = {
  delim: {
    topic: string;
    context_place: string;
    population: string;
    time_period: string;
    resources: string;
  };
  items: Array<{
    kind: "include" | "exclude";
    text: string;
  }>;
};

type MutationActorOptions = {
  actorUserId?: string | null;
};

const DEFAULT_AUTO_CHECKPOINT_MINUTES = 45;

function notFoundError(message: string) {
  const error = Object.assign(new Error(message), { status: 404 });
  return error;
}

function normalizeDelimitation(
  projectId: string,
  delim: DelimitationRow | null
): DelimitationRow {
  return (
    delim ?? {
      project_id: projectId,
      topic: "",
      context_place: "",
      population: "",
      time_period: "",
      resources: "",
      revision: 0,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      created_by: null,
      updated_by: null,
    }
  );
}

function normalizeHashText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function resolveAutoCheckpointMinutes(): number {
  const raw = Number(process.env.DELIMITATION_AUTO_CHECKPOINT_MINUTES ?? DEFAULT_AUTO_CHECKPOINT_MINUTES);

  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_AUTO_CHECKPOINT_MINUTES;
  }

  return raw;
}

export class DelimitationService {
  constructor(private readonly repo: DelimitationRepo) {}

  private async buildCurrentVersionSource(
    projectId: string
  ): Promise<VersionSourceSnapshot> {
    const currentDelim = normalizeDelimitation(
      projectId,
      await this.repo.getDelimitation(projectId)
    );

    const currentItems = await this.repo.getItems(projectId);

    return {
      delim: {
        topic: currentDelim.topic ?? "",
        context_place: currentDelim.context_place ?? "",
        population: currentDelim.population ?? "",
        time_period: currentDelim.time_period ?? "",
        resources: currentDelim.resources ?? "",
      },
      items: currentItems.map((item) => ({
        kind: item.kind,
        text: item.text ?? "",
      })),
    };
  }

  private buildContentHash(source: VersionSourceSnapshot): string {
    const canonical = {
      topic: normalizeHashText(source.delim.topic),
      context_place: normalizeHashText(source.delim.context_place),
      population: normalizeHashText(source.delim.population),
      time_period: normalizeHashText(source.delim.time_period),
      resources: normalizeHashText(source.delim.resources),
      include: source.items
        .filter((item) => item.kind === "include")
        .map((item) => normalizeHashText(item.text))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
      exclude: source.items
        .filter((item) => item.kind === "exclude")
        .map((item) => normalizeHashText(item.text))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    };

    return createHash("sha256")
      .update(JSON.stringify(canonical))
      .digest("hex");
  }

  private hasAutoCheckpointWindowElapsed(createdAt: string): boolean {
    const latestCreatedAtMs = Date.parse(createdAt);
    if (Number.isNaN(latestCreatedAtMs)) return false;

    const thresholdMs = resolveAutoCheckpointMinutes() * 60 * 1000;
    return Date.now() - latestCreatedAtMs >= thresholdMs;
  }

  private async maybeCreateAutoCheckpoint(
    projectId: string,
    actorUserId?: string | null
  ): Promise<SaveVersionResult | null> {
    const latestVersion = await this.repo.getLatestVersion(projectId);

    if (!latestVersion) {
      return null;
    }

    if (!this.hasAutoCheckpointWindowElapsed(latestVersion.created_at)) {
      return null;
    }

    return this.saveVersion(projectId, actorUserId ?? null, null, {
      triggerType: "auto_checkpoint",
    });
  }

  async getFull(projectId: string): Promise<DelimitationFullPayload> {
    const delim = await this.repo.getDelimitation(projectId);
    const items = await this.repo.getItems(projectId);

    return {
      delim: normalizeDelimitation(projectId, delim),
      include: items.filter((item) => item.kind === "include"),
      exclude: items.filter((item) => item.kind === "exclude"),
    };
  }

  async update(
    projectId: string,
    payload: DelimitationSave,
    options?: MutationActorOptions
  ): Promise<DelimitationRow> {
    const { base_revision, ...patch } = payload;

    if (Object.keys(patch).length === 0) {
      const current = await this.repo.getDelimitation(projectId);
      return normalizeDelimitation(projectId, current);
    }

    const updated = await this.repo.saveDelimitationWithRevision(
      projectId,
      patch as DelimitationPatch,
      base_revision,
      options?.actorUserId ?? null
    );

    await this.maybeCreateAutoCheckpoint(projectId, options?.actorUserId ?? null);

    return updated;
  }

  async addItem(
    projectId: string,
    payload: DelimitationItemCreate,
    options?: MutationActorOptions
  ): Promise<DelimitationItemRow> {
    const created = await this.repo.createItem(projectId, payload);

    await this.maybeCreateAutoCheckpoint(projectId, options?.actorUserId ?? null);

    return created;
  }

  async updateItem(
    projectId: string,
    itemId: string,
    payload: DelimitationItemUpdate,
    options?: MutationActorOptions
  ): Promise<DelimitationItemRow | null> {
    const updated = await this.repo.updateItem(projectId, itemId, payload);

    if (updated) {
      await this.maybeCreateAutoCheckpoint(projectId, options?.actorUserId ?? null);
    }

    return updated;
  }

  async removeItemWithCount(
    projectId: string,
    itemId: string,
    options?: MutationActorOptions
  ) {
    const deleted = await this.repo.deleteItemReturning(projectId, itemId);

    if (deleted.length > 0) {
      await this.maybeCreateAutoCheckpoint(projectId, options?.actorUserId ?? null);
    }

    return {
      deletedCount: deleted.length,
    };
  }

  async saveVersion(
    projectId: string,
    userId: string | null,
    label?: string | null,
    options?: {
      triggerType?: DelimitationVersionTriggerType;
    }
  ): Promise<SaveVersionResult> {
    const source = await this.buildCurrentVersionSource(projectId);
    const contentHash = this.buildContentHash(source);
    const latestVersion = await this.repo.getLatestVersion(projectId);

    if (latestVersion?.content_hash && latestVersion.content_hash === contentHash) {
      return {
        created: false,
        reason: "duplicate_snapshot",
        version: latestVersion,
      };
    }

    const versionNumber = await this.repo.getNextVersionNumber(projectId);

    const creation = await this.repo.createVersion({
      projectId,
      versionNumber,
      label: label ?? null,
      createdBy: userId ?? null,
      triggerType: options?.triggerType ?? "manual",
      contentHash,
      items: source.items.map((item, position) => ({ ...item, position })),
      snapshot: {
        topic: source.delim.topic,
        context_place: source.delim.context_place,
        population: source.delim.population,
        time_period: source.delim.time_period,
        resources: source.delim.resources,
      },
    });

    if (!creation.created) {
      return {
        created: false,
        reason: "duplicate_snapshot",
        version: creation.version,
      };
    }


    return {
      created: true,
      reason: null,
      version: creation.version,
    };
  }

  async listVersions(projectId: string): Promise<DelimitationVersionRow[]> {
    return this.repo.listVersions(projectId);
  }

  async getVersion(
    projectId: string,
    versionId: string
  ): Promise<DelimitationVersionDetailPayload> {
    const version = await this.repo.getVersionById(projectId, versionId);

    if (!version) {
      throw notFoundError("VERSION_NOT_FOUND");
    }

    const items = await this.repo.getVersionItems(version.id);

    return {
      version,
      delim: {
        project_id: projectId,
        topic: version.snapshot_topic ?? "",
        context_place: version.snapshot_context_place ?? "",
        population: version.snapshot_population ?? "",
        time_period: version.snapshot_time_period ?? "",
        resources: version.snapshot_resources ?? "",
        revision: 0,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
        created_by: null,
        updated_by: null,
      },
      include: items
        .filter((item) => item.kind === "include")
        .map((item) => ({
          kind: "include" as const,
          text: item.text,
          position: item.position,
        })),
      exclude: items
        .filter((item) => item.kind === "exclude")
        .map((item) => ({
          kind: "exclude" as const,
          text: item.text,
          position: item.position,
        })),
    };
  }

  async restoreVersion(
    projectId: string, versionId: string, userId: string,
    payload: { base_revision?: number; create_backup_of_current?: boolean } = {}
  ): Promise<DelimitationRestorePayload> {
    // Legacy requests compare a server observation, not the client's displayed revision.
    const expected = payload.base_revision ?? (await withDependencyErrors(() => this.repo.getDelimitation(projectId)))?.revision ?? 0;
    const result = await withDependencyErrors(() => this.repo.restoreVersionTransaction(
      projectId, versionId, userId, expected, payload.create_backup_of_current ?? true
    ));
    return {
      restoredFromVersion: result.target.version,
      backupVersion: result.backup?.version ?? null,
      backupCreated: result.backup_created,
      current: { delim: result.parent, include: result.children.filter(item => item.kind === "include"), exclude: result.children.filter(item => item.kind === "exclude") },
    };
  }
}
