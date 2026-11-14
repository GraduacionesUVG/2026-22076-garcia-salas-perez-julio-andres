import { AnalysisInsightsRepo } from "@/src/modules/analysis/analysis-insights.repo";
import { createRecordedSupabase } from "@/__tests__/backend/recorded-supabase";
import { InsightCreateSchema, InsightListQuerySchema } from "@/src/modules/analysis/analysis-insights.schema";
const projectId = "11111111-1111-4111-8111-111111111111";
const entityId = "33333333-2222-4222-8222-222222222222";
const actorUserId = "44444444-4444-4444-8444-444444444444";
const linkId = "55555555-5555-4555-8555-555555555555";
const targetId = "66666666-6666-4666-8666-666666666666";
const row = { id: entityId, project_id: projectId, title: "Distinct insight", summary: "independent summary", interpretation: "independent interpretation", insight_type: "pattern", confidence: "medium", status: "draft", tags: ["specific"], metadata: { source: "insight" }, revision: 0, created_at: "2026-10-04T01:02:03Z", updated_at: "2026-10-04T04:05:06Z", deleted_at: null, created_by: actorUserId, updated_by: actorUserId };
const params = { projectId, insightId: entityId };
function setup(bodies: unknown[]) {
 const recorded = createRecordedSupabase(bodies.map(body => ({ status: 200, body })));
 return { ...recorded, repo: new AnalysisInsightsRepo(recorded.client as never) };
}
function scoped(url: URL, id = entityId) {
 expect(url.searchParams.get("project_id")).toBe("eq." + projectId);
 expect(url.searchParams.get("id")).toBe("eq." + id);
}
describe("AnalysisInsightsRepo installed SDK contracts", () => {
 it.each([
  ["document", "project_documents", { title: "Entrevista sobre aprendizaje" }, "Entrevista sobre aprendizaje"],
  ["segment", "project_document_segments", { selected_text: "Mi hermana me acompañó 🌿" }, "Mi hermana me acompañó 🌿"],
  ["code", "project_codes", { name: "Apoyo familiar" }, "Apoyo familiar"],
  ["memo", "project_memos", { title: "Memo interpretativo" }, "Memo interpretativo"],
  ["participant", "project_participants", { alias: "P03", display_name: "María José" }, "María José"],
 ] as const)("resolves %s link labels once per target while retaining scope and IDs", async (type, table, metadata, label) => {
  const links = [0, 1].map(i => ({ id: `${linkId}-${i}`, project_id: projectId, insight_id: entityId, link_type: type, [`${type}_id`]: targetId }));
  const db = setup([links, [{ id: targetId, ...metadata }]]);
  expect(await db.repo.listLinks(params)).toEqual(links.map(link => ({ ...link, target_label: label })));
  expect(db.requests).toHaveLength(2);
  const request = db.requests[1];
  expect(request.url.pathname).toBe(`/rest/v1/${table}`);
  expect(request.url.searchParams.get("project_id")).toBe(`eq.${projectId}`);
  expect(request.url.searchParams.get("id")).toBe(`in.(${targetId})`);
  expect(request.url.searchParams.get("deleted_at")).toBe("is.null");
  db.assertDrained();
 });
 it("returns unavailable context without inventing a title for a removed linked document", async () => {
  const link = { id: linkId, project_id: projectId, insight_id: entityId, link_type: "document", document_id: targetId };
  const db = setup([[link], []]);
  expect(await db.repo.listLinksByProject(projectId)).toEqual([{ ...link, target_label: null }]);
  expect(db.requests).toHaveLength(2); db.assertDrained();
 });
 it("batches large linked catalogs without changing link order or identity", async () => {
  const documents = Array.from({ length: 201 }, (_, i) => ({ id: `66666666-6666-4666-8666-${String(i).padStart(12, "0")}`, title: `Documento ${i}` }));
  const links = documents.map((document, i) => ({ id: `link-${i}`, project_id: projectId, insight_id: entityId, link_type: "document", document_id: document.id }));
  const db = setup([links, documents.slice(0, 100), documents.slice(100, 200), documents.slice(200)]);
  expect(await db.repo.listLinksByProject(projectId)).toEqual(links.map((link, i) => ({ ...link, target_label: documents[i].title })));
  expect(db.requests).toHaveLength(4);
  for (const [i, request] of db.requests.slice(1).entries()) {
   expect(request.url.searchParams.get("id")).toBe(`in.(${documents.slice(i * 100, (i + 1) * 100).map(document => document.id).join(",")})`);
   expect(request.url.searchParams.get("project_id")).toBe(`eq.${projectId}`);
   expect(request.url.searchParams.get("deleted_at")).toBe("is.null");
  }
  db.assertDrained();
 });
 it("reports a context dependency failure instead of presenting it as a missing resource", async () => {
  const link = { id: linkId, project_id: projectId, insight_id: entityId, link_type: "document", document_id: targetId };
  const db = createRecordedSupabase([
   { status: 200, body: [link] },
   { status: 503, body: { code: "SYNTHETIC_CONTEXT", message: "offline failure" } },
  ]);
  const repo = new AnalysisInsightsRepo(db.client as never);
  await expect(repo.listLinks(params)).rejects.toMatchObject({ message: "DEPENDENCY_UNAVAILABLE", status: 503 });
  db.assertDrained();
 });
 it("uses the participant alias when the display name is blank", async () => {
  const link = { id: linkId, project_id: projectId, insight_id: entityId, link_type: "participant", participant_id: targetId };
  const db = setup([[link], [{ id: targetId, display_name: "  ", alias: " P03 " }]]);
  expect(await db.repo.listLinks(params)).toEqual([{ ...link, target_label: "P03" }]);
  db.assertDrained();
 });
 it("soft-deletes only an active project row using fixed time and actor", async () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-04T12:34:56.000Z"));
  try {
   const db = setup([{ ...row, deleted_at: "2026-10-04T12:34:56.000Z" }]);
   expect(await db.repo.softDelete({ ...params, actorUserId })).toEqual({ ...row, deleted_at: "2026-10-04T12:34:56.000Z" });
   expect(db.requests[0].method).toBe("PATCH"); scoped(db.requests[0].url);
   expect(db.requests[0].url.searchParams.get("deleted_at")).toBe("is.null");
   expect(db.requests[0].body).toEqual({ deleted_at: "2026-10-04T12:34:56.000Z", updated_by: actorUserId }); db.assertDrained();
  } finally { jest.useRealTimers(); }
 });
 it("maps absent SDK lists and reads to their distinct empty/null contracts", async () => {
  const db = setup([null, null, null]);
  expect(await db.repo.listByProject(projectId, InsightListQuerySchema.parse({}))).toEqual([]);
  expect(await db.repo.listLinks(params)).toEqual([]);
  expect(await db.repo.getById(params)).toBeNull();
  expect(db.requests[1].url.searchParams.get("insight_id")).toBe("eq." + entityId);
  expect(db.requests[1].url.searchParams.get("order")).toBe("created_at.desc,id.desc"); db.assertDrained();
 });
 it("inserts default event payload and null entity only when explicitly requested", async () => {
  const db = setup([null]);
  await db.repo.createEvent({ projectId, actorUserId, entityType: "insight", eventType: "insight_created" });
  expect(db.requests[0].url.pathname).toBe("/rest/v1/project_analysis_events");
  expect(db.requests[0].body).toEqual({ project_id: projectId, entity_type: "insight", entity_id: null, event_type: "insight_created", event_payload: {}, created_by: actorUserId }); db.assertDrained();
 });
 it("creates defaults with actor provenance and returns the complete distinctive row", async () => {
  const db = setup([row]);
  const input = InsightCreateSchema.parse({ title: "Distinct insight" });
  expect(await db.repo.create({ projectId, actorUserId, input })).toEqual(row);
  expect(db.requests[0].method).toBe("POST");
  expect(db.requests[0].url.pathname).toBe("/rest/v1/project_insights");
  expect(db.requests[0].body).toEqual({ project_id: projectId, title: "Distinct insight", summary: "", interpretation: "", insight_type: "pattern", confidence: "medium", status: "draft", tags: [], metadata: {}, created_by: actorUserId, updated_by: actorUserId });
  db.assertDrained();
 });
 it.each([false, true])("reads with includeDeleted=%s and exact project/id predicates", async includeDeleted => {
  const db = setup([row]);
  expect(await db.repo.getById({ ...params, includeDeleted })).toEqual(row);
  scoped(db.requests[0].url);
  expect(db.requests[0].url.searchParams.get("deleted_at")).toBe(includeDeleted ? null : "is.null");
  db.assertDrained();
 });
 it("preserves empty fields and revision zero in a conditional update", async () => {
  const db = setup([row]);
  const input = { base_revision: 0, title: "Changed", summary: "", interpretation: "", insight_type: "pattern", confidence: "medium", status: "draft", tags: [], metadata: { reviewed: true } } as Parameters<AnalysisInsightsRepo["update"]>[0]["input"];
  expect(await db.repo.update({ ...params, actorUserId, input })).toEqual(row);
  scoped(db.requests[0].url);
  expect(db.requests[0].method).toBe("PATCH");
  expect(db.requests[0].url.searchParams.get("revision")).toBe("eq.0");
  expect(db.requests[0].url.searchParams.get("deleted_at")).toBe("is.null");
  const patch = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "base_revision"));
  expect(db.requests[0].body).toEqual({ ...patch, updated_by: actorUserId });
  db.assertDrained();
 });
 it("maps missing conditional writes to null without retry", async () => {
  const db = setup([null]);
  expect(await db.repo.update({ ...params, actorUserId, input: { base_revision: 9, title: "stale" } })).toBeNull();
  expect(db.requests).toHaveLength(1); scoped(db.requests[0].url); db.assertDrained();
 });
 it.each([false, true])("records untagged pagination and include_deleted=%s independently", async include_deleted => {
  const db = setup([[row]]);
  const query = InsightListQuerySchema.parse({ offset: "7", limit: "3", include_deleted: String(include_deleted), search: "distinct", insight_type: "pattern", confidence: "medium", status: "draft" });
  expect(await db.repo.listByProject(projectId, query)).toEqual([row]);
  const url = db.requests[0].url;
  expect(url.searchParams.get("project_id")).toBe("eq." + projectId);
  expect(url.searchParams.get("offset")).toBe("7"); expect(url.searchParams.get("limit")).toBe("3");
  expect(url.searchParams.get("order")).toBe("updated_at.desc,id.desc");
  expect(url.searchParams.get("deleted_at")).toBe(include_deleted ? null : "is.null");
  expect(url.searchParams.has("tags")).toBe(false);
  expect(url.searchParams.get("or")).toBe("(title.ilike.%distinct%,summary.ilike.%distinct%,interpretation.ilike.%distinct%)");
  db.assertDrained();
 });
 it.each(["document","segment","code","memo","participant"])("scopes active %s evidence targets", async linkType => {
  const db = setup([{ id: targetId }]);
  expect(await db.repo.targetExists({ projectId, targetId, linkType: linkType as Parameters<AnalysisInsightsRepo["targetExists"]>[0]["linkType"] })).toBe(true);
  const table = { document: "project_documents", segment: "project_document_segments", code: "project_codes", participant: "project_participants", memo: "project_memos" }[linkType];
  expect(db.requests[0].url.pathname).toBe("/rest/v1/" + table);
  scoped(db.requests[0].url, targetId);
  expect(db.requests[0].url.searchParams.get("deleted_at")).toBe("is.null"); db.assertDrained();
 });
 it("returns false for absent/removed/wrong-project target and only issues its scoped read", async () => {
  const db = setup([null]);
  expect(await db.repo.targetExists({ projectId, targetId, linkType: "document" })).toBe(false);
  expect(db.requests).toHaveLength(1); scoped(db.requests[0].url, targetId); db.assertDrained();
 });
 it("does not delete a missing link", async () => {
  const db = setup([null]);
  expect(await db.repo.deleteLink({ ...params, linkId })).toBeNull();
  scoped(db.requests[0].url, linkId);
  expect(db.requests[0].url.searchParams.get("insight_id")).toBe("eq." + entityId);
  expect(db.requests[0].method).toBe("GET"); expect(db.requests).toHaveLength(1); db.assertDrained();
 });
});
