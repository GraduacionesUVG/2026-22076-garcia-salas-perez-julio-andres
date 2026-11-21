import { withDependencyErrors } from "@/src/modules/security/dependency-errors";
import { createHash } from "crypto";
import {
  SampleConfigRepo,
  type SampleCollectionTechniqueRow,
  type SampleConfigRow,
  type SampleConfigVersionRow,
  type SampleConfigVersionTechniqueRow,
  type SampleOptionRow,
  type SampleParticipantSummaryRow,
} from "./sample-config.repo";
import type {
  SampleConfigCreateVersion,
  SampleConfigRestoreVersion,
  SampleConfigSave,
} from "./sample-config.schema";

export type SampleConfigFullPayload = {
  config: SampleConfigRow & { actual_sample_size: number };
  collection_techniques: SampleCollectionTechniqueRow[];
  participant_groups: Array<{ label: string; count: number }>;
};

export type SampleConfigOptionsPayload = {
  main_approaches: SampleOptionRow[];
  scopes: SampleOptionRow[];
  collection_technique_options: SampleOptionRow[];
};

export type SampleConfigVersionSnapshotPayload = {
  main_approach_code: string | null;
  scope_code: string | null;
  field_phase: string;
  target_sample_size: number | null;
  sample_size_rationale: string;
  collection_techniques: Array<{
    id: string;
    technique_code: string | null;
    custom_label: string | null;
    is_custom: boolean;
    position: number;
  }>;
};

export type SampleConfigVersionDetail = {
  version: SampleConfigVersionRow;
  techniques: SampleConfigVersionTechniqueRow[];
};

export type SampleConfigVersionPayload = {
  id: string;
  project_id: string;
  version_number: number;
  label: string | null;
  created_by: string | null;
  created_at: string;
  trigger_type: SampleConfigVersionRow["trigger_type"];
  content_hash: string | null;
  snapshot: SampleConfigVersionSnapshotPayload;
};

export type SampleConfigCreateVersionResult = {
  version: SampleConfigVersionPayload;
  created: boolean;
  reason: "duplicate_snapshot" | null;
};

export type SampleConfigRestorePayload = {
  restored_from_version: SampleConfigVersionPayload;
  backup_version: SampleConfigVersionPayload | null;
  backup_created: boolean;
  current: SampleConfigFullPayload;
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

function normalizeSampleConfig(
  projectId: string,
  config: SampleConfigRow | null,
  actualSampleSize: number
): SampleConfigRow & { actual_sample_size: number } {
  const normalized =
    config ?? {
      project_id: projectId,
      main_approach_code: null,
      scope_code: null,
      field_phase: "",
      target_sample_size: null,
      sample_size_rationale: "",
      revision: 0,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      created_by: null,
      updated_by: null,
    };

  return { ...normalized, actual_sample_size: actualSampleSize };
}

function participantGroupLabel(participant: SampleParticipantSummaryRow): string {
  const attributes =
    participant.attributes && typeof participant.attributes === "object"
      ? participant.attributes
      : {};

  for (const key of ["sample_group", "participant_type", "community"]) {
    const value = attributes[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return participant.display_name?.trim() || participant.alias.trim() || "Sin grupo";
}

function buildParticipantGroups(
  participants: SampleParticipantSummaryRow[]
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();

  for (const participant of participants) {
    if (participant.status === "withdrawn" || participant.status === "archived") {
      continue;
    }

    const label = participantGroupLabel(participant);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function buildSnapshotHash(data: {
  config: SampleConfigRow;
  collection_techniques: Array<{
    technique_code: string | null;
    custom_label: string | null;
    is_custom: boolean;
    position: number;
  }>;
}): string {
  const canonical = {
    main_approach_code: data.config.main_approach_code ?? null,
    scope_code: data.config.scope_code ?? null,
    field_phase: (data.config.field_phase ?? "").trim(),
    target_sample_size: data.config.target_sample_size ?? null,
    sample_size_rationale: (data.config.sample_size_rationale ?? "").trim(),
    collection_techniques: [...data.collection_techniques]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        technique_code: item.technique_code ?? null,
        custom_label: normalizeOptionalText(item.custom_label),
        is_custom: item.is_custom,
        position: item.position,
      })),
  };

  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

function hasMeaningfulSampleContent(data: SampleConfigFullPayload): boolean {
  return (
    !!data.config.main_approach_code ||
    !!data.config.scope_code ||
    (data.config.field_phase ?? "").trim().length > 0 ||
    data.config.target_sample_size !== null ||
    (data.config.sample_size_rationale ?? "").trim().length > 0 ||
    data.collection_techniques.length > 0
  );
}

export class SampleConfigService {
  constructor(private readonly repo: SampleConfigRepo) {}

  async getFull(projectId: string): Promise<SampleConfigFullPayload> {
    const [config, collectionTechniques, participants] = await Promise.all([
      withDependencyErrors(() => this.repo.getSampleConfig(projectId)),
      withDependencyErrors(() => this.repo.getCollectionTechniques(projectId)),
      withDependencyErrors(() => this.repo.getSampleParticipants(projectId)),
    ]);

    const activeParticipants = participants.filter(
      (participant) =>
        participant.status !== "withdrawn" && participant.status !== "archived"
    );

    return {
      config: normalizeSampleConfig(projectId, config, activeParticipants.length),
      collection_techniques: collectionTechniques,
      participant_groups: buildParticipantGroups(participants),
    };
  }

  async getOptions(): Promise<SampleConfigOptionsPayload> {
    const [main_approaches, scopes, collection_technique_options] =
      await Promise.all([
        withDependencyErrors(() => this.repo.getMainApproachOptions()),
        withDependencyErrors(() => this.repo.getScopeOptions()),
        withDependencyErrors(() => this.repo.getCollectionTechniqueOptions()),
      ]);

    return {
      main_approaches,
      scopes,
      collection_technique_options,
    };
  }

  async update(
    projectId: string,
    payload: SampleConfigSave,
    options?: MutationActorOptions
  ): Promise<SampleConfigFullPayload> {
    const {
      base_revision,
      collection_techniques,
      ...patch
    } = payload;

    await withDependencyErrors(() => this.repo.saveSampleConfigWithRevision(
      projectId,
      patch,
      base_revision,
      options?.actorUserId ?? null
    ));

    if (collection_techniques) {
      await withDependencyErrors(() => this.repo.replaceCollectionTechniques(
        projectId,
        collection_techniques,
        options?.actorUserId ?? null
      ));
    }

    return this.getFull(projectId);
  }

  private buildVersionSnapshot(
    version: SampleConfigVersionRow,
    techniques: SampleConfigVersionTechniqueRow[]
  ): SampleConfigVersionSnapshotPayload {
    return {
      main_approach_code: version.snapshot_main_approach_code ?? null,
      scope_code: version.snapshot_scope_code ?? null,
      field_phase: version.snapshot_field_phase ?? "",
      target_sample_size: version.snapshot_target_sample_size ?? null,
      sample_size_rationale: version.snapshot_sample_size_rationale ?? "",
      collection_techniques: [...techniques]
        .sort((a, b) => a.position - b.position)
        .map((item) => ({
          id: item.id,
          technique_code: item.technique_code ?? null,
          custom_label: item.custom_label ?? null,
          is_custom: item.is_custom,
          position: item.position,
        })),
    };
  }

  private toVersionPayload(
    detail: SampleConfigVersionDetail
  ): SampleConfigVersionPayload {
    return {
      id: detail.version.id,
      project_id: detail.version.project_id,
      version_number: detail.version.version_number,
      label: detail.version.label ?? null,
      created_by: detail.version.created_by ?? null,
      created_at: detail.version.created_at,
      trigger_type: detail.version.trigger_type,
      content_hash: detail.version.content_hash ?? null,
      snapshot: this.buildVersionSnapshot(detail.version, detail.techniques),
    };
  }

  async listVersions(projectId: string): Promise<SampleConfigVersionPayload[]> {
    const versions = await withDependencyErrors(() => this.repo.listVersions(projectId));
    const versionIds = versions.map((version) => version.id);
    const techniques = await withDependencyErrors(() => this.repo.getVersionTechniquesForVersions(versionIds));
    const techniquesByVersionId = new Map<
      string,
      SampleConfigVersionTechniqueRow[]
    >();

    for (const technique of techniques) {
      const group = techniquesByVersionId.get(technique.version_id) ?? [];
      group.push(technique);
      techniquesByVersionId.set(technique.version_id, group);
    }

    return versions.map((version) =>
      this.toVersionPayload({
        version,
        techniques: techniquesByVersionId.get(version.id) ?? [],
      })
    );
  }

  async getVersion(
    projectId: string,
    versionId: string
  ): Promise<SampleConfigVersionDetail> {
    const version = await withDependencyErrors(() => this.repo.getVersionById(projectId, versionId));

    if (!version) {
      throw notFoundError("SAMPLE_CONFIG_VERSION_NOT_FOUND");
    }

    const techniques = await withDependencyErrors(() => this.repo.getVersionTechniques(version.id));

    return {
      version,
      techniques,
    };
  }

  async createVersion(
    projectId: string,
    payload: SampleConfigCreateVersion,
    options?: MutationActorOptions
  ): Promise<SampleConfigCreateVersionResult> {
    const current = await this.getFull(projectId);

    if (!hasMeaningfulSampleContent(current)) {
      throw badRequestError("SAMPLE_CONFIG_NOTHING_TO_SNAPSHOT");
    }

    const contentHash = buildSnapshotHash({
      config: current.config,
      collection_techniques: current.collection_techniques.map((item) => ({
        technique_code: item.technique_code,
        custom_label: item.custom_label,
        is_custom: item.is_custom,
        position: item.position,
      })),
    });

    const creation = await withDependencyErrors(() => this.repo.createVersionSnapshot(
      projectId,
      {
        label: normalizeOptionalText(payload.label),
        trigger_type: payload.trigger_type ?? "manual",
        content_hash: contentHash,
        snapshot_main_approach_code: current.config.main_approach_code ?? null,
        snapshot_scope_code: current.config.scope_code ?? null,
        snapshot_field_phase: current.config.field_phase ?? "",
        snapshot_target_sample_size: current.config.target_sample_size ?? null,
        snapshot_sample_size_rationale:
          current.config.sample_size_rationale ?? "",
        collection_techniques: current.collection_techniques.map((item) => ({
          technique_code: item.technique_code ?? null,
          custom_label: item.custom_label ?? null,
          is_custom: item.is_custom,
          position: item.position,
        })),
      },
      options?.actorUserId ?? null
    ));

    const techniques = await withDependencyErrors(() => this.repo.getVersionTechniques(creation.version.id));

    return {
      version: this.toVersionPayload({ version: creation.version, techniques }),
      created: creation.created,
      reason: creation.created ? null : "duplicate_snapshot",
    };
  }

  async restoreVersion(
    projectId: string, versionId: string, payload: SampleConfigRestoreVersion, options?: MutationActorOptions
  ): Promise<SampleConfigRestorePayload> {
    const expected = payload.base_revision ?? (await withDependencyErrors(() => this.repo.getSampleConfig(projectId)))?.revision ?? 0;
    // Participant aggregates are not workflow state. Read them before the write so their failure cannot mask a committed restore.
    const participants = await withDependencyErrors(() => this.repo.getSampleParticipants(projectId));
    const result = await withDependencyErrors(() => this.repo.restoreVersionTransaction(
      projectId, versionId, options?.actorUserId ?? null, expected, payload.create_backup_of_current ?? true
    ));
    return {
      restored_from_version: this.toVersionPayload({ version: result.target.version, techniques: result.target.children }),
      backup_version: result.backup ? this.toVersionPayload({ version: result.backup.version, techniques: result.backup.children }) : null,
      backup_created: result.backup_created,
      current: {
        config: normalizeSampleConfig(projectId, result.parent, participants.filter(p => p.status !== "withdrawn" && p.status !== "archived").length),
        collection_techniques: result.children,
        participant_groups: buildParticipantGroups(participants),
      },
    };
  }
}
