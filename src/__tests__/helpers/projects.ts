import { expect, type APIRequestContext } from "@playwright/test";

export async function createProject(
  request: APIRequestContext,
  name = "Test Project",
  description = "Test Description"
) {
  const res = await request.post("/api/projects", {
    data: { name, description },
  });

  const json = await res.json().catch(() => ({}));

  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  expect(json.project?.id).toBeTruthy();

  return json.project;
}

export async function listProjects(request: APIRequestContext) {
  const res = await request.get("/api/projects");
  const json = await res.json().catch(() => ({}));

  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  expect(Array.isArray(json.projects)).toBe(true);

  return json.projects;
}

export async function getProject(request: APIRequestContext, projectId: string) {
  const res = await request.get(`/api/projects/${projectId}`);
  const json = await res.json().catch(() => ({}));

  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  expect(json.project?.id).toBe(projectId);

  return json.project;
}

export async function updateProject(
  request: APIRequestContext,
  projectId: string,
  patch: { name?: string; description?: string | null }
) {
  const res = await request.patch(`/api/projects/${projectId}`, {
    data: patch,
  });

  const json = await res.json().catch(() => ({}));

  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  expect(json.project?.id).toBe(projectId);

  return json.project;
}

export async function deleteProject(request: APIRequestContext, projectId: string) {
  const res = await request.delete(`/api/projects/${projectId}`);

  if (res.status() === 204) {
    return;
  }

  const json = await res.json().catch(() => ({}));

  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
}