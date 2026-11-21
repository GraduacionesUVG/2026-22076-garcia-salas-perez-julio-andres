import { test, expect } from "@playwright/test";
import { registerAndLogin, logout } from "../helpers/auth";
import {
  createProject,
  getProject,
  updateProject,
  deleteProject,
  listProjects,
} from "../helpers/projects";

test.describe("Integration - project item routes", () => {
  test("GET /api/projects/:id returns project", async ({ request }) => {
    await registerAndLogin(request);

    const project = await createProject(request, "Read Project", "Read Desc");
    const fetched = await getProject(request, project.id);

    expect(fetched.id).toBe(project.id);
    expect(fetched.name).toBe("Read Project");

    await deleteProject(request, project.id);
    await logout(request);
  });

  test("PATCH /api/projects/:id updates name and description", async ({ request }) => {
    await registerAndLogin(request);

    const project = await createProject(request, "Before", "Before desc");

    const updated = await updateProject(request, project.id, {
      name: "After",
      description: "After desc",
    });

    expect(updated.name).toBe("After");
    expect(updated.description).toBe("After desc");

    await deleteProject(request, project.id);
    await logout(request);
  });

  test("DELETE /api/projects/:id removes project", async ({ request }) => {
    await registerAndLogin(request);

    const project = await createProject(request, "To delete", "Delete desc");
    await deleteProject(request, project.id);

    const projects = await listProjects(request);
    expect(projects.some((p: any) => p.id === project.id)).toBe(false);

    await logout(request);
  });
});