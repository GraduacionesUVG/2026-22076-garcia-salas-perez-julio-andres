import { GET as list, POST } from '@/app/api/projects/route';
import { GET, PATCH, DELETE } from '@/app/api/projects/[id]/route';
import { requireSession } from '@/src/modules/auth/auth.guard';
import { requireProjectRole } from '@/src/modules/projects/project.guard';
import { createRecordedSupabase } from '@/__tests__/backend/recorded-supabase';
jest.mock('@/src/modules/auth/auth.guard',()=>({requireSession:jest.fn()}));
jest.mock('@/src/modules/projects/project.guard',()=>({requireProjectRole:jest.fn()}));
const id='11111111-1111-4111-8111-111111111111';
const ctx={params:Promise.resolve({id})};
const project={id,name:'Study',description:null,owner_id:'actor',is_active:true,created_at:'2026-01-01',updated_at:'2026-01-01'};
function setup(responses: Parameters<typeof createRecordedSupabase>[0], role='owner') {
  const db=createRecordedSupabase(responses); const context={supabase:db.client,user:{id:'actor',email:'actor@example.com'},member:{role}};
  jest.mocked(requireSession).mockResolvedValue(context as never); jest.mocked(requireProjectRole).mockResolvedValue(context as never); return db;
}
const request=(body:unknown)=>new Request('https://app.invalid',{method:'POST',body:JSON.stringify(body)});
describe('actual project HTTP handlers with real service/repository',()=>{
  it('lists only caller projects',async()=>{const db=setup([{status:200,body:[]}]); const response=await list(); expect(response.status).toBe(200); expect(await response.json()).toEqual({ok:true,projects:[]}); expect(db.requests[0].url.searchParams.get('user_id')).toBe('eq.actor'); db.assertDrained();});
  it('creates project for authenticated owner',async()=>{const db=setup([{status:201,body:project},{status:200,body:{role:'owner'}}]); const response=await POST(request({name:'Study'})); expect(response.status).toBe(201); expect(await response.json()).toEqual({ok:true,project:{...project,my_role:'owner'}}); expect(db.requests[0].body).toEqual({name:'Study',description:null,owner_id:'actor'}); db.assertDrained();});
  it.each([GET,PATCH])('reads/updates project through actual export %#',async handler=>{const db=setup([{status:200,body:project}],'editor'); const response=await handler(request({name:'Changed'}),ctx); expect(response.status).toBe(200); expect(await response.json()).toEqual({ok:true,project:{...project,my_role:'editor'}}); expect(db.requests[0].url.searchParams.get('id')).toBe(`eq.${id}`); db.assertDrained();});
  it('deletes only requested project with owner role gate',async()=>{const db=setup([{status:204,body:null}]); const response=await DELETE(request(null),ctx); expect(await response.json()).toEqual({ok:true}); expect(requireProjectRole).toHaveBeenLastCalledWith(id,['owner']); expect(db.requests[0].method).toBe('DELETE'); expect(db.requests[0].url.searchParams.get('id')).toBe(`eq.${id}`); db.assertDrained();});
  it.each([GET,PATCH])('returns 404 for absent project %#',async handler=>{const db=setup([{status:200,body:null}]); expect((await handler(request({name:'Changed'}),ctx)).status).toBe(404); db.assertDrained();});
  it.each([GET,PATCH,DELETE])('rejects invalid project before authorization or query %#',async handler=>{const db=setup([]); expect((await handler(request({name:'Study'}),{params:Promise.resolve({id:'bad'})})).status).toBe(400); expect(requireProjectRole).not.toHaveBeenCalled(); db.assertDrained();});
  it.each([POST,PATCH])('rejects malformed/primitive JSON without query %#',async handler=>{const db=setup([]); for(const body of ['{','null','7']) {const response=await handler(new Request('https://app.invalid',{method:'POST',body}),ctx); expect(response.status).toBe(400);} expect(db.requests).toEqual([]); db.assertDrained();});
  it.each([GET,PATCH,DELETE])('denies role before repository effects %#',async handler=>{const db=setup([]); jest.mocked(requireProjectRole).mockRejectedValueOnce(Object.assign(new Error('FORBIDDEN'),{status:403})); expect((await handler(request({name:'Study'}),ctx)).status).toBe(403); expect(db.requests).toEqual([]); db.assertDrained();});
  it.each([GET,PATCH,DELETE])('redacts dependency failure without retry %#',async handler=>{const db=setup([{status:503,body:{message:'provider secret'}}]); const response=await handler(request({name:'Study'}),ctx); expect(response.status).toBe(503); expect(await response.json()).toEqual({ok:false,error:'DEPENDENCY_UNAVAILABLE'}); expect(db.requests).toHaveLength(1); db.assertDrained();});
});
