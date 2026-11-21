import { test, expect } from "@playwright/test";
import { registerAndLogin, logout } from "../helpers/auth";
import { createProject, deleteProject } from "../helpers/projects";
import { getDelimitation, putDelimitation } from "../helpers/delimitation";

test.describe("Integration - project delimitation routes", () => {
  test("GET /api/projects/:id/delimitation returns empty default structure", async ({ request }) => {
    await registerAndLogin(request);

    const project = await createProject(request, "Delimitation Project", "Desc");
    const data = await getDelimitation(request, project.id);

    expect(data.delim.project_id).toBe(project.id);
    expect(data.delim.topic).toBe("");
    expect(Array.isArray(data.include)).toBe(true);
    expect(Array.isArray(data.exclude)).toBe(true);

    await deleteProject(request, project.id);
    await logout(request);
  });

  test("PUT /api/projects/:id/delimitation updates delimitation", async ({ request }) => {
    await registerAndLogin(request);

    const project = await createProject(request, "Delimitation Update", "Desc");

    const updated = await putDelimitation(request, project.id, {
      topic: "Tema integración",
      context_place: "Guatemala",
      population: "Estudiantes",
      time_period: "2026",
      resources: "Bibliografía",
    });

    expect(updated.topic).toBe("Tema integración");
    expect(updated.context_place).toBe("Guatemala");
    expect(updated.population).toBe("Estudiantes");
    expect(updated.time_period).toBe("2026");
    expect(updated.resources).toBe("Bibliografía");

    const data = await getDelimitation(request, project.id);
    expect(data.delim.topic).toBe("Tema integración");

    await deleteProject(request, project.id);
    await logout(request);
  });
});