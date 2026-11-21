import { expect, request as playwrightRequest, test } from "@playwright/test";
import {
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  classifyInvitationRace,
  parseTeamSnapshot,
} from "@/__tests__/backend/task6-test-helpers";
import {
  closeQaSessions,
  createQaSessions,
  loginQaSession,
  type QaSession,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";

let sessions: QaSessions;
let fixture: QaProjectFixture | undefined;

async function createInvitation() {
  const response = await sessions.owner.request.post(
    `/api/projects/${fixture!.project.id}/team`,
    { data: { email: sessions.config.intruderEmail, role: "editor" } }
  );
  expect(response.status()).toBe(201);
  const invitation = (await response.json()).invitation as { id: string; token: string };
  const workspace = parseTeamSnapshot(
    await (
      await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`)
    ).json()
  );
  expect(workspace.invitations.find((item) => item.id === invitation.id)?.status).toBe("pending");
  return invitation;
}

async function secondIntruderSession(): Promise<QaSession> {
  const baseURL = process.env.BACKEND_TEST_BASE_URL ?? "http://localhost:3000";
  const request = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { origin: new URL(baseURL).origin },
  });
  return loginQaSession({
    identity: "intruder",
    email: sessions.config.intruderEmail,
    password: sessions.config.userPassword,
    request,
  });
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
  "team.member.remove",
  ["concurrency", "persistence", "cleanup"],
  "owner removal versus viewer leave yields one removal and one activity event"
), async () => {
  const memberPath = `/api/projects/${fixture!.project.id}/team/members/${sessions.viewer.user.id}`;
  const results = await Promise.all([
    sessions.owner.request.delete(memberPath),
    sessions.viewer.request.delete(memberPath),
  ]);
  expect(results.filter(response => response.status() === 200)).toHaveLength(1);
  expect([403, 404]).toContain(results.find(response => response.status() !== 200)!.status());
  const response = await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  const workspace = parseTeamSnapshot(body);
  expect(workspace.members.some(member => member.userId === sessions.viewer.user.id)).toBe(false);
  expect(body.activity.filter((event: { event_type: string; event_payload: { user_id?: string } }) =>
    event.event_type === "member_removed" && event.event_payload.user_id === sessions.viewer.user.id
  )).toHaveLength(1);
});

test(actionEvidenceTitle(
  "team.project-invitation.accept",
  ["success", "persistence", "concurrency", "cleanup"],
  "makes two simultaneous accepts yield one member"
), async () => {
  const invitation = await createInvitation();
  let second: QaSession | undefined;
  try {
    second = await secondIntruderSession();
    const [left, right] = await Promise.all([
      sessions.intruder.request.post("/api/project-invitations/accept", {
        data: { token: invitation.token },
      }),
      second.request.post("/api/project-invitations/accept", {
        data: { token: invitation.token },
      }),
    ]);
    expect([left.status(), right.status()].sort((a, b) => a - b)).toEqual([200, 409]);

    const workspace = parseTeamSnapshot(
      await (
        await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`)
      ).json()
    );
    expect(workspace.members.filter((member) => member.userId === sessions.intruder.user.id)).toHaveLength(1);
    expect(
      workspace.invitations.find((item) => item.id === invitation.id)?.status
    ).toBe("accepted");
  } finally {
    // Both contexts authenticate as the same user. Calling the logout endpoint
    // here would revoke the primary context globally and poison the next test.
    if (second) await second.request.dispose();
  }
});

test(actionEvidenceTitle(
  "team.project-invitation.accept",
  ["concurrency"],
  "leaves accept versus revoke in one consistent terminal state"
), async () => {
  const invitation = await createInvitation();
  const [accept, revoke] = await Promise.all([
    sessions.intruder.request.post("/api/project-invitations/accept", {
      data: { token: invitation.token },
    }),
    sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/team/invitations/${invitation.id}/revoke`
    ),
  ]);

  const workspace = parseTeamSnapshot(
    await (
      await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`)
    ).json()
  );
  const invitationState = workspace.invitations.find((item) => item.id === invitation.id);
  expect(invitationState).toBeDefined();

  expect(
    classifyInvitationRace({
      acceptStatus: accept.status(),
      revokeStatus: revoke.status(),
      memberExists: workspace.members.some(
        (member) => member.userId === sessions.intruder.user.id
      ),
      invitationStatus: invitationState!.status,
    })
  ).toMatch(/^(accepted|revoked)$/u);
});
