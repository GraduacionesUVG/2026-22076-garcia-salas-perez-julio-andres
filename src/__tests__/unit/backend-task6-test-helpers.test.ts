import {
  classifyInvitationRace,
  parseMarkedProjectId,
  parsePresenceSnapshot,
  parseTeamSnapshot,
} from "@/__tests__/backend/task6-test-helpers";

describe("Task 6 marked project helpers", () => {
  it("returns a safely parsed UUID for the expected marked project", () => {
    expect(
      parseMarkedProjectId(
        {
          project: {
            id: "123e4567-e89b-42d3-a456-426614174000",
            name: "E2E_20260712_abcdef marked project",
          },
        },
        "E2E_20260712_abcdef"
      )
    ).toBe("123e4567-e89b-42d3-a456-426614174000");
  });

  it.each([
    null,
    {},
    { project: { id: "not-a-uuid", name: "E2E_20260712_abcdef project" } },
    {
      project: {
        id: "123e4567-e89b-42d3-a456-426614174000",
        name: "another run",
      },
    },
  ])("rejects an unsafe marked project response: %#", (body) => {
    expect(() => parseMarkedProjectId(body, "E2E_20260712_abcdef")).toThrow(
      "Invalid marked project response"
    );
  });
});

describe("Task 6 team snapshot helpers", () => {
  it("parses members and invitations without retaining mutable response objects", () => {
    const body = {
      members: [{ user_id: "user-1", role: "editor" }],
      invitations: [{ id: "invite-1", status: "pending", email: "a@b.test" }],
    };

    const snapshot = parseTeamSnapshot(body);
    body.members[0].role = "viewer";
    body.invitations[0].status = "revoked";

    expect(snapshot).toEqual({
      members: [{ userId: "user-1", role: "editor" }],
      invitations: [
        { id: "invite-1", status: "pending", email: "a@b.test" },
      ],
    });
  });

  it("parses presence records needed to prove cross-project isolation", () => {
    expect(
      parsePresenceSnapshot({
        presence: [
          {
            project_id: "project-1",
            user_id: "user-1",
            resource_type: "document",
            resource_id: "document-1",
            presence_state: "viewing",
          },
        ],
      })
    ).toEqual([
      {
        projectId: "project-1",
        userId: "user-1",
        resourceType: "document",
        resourceId: "document-1",
        presenceState: "viewing",
      },
    ]);
  });

  it.each([null, {}, { presence: null }, { presence: [{ project_id: 7 }] }])(
    "rejects malformed presence snapshots: %#",
    (body) => {
      expect(() => parsePresenceSnapshot(body)).toThrow(
        "Invalid presence snapshot"
      );
    }
  );

  it.each([
    null,
    {},
    { members: null, invitations: [] },
    { members: [], invitations: [{ id: "x", status: "unknown", email: "a" }] },
  ])("rejects malformed team snapshots: %#", (body) => {
    expect(() => parseTeamSnapshot(body)).toThrow("Invalid team snapshot");
  });

  it("classifies exactly one accepted terminal state", () => {
    expect(
      classifyInvitationRace({
        acceptStatus: 200,
        revokeStatus: 404,
        memberExists: true,
        invitationStatus: "accepted",
      })
    ).toBe("accepted");
  });

  it("classifies exactly one revoked terminal state", () => {
    expect(
      classifyInvitationRace({
        acceptStatus: 404,
        revokeStatus: 200,
        memberExists: false,
        invitationStatus: "revoked",
      })
    ).toBe("revoked");
  });

  it.each([
    {
      acceptStatus: 200,
      revokeStatus: 200,
      memberExists: true,
      invitationStatus: "revoked" as const,
    },
    {
      acceptStatus: 500,
      revokeStatus: 500,
      memberExists: false,
      invitationStatus: "pending" as const,
    },
    {
      acceptStatus: 200,
      revokeStatus: 404,
      memberExists: false,
      invitationStatus: "accepted" as const,
    },
  ])("rejects an inconsistent race terminal state: %#", (state) => {
    expect(() => classifyInvitationRace(state)).toThrow(
      "Inconsistent invitation race terminal state"
    );
  });
});
