import { test, expect } from "@playwright/test";
import { registerAndLogin, assertAuthenticated, logout } from "../helpers/auth";
import { createProject, listProjects, deleteProject } from "../helpers/projects";

test.describe("Integration - projects collection routes", () => {
  test("POST /api/projects creates and GET /api/projects lists", async ({ request }) => {
    const auth = await registerAndLogin(request);
    await assertAuthenticated(request, auth.email);

    const project = await createProject(request, "Integration Project", "Integration Desc");
    expect(project.name).toBe("Integration Project");

    const projects = await listProjects(request);
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.some((p: any) => p.id === project.id)).toBe(true);

    await deleteProject(request, project.id);
    await logout(request);
  });
});