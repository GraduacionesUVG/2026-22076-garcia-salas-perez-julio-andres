import { DocumentSegmentsRepo } from "@/src/modules/documents/document-segments.repo";
import { DocumentSegmentsService } from "@/src/modules/documents/document-segments.service";
import { createRecordedSupabase } from "@/__tests__/backend/recorded-supabase";
describe("DocumentSegmentsRepo installed SDK query contracts", () => {
 for (const reason of ["missing", "deleted", "mismatched-project"] as const) it.each(["getById", "create", "update", "softDelete"] as const)(reason + " parent scoped read stops %s before child transport", async method => {
 const db=createRecordedSupabase([{status:200,body:null}]); const service=new DocumentSegmentsService(new DocumentSegmentsRepo(db.client as never));
 const args={projectId:"project-A",documentId:"document-B",segmentId:"segment-C",actorUserId:"actor",input:method==="create"?{start_char:0,end_char:1,selected_text:"a",base_document_revision:0}:{base_revision:0,note:"new"}};
 await expect((service[method] as (input: unknown) => Promise<unknown>)(args)).resolves.toBeNull();expect(db.requests).toHaveLength(1);const q=db.requests[0].url.searchParams;expect(db.requests[0].url.pathname).toBe("/rest/v1/project_documents");expect(q.get("project_id")).toBe("eq.project-A");expect(q.get("id")).toBe("eq.document-B");expect(q.get("deleted_at")).toBe("is.null");db.assertDrained();
 });
 it("segment deletion scopes every id and writes actor/time",async()=>{
 const db=createRecordedSupabase([{status:200,body:null}]);await expect(new DocumentSegmentsRepo(db.client as never).softDelete({projectId:"p",documentId:"d",segmentId:"s",actorUserId:"actor"})).resolves.toBeNull();const r=db.requests[0];expect(r.method).toBe("PATCH");expect(r.body).toEqual({updated_by:"actor",deleted_at:expect.stringMatching(/^\d{4}-/)});const q=r.url.searchParams;expect(q.get("project_id")).toBe("eq.p");expect(q.get("document_id")).toBe("eq.d");expect(q.get("id")).toBe("eq.s");expect(q.get("deleted_at")).toBe("is.null");db.assertDrained();
 });
 it.each([false,true])("scopes read to parent/project and toggles active predicate includeDeleted=%s", async (includeDeleted) => {
 const db = createRecordedSupabase([{status:200,body:null}]); const repo=new DocumentSegmentsRepo(db.client as never);
 await expect(repo.getById({projectId:"p",documentId:"d",segmentId:"s",includeDeleted})).resolves.toBeNull();
 const q=db.requests[0].url.searchParams;
 expect(q.get("project_id")).toBe("eq.p"); expect(q.get("id")).toBe("eq.s");
 expect(q.get("document_id")).toBe("eq.d");
 expect(q.get("deleted_at")).toBe(includeDeleted?null:"is.null"); db.assertDrained();
 });
 it("applies revision predicate and only mutable patch/actor fields", async () => {
 const db=createRecordedSupabase([{status:200,body:null}]); const repo=new DocumentSegmentsRepo(db.client as never);
 await expect(repo.update({projectId:"p",documentId:"d",segmentId:"s",actorUserId:"actor",input:{base_revision:4,note:"á"}})).resolves.toBeNull();
 const r=db.requests[0]; expect(r.method).toBe("PATCH"); expect(r.body).toEqual({note:"á",updated_by:"actor"});
 expect(r.url.searchParams.get("revision")).toBe("eq.4"); expect(r.url.searchParams.get("project_id")).toBe("eq.p"); expect(r.url.searchParams.get("id")).toBe("eq.s"); expect(r.url.searchParams.get("deleted_at")).toBe("is.null"); expect(r.url.searchParams.get("document_id")).toBe("eq.d"); db.assertDrained();
 });
 it("sends creation defaults, exact Unicode content and both actors", async () => {
 const row={id:"new"}; const db=createRecordedSupabase([{status:201,body:row}]); const repo=new DocumentSegmentsRepo(db.client as never);
 await expect(repo.create({projectId:"p",documentId:"d",actorUserId:"actor",input:{start_char:0,end_char:3,selected_text:"á😀",base_document_revision:0}})).resolves.toEqual(row);
 const r=db.requests[0]; expect(r.method).toBe("POST"); expect(r.body).toEqual(expect.objectContaining({project_id:"p",created_by:"actor",updated_by:"actor",document_id:"d",label:"",note:"",selected_text:"á😀"})); db.assertDrained();
 });
 it("constructs inclusive pagination and active/list filters", async () => {
 const db=createRecordedSupabase([{status:200,body:[]}]); const repo=new DocumentSegmentsRepo(db.client as never);
 await expect(repo.listByDocument({projectId:"p",documentId:"d",query:{limit:2,offset:3,include_deleted:false,search:"á"}})).resolves.toEqual([]);
 const q=db.requests[0].url.searchParams; expect(q.get("offset")).toBe("3"); expect(q.get("limit")).toBe("2"); expect(q.get("project_id")).toBe("eq.p"); expect(q.get("deleted_at")).toBe("is.null");
 expect(q.get("document_id")).toBe("eq.d"); expect(q.get("or")).toBe("(note.ilike.%á%,selected_text.ilike.%á%)");
 db.assertDrained();
 });
});
