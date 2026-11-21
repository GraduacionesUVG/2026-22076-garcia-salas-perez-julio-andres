import { GET,POST } from '@/app/api/projects/[id]/team/route';
import { POST as presence } from '@/app/api/projects/[id]/team/presence/route';
import { PATCH,DELETE } from '@/app/api/projects/[id]/team/members/[userId]/route';
import { POST as accept } from '@/app/api/project-invitations/accept/route';
import { POST as revoke } from '@/app/api/projects/[id]/team/invitations/[invitationId]/revoke/route';
import { requireSession } from '@/src/modules/auth/auth.guard';
import { requireProjectRole,requireProjectMember } from '@/src/modules/projects/project.guard';
import { CollaborationService } from '@/src/modules/collaboration/collaboration.service';
jest.mock('@/src/modules/auth/auth.guard',()=>({requireSession:jest.fn()}));
jest.mock('@/src/modules/projects/project.guard',()=>({requireProjectRole:jest.fn(),requireProjectMember:jest.fn()}));
const id='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222';
const invitationId='33333333-3333-4333-8333-333333333333';
const ctx={params:Promise.resolve({id,userId,invitationId})};
const req=(body:unknown)=>new Request('https://app.invalid',{method:'POST',body:JSON.stringify(body)});
describe('actual team HTTP handler boundaries',()=>{
  const from=jest.fn();
  beforeEach(()=>{const context={supabase:{from},user:{id:'actor',email:'actor@example.com'},member:{role:'owner'}}; for(const guard of [requireSession,requireProjectRole,requireProjectMember]) jest.mocked(guard).mockResolvedValue(context as never);});
  afterEach(()=>jest.restoreAllMocks());
  it('revokes requested invitation through owner-only handler',async()=>{
    const method=jest.spyOn(CollaborationService.prototype,'revokeInvitation').mockResolvedValue({id:invitationId,project_id:id,status:'revoked'} as never);
    const response=await revoke(req(null),ctx); expect(response.status).toBe(200); expect(await response.json()).toEqual({ok:true,invitation:{id:invitationId,project_id:id,status:'revoked'}}); expect(method).toHaveBeenCalledWith({projectId:id,invitationId,actorUserId:'actor'}); expect(requireProjectRole).toHaveBeenLastCalledWith(id,['owner']);
  });
  it.each([[GET,'getWorkspace',null],[POST,'inviteMember',{email:'ana@example.com',role:'editor'}],[presence,'touchPresence',{resource_type:'project',presence_state:'viewing'}],[PATCH,'updateMemberRole',{role:'viewer'}],[DELETE,'removeMember',null],[accept,'acceptInvitation',{token:'a'.repeat(64)}],[revoke,'revokeInvitation',null]] as const)('normalizes transient service failure through actual handler %#',async(handler,method,body)=>{
    jest.spyOn(CollaborationService.prototype,method).mockRejectedValue({status:503,message:'private gateway'});
    const response=await handler(req(body),ctx); expect(response.status).toBe(503); expect(await response.json()).toEqual({ok:false,error:'DEPENDENCY_UNAVAILABLE'});
  });
  it('viewer workspace does not expose invitations',async()=>{jest.mocked(requireProjectRole).mockResolvedValueOnce({supabase:{from},member:{role:'viewer'}} as never); const get=jest.spyOn(CollaborationService.prototype,'getWorkspace').mockResolvedValue({members:[],invitations:[],activity:[]} as never); const response=await GET(req(null),ctx); expect(response.status).toBe(200); expect(await response.json()).toEqual({ok:true,currentRole:'viewer',members:[],invitations:[],activity:[]}); expect(get).toHaveBeenCalledWith(id,{includeInvitations:false});});
  it('invites with caller identity and returns the complete invitation envelope',async()=>{
    const invitation={id:invitationId,project_id:id,email:'ana@example.com',role:'editor',status:'pending',expires_at:'2026-10-11T00:00:00Z'};
    const method=jest.spyOn(CollaborationService.prototype,'inviteMember').mockResolvedValue(invitation as never);
    const response=await POST(req({email:'ana@example.com',role:'editor'}),ctx);
    expect(response.status).toBe(201); expect(await response.json()).toEqual({ok:true,invitation});
    expect(method).toHaveBeenCalledWith({projectId:id,actorUserId:'actor',actorEmail:'actor@example.com',input:{email:'ana@example.com',role:'editor'}}); expect(requireProjectRole).toHaveBeenLastCalledWith(id,['owner']);
  });
  it('publishes requested document presence and preserves collaborator results',async()=>{
    const documentId='44444444-4444-4444-8444-444444444444';
    const result={presence:{id:'presence-own',project_id:id,user_id:'actor',resource_type:'document',resource_id:documentId,presence_state:'editing',metadata:{cursor:7}},active:[{id:'presence-other',user_id:userId,display_name:'Ana',resource_id:documentId}]};
    const method=jest.spyOn(CollaborationService.prototype,'touchPresence').mockResolvedValue(result as never);
    const input={resource_type:'document',resource_id:documentId,presence_state:'editing',metadata:{cursor:7}};
    const response=await presence(req(input),ctx); expect(response.status).toBe(200); expect(await response.json()).toEqual({ok:true,...result});
    expect(method).toHaveBeenCalledWith({projectId:id,userId:'actor',input}); expect(requireProjectRole).toHaveBeenLastCalledWith(id,['owner','editor','viewer']);
  });
  it('updates the requested member rather than the caller',async()=>{
    const member={project_id:id,user_id:userId,role:'viewer',full_name:'Ana',username:'ana',email:'ana@example.com',created_at:'2026-01-01'};
    const method=jest.spyOn(CollaborationService.prototype,'updateMemberRole').mockResolvedValue(member as never);
    const response=await PATCH(req({role:'viewer'}),ctx); expect(response.status).toBe(200); expect(await response.json()).toEqual({ok:true,member});
    expect(method).toHaveBeenCalledWith({projectId:id,targetUserId:userId,actorUserId:'actor',input:{role:'viewer'}}); expect(requireProjectRole).toHaveBeenLastCalledWith(id,['owner']);
  });
  it('accepts a token for the session actor and returns accepted project membership',async()=>{
    const token='a'.repeat(64),result={project_id:id,invitation:{id:invitationId,status:'accepted',email:'actor@example.com'},member:{project_id:id,user_id:'actor',role:'editor'}};
    const method=jest.spyOn(CollaborationService.prototype,'acceptInvitation').mockResolvedValue(result as never);
    const response=await accept(req({token})); expect(response.status).toBe(200); expect(await response.json()).toEqual({ok:true,...result});
    expect(method).toHaveBeenCalledWith({token,userId:'actor',userEmail:'actor@example.com'}); expect(requireSession).toHaveBeenCalledTimes(1); expect(requireProjectRole).not.toHaveBeenCalled();
  });
  it('owner removal succeeds through actual handler',async()=>{const remove=jest.spyOn(CollaborationService.prototype,'removeMember').mockResolvedValue(undefined); const response=await DELETE(req(null),ctx); expect(await response.json()).toEqual({ok:true}); expect(remove).toHaveBeenCalledWith({projectId:id,targetUserId:userId,actorUserId:'actor'});});
  it('nonowner cannot remove another member or emit writes',async()=>{jest.mocked(requireProjectMember).mockResolvedValueOnce({supabase:{from},user:{id:'actor'},member:{role:'viewer'}} as never); const remove=jest.spyOn(CollaborationService.prototype,'removeMember'); const response=await DELETE(req(null),ctx); expect(response.status).toBe(403); expect(await response.json()).toEqual({ok:false,error:'FORBIDDEN'}); expect(remove).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();});
  it.each([[POST,'inviteMember'],[presence,'touchPresence'],[PATCH,'updateMemberRole'],[accept,'acceptInvitation']] as const)('invalid body causes no service mutation %#',async(handler,method)=>{const mutation=jest.spyOn(CollaborationService.prototype,method); expect((await handler(req(null),ctx)).status).toBe(400); expect(mutation).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();});
  it.each([GET,POST,presence,PATCH,DELETE])('invalid project causes no authorization %#',async handler=>{expect((await handler(req({}),{params:Promise.resolve({id:'bad',userId})})).status).toBe(400); expect(requireProjectRole).not.toHaveBeenCalled(); expect(requireProjectMember).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();});
});
