import { expect, request as playwrightRequest, test } from "@playwright/test";
import {
  bootstrapQaAccount,
  closeQaSession,
  createQaSessions,
  loadLocalBackendTestConfig,
  type QaIdentity,
} from "@/__tests__/backend/sessions";
import {
  cleanupQaProjectAndSessions,
  createQaProjectFixture,
  teamRolesByUserId,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";

test.describe.configure({ mode: "serial" });

test.describe("reusable backend QA accounts", () => {
  test("loads only the fixed QA account identities from the local config", () => {
    const config = loadLocalBackendTestConfig();

    expect(config.ownerEmail).toMatch(/^qa_backend_owner@/);
    expect(config.editorEmail).toMatch(/^qa_backend_editor@/);
    expect(config.viewerEmail).toMatch(/^qa_backend_viewer@/);
    expect(config.intruderEmail).toMatch(/^qa_backend_intruder@/);
    expect(config.userPassword.length).toBeGreaterThanOrEqual(24);
  });

  test("explicitly bootstraps only the fixed QA accounts", async () => {
    const config = loadLocalBackendTestConfig();
    const baseURL = process.env.BACKEND_TEST_BASE_URL ?? "http://localhost:3000";

    for (const [identity, email] of [
      ["owner", config.ownerEmail],
      ["editor", config.editorEmail],
      ["viewer", config.viewerEmail],
      ["intruder", config.intruderEmail],
    ] as const) {
      const request = await playwrightRequest.newContext({
        baseURL,
        extraHTTPHeaders: { origin: new URL(baseURL).origin },
      });
      let session: Awaited<ReturnType<typeof bootstrapQaAccount>> | undefined;

      try {
        session = await bootstrapQaAccount({
          identity,
          email,
          password: config.userPassword,
          request,
        });
      } finally {
        if (session) await closeQaSession(session);
        else await request.dispose();
      }
    }
  });

  test("establishes project roles while excluding the intruder", async () => {
    const sessions = await createQaSessions();
    let fixture: QaProjectFixture | undefined;

    try {
      fixture = await createQaProjectFixture(sessions);

      const expectedRoles: Record<Exclude<QaIdentity, "intruder">, string> = {
        owner: "owner",
        editor: "editor",
        viewer: "viewer",
      };

      for (const [identity, expectedRole] of Object.entries(expectedRoles) as Array<
        [Exclude<QaIdentity, "intruder">, string]
      >) {
        const projectResponse = await sessions[identity].request.get(
          `/api/projects/${fixture.project.id}`
        );
        const projectBody = await projectResponse.json();

        expect(projectResponse.ok()).toBe(true);
        expect(projectBody.project).toMatchObject({
          id: fixture.project.id,
          name: fixture.project.name,
          my_role: expectedRole,
        });

        const teamResponse = await sessions[identity].request.get(
          `/api/projects/${fixture.project.id}/team`
        );
        const teamBody = await teamResponse.json();

        expect(teamResponse.ok()).toBe(true);
        expect(teamBody.currentRole).toBe(expectedRole);
      }

      const ownerTeamResponse = await sessions.owner.request.get(
        `/api/projects/${fixture.project.id}/team`
      );
      const ownerTeamBody = await ownerTeamResponse.json();
      expect(ownerTeamResponse.ok()).toBe(true);
      const rolesByUserId = teamRolesByUserId(ownerTeamBody);

      expect(rolesByUserId.get(sessions.owner.user.id)).toBe("owner");
      expect(rolesByUserId.get(sessions.editor.user.id)).toBe("editor");
      expect(rolesByUserId.get(sessions.viewer.user.id)).toBe("viewer");
      expect(rolesByUserId.has(sessions.intruder.user.id)).toBe(false);

      for (const path of [
        `/api/projects/${fixture.project.id}`,
        `/api/projects/${fixture.project.id}/team`,
      ]) {
        const intruderResponse = await sessions.intruder.request.get(path);
        expect([403, 404]).toContain(intruderResponse.status());
      }
    } finally {
      await cleanupQaProjectAndSessions(fixture, sessions);
    }
  });
});
