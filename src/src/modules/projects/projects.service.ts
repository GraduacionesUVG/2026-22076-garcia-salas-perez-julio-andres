import { withDependencyErrors, normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { ProjectsRepo, type ProjectRole, type ProjectRow } from "./projects.repo";
import type { CreateProjectInput, UpdateProjectInput } from "./projects.schema";

export type ProjectWithRole = ProjectRow & {
  my_role: ProjectRole;
};

function internalError(message: string) {
  const error: any = new Error(message);
  error.status = 500;
  return error;
}

export class ProjectsService {
  constructor(private readonly repo: ProjectsRepo) {}

  async listForUser(userId: string): Promise<ProjectWithRole[]> {
    const rows = await withDependencyErrors(() => this.repo.listForUser(userId));

    return rows
      .map((row) => {
        if (!row.projects) return null;

        return {
          ...row.projects,
          my_role: row.role,
        };
      })
      .filter(Boolean) as ProjectWithRole[];
  }

  async createForUser(userId: string, input: CreateProjectInput): Promise<ProjectWithRole> {
    const project = await withDependencyErrors(() => this.repo.createForOwner({
      ownerId: userId,
      input,
    }));

    const role = (await withDependencyErrors(() => this.repo.getMembershipRole(project.id, userId))) ?? "owner";

    return {
      ...project,
      my_role: role,
    };
  }

  async getById(projectId: string, myRole: ProjectRole): Promise<ProjectWithRole | null> {
    const project = await withDependencyErrors(() => this.repo.getById(projectId));

    if (!project) return null;

    return {
      ...project,
      my_role: myRole,
    };
  }

  async updateById(
    projectId: string,
    myRole: ProjectRole,
    input: UpdateProjectInput
  ): Promise<ProjectWithRole | null> {
    const project = await withDependencyErrors(() => this.repo.updateById(projectId, input));

    if (!project) return null;

    return {
      ...project,
      my_role: myRole,
    };
  }

  async deleteById(projectId: string): Promise<void> {
    try {
      await withDependencyErrors(() => this.repo.deleteById(projectId));
    } catch (error: any) {
      const normalized = normalizeDependencyError(error);
      if (normalized !== error || typeof error?.status === "number" || typeof error?.code === "string") throw normalized;
      throw internalError(error?.message ?? "Delete failed");
    }
  }
}
