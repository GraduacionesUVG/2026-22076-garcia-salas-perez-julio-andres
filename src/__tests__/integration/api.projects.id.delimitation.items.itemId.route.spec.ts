import { test, expect } from "@playwright/test";
import { registerAndLogin, logout } from "../helpers/auth";
import { createProject, deleteProject } from "../helpers/projects";
import { addItem, patchItem, deleteItem, getDelimitation } from "../helpers/delimitation";

test.describe("Integration - delimitation item routes", () => {
  test("PATCH /api/projects/:id/delimitation/items/:itemId edits item text", async ({ request }) => {
    await registerAndLogin(request);
    const project = await createProject(request, "Patch Item Project", "Desc");

    const item = await addItem(request, project.id, "include", "Original");
    const updated = await patchItem(request, project.id, item.id, "Editado");

    expect(updated.text).toBe("Editado");

    const d = await getDelimitation(request, project.id);
    expect(d.include.find((x: any) => x.id === item.id)?.text).toBe("Editado");

    await deleteProject(request, project.id);
    await logout(request);
  });

  test("DELETE /api/projects/:id/delimitation/items/:itemId removes item", async ({ request }) => {
    await registerAndLogin(request);
    const project = await createProject(request, "Delete Item Project", "Desc");

    const item = await addItem(request, project.id, "exclude", "Borrar");
    await deleteItem(request, project.id, item.id);

    const d = await getDelimitation(request, project.id);
    expect(d.exclude.some((x: any) => x.id === item.id)).toBe(false);

    await deleteProject(request, project.id);
    await logout(request);
  });
});