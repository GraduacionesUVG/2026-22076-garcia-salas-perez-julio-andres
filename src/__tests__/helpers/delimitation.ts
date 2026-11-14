import { expect, type APIRequestContext } from "@playwright/test";

export async function getDelimitation(request: APIRequestContext, projectId: string) {
  const res = await request.get(`/api/projects/${projectId}/delimitation`);
  const json = await res.json().catch(() => ({}));
  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  return json.data;
}

export async function putDelimitation(
  request: APIRequestContext,
  projectId: string,
  patch: any
) {
  const res = await request.put(`/api/projects/${projectId}/delimitation`, {
    data: patch,
  });
  const json = await res.json().catch(() => ({}));
  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  return json.data;
}

export async function addItem(
  request: APIRequestContext,
  projectId: string,
  kind: "include" | "exclude",
  text: string
) {
  const res = await request.post(`/api/projects/${projectId}/delimitation/items`, {
    data: { kind, text },
  });
  const json = await res.json().catch(() => ({}));
  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  return json.data;
}

export async function patchItem(
  request: APIRequestContext,
  projectId: string,
  itemId: string,
  text: string
) {
  const res = await request.patch(
    `/api/projects/${projectId}/delimitation/items/${itemId}`,
    {
      data: { text },
    }
  );
  const json = await res.json().catch(() => ({}));
  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  return json.data;
}

export async function deleteItem(
  request: APIRequestContext,
  projectId: string,
  itemId: string
) {
  const res = await request.delete(
    `/api/projects/${projectId}/delimitation/items/${itemId}`
  );
  expect(res.status()).toBe(204);
}

export async function saveDelimitationVersion(
  request: APIRequestContext,
  projectId: string,
  label?: string | null
) {
  const res = await request.post(`/api/projects/${projectId}/delimitation/versions`, {
    data: label === undefined ? {} : { label },
  });
  const json = await res.json().catch(() => ({}));
  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  expect(json.version?.id).toBeTruthy();
  return json.version;
}

export async function listDelimitationVersions(
  request: APIRequestContext,
  projectId: string
) {
  const res = await request.get(`/api/projects/${projectId}/delimitation/versions`);
  const json = await res.json().catch(() => ({}));
  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  expect(Array.isArray(json.versions)).toBe(true);
  return json.versions;
}

export async function getDelimitationVersion(
  request: APIRequestContext,
  projectId: string,
  versionId: string
) {
  const res = await request.get(
    `/api/projects/${projectId}/delimitation/versions/${versionId}`
  );
  const json = await res.json().catch(() => ({}));
  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  expect(json.data?.version?.id).toBe(versionId);
  return json.data;
}

export async function restoreDelimitationVersion(
  request: APIRequestContext,
  projectId: string,
  versionId: string
) {
  const res = await request.post(
    `/api/projects/${projectId}/delimitation/versions/${versionId}/restore`
  );
  const json = await res.json().catch(() => ({}));
  expect(res.ok()).toBeTruthy();
  expect(json.ok).toBe(true);
  expect(json.data?.restoredFromVersion?.id).toBe(versionId);
  expect(json.data?.backupVersion?.id).toBeTruthy();
  return json.data;
}