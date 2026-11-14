import {
  SUPABASE_FAILURE_CASES,
  captureRejection,
  expectSafeDependencyFailure,
  freshProviderFailure,
} from "@/__tests__/backend/supabase-failure-cases";
import { ProjectsService } from "@/src/modules/projects/projects.service";

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    createForOwner: jest.fn(),
    getMembershipRole: jest.fn(),
    listForUser: jest.fn(),
    getById: jest.fn(),
    updateById: jest.fn(),
    deleteById: jest.fn(),
    ...overrides,
  };
}

describe("ProjectsService dependency failures", () => {
  it("retains database error codes across deletion for existing mappings", async () => {
    const error = { code: "23505", message: "duplicate key" };
    const repo = makeRepo({ deleteById: jest.fn().mockRejectedValue(error) });
    await expect(new ProjectsService(repo as never).deleteById("project-1")).rejects.toBe(error);
  });
  it.each(SUPABASE_FAILURE_CASES)("normalizes $name before delete wrapper loses status", async (fixture) => {
    const repo = makeRepo({ deleteById: jest.fn().mockRejectedValue(freshProviderFailure(fixture)) });
    await expect(new ProjectsService(repo as never).deleteById("project-1")).rejects.toMatchObject({ status: 503, message: "DEPENDENCY_UNAVAILABLE" });
    expect(repo.deleteById).toHaveBeenCalledTimes(1);
  });
  it.each([400, 401, 403, 404, 409, 410])("preserves domain %i at create and delete boundaries", async (status) => {
    const error = Object.assign(new Error("DOMAIN_FAILURE"), { status });
    const repo = makeRepo({ createForOwner: jest.fn().mockRejectedValue(error), deleteById: jest.fn().mockRejectedValue(error) });
    const service = new ProjectsService(repo as never);
    await expect(service.createForUser("user-1", { name: "Project", description: null, is_active: true })).rejects.toBe(error);
    await expect(service.deleteById("project-1")).rejects.toBe(error);
  });
  it.each(SUPABASE_FAILURE_CASES)(
    "RED: translates $name before reading the new membership",
    async (failureCase) => {
      const repo = makeRepo({
        createForOwner: jest
          .fn()
          .mockRejectedValue(freshProviderFailure(failureCase)),
      });
      const service = new ProjectsService(repo as never);

      const observed = await captureRejection(
        service.createForUser("user-1", {
          name: "Proyecto temporal",
          description: null,
          is_active: true,
        })
      );

      expectSafeDependencyFailure(observed, failureCase);
      expect(repo.getMembershipRole).not.toHaveBeenCalled();
    }
  );
});
