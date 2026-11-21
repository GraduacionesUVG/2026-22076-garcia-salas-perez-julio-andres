import {
  expect,
  request as playwrightRequest,
  test,
  type APIResponse,
} from "@playwright/test";
import {
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  parsePresenceSnapshot,
  parseTeamSnapshot,
} from "@/__tests__/backend/task6-test-helpers";
import {
  closeQaSessions,
  createQaSessions,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";

export const BACKEND_ROUTE_COVERAGE = [
  ["POST", "/api/project-invitations/accept"],
  ["POST", "/api/projects/:id/team/invitations/:invitationId/revoke"],
  ["PATCH", "/api/projects/:id/team/members/:userId"],
  ["DELETE", "/api/projects/:id/team/members/:userId"],
  ["POST", "/api/projects/:id/team/presence"],
  ["GET", "/api/projects/:id/team"],
  ["POST", "/api/projects/:id/team"],
] as const;

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;

async function json(response: APIResponse): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function inviteIntruder(role: "editor" | "viewer" = "viewer") {
  const response = await sessions.owner.request.post(
    `/api/projects/${fixture!.project.id}/team`,
    { data: { email: sessions.config.intruderEmail, role } }
  );
  const value = await json(response);
  expect(response.status()).toBe(201);
  const invitation = value.invitation as { id: string; token: string; status: string };
  const workspace = parseTeamSnapshot(
    await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`))
  );
  expect(workspace.invitations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: invitation.id, status: "pending" }),
    ])
  );
  return invitation;
}

test.beforeAll(async () => {
  sessions = await createQaSessions();
});

test.beforeEach(async () => {
  fixture = await createQaProjectFixture(sessions);
});

test.afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

test.afterAll(async () => {
  if (sessions) await closeQaSessions(sessions);
});

test(actionEvidenceTitle(
  "team.workspace.read",
  ["success", "cleanup"],
  "shows invitations only to the owner workspace"
), async () => {
  await inviteIntruder();
  const owner = await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`);
  const ownerBody = await json(owner);
  expect(owner.status()).toBe(200);
  expect(
    parseTeamSnapshot(ownerBody).invitations.filter(
      (invitation) =>
        invitation.email === sessions.config.intruderEmail &&
        invitation.status === "pending"
    )
  ).toHaveLength(1);

  for (const identity of ["editor", "viewer"] as const) {
    const response = await sessions[identity].request.get(
      `/api/projects/${fixture!.project.id}/team`
    );
    const value = await json(response);
    expect(response.status()).toBe(200);
    expect(value.currentRole).toBe(identity);
    expect(value.invitations).toEqual([]);
  }
});

test(actionEvidenceTitle(
  "team.member.invite",
  ["success", "persistence", "permissions", "cleanup"],
  "allows only the owner to invite and normalizes email"
), async () => {
  for (const identity of ["editor", "viewer", "intruder"] as const) {
    const response = await sessions[identity].request.post(
      `/api/projects/${fixture!.project.id}/team`,
      { data: { email: sessions.config.intruderEmail, role: "viewer" } }
    );
    expect([403, 404]).toContain(response.status());
  }

  const response = await sessions.owner.request.post(
    `/api/projects/${fixture!.project.id}/team`,
    { data: { email: `  ${sessions.config.intruderEmail.toUpperCase()}  `, role: "editor" } }
  );
  expect(response.status()).toBe(201);
  expect((await json(response)).invitation).toEqual(
    expect.objectContaining({ email: sessions.config.intruderEmail, role: "editor", status: "pending" })
  );

  const workspace = parseTeamSnapshot(
    await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`))
  );
  expect(workspace.invitations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ email: sessions.config.intruderEmail, status: "pending" }),
    ])
  );
});

for (const [index, data] of [
  { email: "bad", role: "viewer" },
  { email: "a@b.test", role: "owner" },
  { email: "a@b.test", role: "admin" },
  { email: "a@b.test", role: "viewer", extra: true },
  { role: "viewer" },
  null,
] .entries()) {
  test(actionEvidenceTitle(
    "team.member.invite",
    ["validation"],
    `rejects invalid invitation payload case ${index + 1}`
  ), async () => {
    const response = await sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/team`,
      { data }
    );
    expect(response.status()).toBe(400);
  });
}

test(actionEvidenceTitle(
  "team.member.invite",
  ["duplicate"],
  "rejects self, existing-member, and duplicate pending invitations"
), async () => {
  for (const email of [sessions.config.ownerEmail, sessions.config.editorEmail]) {
    const response = await sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/team`,
      { data: { email, role: "viewer" } }
    );
    expect(response.status()).toBe(409);
  }

  await inviteIntruder();
  const duplicate = await sessions.owner.request.post(
    `/api/projects/${fixture!.project.id}/team`,
    { data: { email: sessions.config.intruderEmail, role: "editor" } }
  );
  expect(duplicate.status()).toBe(409);

  const workspace = parseTeamSnapshot(
    await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`))
  );
  expect(
    workspace.invitations.filter(
      (item) => item.email === sessions.config.intruderEmail && item.status === "pending"
    )
  ).toHaveLength(1);
});

test(actionEvidenceTitle(
  "team.project-invitation.accept",
  ["success", "persistence", "permissions", "duplicate", "cleanup"],
  "accepts once for the intended user and rejects a replay"
), async () => {
  const invitation = await inviteIntruder("editor");
  const wrong = await sessions.editor.request.post("/api/project-invitations/accept", {
    data: { token: invitation.token },
  });
  expect(wrong.status()).toBe(403);

  const accepted = await sessions.intruder.request.post("/api/project-invitations/accept", {
    data: { token: invitation.token },
  });
  expect(accepted.status()).toBe(200);

  const replay = await sessions.intruder.request.post("/api/project-invitations/accept", {
    data: { token: invitation.token },
  });
  expect([404, 409]).toContain(replay.status());

  const team = parseTeamSnapshot(
    await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`))
  );
  expect(team.members.filter((member) => member.userId === sessions.intruder.user.id)).toEqual([
    { userId: sessions.intruder.user.id, role: "editor" },
  ]);
});

for (const [index, token] of ["short", "x".repeat(257), null, { nested: true }].entries()) {
  test(actionEvidenceTitle(
    "team.project-invitation.accept",
    ["validation"],
    `rejects malformed invitation token case ${index + 1}`
  ), async () => {
    const response = await sessions.intruder.request.post(
      "/api/project-invitations/accept",
      { data: { token } }
    );
    expect(response.status()).toBe(400);
  });
}

test(actionEvidenceTitle(
  "team.invitation.revoke",
  ["success", "persistence", "permissions", "cleanup"],
  "revokes a pending invitation once and denies non-owner replay"
), async () => {
  const invitation = await inviteIntruder();
  const path = `/api/projects/${fixture!.project.id}/team/invitations/${invitation.id}/revoke`;
  expect((await sessions.editor.request.post(path)).status()).toBe(403);
  expect((await sessions.owner.request.post(path)).status()).toBe(200);
  expect((await sessions.owner.request.post(path)).status()).toBe(404);

  const workspace = parseTeamSnapshot(
    await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`))
  );
  expect(workspace.invitations.find((item) => item.id === invitation.id)?.status).toBe("revoked");

  const accept = await sessions.intruder.request.post("/api/project-invitations/accept", {
    data: { token: invitation.token },
  });
  expect(accept.status()).toBe(404);
});

test(actionEvidenceTitle(
  "team.invitation.revoke",
  ["validation"],
  "rejects a malformed invitation identity"
), async () => {
  const response = await sessions.owner.request.post(
    `/api/projects/${fixture!.project.id}/team/invitations/not-a-uuid/revoke`
  );
  expect(response.status()).toBe(400);
});

test(actionEvidenceTitle(
  "team.member-role.update",
  ["success", "persistence", "validation", "cleanup"],
  "changes member role and rejects invalid role changes"
), async () => {
  const editorPath = `/api/projects/${fixture!.project.id}/team/members/${sessions.editor.user.id}`;
  const update = await sessions.owner.request.patch(editorPath, { data: { role: "viewer" } });
  expect(update.status()).toBe(200);
  expect((await json(update)).member).toEqual(
    expect.objectContaining({ user_id: sessions.editor.user.id, role: "viewer" })
  );

  const workspace = parseTeamSnapshot(
    await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`))
  );
  expect(workspace.members).toContainEqual({ userId: sessions.editor.user.id, role: "viewer" });

  const own = await sessions.owner.request.patch(
    `/api/projects/${fixture!.project.id}/team/members/${sessions.owner.user.id}`,
    { data: { role: "viewer" } }
  );
  expect(own.status()).toBe(400);

  for (const data of [{ role: "owner" }, { role: "admin" }, { role: "editor", extra: true }]) {
    expect((await sessions.owner.request.patch(editorPath, { data })).status()).toBe(400);
  }
});

test("owner cannot remove self; non-owner cannot remove another member", async () => {
  const ownPath = `/api/projects/${fixture!.project.id}/team/members/${sessions.owner.user.id}`;
  expect((await sessions.owner.request.delete(ownPath)).status()).toBe(400);

  const viewerPath = `/api/projects/${fixture!.project.id}/team/members/${sessions.viewer.user.id}`;
  expect((await sessions.editor.request.delete(viewerPath)).status()).toBe(403);
  const editorPath = `/api/projects/${fixture!.project.id}/team/members/${sessions.editor.user.id}`;
  expect((await sessions.viewer.request.delete(editorPath)).status()).toBe(403);
  expect((await sessions.intruder.request.delete(viewerPath)).status()).toBe(403);
  const workspace = parseTeamSnapshot(await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`)));
  for (const identity of ["owner", "editor", "viewer"] as const) {
    expect(workspace.members.some(member => member.userId === sessions[identity].user.id)).toBe(true);
  }
});

test(actionEvidenceTitle(
  "team.member.remove",
  ["validation"],
  "rejects a malformed member identity"
), async () => {
  const response = await sessions.owner.request.delete(
    `/api/projects/${fixture!.project.id}/team/members/not-a-uuid`
  );
  expect(response.status()).toBe(400);
});

for (const identity of ["editor", "viewer"] as const) test(actionEvidenceTitle(
  "team.member.remove",
  ["success", "persistence", "cleanup"],
  `allows ${identity} to remove their own membership`
), async () => {
  const memberPath = `/api/projects/${fixture!.project.id}/team/members/${sessions[identity].user.id}`;
  const remove = await sessions[identity].request.delete(memberPath);
  expect(remove.status()).toBe(200);

  const workspace = parseTeamSnapshot(
    await json(
      await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`)
    )
  );
  expect(workspace.members.some((member) => member.userId === sessions[identity].user.id)).toBe(
    false
  );
  expect((await sessions[identity].request.get(`/api/projects/${fixture!.project.id}/team`)).status()).toBe(403);
});

test("owner removes another member and preserves ownership", async () => {
  const response = await sessions.owner.request.delete(`/api/projects/${fixture!.project.id}/team/members/${sessions.viewer.user.id}`);
  expect(response.status()).toBe(200);
  const workspace = parseTeamSnapshot(await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`)));
  expect(workspace.members.some(member => member.userId === sessions.viewer.user.id)).toBe(false);
  expect(workspace.members.find(member => member.userId === sessions.owner.user.id)?.role).toBe("owner");
});

test("cross-project member id does not mutate the target project", async () => {
  const foreign = await createQaProjectFixture(sessions);
  try {
    const invitation = await sessions.owner.request.post(
      `/api/projects/${foreign.project.id}/team`,
      { data: { email: sessions.config.intruderEmail, role: "viewer" } }
    );
    const token = ((await invitation.json()).invitation as { token: string }).token;
    expect(
      (await sessions.intruder.request.post("/api/project-invitations/accept", { data: { token } })).status()
    ).toBe(200);

    const patch = await sessions.owner.request.patch(
      `/api/projects/${fixture!.project.id}/team/members/${sessions.intruder.user.id}`,
      { data: { role: "editor" } }
    );
    expect(patch.status()).toBe(404);
  } finally {
    await foreign.cleanup();
  }
});

test(actionEvidenceTitle(
  "team.presence.touch",
  ["success", "persistence", "cleanup"],
  "publishes bounded project presence for every project role"
), async () => {
  for (const identity of ["owner", "editor", "viewer"] as const) {
    const response = await sessions[identity].request.post(
      `/api/projects/${fixture!.project.id}/team/presence`,
      {
        data: {
          resource_type: "project",
          presence_state: identity === "viewer" ? "viewing" : "editing",
          metadata: { surface: "team-tests" },
        },
      }
    );
    expect(response.status()).toBe(200);
    expect((await json(response)).presence).toEqual(
      expect.objectContaining({ project_id: fixture!.project.id, user_id: sessions[identity].user.id })
    );

    const workspace = await sessions[identity].request.get(
      `/api/projects/${fixture!.project.id}/team`
    );
    expect(workspace.status()).toBe(200);
    expect(parsePresenceSnapshot(await json(workspace))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId: fixture!.project.id,
          userId: sessions[identity].user.id,
          resourceType: "project",
          presenceState: identity === "viewer" ? "viewing" : "editing",
        }),
      ])
    );
  }
});

test("intruder cannot publish presence in a project they cannot access", async () => {
  const response = await sessions.intruder.request.post(
    `/api/projects/${fixture!.project.id}/team/presence`,
    {
      data: {
        resource_type: "project",
        presence_state: "viewing",
      },
    }
  );
  expect([403, 404]).toContain(response.status());
});

const anonymousCollaborationCases = [
  [actionEvidenceTitle("team.workspace.read", ["permissions"], "denies anonymous team reads"), "get", () => `/api/projects/${fixture!.project.id}/team`, undefined],
  [actionEvidenceTitle("team.member.invite", ["permissions"], "denies anonymous invitations"), "post", () => `/api/projects/${fixture!.project.id}/team`, { email: "intruder@example.test", role: "viewer" }],
  [actionEvidenceTitle("team.invitation.revoke", ["permissions"], "denies anonymous invitation revocation"), "post", () => `/api/projects/${fixture!.project.id}/team/invitations/123e4567-e89b-42d3-a456-426614174000/revoke`, undefined],
  [actionEvidenceTitle("team.member-role.update", ["permissions"], "denies anonymous role updates"), "patch", () => `/api/projects/${fixture!.project.id}/team/members/${sessions.viewer.user.id}`, { role: "editor" }],
  [actionEvidenceTitle("team.member.remove", ["permissions"], "denies anonymous member removal"), "delete", () => `/api/projects/${fixture!.project.id}/team/members/${sessions.viewer.user.id}`, undefined],
  [actionEvidenceTitle("team.presence.touch", ["permissions"], "denies anonymous presence updates"), "post", () => `/api/projects/${fixture!.project.id}/team/presence`, { resource_type: "project", presence_state: "viewing" }],
  [actionEvidenceTitle("team.project-invitation.accept", ["permissions"], "denies anonymous invitation acceptance"), "post", () => "/api/project-invitations/accept", { token: "x".repeat(64) }],
] as const;

for (const [title, method, path, data] of anonymousCollaborationCases) {
  test(title, async () => {
    const baseURL = process.env.BACKEND_TEST_BASE_URL ?? "http://localhost:3000";
    const anonymous = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { origin: new URL(baseURL).origin },
    });
    try {
      const response = await anonymous[method](
        path(),
        data === undefined ? {} : { data }
      );
      expect(response.status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
  });
}

for (const [index, data] of [
  { resource_type: "unknown" },
  { resource_type: "document", resource_id: "not-a-uuid" },
  { resource_type: "project", presence_state: "offline" },
  { resource_type: "project", extra: true },
] .entries()) {
  test(actionEvidenceTitle(
    "team.presence.touch",
    ["validation"],
    `rejects malformed presence case ${index + 1}`
  ), async () => {
    const response = await sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/team/presence`,
      { data }
    );
    expect(response.status()).toBe(400);
  });
}

test("RED: document presence rejects a real foreign document without mutation", async () => {
  const foreign = await createQaProjectFixture(sessions);
  try {
    const title = `${foreign.marker} presence document`;
    const createDocument = await sessions.owner.request.post(
      `/api/projects/${foreign.project.id}/documents`,
      { data: { title, content: "foreign presence sentinel" } }
    );
    const createBody = await json(createDocument);
    expect(createDocument.status(), JSON.stringify(createBody)).toBe(201);
    const document = createBody.document;
    expect(document).toEqual(expect.objectContaining({ id: expect.any(String), title }));
    const documentId = (document as { id: string }).id;

    const currentBefore = parsePresenceSnapshot(
      await json(
        await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`)
      )
    );
    const foreignBefore = parsePresenceSnapshot(
      await json(
        await sessions.owner.request.get(`/api/projects/${foreign.project.id}/team`)
      )
    );
    const response = await sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/team/presence`,
      {
        data: {
          resource_type: "document",
          resource_id: documentId,
          presence_state: "viewing",
        },
      }
    );
    expect([400, 404]).toContain(response.status());

    const currentAfter = parsePresenceSnapshot(
      await json(
        await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`)
      )
    );
    const foreignAfter = parsePresenceSnapshot(
      await json(
        await sessions.owner.request.get(`/api/projects/${foreign.project.id}/team`)
      )
    );
    expect(currentAfter).toEqual(currentBefore);
    expect(foreignAfter).toEqual(foreignBefore);

    const documentProof = await sessions.owner.request.get(
      `/api/projects/${foreign.project.id}/documents/${documentId}`
    );
    expect(documentProof.status()).toBe(200);
    expect((await json(documentProof)).document).toEqual(
      expect.objectContaining({ id: documentId, title })
    );
  } finally {
    await foreign.cleanup();
  }
});

test("RED: presence metadata has an application-level size bound", async () => {
  const response = await sessions.owner.request.post(
    `/api/projects/${fixture!.project.id}/team/presence`,
    {
      data: {
        resource_type: "project",
        presence_state: "viewing",
        metadata: { oversized: "x".repeat(20_000) },
      },
    }
  );
  expect([400, 413]).toContain(response.status());
});
