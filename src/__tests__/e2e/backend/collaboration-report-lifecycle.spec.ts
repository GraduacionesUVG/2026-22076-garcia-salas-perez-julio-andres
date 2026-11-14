import { expect, test } from "@playwright/test";
import { createQaProjectFixture, cleanupQaProjectAndSessions, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { createQaSessions } from "@/__tests__/backend/sessions";
import { readJson, objectField, stringField, arrayField } from "@/__tests__/integration/research-workflow/task7-test-helpers";

test("temporary collaboration journey exports linked findings and revokes accepted member access", async () => {
  test.setTimeout(180_000);
  const sessions = await createQaSessions();
  let fixture: QaProjectFixture | undefined;
  try {
    fixture = await createQaProjectFixture(sessions);
    const root = `/api/projects/${fixture.project.id}`;
    const owner = sessions.owner.request;
    const reader = sessions.viewer.request;
    const invitationResponse = await owner.post(`${root}/team`, { data: { email: sessions.config.intruderEmail, role: "viewer" } });
    expect(invitationResponse.status()).toBe(201);
    const invitation = objectField(await readJson(invitationResponse), "invitation");
    expect((await sessions.intruder.request.post("/api/project-invitations/accept", { data: { token: stringField(invitation, "token") } })).status()).toBe(200);
    const accepted = await sessions.intruder.request.get(`${root}/team`);
    expect(accepted.status()).toBe(200);
    expect(await readJson(accepted)).toMatchObject({ currentRole: "viewer" });
    const memberPath = `${root}/team/members/${sessions.intruder.user.id}`;
    expect((await owner.patch(memberPath, { data: { role: "editor" } })).status()).toBe(200);
    const changed = await sessions.intruder.request.get(`${root}/team`);
    expect(changed.status()).toBe(200);
    expect(await readJson(changed)).toMatchObject({ currentRole: "editor" });
    const memoTitle = `${fixture.marker} report memo`;
    const memoResponse = await sessions.intruder.request.post(`${root}/analysis/memos`, { data: { title: memoTitle, body: "Temporary report input" } });
    expect(memoResponse.status()).toBe(201);
    const memoId = stringField(objectField(await readJson(memoResponse), "memo"), "id");
    const insightTitle = `${fixture.marker} confirmed hallazgo`;
    const insightResponse = await sessions.intruder.request.post(`${root}/analysis/insights`, { data: { title: insightTitle, summary: "Deterministic linked finding", status: "confirmed" } });
    expect(insightResponse.status()).toBe(201);
    const insightId = stringField(objectField(await readJson(insightResponse), "insight"), "id");
    const linksPath = `${root}/analysis/insights/${insightId}/links`;
    const linkResponse = await sessions.intruder.request.post(linksPath, { data: { link_type: "memo", memo_id: memoId } });
    expect(linkResponse.status()).toBe(201);
    const linkId = stringField(objectField(await readJson(linkResponse), "link"), "id");
    for (const [path, field, expected] of [
      [`${root}/analysis/memos/${memoId}`, "memo", { id: memoId, title: memoTitle }],
      [`${root}/analysis/insights/${insightId}`, "insight", { id: insightId, title: insightTitle, status: "confirmed" }],
    ] as const) {
      const response = await reader.get(path);
      expect(response.status()).toBe(200);
      expect(objectField(await readJson(response), field)).toMatchObject(expected);
    }
    const linkRead = await reader.get(linksPath);
    expect(linkRead.status()).toBe(200);
    expect(arrayField(await readJson(linkRead), "links")).toContainEqual(expect.objectContaining({ id: linkId, memo_id: memoId }));
    for (const path of ["overview", "dashboard"]) {
      const response = await reader.get(`${root}/analysis/${path}`);
      expect(response.status()).toBe(200);
      expect(objectField(await readJson(response), "overview")).toMatchObject({ memos_count: 1, insights_count: 1 });
    }
    const workflowRead = await reader.get(`${root}/workflow`);
    expect(workflowRead.status()).toBe(200);
    expect(objectField(objectField(objectField(await readJson(workflowRead), "workflow"), "phaseMap"), "report")).toMatchObject({ state: "completed", progress: 100 });
    const markdown = await reader.get(`${root}/exports/insights?format=md`);
    expect(markdown.status()).toBe(200);
    expect(markdown.headers()["content-type"]).toContain("text/markdown");
    expect(markdown.headers()["content-disposition"]).toContain("attachment");
    const text = await markdown.text();
    expect(text).toContain(insightTitle);
    expect(text).toContain("Deterministic linked finding");
    expect((await reader.delete(memberPath)).status()).toBe(403);
    expect((await owner.delete(memberPath)).status()).toBe(200);
    const teamRead = await owner.get(`${root}/team`);
    expect(teamRead.status()).toBe(200);
    expect(arrayField(await readJson(teamRead), "members").some((member) => member.user_id === sessions.intruder.user.id)).toBe(false);
    for (const path of ["team", "analysis/memos", "analysis/insights", "analysis/overview", "exports/insights?format=md"]) {
      expect((await sessions.intruder.request.get(`${root}/${path}`)).status()).toBe(403);
    }
  } finally {
    await cleanupQaProjectAndSessions(fixture, sessions);
  }
});
