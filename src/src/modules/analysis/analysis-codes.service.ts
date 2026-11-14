import type {
  CodeCreateInput,
  CodeListQuery,
  CodeUpdateInput,
} from "./analysis-codes.schema";
import {
  AnalysisCodesRepo,
  type ProjectCodeRow,
} from "./analysis-codes.repo";

function makeServiceError(message: string, status = 400) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function normalizeCodeEventPayload(code: ProjectCodeRow): Record<string, unknown> {
  return {
    code_id: code.id,
    name: code.name,
    parent_code_id: code.parent_code_id,
    color: code.color,
    position: code.position,
    is_active: code.is_active,
    revision: code.revision,
  };
}

function getChangedCodeFields(params: {
  before: ProjectCodeRow;
  after: ProjectCodeRow;
}) {
  const { before, after } = params;
  const fields: Array<keyof ProjectCodeRow> = [
    "name",
    "description",
    "definition",
    "inclusion_criteria",
    "exclusion_criteria",
    "parent_code_id",
    "color",
    "position",
    "is_active",
    "metadata",
    "deleted_at",
  ];

  return fields.filter(
    (field) =>
      JSON.stringify(before[field] ?? null) !==
      JSON.stringify(after[field] ?? null)
  );
}

function isDescendantCode(params: {
  codes: ProjectCodeRow[];
  sourceCodeId: string;
  possibleDescendantId: string;
}) {
  const childMap = new Map<string, ProjectCodeRow[]>();

  params.codes.forEach((code) => {
    if (!code.parent_code_id) return;
    const bucket = childMap.get(code.parent_code_id) ?? [];
    bucket.push(code);
    childMap.set(code.parent_code_id, bucket);
  });

  const seen = new Set<string>();
  const stack = [...(childMap.get(params.sourceCodeId) ?? [])];

  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current.id)) continue;

    if (current.id === params.possibleDescendantId) {
      return true;
    }

    seen.add(current.id);
    stack.push(...(childMap.get(current.id) ?? []));
  }

  return false;
}

export class AnalysisCodesService {
  constructor(private readonly repo: AnalysisCodesRepo) {}

  async listByProject(
    projectId: string,
    query: CodeListQuery
  ): Promise<ProjectCodeRow[]> {
    return this.repo.listByProject(projectId, query);
  }

  async getById(params: {
    projectId: string;
    codeId: string;
  }): Promise<ProjectCodeRow | null> {
    return this.repo.getById(params);
  }

  async create(params: {
    projectId: string;
    input: CodeCreateInput;
    actorUserId: string;
  }): Promise<ProjectCodeRow> {
    const existing = await this.repo.getActiveByName({
      projectId: params.projectId,
      name: params.input.name,
    });

    if (existing) {
      throw makeServiceError("CODE_ALREADY_EXISTS", 409);
    }

    if (params.input.parent_code_id) {
      const parent = await this.repo.getById({
        projectId: params.projectId,
        codeId: params.input.parent_code_id,
      });

      if (!parent) {
        throw makeServiceError("CODE_NOT_FOUND", 404);
      }
    }

    const code = await this.repo.create(params);

    await this.repo.createEvent({
      projectId: params.projectId,
      codeId: code.id,
      eventType: "code_created",
      actorUserId: params.actorUserId,
      payload: normalizeCodeEventPayload(code),
    });

    return code;
  }

  async update(params: {
    projectId: string;
    codeId: string;
    input: CodeUpdateInput;
    actorUserId: string;
  }): Promise<ProjectCodeRow | null> {
    const current = await this.repo.getById({
      projectId: params.projectId,
      codeId: params.codeId,
    });

    if (!current) {
      return null;
    }

    if (current.revision !== params.input.base_revision) {
      throw makeServiceError("CODE_REVISION_CONFLICT", 409);
    }

    if (params.input.name !== undefined) {
      const existing = await this.repo.getActiveByName({
        projectId: params.projectId,
        name: params.input.name,
        excludeCodeId: params.codeId,
      });

      if (existing) {
        throw makeServiceError("CODE_ALREADY_EXISTS", 409);
      }
    }

    if (params.input.parent_code_id) {
      if (params.input.parent_code_id === params.codeId) {
        throw makeServiceError("CODE_NOT_FOUND", 404);
      }

      const parent = await this.repo.getById({
        projectId: params.projectId,
        codeId: params.input.parent_code_id,
      });

      if (!parent) {
        throw makeServiceError("CODE_NOT_FOUND", 404);
      }

      const allCodes = await this.repo.listByProject(params.projectId, {
        limit: 1000,
        offset: 0,
        include_deleted: false,
      });

      if (
        isDescendantCode({
          codes: allCodes,
          sourceCodeId: params.codeId,
          possibleDescendantId: params.input.parent_code_id,
        })
      ) {
        throw makeServiceError("CODE_PARENT_CYCLE", 409);
      }
    }

    const updated = await this.repo.update(params);

    if (!updated) {
      throw makeServiceError("CODE_REVISION_CONFLICT", 409);
    }

    await this.repo.createEvent({
      projectId: params.projectId,
      codeId: updated.id,
      eventType: "code_updated",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeCodeEventPayload(updated),
        changed_fields: getChangedCodeFields({
          before: current,
          after: updated,
        }),
      },
    });

    return updated;
  }

  async softDelete(params: {
    projectId: string;
    codeId: string;
    actorUserId: string;
  }): Promise<ProjectCodeRow | null> {
    const blockers = await this.repo.getDeletionBlockers({
      projectId: params.projectId,
      codeId: params.codeId,
    });

    if (blockers.activeChildren > 0) {
      throw makeServiceError("CODE_HAS_ACTIVE_CHILDREN", 409);
    }
    if (blockers.activeAssignments > 0) {
      throw makeServiceError("CODE_HAS_ACTIVE_ASSIGNMENTS", 409);
    }

    const code = await this.repo.softDelete(params);

    if (!code) {
      return null;
    }

    await this.repo.createEvent({
      projectId: params.projectId,
      codeId: code.id,
      eventType: "code_soft_deleted",
      actorUserId: params.actorUserId,
      payload: {
        ...normalizeCodeEventPayload(code),
        deleted: true,
      },
    });

    return code;
  }
}
