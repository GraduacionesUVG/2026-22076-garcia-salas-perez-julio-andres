import { test, expect } from "@playwright/test";
import { registerAndLogin, logout } from "../helpers/auth";
import { createProject, deleteProject } from "../helpers/projects";
import {
  addItem,
  deleteItem,
  getDelimitation,
  getDelimitationVersion,
  listDelimitationVersions,
  putDelimitation,
  restoreDelimitationVersion,
  saveDelimitationVersion,
} from "../helpers/delimitation";

test.describe("Integration - delimitation versions", () => {
  test("save, list, inspect and restore versions", async ({ request }) => {
    await registerAndLogin(request);

    const project = await createProject(
      request,
      "Versioned Delimitation",
      "Testing snapshots"
    );

    await putDelimitation(request, project.id, {
      topic: "Tema v1",
      context_place: "Guatemala",
      population: "Estudiantes",
      time_period: "2025",
      resources: "Bibliografía base",
    });

    const includeV1 = await addItem(request, project.id, "include", "Incluye entrevistas");
    await addItem(request, project.id, "exclude", "Excluye observación");

    const version1 = await saveDelimitationVersion(request, project.id, "Base v1");
    expect(version1.version_number).toBe(1);

    await putDelimitation(request, project.id, {
      topic: "Tema v2",
      context_place: "Guatemala ciudad",
      population: "Docentes",
      time_period: "2026",
      resources: "Nuevas fuentes",
    });

    await deleteItem(request, project.id, includeV1.id);
    await addItem(request, project.id, "include", "Incluye grupos focales");

    const version2 = await saveDelimitationVersion(request, project.id, "Ajuste v2");
    expect(version2.version_number).toBe(2);

    const versions = await listDelimitationVersions(request, project.id);
    expect(versions.length).toBe(2);
    expect(versions[0].version_number).toBe(2);
    expect(versions[1].version_number).toBe(1);

    const version1Detail = await getDelimitationVersion(request, project.id, version1.id);
    expect(version1Detail.delim.topic).toBe("Tema v1");
    expect(version1Detail.include.some((x: any) => x.text === "Incluye entrevistas")).toBe(true);
    expect(version1Detail.exclude.some((x: any) => x.text === "Excluye observación")).toBe(true);

    const restored = await restoreDelimitationVersion(request, project.id, version1.id);
    expect(restored.restoredFromVersion.version_number).toBe(1);
    expect(restored.backupVersion.version_number).toBe(3);
    expect(restored.current.delim.topic).toBe("Tema v1");
    expect(
      restored.current.include.some((x: any) => x.text === "Incluye entrevistas")
    ).toBe(true);

    const current = await getDelimitation(request, project.id);
    expect(current.delim.topic).toBe("Tema v1");
    expect(current.include.some((x: any) => x.text === "Incluye entrevistas")).toBe(true);
    expect(current.exclude.some((x: any) => x.text === "Excluye observación")).toBe(true);

    const versionsAfterRestore = await listDelimitationVersions(request, project.id);
    expect(versionsAfterRestore.length).toBe(3);

    await deleteProject(request, project.id);
    await logout(request);
  });
});