import * as corpusRoute0 from "@/app/api/projects/[id]/documents/route";
import * as corpusRoute1 from "@/app/api/projects/[id]/documents/[documentId]/route";
import * as corpusRoute2 from "@/app/api/projects/[id]/documents/[documentId]/duplicate/route";
import * as corpusRoute3 from "@/app/api/projects/[id]/documents/[documentId]/restore/route";
import * as corpusRoute4 from "@/app/api/projects/[id]/documents/trash/route";
import * as corpusRoute5 from "@/app/api/projects/[id]/documents/stats/route";
import * as corpusRoute6 from "@/app/api/projects/[id]/documents/sources/route";
import * as corpusRoute7 from "@/app/api/projects/[id]/documents/sources/[sourceId]/route";
import * as corpusRoute8 from "@/app/api/projects/[id]/documents/[documentId]/segments/route";
import * as corpusRoute9 from "@/app/api/projects/[id]/documents/[documentId]/segments/[segmentId]/route";
import * as corpusRoute10 from "@/app/api/projects/[id]/documents/[documentId]/versions/route";
import * as corpusRoute11 from "@/app/api/projects/[id]/documents/[documentId]/versions/[versionId]/route";
import * as corpusRoute12 from "@/app/api/projects/[id]/documents/[documentId]/versions/[versionId]/restore/route";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { DocumentsService } from "@/src/modules/documents/documents.service";
import { DocumentSegmentsService } from "@/src/modules/documents/document-segments.service";
import { DocumentSourcesService } from "@/src/modules/documents/document-sources.service";
import { DocumentVersionsService } from "@/src/modules/documents/document-versions.service";
jest.mock("@/src/modules/projects/project.guard", () => ({ requireProjectRole: jest.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
const params = { id, documentId: "22222222-2222-4222-8222-222222222222", segmentId: "33333333-3333-4333-8333-333333333333", sourceId: "44444444-4444-4444-8444-444444444444", versionId: "55555555-5555-4555-8555-555555555555" };
const corpusRoutes: Record<string, Record<string, (request: Request, context: {params: Promise<typeof params>}) => Promise<Response>>> = {
 "": { GET: corpusRoute0.GET, POST: corpusRoute0.POST },
 "/[documentId]": { GET: corpusRoute1.GET, PATCH: corpusRoute1.PATCH, DELETE: corpusRoute1.DELETE },
 "/[documentId]/duplicate": { POST: corpusRoute2.POST },
 "/[documentId]/restore": { POST: corpusRoute3.POST },
 "/trash": { GET: corpusRoute4.GET },
 "/stats": { GET: corpusRoute5.GET },
 "/sources": { GET: corpusRoute6.GET, POST: corpusRoute6.POST },
 "/sources/[sourceId]": { GET: corpusRoute7.GET, PATCH: corpusRoute7.PATCH, DELETE: corpusRoute7.DELETE },
 "/[documentId]/segments": { GET: corpusRoute8.GET, POST: corpusRoute8.POST },
 "/[documentId]/segments/[segmentId]": { GET: corpusRoute9.GET, PATCH: corpusRoute9.PATCH, DELETE: corpusRoute9.DELETE },
 "/[documentId]/versions": { GET: corpusRoute10.GET, POST: corpusRoute10.POST },
 "/[documentId]/versions/[versionId]": { GET: corpusRoute11.GET },
 "/[documentId]/versions/[versionId]/restore": { POST: corpusRoute12.POST },
};
const cases = [
 ["", "GET", DocumentsService, "listByProject", "documents", null, 200],
 ["", "POST", DocumentsService, "create", "document", { title: "Unicode á", content: "" }, 201],
 ["/[documentId]", "GET", DocumentsService, "getById", "document", null, 200],
 ["/[documentId]", "PATCH", DocumentsService, "update", "document", { base_revision: 0, title: "new" }, 200],
 ["/[documentId]", "DELETE", DocumentsService, "softDelete", "document", null, 200],
 ["/[documentId]/duplicate", "POST", DocumentsService, "duplicate", "document", null, 201],
 ["/[documentId]/restore", "POST", DocumentsService, "restore", "document", null, 200],
 ["/trash", "GET", DocumentsService, "listTrashByProject", "documents", null, 200],
 ["/stats", "GET", DocumentsService, "getStats", "stats", null, 200],
 ["/sources", "GET", DocumentSourcesService, "listByProject", "sources", null, 200],
 ["/sources", "POST", DocumentSourcesService, "create", "source", { code: "custom", label: "Source" }, 201],
 ["/sources/[sourceId]", "GET", DocumentSourcesService, "getById", "source", null, 200],
 ["/sources/[sourceId]", "PATCH", DocumentSourcesService, "update", "source", { label: "new" }, 200],
 ["/sources/[sourceId]", "DELETE", DocumentSourcesService, "softDelete", "source", null, 200],
 ["/[documentId]/segments", "GET", DocumentSegmentsService, "listByDocument", "segments", null, 200],
 ["/[documentId]/segments", "POST", DocumentSegmentsService, "create", "segment", { start_char: 0, end_char: 1, selected_text: "á", base_document_revision: 0 }, 201],
 ["/[documentId]/segments/[segmentId]", "GET", DocumentSegmentsService, "getById", "segment", null, 200],
 ["/[documentId]/segments/[segmentId]", "PATCH", DocumentSegmentsService, "update", "segment", { base_revision: 0, note: "new" }, 200],
 ["/[documentId]/segments/[segmentId]", "DELETE", DocumentSegmentsService, "softDelete", "segment", null, 200],
 ["/[documentId]/versions", "GET", DocumentVersionsService, "listByDocument", "versions", null, 200],
 ["/[documentId]/versions", "POST", DocumentVersionsService, "create", "version", {}, 201],
 ["/[documentId]/versions/[versionId]", "GET", DocumentVersionsService, "getById", "version", null, 200],
 ["/[documentId]/versions/[versionId]/restore", "POST", DocumentVersionsService, "restore", "document", { base_revision: 0 }, 200],
] as const;
function request(method: string, body: unknown, raw = false) {
 return new Request("http://localhost/api/corpus", { method, ...(body === null ? {} : { body: raw ? String(body) : JSON.stringify(body), headers: { "content-type": "application/json" } }) });
}
afterEach(() => jest.restoreAllMocks());
beforeEach(() => { jest.mocked(requireProjectRole).mockReset(); jest.mocked(requireProjectRole).mockResolvedValue({ supabase: {}, user: { id: "actor" } } as never); });
describe.each(cases)("%s %s", (path, method, Service, operation, key, body, status) => {
 const handler = corpusRoutes[path][method];
 it("returns the exact successful service object and project/actor inputs", async () => {
  const result = { marker: "actual-response" };
  const spy = jest.spyOn(Service.prototype as unknown as Record<string, (...args: never[]) => Promise<unknown>>, operation).mockResolvedValue(result);
  const response = await handler(request(method, body), { params: Promise.resolve(params) });
  expect(response.status).toBe(status); expect(await response.json()).toEqual({ ok: true, [key]: result });
  expect(requireProjectRole).toHaveBeenCalledWith(id, method === "GET" ? ["owner", "editor", "viewer"] : ["owner", "editor"]);
  expect(spy).toHaveBeenCalledTimes(1);
  const query = { limit: key === "sources" || key === "segments" ? 100 : 50, offset: 0, ...(key === "versions" ? {} : { include_deleted: false }) };
  let input: unknown = body;
  if (path === "" && method === "POST") input = { ...body, document_type: "interview", status: "draft", location: "", language: "es", notes: "" };
  if (path === "/sources" && method === "POST") input = { ...body, description: "" };
  if (path.endsWith("/segments") && method === "POST") input = { ...body, note: "" };
  if (path.endsWith("/versions") && method === "POST") input = { trigger_type: "manual" };
  if (operation === "getStats") expect(spy).toHaveBeenCalledWith(id);
  else if (["listByProject", "listTrashByProject"].includes(operation)) expect(spy).toHaveBeenCalledWith(id, query);
  else expect(spy).toHaveBeenCalledWith({ projectId: id,
    ...(path.includes("[documentId]") ? { documentId: params.documentId } : {}),
    ...(path.includes("[segmentId]") ? { segmentId: params.segmentId } : {}),
    ...(path.includes("[sourceId]") ? { sourceId: params.sourceId } : {}),
    ...(path.includes("[versionId]") ? { versionId: params.versionId } : {}),
    ...(method === "GET" ? {} : { actorUserId: "actor" }),
    ...(body === null ? {} : { input }),
    ...(operation === "listByDocument" ? { query } : {}),
  });
 });
 it("rejects invalid project before authorization or service effects", async () => {
  const spy = jest.spyOn(Service.prototype as unknown as Record<string, (...args: never[]) => Promise<unknown>>, operation);
  const response = await handler(request(method, body), { params: Promise.resolve({ ...params, id: "bad" }) });
  expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: path === "/[documentId]/duplicate" ? "INVALID_PROJECT_ID" : "Invalid project id" });
  expect(requireProjectRole).not.toHaveBeenCalled(); expect(spy).not.toHaveBeenCalled();
 });
 it("preserves scoped authorization rejection without service effects", async () => {
  jest.mocked(requireProjectRole).mockRejectedValue(Object.assign(new Error("FORBIDDEN"), { status: 403 }));
  const spy = jest.spyOn(Service.prototype as unknown as Record<string, (...args: never[]) => Promise<unknown>>, operation);
  const response = await handler(request(method, body), { params: Promise.resolve(params) });
  expect(response.status).toBe(403); expect(await response.json()).toEqual({ ok: false, error: "FORBIDDEN" }); expect(spy).not.toHaveBeenCalled();
 });
 it("preserves service domain conflict without successful response", async () => {
  const spy = jest.spyOn(Service.prototype as unknown as Record<string, (...args: never[]) => Promise<unknown>>, operation).mockRejectedValue(Object.assign(new Error("DOMAIN_CONFLICT"), { status: 409 }));
  const response = await handler(request(method, body), { params: Promise.resolve(params) });
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ ok: false, error: "DOMAIN_CONFLICT" }); expect(spy).toHaveBeenCalledTimes(1);
 });
 if (path.includes("[")) it("rejects invalid child id before authorization", async () => {
  const child = path.startsWith("/sources") ? "sourceId" : "documentId";
  const spy = jest.spyOn(Service.prototype as unknown as Record<string, (...args: never[]) => Promise<unknown>>, operation);
  const response = await handler(request(method, body), { params: Promise.resolve({ ...params, [child]: "bad" }) });
  expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: path === "/[documentId]/duplicate" ? "INVALID_DOCUMENT_ID" : child === "sourceId" ? "Invalid source id" : "Invalid document id" });
  expect(requireProjectRole).not.toHaveBeenCalled(); expect(spy).not.toHaveBeenCalled();
 });
 for (const child of ["segmentId", "versionId"] as const) if (path.includes("[" + child + "]")) it("rejects invalid nested " + child + " independently", async () => {
  const spy = jest.spyOn(Service.prototype as unknown as Record<string, (...args: never[]) => Promise<unknown>>, operation);
  const response = await handler(request(method, body), { params: Promise.resolve({ ...params, [child]: "bad" }) });
  expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: child === "segmentId" ? "Invalid segment id" : "Invalid version id" });
  expect(requireProjectRole).not.toHaveBeenCalled(); expect(spy).not.toHaveBeenCalled();
 });
 if (path.includes("[")) it("maps scoped missing service result to exact 404", async () => {
  const spy = jest.spyOn(Service.prototype as unknown as Record<string, (...args: never[]) => Promise<unknown>>, operation).mockResolvedValue(null);
  const response = await handler(request(method, body), { params: Promise.resolve(params) });
  const error = path === "/[documentId]/restore" ? "DOCUMENT_NOT_FOUND_OR_NOT_DELETED" : path.includes("[sourceId]") ? "DOCUMENT_SOURCE_NOT_FOUND" : path.includes("[segmentId]") ? "SEGMENT_NOT_FOUND" : path.endsWith("[versionId]") ? "DOCUMENT_VERSION_NOT_FOUND" : "DOCUMENT_NOT_FOUND";
  expect(response.status).toBe(404); expect(await response.json()).toEqual({ ok: false, error }); expect(spy).toHaveBeenCalledTimes(1);
 });
 if (method === "GET" && ["documents", "sources", "segments", "versions"].includes(key)) it.each(["limit=0", "offset=-1"])("rejects query boundary %s before authorization", async query => {
  const spy = jest.spyOn(Service.prototype as unknown as Record<string, (...args: never[]) => Promise<unknown>>, operation);
  const response = await handler(new Request("http://localhost/api/corpus?" + query), { params: Promise.resolve(params) });
  expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ ok: false, error: "Validation error" }); expect(requireProjectRole).not.toHaveBeenCalled(); expect(spy).not.toHaveBeenCalled();
 });
 if (body !== null) it.each(["null", "[]", "42", "{"])("rejects JSON %s with no mutation", async (raw) => {
  const spy = jest.spyOn(Service.prototype as unknown as Record<string, (...args: never[]) => Promise<unknown>>, operation).mockResolvedValue({ id: "unexpected-write" });
  const response = await handler(request(method, raw, true), { params: Promise.resolve(params) });
  expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ ok: false, error: raw === "{" ? "Invalid JSON body" : "Validation error" }); expect(spy).not.toHaveBeenCalled();
 });
});
