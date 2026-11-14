import { expect, test, type APIResponse } from "@playwright/test";
import {
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  closeQaSessions,
  createQaSessions,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import {
  classifyInvitationRace,
  parseTeamSnapshot,
} from "@/__tests__/backend/task6-test-helpers";
import {
  classifyOneWinnerRace,
  codeFixtureData,
  segmentSelection,
} from "@/__tests__/backend/task10-test-helpers";

export const BACKEND_ROUTE_COVERAGE = [] as const;

// Audit limitation: terminal HTTP state is observable here, but migration,
// unique-index, and RLS policy definitions are not present in this checkout.

type JsonObject = Record<string, unknown>;

test.describe.serial("Task 14 bounded concurrency audit", () => {
  test.setTimeout(180_000);

  let sessions: QaSessions | undefined;
  let fixture: QaProjectFixture | undefined;
  let sequence = 0;

  async function json(response: APIResponse): Promise<JsonObject> {
    const value: unknown = await response.json();
    expect(typeof value).toBe("object");
    expect(value).not.toBeNull();
    expect(Array.isArray(value)).toBe(false);
    return value as JsonObject;
  }

  function objectField(value: JsonObject, key: string): JsonObject {
    const nested = value[key];
    expect(nested).toEqual(expect.any(Object));
    expect(Array.isArray(nested)).toBe(false);
    return nested as JsonObject;
  }

  function arrayField(value: JsonObject, key: string): JsonObject[] {
    expect(Array.isArray(value[key])).toBe(true);
    return value[key] as JsonObject[];
  }

  function nextValue(label: string): string {
    sequence += 1;
    return `${fixture!.marker} ${label} ${sequence}`;
  }

  function appendFailure(failures: unknown[], error: unknown): void {
    if (error instanceof AggregateError) {
      for (const nested of error.errors) appendFailure(failures, nested);
      return;
    }
    failures.push(error);
  }

  async function closeResources(): Promise<void> {
    const failures: unknown[] = [];
    const cleanups: Array<() => Promise<void>> = [];
    const assignedFixture = fixture;
    const assignedSessions = sessions;
    fixture = undefined;
    sessions = undefined;
    if (assignedFixture) cleanups.push(() => assignedFixture.cleanup());
    if (assignedSessions) cleanups.push(() => closeQaSessions(assignedSessions));

    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        appendFailure(failures, error);
      }
    }

    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, "Task 14 concurrency cleanup failed");
    }
  }

  test.beforeAll(async () => {
    try {
      sessions = await createQaSessions();
      fixture = await createQaProjectFixture(sessions);
    } catch (error) {
      try {
        await closeResources();
      } catch (cleanupError) {
        const failures = [error];
        appendFailure(failures, cleanupError);
        throw new AggregateError(
          failures,
          "Task 14 concurrency setup and cleanup failed"
        );
      }
      throw error;
    }
  });

  test.afterAll(async () => {
    await closeResources();
  });

  test("two stale memo updates leave exactly one winner state", async () => {
    const create = await sessions!.owner.request.post(
      `/api/projects/${fixture!.project.id}/analysis/memos`,
      { data: { title: nextValue("race memo"), body: "before" } }
    );
    expect(create.status()).toBe(201);
    const memo = objectField(await json(create), "memo");
    const path = `/api/projects/${fixture!.project.id}/analysis/memos/${memo.id}`;
    const candidates = [nextValue("memo owner"), nextValue("memo editor")] as const;

    const responses = await Promise.all([
      sessions!.owner.request.patch(path, {
        data: { base_revision: memo.revision, body: candidates[0] },
      }),
      sessions!.editor.request.patch(path, {
        data: { base_revision: memo.revision, body: candidates[1] },
      }),
    ]);

    const race = classifyOneWinnerRace(
      responses.map((response) => response.status()),
      200,
      409
    );
    const winner = objectField(await json(responses[race.winnerIndex]!), "memo");
    const terminal = objectField(
      await json(await sessions!.owner.request.get(path)),
      "memo"
    );
    expect(terminal.body).toBe(winner.body);
    expect(candidates).toContain(terminal.body);
    expect(terminal.revision).toBe(Number(memo.revision) + 1);
  });

  test("two duplicate code assignments leave one terminal row", async () => {
    const content = nextValue("alpha evidence omega");
    const documentResponse = await sessions!.owner.request.post(
      `/api/projects/${fixture!.project.id}/documents`,
      { data: { title: nextValue("assignment document"), content } }
    );
    expect(documentResponse.status()).toBe(201);
    const document = objectField(await json(documentResponse), "document");

    const selectedText = "evidence";
    const segmentResponse = await sessions!.owner.request.post(
      `/api/projects/${fixture!.project.id}/documents/${document.id}/segments`,
      {
        data: {
          base_document_revision: document.revision,
          ...segmentSelection(content, selectedText),
        },
      }
    );
    expect(segmentResponse.status()).toBe(201);
    const segment = objectField(await json(segmentResponse), "segment");

    const codeResponse = await sessions!.owner.request.post(
      `/api/projects/${fixture!.project.id}/analysis/codes`,
      { data: codeFixtureData({ name: nextValue("assignment code") }) }
    );
    expect(codeResponse.status()).toBe(201);
    const code = objectField(await json(codeResponse), "code");
    const path = `/api/projects/${fixture!.project.id}/analysis/segments/${segment.id}/codes`;
    const notes = [nextValue("owner assignment"), nextValue("editor assignment")] as const;

    const responses = await Promise.all([
      sessions!.owner.request.post(path, {
        data: { code_id: code.id, analytic_note: notes[0] },
      }),
      sessions!.editor.request.post(path, {
        data: { code_id: code.id, analytic_note: notes[1] },
      }),
    ]);
    classifyOneWinnerRace(
      responses.map((response) => response.status()),
      201,
      409
    );

    const terminal = arrayField(
      await json(await sessions!.owner.request.get(path)),
      "segment_codes"
    );
    expect(terminal).toHaveLength(1);
    expect(terminal[0]!.code_id).toBe(code.id);
    expect(notes).toContain(terminal[0]!.analytic_note);
  });

  test("two simultaneous version requests allocate one new snapshot", async () => {
    const workflowPath = `/api/projects/${fixture!.project.id}/delimitation`;
    const current = objectField(
      objectField(await json(await sessions!.owner.request.get(workflowPath)), "data"),
      "delim"
    );
    const update = await sessions!.owner.request.put(workflowPath, {
      data: {
        base_revision: current.revision,
        resources: nextValue("version allocation state"),
      },
    });
    expect(update.status()).toBe(200);

    const versionsPath = `${workflowPath}/versions`;
    const before = arrayField(
      await json(await sessions!.owner.request.get(versionsPath)),
      "versions"
    );
    const beforeIds = new Set(before.map((version) => String(version.id)));

    const responses = await Promise.all([
      sessions!.owner.request.post(versionsPath, {
        data: { label: nextValue("version A") },
      }),
      sessions!.editor.request.post(versionsPath, {
        data: { label: nextValue("version B") },
      }),
    ]);
    expect(
      responses.every((response) => [200, 201, 409].includes(response.status()))
    ).toBe(true);

    const after = arrayField(
      await json(await sessions!.owner.request.get(versionsPath)),
      "versions"
    );
    const created = after.filter((version) => !beforeIds.has(String(version.id)));
    expect(created).toHaveLength(1);
    expect(new Set(after.map((version) => version.id)).size).toBe(after.length);
    expect(new Set(after.map((version) => version.version_number)).size).toBe(
      after.length
    );
  });

  test(actionEvidenceTitle(
    "team.project-invitation.accept",
    ["concurrency", "cleanup"],
    "leaves accept versus revoke in one invitation-consistent state"
  ), async () => {
    const invitationResponse = await sessions!.owner.request.post(
      `/api/projects/${fixture!.project.id}/team`,
      { data: { email: sessions!.config.intruderEmail, role: "editor" } }
    );
    expect(invitationResponse.status()).toBe(201);
    const invitation = objectField(await json(invitationResponse), "invitation");

    const [accept, revoke] = await Promise.all([
      sessions!.intruder.request.post("/api/project-invitations/accept", {
        data: { token: invitation.token },
      }),
      sessions!.owner.request.post(
        `/api/projects/${fixture!.project.id}/team/invitations/${invitation.id}/revoke`
      ),
    ]);

    const team = parseTeamSnapshot(
      await json(
        await sessions!.owner.request.get(`/api/projects/${fixture!.project.id}/team`)
      )
    );
    const invitationState = team.invitations.find(
      (candidate) => candidate.id === invitation.id
    );
    expect(invitationState).toBeDefined();
    const membershipCount = team.members.filter(
      (member) => member.userId === sessions!.intruder.user.id
    ).length;
    expect(membershipCount).toBeLessThanOrEqual(1);

    const terminalState = classifyInvitationRace({
      acceptStatus: accept.status(),
      revokeStatus: revoke.status(),
      memberExists: membershipCount === 1,
      invitationStatus: invitationState!.status,
    });
    expect(terminalState).toMatch(/^(?:accepted|revoked)$/u);
    expect(membershipCount).toBe(terminalState === "accepted" ? 1 : 0);
  });
});
