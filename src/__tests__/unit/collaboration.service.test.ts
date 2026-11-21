import { CollaborationService } from "@/src/modules/collaboration/collaboration.service";
import {
  SUPABASE_FAILURE_CASES,
  captureRejection,
  expectSafeDependencyFailure,
  freshProviderFailure,
} from "@/__tests__/backend/supabase-failure-cases";

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    findMemberByUserId: jest.fn().mockResolvedValue({
      project_id: "project-1",
      user_id: "owner-1",
      role: "owner",
    }),
    findMemberByEmail: jest.fn().mockResolvedValue(null),
    hasMemberEmail: jest.fn().mockResolvedValue(false),
    listMembers: jest.fn().mockResolvedValue([
      {
        project_id: "project-1",
        user_id: "owner-1",
        role: "owner",
        created_at: "2026-01-01T00:00:00.000Z",
        profiles: { full_name: "Owner", email: "owner@example.com" },
      },
    ]),
    listInvitations: jest.fn().mockResolvedValue([
      {
        id: "invite-1",
        project_id: "project-1",
        email: "ana@example.com",
        role: "editor",
        token: "secret-token",
        status: "pending",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      },
    ]),
    findPendingInvitationByEmail: jest.fn().mockResolvedValue(null),
    createInvitation: jest.fn().mockImplementation(async (input) => ({
      id: "invite-1",
      project_id: input.projectId,
      email: input.email,
      role: input.role,
      token: input.token,
      status: "pending",
      expires_at: input.expiresAt,
    })),
    findInvitationByToken: jest.fn().mockResolvedValue({
      id: "invite-1",
      project_id: "project-1",
      email: "ana@example.com",
      role: "editor",
      status: "pending",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    }),
    createMember: jest.fn().mockResolvedValue({
      project_id: "project-1",
      user_id: "user-2",
      role: "editor",
    }),
    markInvitationAccepted: jest.fn().mockResolvedValue(undefined),
    acceptInvitationAtomically: jest.fn().mockResolvedValue({
      invitation: {
        id: "invite-1",
        project_id: "project-1",
        email: "ana@example.com",
        role: "editor",
        status: "accepted",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      },
      member: {
        project_id: "project-1",
        user_id: "user-2",
        role: "editor",
      },
    }),
    listPresence: jest.fn().mockResolvedValue([]),
    listActivity: jest.fn().mockResolvedValue([]),
    upsertPresence: jest.fn().mockResolvedValue({
      id: "presence-1",
      project_id: "project-1",
      user_id: "user-1",
      resource_type: "document",
      resource_id: "document-1",
      presence_state: "editing",
    }),
    createActivity: jest.fn().mockResolvedValue(undefined),
    removeMember: jest.fn().mockResolvedValue(undefined),
    documentExistsInProject: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("CollaborationService", () => {
  it.each(['revoked','accepted'])('rejects %s invitations without any mutation or audit',async status=>{
    const repo=makeRepo({findInvitationByToken:jest.fn().mockResolvedValue({status})});
    await expect(new CollaborationService(repo as never).acceptInvitation({token:'t',userId:'u',userEmail:'ana@example.com'})).rejects.toMatchObject({status:404,message:'PROJECT_INVITATION_NOT_FOUND'});
    expect(repo.acceptInvitationAtomically).not.toHaveBeenCalled(); expect(repo.createActivity).not.toHaveBeenCalled();
  });
  it('rejects wrong-email invitation before atomic mutation or audit',async()=>{
    const repo=makeRepo();
    await expect(new CollaborationService(repo as never).acceptInvitation({token:'t',userId:'u',userEmail:'outsider@example.com'})).rejects.toMatchObject({status:403,message:'PROJECT_INVITATION_EMAIL_MISMATCH'});
    expect(repo.acceptInvitationAtomically).not.toHaveBeenCalled(); expect(repo.createActivity).not.toHaveBeenCalled();
  });
  it.each([['PROJECT_INVITATION_EXPIRED',410],['PROJECT_INVITATION_EMAIL_MISMATCH',403],['PROJECT_INVITATION_NOT_FOUND',404],['PROJECT_INVITATION_ALREADY_ACCEPTED',409],['PROJECT_INVITATION_NOT_PENDING',409],['PROJECT_MEMBER_ALREADY_EXISTS',409]])('maps atomic accept rejection %s without audit',async(message,status)=>{
    const repo=makeRepo({acceptInvitationAtomically:jest.fn().mockRejectedValue({code:'P0001',message})});
    await expect(new CollaborationService(repo as never).acceptInvitation({token:'t',userId:'u',userEmail:'ana@example.com'})).rejects.toMatchObject({status});
    expect(repo.createActivity).not.toHaveBeenCalled(); expect(repo.acceptInvitationAtomically).toHaveBeenCalledTimes(1);
  });
  it("allows self-leave using one atomic write without a post-removal activity write", async () => {
    const repo = makeRepo({ removeMember: jest.fn().mockResolvedValue(undefined) });
    const service = new CollaborationService(repo as never);
    await expect(service.removeMember({ projectId: "project-1", targetUserId: "viewer", actorUserId: "viewer" })).resolves.toBeUndefined();
    expect(repo.removeMember).toHaveBeenCalledWith({ projectId: "project-1", userId: "viewer", actorUserId: "viewer" });
    expect(repo.createActivity).not.toHaveBeenCalled();
  });

  it.each([
    ["CANNOT_REMOVE_SELF", 400], ["PROJECT_MEMBER_OWNER_PROTECTED", 400],
    ["PROJECT_MEMBER_NOT_FOUND", 404], ["FORBIDDEN", 403], ["UNAUTHORIZED", 401],
  ])("maps atomic removal marker %s", async (message, status) => {
    const repo = makeRepo({ removeMember: jest.fn().mockRejectedValue({ code: "P0001", message }) });
    await expect(new CollaborationService(repo as never).removeMember({ projectId: "project-1", targetUserId: "viewer", actorUserId: "owner" })).rejects.toMatchObject({ message, status });
    expect(repo.createActivity).not.toHaveBeenCalled();
  });

  it.each(SUPABASE_FAILURE_CASES)("redacts removal $name without retry or activity", async (failureCase) => {
    const removeMember = jest.fn().mockRejectedValue(freshProviderFailure(failureCase));
    const repo = makeRepo({ removeMember });
    const observed = await captureRejection(new CollaborationService(repo as never).removeMember({ projectId: "project-1", targetUserId: "viewer", actorUserId: "owner" }));
    expectSafeDependencyFailure(observed, failureCase);
    expect(removeMember).toHaveBeenCalledTimes(1);
    expect(repo.createActivity).not.toHaveBeenCalled();
  });
  it("creates a pending invitation with a normalized email and expiring token", async () => {
    const repo = makeRepo();
    const service = new CollaborationService(repo as never);

    const invitation = await service.inviteMember({
      projectId: "project-1",
      actorUserId: "owner-1",
      input: {
        email: "  ANA@Example.COM ",
        role: "editor",
      },
    });

    expect(repo.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        email: "ana@example.com",
        role: "editor",
        token: expect.any(String),
        expiresAt: expect.any(String),
        actorUserId: "owner-1",
      })
    );
    expect(invitation.email).toBe("ana@example.com");
  });

  it("rejects invitations that try to grant owner permissions", async () => {
    const service = new CollaborationService(makeRepo() as never);

    await expect(
      service.inviteMember({
        projectId: "project-1",
        actorUserId: "owner-1",
        input: {
          email: "ana@example.com",
          role: "owner" as never,
        },
      })
    ).rejects.toMatchObject({ status: 400, message: "INVALID_INVITATION_ROLE" });
  });

  it("accepts a pending invitation and creates project membership", async () => {
    const repo = makeRepo();
    const service = new CollaborationService(repo as never);

    const result = await service.acceptInvitation({
      token: "token-1",
      userId: "user-2",
      userEmail: "ana@example.com",
    });

    expect(repo.acceptInvitationAtomically).toHaveBeenCalledWith("token-1");
    expect(result.member.role).toBe("editor");
  });

  it("rejects an expired pending invitation without creating membership", async () => {
    const repo = makeRepo({
      findInvitationByToken: jest.fn().mockResolvedValue({
        id: "invite-expired",
        project_id: "project-1",
        email: "ana@example.com",
        role: "editor",
        status: "pending",
        expires_at: "2020-01-01T00:00:00.000Z",
      }),
    });
    const service = new CollaborationService(repo as never);

    await expect(
      service.acceptInvitation({
        token: "expired-token",
        userId: "user-2",
        userEmail: "ana@example.com",
      })
    ).rejects.toMatchObject({
      status: 410,
      message: "PROJECT_INVITATION_EXPIRED",
    });
    expect(repo.createMember).not.toHaveBeenCalled();
    expect(repo.markInvitationAccepted).not.toHaveBeenCalled();
    expect(repo.createActivity).not.toHaveBeenCalled();
  });

  it("propagates duplicate membership creation without accepting the invitation", async () => {
    const duplicateError = Object.assign(new Error("duplicate membership"), {
      code: "23505",
    });
    const repo = makeRepo({
      acceptInvitationAtomically: jest.fn().mockRejectedValue(duplicateError),
    });
    const service = new CollaborationService(repo as never);

    await expect(
      service.acceptInvitation({
        token: "token-1",
        userId: "user-2",
        userEmail: "ana@example.com",
      })
    ).rejects.toBe(duplicateError);

    expect(repo.createActivity).not.toHaveBeenCalled();
  });

  it("can load the workspace without exposing pending invitations", async () => {
    const repo = makeRepo();
    const service = new CollaborationService(repo as never);

    const workspace = await service.getWorkspace("project-1", {
      includeInvitations: false,
    });

    expect(repo.listInvitations).not.toHaveBeenCalled();
    expect(workspace.members).toHaveLength(1);
    expect(workspace.invitations).toEqual([]);
  });

  it("publishes cheap document presence and returns other active collaborators", async () => {
    const repo = makeRepo({
      listPresence: jest.fn().mockResolvedValue([
        {
          id: "presence-2",
          project_id: "project-1",
          user_id: "user-2",
          resource_type: "document",
          resource_id: "document-1",
          presence_state: "editing",
          profiles: { full_name: "Ana", email: "ana@example.com" },
        },
      ]),
    });
    const service = new CollaborationService(repo as never);

    const result = await service.touchPresence({
      projectId: "project-1",
      userId: "user-1",
      input: {
        resource_type: "document",
        resource_id: "document-1",
        presence_state: "editing",
        metadata: {},
      },
    });

    expect(repo.upsertPresence).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        userId: "user-1",
        resourceType: "document",
        resourceId: "document-1",
        presenceState: "editing",
      })
    );
    expect(result.active).toHaveLength(1);
    expect(result.active[0].display_name).toBe("Ana");
  });

  it("rejects document presence when the document belongs to another project", async () => {
    const repo = makeRepo({
      documentExistsInProject: jest.fn().mockResolvedValue(false),
    });
    const service = new CollaborationService(repo as never);

    await expect(
      service.touchPresence({
        projectId: "project-1",
        userId: "user-1",
        input: {
          resource_type: "document",
          resource_id: "00000000-0000-4000-8000-000000000001",
          presence_state: "viewing",
          metadata: {},
        },
      })
    ).rejects.toMatchObject({ status: 404, message: "DOCUMENT_NOT_FOUND" });
    expect(repo.upsertPresence).not.toHaveBeenCalled();
  });

  it.each(SUPABASE_FAILURE_CASES)(
    "RED: translates $name before creating an invitation or activity",
    async (failureCase) => {
      const repo = makeRepo({
        hasMemberEmail: jest
          .fn()
          .mockRejectedValue(freshProviderFailure(failureCase)),
      });
      const service = new CollaborationService(repo as never);

      const observed = await captureRejection(
        service.inviteMember({
          projectId: "project-1",
          actorUserId: "owner-1",
          actorEmail: "owner@example.com",
          input: { email: "ana@example.com", role: "editor" },
        })
      );

      expectSafeDependencyFailure(observed, failureCase);
      expect(repo.createInvitation).not.toHaveBeenCalled();
      expect(repo.createActivity).not.toHaveBeenCalled();
    }
  );
});
