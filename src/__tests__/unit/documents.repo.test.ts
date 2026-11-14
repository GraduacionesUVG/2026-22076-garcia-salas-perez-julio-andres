import { DocumentsRepo } from "@/src/modules/documents/documents.repo";
import { DocumentCreateSchema } from "@/src/modules/documents/documents.schema";
import { createRecordedSupabase } from "@/__tests__/backend/recorded-supabase";
describe("DocumentsRepo installed SDK query contracts", () => {
 it.each(["softDelete", "restore"] as const)("%s only affects its correct deletion state", async method => {
 const db=createRecordedSupabase([{status:200,body:null}]); const repo=new DocumentsRepo(db.client as never);
 await expect(repo[method]({projectId:"p",documentId:"d",actorUserId:"actor"})).resolves.toBeNull();
 const r=db.requests[0];expect(r.method).toBe("PATCH");expect(r.url.searchParams.get("project_id")).toBe("eq.p");expect(r.url.searchParams.get("id")).toBe("eq.d");expect(r.url.searchParams.get("deleted_at")).toBe(method==="restore"?"not.is.null":"is.null");expect(r.body).toEqual({updated_by:"actor",deleted_at:method==="restore"?null:expect.stringMatching(/^\d{4}-/)});db.assertDrained();
 });
 it("trash only queries deleted project documents", async()=>{
 const db=createRecordedSupabase([{status:200,body:[]}]);await expect(new DocumentsRepo(db.client as never).listDeletedByProject("p",{limit:20,offset:0,include_deleted:false})).resolves.toEqual([]);expect(db.requests[0].url.searchParams.get("deleted_at")).toBe("not.is.null");expect(db.requests[0].url.searchParams.get("project_id")).toBe("eq.p");db.assertDrained();
 });
 it.each([false,true])("scopes read to parent/project and toggles active predicate includeDeleted=%s", async (includeDeleted) => {
 const db = createRecordedSupabase([{status:200,body:null}]); const repo=new DocumentsRepo(db.client as never);
 await expect(repo.getById({projectId:"p",documentId:"d",includeDeleted})).resolves.toBeNull();
 const q=db.requests[0].url.searchParams;
 expect(q.get("project_id")).toBe("eq.p"); expect(q.get("id")).toBe("eq.d");

 expect(q.get("deleted_at")).toBe(includeDeleted?null:"is.null"); db.assertDrained();
 });
 it("applies revision predicate and only mutable patch/actor fields", async () => {
 const db=createRecordedSupabase([{status:200,body:null}]); const repo=new DocumentsRepo(db.client as never);
 await expect(repo.update({projectId:"p",documentId:"d",actorUserId:"actor",input:{base_revision:4,title:"á",content:""}})).resolves.toBeNull();
 const r=db.requests[0]; expect(r.method).toBe("PATCH"); expect(r.body).toEqual({title:"á",content:"",updated_by:"actor"});
 expect(r.url.searchParams.get("revision")).toBe("eq.4"); expect(r.url.searchParams.get("project_id")).toBe("eq.p"); expect(r.url.searchParams.get("id")).toBe("eq.d"); expect(r.url.searchParams.get("deleted_at")).toBe("is.null"); db.assertDrained();
 });
 it("sends creation defaults, exact Unicode content and both actors", async () => {
 const row={id:"new"}; const db=createRecordedSupabase([{status:201,body:row}]); const repo=new DocumentsRepo(db.client as never);
 await expect(repo.create({projectId:"p",actorUserId:"actor",input:DocumentCreateSchema.parse({title:"á",content:"😀"})})).resolves.toEqual(row);
 const r=db.requests[0]; expect(r.method).toBe("POST"); expect(r.body).toEqual(expect.objectContaining({project_id:"p",created_by:"actor",updated_by:"actor",content:"😀",source_id:null,participant_id:null,language:"es",status:"draft"})); db.assertDrained();
 });
 it("constructs inclusive pagination and active/list filters", async () => {
 const db=createRecordedSupabase([{status:200,body:[]}]); const repo=new DocumentsRepo(db.client as never);
 await expect(repo.listByProject("p",{limit:2,offset:3,include_deleted:false,source_id:"src",participant_id:"person",status:"draft",document_type:"interview"})).resolves.toEqual([]);
 const q=db.requests[0].url.searchParams; expect(q.get("offset")).toBe("3"); expect(q.get("limit")).toBe("2"); expect(q.get("project_id")).toBe("eq.p"); expect(q.get("deleted_at")).toBe("is.null");
 expect(q.get("source_id")).toBe("eq.src"); expect(q.get("participant_id")).toBe("eq.person"); expect(q.get("status")).toBe("eq.draft"); expect(q.get("document_type")).toBe("eq.interview");
 db.assertDrained();
 });
});
