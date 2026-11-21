/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, request as playwrightRequest, test, type APIResponse } from "@playwright/test";
import {
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  closeQaSessions,
  createQaSessions,
  loginQaSession,
  type QaSession,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import { codeFixtureData, segmentSelection } from "@/__tests__/backend/task10-test-helpers";
import { parseTeamSnapshot } from "@/__tests__/backend/task6-test-helpers";

// These routes already have action owners. This spec supplies independent,
// API-observable evidence for database capabilities rather than route coverage.
export const BACKEND_ROUTE_COVERAGE = [] as const;

test.describe.serial("read-only database capability evidence", () => {
  test.setTimeout(180_000);

  let sessions: QaSessions;
  let fixture: QaProjectFixture | undefined;
  let sequence = 0;

  async function json(response: APIResponse): Promise<Record<string, any>> {
    const value: unknown = await response.json();
    expect(value).toEqual(expect.any(Object));
    expect(Array.isArray(value)).toBe(false);
    return value as Record<string, any>;
  }

  async function createCode(overrides: Record<string, unknown> = {}) {
    sequence += 1;
    const response = await sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/analysis/codes`,
      {
        data: codeFixtureData({
          name: `${fixture!.marker} db capability code ${sequence}`,
          ...overrides,
        }),
      }
    );
    expect(response.status()).toBe(201);
    return (await json(response)).code as Record<string, any>;
  }

  async function closeFixtures() {
    const failures: unknown[] = [];
    for (const target of [fixture]) {
      try {
        await target?.cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    fixture = undefined;
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, "Database capability fixture cleanup failed");
    }
  }

  test.beforeAll(async () => {
    sessions = await createQaSessions();
  });

  test.beforeEach(async () => {
    fixture = await createQaProjectFixture(sessions);
  });

  test.afterEach(async () => {
    await closeFixtures();
  });

  test.afterAll(async () => {
    if (sessions) await closeQaSessions(sessions);
  });

  test("project teammates see the owner's directory identity without gaining management rights", async () => {
    const teamPath = `/api/projects/${fixture!.project.id}/team`;
    const ownerResponse = await sessions.owner.request.get(teamPath);
    expect(ownerResponse.status()).toBe(200);
    const ownerView = await json(ownerResponse);
    const owner = ownerView.members.find((member: any) => member.role === 'owner');
    expect(owner).toMatchObject({ user_id: sessions.owner.user.id, email: sessions.owner.email });
    for (const role of ['editor', 'viewer'] as const) {
      const response = await sessions[role].request.get(teamPath);
      expect(response.status()).toBe(200);
      const body = await json(response);
      expect(body.members.find((member: any) => member.user_id === owner.user_id)).toEqual(owner);
      expect(body.invitations).toEqual([]);
      expect(body.currentRole).toBe(role);
      expect((await sessions[role].request.post(teamPath, { data: { email: 'directory-probe@example.test', role: 'viewer' } })).status()).toBe(403);
    }
    expect((await sessions.intruder.request.get(teamPath)).status()).toBe(403);
  });

  test("code-cycle prevention rejects a descendant parent and preserves the tree", async () => {
    const root = await createCode();
    const child = await createCode({ parent_code_id: root.id });
    const cycle = await sessions.owner.request.patch(
      `/api/projects/${fixture!.project.id}/analysis/codes/${root.id}`,
      { data: { base_revision: root.revision, parent_code_id: child.id } }
    );

    expect(cycle.status()).toBe(409);
    expect(await json(cycle)).toMatchObject({ error: "CODE_PARENT_CYCLE" });
    const persisted = await sessions.owner.request.get(
      `/api/projects/${fixture!.project.id}/analysis/codes/${root.id}`
    );
    expect((await json(persisted)).code).toMatchObject({
      id: root.id,
      parent_code_id: null,
      revision: root.revision,
    });
  });

  test("duplicate workflow snapshots converge on one persisted version", async () => {
    const path = `/api/projects/${fixture!.project.id}/delimitation/versions`;
    const first = await sessions.owner.request.post(path, {
      data: { label: `${fixture!.marker} first snapshot` },
    });
    const second = await sessions.owner.request.post(path, {
      data: { label: `${fixture!.marker} duplicate snapshot` },
    });
    expect(first.status()).toBe(201);
    expect(second.status()).toBe(200);
    const firstVersion = (await json(first)).data.version;
    const secondVersion = (await json(second)).data.version;
    expect(secondVersion.id).toBe(firstVersion.id);

    const list = await sessions.owner.request.get(path);
    expect(list.status()).toBe(200);
    const versions = (await json(list)).versions as Array<Record<string, any>>;
    expect(Array.isArray(versions)).toBe(true);
    expect(versions.filter((version) => version.id === firstVersion.id)).toHaveLength(1);
  });

  test("segment persistence uses normalized UTF-16 offsets", async () => {
    const documentResponse = await sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/documents`,
      { data: { title: `${fixture!.marker} UTF-16`, content: "alpha 😀 beta\r\ngamma" } }
    );
    expect(documentResponse.status()).toBe(201);
    const document = (await json(documentResponse)).document;
    const create = await sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/documents/${document.id}/segments`,
      {
        data: {
          base_document_revision: document.revision,
          ...segmentSelection(document.content, "😀 beta"),
        },
      }
    );
    expect(create.status()).toBe(201);
    const segment = (await json(create)).segment;
    expect(segment).toMatchObject({ start_char: 6, end_char: 13, selected_text: "😀 beta" });
  });

  test("analysis overview returns project-scoped aggregate output", async () => {
    const documentResponse = await sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/documents`,
      { data: { title: `${fixture!.marker} overview`, content: "bounded evidence" } }
    );
    expect(documentResponse.status()).toBe(201);
    const overview = await sessions.owner.request.get(
      `/api/projects/${fixture!.project.id}/analysis/overview`
    );
    expect(overview.status()).toBe(200);
    expect((await json(overview)).overview).toMatchObject({
      project_id: fixture!.project.id,
      documents_count: 1,
      segments_count: 0,
      codes_count: 0,
    });
  });

  test("invitation acceptance is atomic under a simultaneous replay", async () => {
    const invitationResponse = await sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/team`,
      { data: { email: sessions.config.intruderEmail, role: "viewer" } }
    );
    expect(invitationResponse.status()).toBe(201);
    const invitation = (await json(invitationResponse)).invitation;
    const baseURL = process.env.BACKEND_TEST_BASE_URL ?? "http://localhost:3000";
    const secondContext = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { origin: new URL(baseURL).origin },
    });
    let second: QaSession | undefined;
    try {
      second = await loginQaSession({
        identity: "intruder",
        email: sessions.config.intruderEmail,
        password: sessions.config.userPassword,
        request: secondContext,
      });
      const responses = await Promise.all([
        sessions.intruder.request.post("/api/project-invitations/accept", {
          data: { token: invitation.token },
        }),
        second.request.post("/api/project-invitations/accept", {
          data: { token: invitation.token },
        }),
      ]);
      expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
      const team = parseTeamSnapshot(
        await json(
          await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/team`)
        )
      );
      expect(
        team.members.filter((member) => member.userId === sessions.intruder.user.id)
      ).toHaveLength(1);
    } finally {
      await secondContext.dispose();
    }
  });

  test("project document RLS is visible to its owner and hidden from a nonmember", async () => {
    const documentResponse = await sessions.owner.request.post(
      `/api/projects/${fixture!.project.id}/documents`,
      {
        data: {
          title: `${fixture!.marker} RLS probe`,
          content: `${fixture!.marker} known owner-only row`,
        },
      }
    );
    expect(documentResponse.status()).toBe(201);
    const document = (await json(documentResponse)).document as Record<string, any>;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
    expect(supabaseUrl).toBeTruthy();
    expect(anonKey).toBeTruthy();
    expect(new URL(supabaseUrl!).hostname).toBe(sessions.config.supabaseHost);

    function assertPublicClientKey(value: string) {
      expect(value.startsWith("sb_secret_")).toBe(false);
      if (value.startsWith("sb_publishable_")) return;
      const parts = value.split(".");
      expect(parts).toHaveLength(3);
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8")
      ) as { role?: unknown };
      expect(payload.role).toBe("anon");
    }
    assertPublicClientKey(anonKey!);

    async function userDataApi(email: string, expectedUserId: string) {
      // Authentication and Data API requests use only the public anon key plus
      // the user's own JWT. A service-role credential is never accepted here.
      const auth = await playwrightRequest.newContext({
        baseURL: supabaseUrl,
        extraHTTPHeaders: { apikey: anonKey! },
      });
      try {
        const login = await auth.post("/auth/v1/token?grant_type=password", {
          data: { email, password: sessions.config.userPassword },
        });
        expect(login.status()).toBe(200);
        const body: unknown = await login.json();
        expect(body).toEqual(expect.objectContaining({
          access_token: expect.any(String),
          user: expect.objectContaining({ id: expectedUserId }),
        }));
        const token = (body as { access_token: string }).access_token;
        const data = await playwrightRequest.newContext({
          baseURL: supabaseUrl,
          extraHTTPHeaders: {
            apikey: anonKey!,
            authorization: `Bearer ${token}`,
          },
        });
        const session = await data.get("/auth/v1/user");
        expect(session.status()).toBe(200);
        expect(await session.json()).toEqual(
          expect.objectContaining({ id: expectedUserId })
        );
        return data;
      } finally {
        await auth.dispose();
      }
    }

    const rowPath = `/rest/v1/project_documents?id=eq.${document.id}&select=id,project_id,title`;
    let ownerData: Awaited<ReturnType<typeof userDataApi>> | undefined;
    let intruderData: Awaited<ReturnType<typeof userDataApi>> | undefined;
    try {
      ownerData = await userDataApi(
        sessions.config.ownerEmail,
        sessions.owner.user.id
      );
      intruderData = await userDataApi(
        sessions.config.intruderEmail,
        sessions.intruder.user.id
      );
      const ownerRead = await ownerData.get(rowPath);
      expect(ownerRead.status()).toBe(200);
      expect(await ownerRead.json()).toEqual([
        {
          id: document.id,
          project_id: fixture!.project.id,
          title: `${fixture!.marker} RLS probe`,
        },
      ]);

      const intruderRead = await intruderData.get(rowPath);
      expect(intruderRead.status()).toBe(200);
      expect(await intruderRead.json()).toEqual([]);
    } finally {
      await Promise.all(
        [ownerData, intruderData]
          .filter((context) => context !== undefined)
          .map((context) => context.dispose())
      );
    }
  });
});
