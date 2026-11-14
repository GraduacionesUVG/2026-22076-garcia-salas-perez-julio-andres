import { test, expect } from "@playwright/test";
import { registerAndLogin, logout } from "../helpers/auth";
import { createProject, deleteProject } from "../helpers/projects";
import { addItem, getDelimitation } from "../helpers/delimitation";

test.describe("Integration - delimitation items collection route", () => {
  test("POST /api/projects/:id/delimitation/items creates include and exclude items", async ({ request }) => {
    await registerAndLogin(request);

    const project = await createProject(request, "Items Project", "Desc");

    const inc = await addItem(request, project.id, "include", "Incluye 1");
    expect(inc.id).toBeTruthy();

    const exc = await addItem(request, project.id, "exclude", "Excluye 1");
    expect(exc.id).toBeTruthy();

    const d = await getDelimitation(request, project.id);
    expect(d.include.some((x: any) => x.id === inc.id)).toBe(true);
    expect(d.exclude.some((x: any) => x.id === exc.id)).toBe(true);

    await deleteProject(request, project.id);
    await logout(request);
  });
});