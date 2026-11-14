import { CollaborationRepo } from "@/src/modules/collaboration/collaboration.repo";
import { createRecordedSupabase } from '@/__tests__/backend/recorded-supabase';
import { SUPABASE_FAILURE_CASES, captureRejection, expectSafeDependencyFailure, freshProviderFailure } from "@/__tests__/backend/supabase-failure-cases";

describe("CollaborationRepo", () => {
  it('scopes member updates by both identifiers and protects owner role in SDK request',async()=>{
    const db=createRecordedSupabase([{status:200,body:null}]);
    expect(await new CollaborationRepo(db.client as never).updateMemberRole({projectId:'p',userId:'u',role:'viewer'})).toBeNull();
    const query=db.requests[0].url.searchParams; expect(query.get('project_id')).toBe('eq.p'); expect(query.get('user_id')).toBe('eq.u'); expect(query.get('role')).toBe('neq.owner'); expect(db.requests[0].body).toEqual({role:'viewer'}); db.assertDrained();
  });
  it('requires project and nondeleted document when checking presence resource',async()=>{
    const db=createRecordedSupabase([{status:200,body:null}]);
    expect(await new CollaborationRepo(db.client as never).documentExistsInProject({projectId:'p',documentId:'child'})).toBe(false);
    const query=db.requests[0].url.searchParams; expect(query.get('project_id')).toBe('eq.p'); expect(query.get('id')).toBe('eq.child'); expect(query.get('deleted_at')).toBe('is.null'); db.assertDrained();
  });
  it('scopes revocation to project, invitation and pending status',async()=>{
    const db=createRecordedSupabase([{status:200,body:null}]);
    expect(await new CollaborationRepo(db.client as never).revokeInvitation({projectId:'p',invitationId:'child'})).toBeNull();
    const query=db.requests[0].url.searchParams; expect(query.get('project_id')).toBe('eq.p'); expect(query.get('id')).toBe('eq.child'); expect(query.get('status')).toBe('eq.pending'); expect(db.requests[0].body).toMatchObject({status:'revoked'}); db.assertDrained();
  });
  it('only returns pending unexpired matching project invitations',async()=>{
    const db=createRecordedSupabase([{status:200,body:null}]);
    expect(await new CollaborationRepo(db.client as never).findPendingInvitationByEmail({projectId:'p',email:'a@example.com'})).toBeNull();
    const query=db.requests[0].url.searchParams; expect(query.get('project_id')).toBe('eq.p'); expect(query.get('email')).toBe('eq.a@example.com'); expect(query.get('status')).toBe('eq.pending'); expect(query.get('expires_at')).toMatch(/^gt\./); db.assertDrained();
  });
  it.each(['members','invitations','presence','activity'] as const)('empty %s skips profile request',async method=>{
    const db=createRecordedSupabase([{status:200,body:null}]); const repo=new CollaborationRepo(db.client as never);
    const result=await ({members:()=>repo.listMembers('p'),invitations:()=>repo.listInvitations('p'),presence:()=>repo.listPresence({projectId:'p',resourceType:'document',resourceId:'child'}),activity:()=>repo.listActivity('p')})[method]();
    expect(result).toEqual([]); expect(db.requests[0].url.searchParams.get('project_id')).toBe('eq.p');
    if(method==='presence'){expect(db.requests[0].url.searchParams.get('resource_id')).toBe('eq.child'); expect(db.requests[0].url.searchParams.get('resource_type')).toBe('eq.document'); expect(db.requests[0].url.searchParams.get('last_seen_at')).toMatch(/^gte\./);}
    if(method==='activity'){expect(db.requests[0].url.searchParams.get('offset')).toBe('0'); expect(db.requests[0].url.searchParams.get('limit')).toBe('20');} db.assertDrained();
  });
  it('joins profile metadata and preserves missing profile as null',async()=>{
    const db=createRecordedSupabase([{status:200,body:[{user_id:'u',project_id:'p',role:'editor'},{user_id:'missing',project_id:'p',role:'viewer'}]},{status:200,body:[{id:'u',email:'ana@example.com',full_name:'Ana',username:null}]}]);
    const rows=await new CollaborationRepo(db.client as never).listMembers('p'); expect(rows[0].profiles).toMatchObject({email:'ana@example.com'}); expect(rows[1].profiles).toBeNull();
    expect(db.requests[1].url.pathname).toBe('/rest/v1/rpc/project_member_profiles_safe');
    expect(db.requests[1].body).toEqual({ p_project_id: 'p', p_user_ids: ['u', 'missing'] }); db.assertDrained();
  });
  it('loads coworker identities through a project-scoped directory instead of the own-profile RLS query', async () => {
    const db = createRecordedSupabase([
      { status: 200, body: [{ project_id: 'p', user_id: 'owner', role: 'owner' }, { project_id: 'p', user_id: 'editor', role: 'editor' }] },
      { status: 200, body: [{ id: 'owner', full_name: 'Julio', email: 'owner@example.test', username: null }, { id: 'editor', full_name: 'Sofia', email: 'editor@example.test', username: null }] },
    ]);
    const members = await new CollaborationRepo(db.client as never).listMembers('p');
    expect(members.map(member => member.profiles?.full_name)).toEqual(['Julio', 'Sofia']);
    expect(db.requests[1]).toMatchObject({ method: 'POST', body: { p_project_id: 'p', p_user_ids: ['owner', 'editor'] } });
    expect(db.requests.some(request => request.url.pathname.endsWith('/profiles'))).toBe(false);
    db.assertDrained();
  });
  it.each(['hasEmail','members','member','document','update','invitations','pending','token','createInvite','revoke','mark','accept','presence','upsert','activity','event'] as const)('redacts SDK %s failure without retry',async method=>{
    const db=createRecordedSupabase([{status:503,body:{message:'private'}}]); const repo=new CollaborationRepo(db.client as never);
    const operations={hasEmail:()=>repo.hasMemberEmail({projectId:'p',email:'a@example.com'}),members:()=>repo.listMembers('p'),member:()=>repo.findMemberByUserId({projectId:'p',userId:'u'}),document:()=>repo.documentExistsInProject({projectId:'p',documentId:'d'}),update:()=>repo.updateMemberRole({projectId:'p',userId:'u',role:'viewer'}),invitations:()=>repo.listInvitations('p'),pending:()=>repo.findPendingInvitationByEmail({projectId:'p',email:'a@example.com'}),token:()=>repo.findInvitationByToken('t'),createInvite:()=>repo.createInvitation({projectId:'p',email:'a@example.com',role:'viewer',token:'t',expiresAt:'2026-01-01',actorUserId:'u'}),revoke:()=>repo.revokeInvitation({projectId:'p',invitationId:'i'}),mark:()=>repo.markInvitationAccepted({invitationId:'i',userId:'u'}),accept:()=>repo.acceptInvitationAtomically('t'),presence:()=>repo.listPresence({projectId:'p'}),upsert:()=>repo.upsertPresence({projectId:'p',userId:'u',resourceType:'project',resourceId:'p',presenceState:'viewing',metadata:{}}),activity:()=>repo.listActivity('p'),event:()=>repo.createActivity({projectId:'p',eventType:'event',actorUserId:'u'})};
    await expect(operations[method]()).rejects.toMatchObject({status:503,message:'DEPENDENCY_UNAVAILABLE'}); expect(db.requests).toHaveLength(1); db.assertDrained();
  });
  it("removes membership with an actor-bound atomic RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    const repo = new CollaborationRepo({ rpc } as never);
    await repo.removeMember({ projectId: "project-1", userId: "viewer", actorUserId: "viewer" });
    expect(rpc).toHaveBeenCalledWith("remove_project_member_atomic", { p_project_id: "project-1", p_user_id: "viewer", p_actor_user_id: "viewer" });
  });
  it.each(SUPABASE_FAILURE_CASES)("normalizes RPC response $name once", async failureCase => {
    const error = freshProviderFailure(failureCase);
    const rpc = jest.fn().mockResolvedValue({ data: null, error });
    const observed = await captureRejection(new CollaborationRepo({ rpc } as never).removeMember({ projectId: "project-1", userId: "viewer", actorUserId: "viewer" }));
    expectSafeDependencyFailure(observed, failureCase);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("preserves known SQL domain markers even when returned with HTTP500", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "PROJECT_MEMBER_NOT_FOUND" }, status: 500 });
    await expect(new CollaborationRepo({ rpc } as never).removeMember({ projectId: "project-1", userId: "viewer", actorUserId: "viewer" })).rejects.toMatchObject({ code: "P0001", message: "PROJECT_MEMBER_NOT_FOUND" });
  });
  it("creates an invited member with INSERT instead of UPSERT", async () => {
    const member = {
      project_id: "project-1",
      user_id: "user-2",
      role: "editor",
      created_at: "2026-07-12T00:00:00.000Z",
    };
    const insertResult = {
      data: null,
      error: null,
      select: jest.fn(),
    };
    const insertReturningQuery = {
      single: jest.fn().mockResolvedValue({ data: member, error: null }),
    };
    insertResult.select.mockReturnValue(insertReturningQuery);

    const memberWriteQuery = {
      insert: jest.fn(),
      upsert: jest.fn(),
    };
    memberWriteQuery.insert.mockReturnValue(insertResult);
    memberWriteQuery.upsert.mockReturnValue(insertResult);

    const memberReadQuery = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn(),
    };
    memberReadQuery.select.mockReturnValue(memberReadQuery);
    memberReadQuery.eq.mockReturnValue(memberReadQuery);
    memberReadQuery.maybeSingle.mockResolvedValue({ data: member, error: null });

    const profileQuery = {
      select: jest.fn(),
      in: jest.fn(),
    };
    profileQuery.select.mockReturnValue(profileQuery);
    profileQuery.in.mockResolvedValue({ data: [], error: null });

    let projectMemberQueryCount = 0;
    const db = {
      rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
      from: jest.fn((table: string) => {
        if (table !== "project_members") return profileQuery;
        projectMemberQueryCount += 1;
        return projectMemberQueryCount === 1
          ? memberWriteQuery
          : memberReadQuery;
      }),
    };
    const repo = new CollaborationRepo(db as never);

    await repo.createMember({
      projectId: "project-1",
      userId: "user-2",
      role: "editor",
    });

    expect(memberWriteQuery.insert).toHaveBeenCalledWith({
      project_id: "project-1",
      user_id: "user-2",
      role: "editor",
    });
    expect(memberWriteQuery.upsert).not.toHaveBeenCalled();
    expect(insertResult.select).not.toHaveBeenCalled();
    expect(memberReadQuery.select).toHaveBeenCalled();
  });

  it("propagates duplicate membership errors without overwriting the existing role", async () => {
    const duplicateError = Object.assign(new Error("duplicate membership"), {
      code: "23505",
    });
    const memberWriteQuery = {
      insert: jest.fn().mockResolvedValue({ data: null, error: duplicateError }),
      upsert: jest.fn(),
      update: jest.fn(),
    };
    const db = { from: jest.fn().mockReturnValue(memberWriteQuery) };
    const repo = new CollaborationRepo(db as never);

    await expect(
      repo.createMember({
        projectId: "project-1",
        userId: "user-2",
        role: "viewer",
      })
    ).rejects.toBe(duplicateError);

    expect(memberWriteQuery.upsert).not.toHaveBeenCalled();
    expect(memberWriteQuery.update).not.toHaveBeenCalled();
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("reports a post-insert lookup failure without claiming rollback", async () => {
    const memberWriteQuery = {
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    const memberReadQuery = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    memberReadQuery.select.mockReturnValue(memberReadQuery);
    memberReadQuery.eq.mockReturnValue(memberReadQuery);
    const db = {
      from: jest
        .fn()
        .mockReturnValueOnce(memberWriteQuery)
        .mockReturnValueOnce(memberReadQuery),
    };
    const repo = new CollaborationRepo(db as never);

    await expect(
      repo.createMember({
        projectId: "project-1",
        userId: "user-2",
        role: "editor",
      })
    ).rejects.toThrow("Created project member could not be loaded");
  });
});
