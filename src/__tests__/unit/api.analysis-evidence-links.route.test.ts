jest.mock("@/src/modules/projects/project.guard", () => ({ requireProjectRole: jest.fn() }));
import * as memos from "@/app/api/projects/[id]/analysis/memos/[memoId]/links/route";
import * as memoCollection from "@/app/api/projects/[id]/analysis/memos/route";
import * as insightCollection from "@/app/api/projects/[id]/analysis/insights/route";
import * as memoItem from "@/app/api/projects/[id]/analysis/memos/[memoId]/route";
import * as insightItem from "@/app/api/projects/[id]/analysis/insights/[insightId]/route";
import * as insights from "@/app/api/projects/[id]/analysis/insights/[insightId]/links/route";
import { DELETE as memoDELETE } from "@/app/api/projects/[id]/analysis/memos/[memoId]/links/[linkId]/route";
import { DELETE as insightDELETE } from "@/app/api/projects/[id]/analysis/insights/[insightId]/links/[linkId]/route";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { createRecordedSupabase } from "@/__tests__/backend/recorded-supabase";
const projectId = "11111111-1111-4111-8111-111111111111";
const actorId = "44444444-4444-4444-8444-444444444444";
const linkId = "55555555-5555-4555-8555-555555555555";
const targetId = "66666666-6666-4666-8666-666666666666";

describe.each([
 { key: "memo", collection: memoCollection, item: memoItem, id: "22222222-2222-4222-8222-222222222222", fields: { body: "Distinct note", memo_type: "analytic" }, input: { title: "Distinct memo", body: "", memo_type: "analytic", status: "draft", tags: [], metadata: { source: "memo" } } },
 { key: "insight", collection: insightCollection, item: insightItem, id: "33333333-3333-4333-8333-333333333333", fields: { summary: "Distinct summary", interpretation: "Distinct interpretation", insight_type: "pattern", confidence: "high" }, input: { title: "Distinct insight", summary: "", interpretation: "Explanation", insight_type: "pattern", confidence: "high", status: "draft", tags: [], metadata: { source: "insight" } } },
])("$key entity actual handler contracts", ({ key, collection, item, id, fields, input }) => {
 const row = { id, project_id: projectId, title: input.title, ...fields, status: "draft", tags: ["specific"], metadata: { source: key }, revision: 0, deleted_at: null, created_at: "2026-10-04T01:02:03Z", updated_at: "2026-10-04T04:05:06Z", created_by: actorId, updated_by: actorId };
 const ctx = () => ({ params: Promise.resolve({ id: projectId, memoId: id, insightId: id }) });
 function setup(bodies: unknown[]) {
  const db = createRecordedSupabase(bodies.map(body => ({ status: 200, body })));
  jest.mocked(requireProjectRole).mockResolvedValue({ supabase: db.client, user: { id: actorId } } as never); return db;
 }
 const req = (body?: unknown) => new Request("https://app.example.test/entity", body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
 function scope(url: URL) { expect(url.searchParams.get("project_id")).toBe("eq." + projectId); expect(url.searchParams.get("id")).toBe("eq." + id); }
 it("creates complete domain input, response and exact actor audit", async () => {
  const db = setup([row, null]);
  const response = await collection.POST(req(input), ctx());
  expect(response.status).toBe(201); expect(await response.json()).toEqual({ ok: true, [key]: row });
  expect(requireProjectRole).toHaveBeenCalledWith(projectId, ["owner", "editor"]);
  expect(db.requests[0].body).toEqual({ ...input, project_id: projectId, created_by: actorId, updated_by: actorId });
  expect(db.requests[1].body).toEqual({ project_id: projectId, entity_type: key, entity_id: id, event_type: key + "_created", created_by: actorId, event_payload: { [key + "_id"]: id, title: row.title, [key + "_type"]: fields[key + "_type" as keyof typeof fields], ...(key === "insight" ? { confidence: "high" } : {}), status: "draft", tags: ["specific"], revision: 0 } }); db.assertDrained();
 });
 it("rejects empty entity creation without query/audit", async () => {
  const db = setup([]);
  const response = await collection.POST(req({}), ctx());
  expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: "VALIDATION_ERROR", details: expect.objectContaining({ fieldErrors: { title: expect.any(Array) }, formErrors: [] }) }); expect(db.requests).toEqual([]); db.assertDrained();
 });
 it.each([false, true])("item read missing=%s preserves payload and scoping", async missing => {
  const db = setup([missing ? null : row]); const response = await item.GET(req(), ctx());
  expect(response.status).toBe(missing ? 404 : 200);
  expect(await response.json()).toEqual(missing ? { ok: false, error: key.toUpperCase() + "_NOT_FOUND" } : { ok: true, [key]: row });
  expect(requireProjectRole).toHaveBeenCalledWith(projectId, ["owner", "editor", "viewer"]); scope(db.requests[0].url); db.assertDrained();
 });
 it("patches revision zero with empty tags and full response/audit", async () => {
  const updated = { ...row, title: "Updated title", tags: [], revision: 1 };
  const db = setup([row, updated, null]); const response = await item.PATCH(req({ base_revision: 0, title: " Updated title ", tags: [] }), ctx());
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, [key]: updated });
  expect(requireProjectRole).toHaveBeenCalledWith(projectId, ["owner", "editor"]);
  scope(db.requests[0].url); scope(db.requests[1].url);
  expect(db.requests[1].url.searchParams.get("revision")).toBe("eq.0");
  expect(db.requests[1].body).toEqual({ title: "Updated title", tags: [], updated_by: actorId });
  expect(db.requests[2].body).toEqual({ project_id: projectId, entity_type: key, entity_id: id, event_type: key + "_updated", created_by: actorId, event_payload: { [key + "_id"]: id, title: updated.title, [key + "_type"]: fields[key + "_type" as keyof typeof fields], ...(key === "insight" ? { confidence: "high" } : {}), status: "draft", tags: [], revision: 1, changed_fields: ["title", "tags"] } }); db.assertDrained();
 });
 it("rejects stale patch before write/audit", async () => {
  const db = setup([{ ...row, revision: 4 }]); const response = await item.PATCH(req({ base_revision: 0, title: "Stale" }), ctx());
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ ok: false, error: key.toUpperCase() + "_REVISION_CONFLICT" });
  expect(db.requests).toHaveLength(1); expect(db.requests[0].method).toBe("GET"); scope(db.requests[0].url); db.assertDrained();
 });
 it.each([false, true])("item soft-delete missing=%s uses exact scoped actor write", async missing => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-04T12:00:00.000Z"));
  try {
   const deleted = { ...row, deleted_at: "2026-10-04T12:00:00.000Z" };
   const db = setup(missing ? [null] : [deleted, null]); const response = await item.DELETE(req(), ctx());
   expect(response.status).toBe(missing ? 404 : 200); expect(await response.json()).toEqual(missing ? { ok: false, error: key.toUpperCase() + "_NOT_FOUND" } : { ok: true, [key]: deleted });
   expect(requireProjectRole).toHaveBeenCalledWith(projectId, ["owner", "editor"]);
   scope(db.requests[0].url); expect(db.requests[0].body).toEqual({ deleted_at: "2026-10-04T12:00:00.000Z", updated_by: actorId });
   if (!missing) expect(db.requests[1].body).toEqual({ project_id: projectId, entity_type: key, entity_id: id, event_type: key + "_soft_deleted", created_by: actorId, event_payload: { [key + "_id"]: id, title: row.title, [key + "_type"]: fields[key + "_type" as keyof typeof fields], ...(key === "insight" ? { confidence: "high" } : {}), status: "draft", tags: ["specific"], revision: 0, deleted: true } });
   expect(db.requests).toHaveLength(missing ? 1 : 2); db.assertDrained();
  } finally { jest.useRealTimers(); }
 });
});

describe.each([
 { domain: "MEMO", key: "memo", parent: "22222222-2222-4222-8222-222222222222", routes: memos, DELETE: memoDELETE },
 { domain: "INSIGHT", key: "insight", parent: "33333333-3333-4333-8333-333333333333", routes: insights, DELETE: insightDELETE },
])("$domain actual evidence handlers/service/repository", ({ domain, key, parent, routes, DELETE }) => {
 const ctx = () => ({ params: Promise.resolve({ id: projectId, memoId: parent, insightId: parent, linkId }) });
 const parentRow = { id: parent, project_id: projectId, title: "Distinct parent", revision: 0 };
 const link = { id: linkId, project_id: projectId, [key + "_id"]: parent, link_type: "document", document_id: targetId, segment_id: null, code_id: null, participant_id: null, ...(key === "insight" ? { memo_id: null } : {}), created_at: "2026-10-04T02:03:04Z", created_by: actorId };
 function setup(bodies: unknown[]) {
  const db = createRecordedSupabase(bodies.map(body => ({ status: 200, body })));
  jest.mocked(requireProjectRole).mockResolvedValue({ supabase: db.client, user: { id: actorId } } as never);
  return db;
 }
 function request(body?: string) { return new Request("https://app.example.test/evidence", body === undefined ? {} : { method: "POST", body }); }
 it("lists full distinctive links and scopes parent and link queries", async () => {
  const db = setup([parentRow, [link], ...(key === "insight" ? [[{ id: targetId, title: "Entrevista de campo" }]] : [])]);
  const response = await routes.GET(request(), ctx());
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, links: [{ ...link, ...(key === "insight" ? { target_label: "Entrevista de campo" } : {}) }] });
  expect(requireProjectRole).toHaveBeenCalledWith(projectId, ["owner", "editor", "viewer"]);
  expect(db.requests[0].url.searchParams.get("id")).toBe("eq." + parent);
  expect(db.requests[1].url.searchParams.get(key + "_id")).toBe("eq." + parent);
  for (const r of db.requests) expect(r.url.searchParams.get("project_id")).toBe("eq." + projectId);
  if (key === "insight") {
    expect(db.requests[2].url.pathname).toBe("/rest/v1/project_documents");
    expect(db.requests[2].url.searchParams.get("id")).toBe(`in.(${targetId})`);
    expect(db.requests[2].url.searchParams.get("deleted_at")).toBe("is.null");
  }
  db.assertDrained();
 });
 it("creates typed evidence and pins actor and exact audit payload", async () => {
  const db = setup([parentRow, { id: targetId }, link, null]);
  const response = await routes.POST(request(JSON.stringify({ link_type: "document", document_id: targetId })), ctx());
  expect(response.status).toBe(201); expect(await response.json()).toEqual({ ok: true, link });
  expect(requireProjectRole).toHaveBeenCalledWith(projectId, ["owner", "editor"]);
  const insert = Object.fromEntries(Object.entries(link).filter(([key]) => key !== "id" && key !== "created_at"));
  expect(db.requests[2].body).toEqual(insert);
  expect(db.requests[1].url.searchParams.get("id")).toBe("eq." + targetId);
  expect(db.requests[1].url.searchParams.get("deleted_at")).toBe("is.null");
  expect(db.requests[3].body).toEqual({ project_id: projectId, entity_type: key + "_link", entity_id: linkId, event_type: key + "_link_created", created_by: actorId, event_payload: { [key + "_link_id"]: linkId, [key + "_id"]: parent, link_type: "document", document_id: targetId, segment_id: null, code_id: null, participant_id: null, ...(key === "insight" ? { memo_id: null } : {}) } });
  db.assertDrained();
 });
 it("returns missing parent 404 and never reads evidence", async () => {
  const db = setup([null]);
  const response = await routes.GET(request(), ctx());
  expect(response.status).toBe(404); expect(await response.json()).toEqual({ ok: false, error: domain + "_NOT_FOUND" });
  expect(db.requests).toHaveLength(1); db.assertDrained();
 });
 it("rejects removed/wrong-project target without link write or audit", async () => {
  const db = setup([parentRow, null]);
  const response = await routes.POST(request(JSON.stringify({ link_type: "document", document_id: targetId })), ctx());
  expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: "INVALID_LINK_TARGET" });
  expect(db.requests).toHaveLength(2);
  expect(db.requests.every(r => r.method === "GET")).toBe(true);
  expect(db.requests[1].url.searchParams.get("project_id")).toBe("eq." + projectId); db.assertDrained();
 });
 it("deletes only exact scoped evidence and pins returned payload and audit", async () => {
  const db = setup([link, null, null]);
  const response = await DELETE(request(), ctx());
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, link });
  expect(requireProjectRole).toHaveBeenCalledWith(projectId, ["owner", "editor"]);
  expect(db.requests[1].method).toBe("DELETE");
  for (const r of db.requests.slice(0, 2)) {
   expect(r.url.searchParams.get("project_id")).toBe("eq." + projectId);
   expect(r.url.searchParams.get(key + "_id")).toBe("eq." + parent);
   expect(r.url.searchParams.get("id")).toBe("eq." + linkId);
  }
  expect(db.requests[2].body).toEqual({ project_id: projectId, entity_type: key + "_link", entity_id: linkId, event_type: key + "_link_deleted", created_by: actorId, event_payload: { [key + "_link_id"]: linkId, [key + "_id"]: parent, link_type: "document", document_id: targetId, segment_id: null, code_id: null, participant_id: null, ...(key === "insight" ? { memo_id: null } : {}), deleted: true } });
  db.assertDrained();
 });
 it("does not mutate or audit missing evidence", async () => {
  const db = setup([null]);
  const response = await DELETE(request(), ctx());
  expect(response.status).toBe(404); expect(await response.json()).toEqual({ ok: false, error: domain + "_LINK_NOT_FOUND" });
  expect(db.requests).toHaveLength(1); expect(db.requests[0].method).toBe("GET"); db.assertDrained();
 });
 it("rejects malformed JSON after writer guard without querying data", async () => {
  const db = setup([]);
  const response = await routes.POST(request("{"), ctx());
  expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: "Invalid JSON body" });
  expect(requireProjectRole).toHaveBeenCalledWith(projectId, ["owner", "editor"]); expect(db.requests).toEqual([]); db.assertDrained();
 });
 it.each([{}, null, [], { link_type: "unknown", document_id: targetId }, { link_type: "document", document_id: "invalid" }, { link_type: "document", segment_id: targetId }])("rejects invalid typed input %p without query or audit", async body => {
  const db = setup([]);
  const response = await routes.POST(request(JSON.stringify(body)), ctx());
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ ok: false, error: "VALIDATION_ERROR", details: expect.objectContaining({ formErrors: expect.any(Array), fieldErrors: expect.any(Object) }) });
  expect(db.requests).toEqual([]); db.assertDrained();
 });
 it.each([
  { code: "23505", status: 409, expected: domain + "_LINK_ALREADY_EXISTS" },
  { code: "57014", status: 503, expected: "DEPENDENCY_UNAVAILABLE" },
 ])("translates rejected insert $code without retry or success audit", async ({ code, status, expected }) => {
  const db = createRecordedSupabase([{ status: 200, body: parentRow }, { status: 200, body: { id: targetId } }, { status: code === "23505" ? 409 : 500, body: { code, message: "private diagnostic", details: "secret SQL", hint: "provider-secret" } }]);
  jest.mocked(requireProjectRole).mockResolvedValue({ supabase: db.client, user: { id: actorId } } as never);
  const response = await routes.POST(request(JSON.stringify({ link_type: "document", document_id: targetId })), ctx());
  expect(response.status).toBe(status); expect(await response.json()).toEqual({ ok: false, error: expected });
  expect(db.requests).toHaveLength(3); expect(db.requests[2].method).toBe("POST"); db.assertDrained();
 });
});
