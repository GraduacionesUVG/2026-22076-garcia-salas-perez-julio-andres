/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, request, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { createQaProjectFixture, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { closeQaSessions, createQaSessions, type QaSessions } from "@/__tests__/backend/sessions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import { codeFixtureData } from "@/__tests__/backend/task10-test-helpers";
import { cleanupTask11Fixtures } from "@/__tests__/integration/analysis/task11-test-helpers";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects/:id/analysis/codes/stats"], ["GET", "/api/projects/:id/analysis/dashboard"],
  ["GET", "/api/projects/:id/analysis/document-patterns"], ["GET", "/api/projects/:id/analysis/overview"],
  ["GET", "/api/projects/:id/analysis/relationships"], ["GET", "/api/projects/:id/analysis/segments/uncoded"],
] as const;
let sessions: QaSessions; let fixture: QaProjectFixture | undefined; let foreign: QaProjectFixture | undefined; let anonymous: APIRequestContext;
async function json(response: APIResponse) { expect(response.status()).toBe(200); return (await response.json()) as Record<string, any>; }
async function create(path: string, data: Record<string, unknown>, key: string) { const response = await sessions.owner.request.post(path, { data }); const value = await response.json() as Record<string, any>; expect(response.status(), JSON.stringify(value)).toBe(201); return value[key] as Record<string, any>; }
test.beforeAll(async ({ baseURL }) => { sessions = await createQaSessions(); anonymous = await request.newContext({ baseURL }); });
test.beforeEach(async () => { fixture = await createQaProjectFixture(sessions); foreign = await createQaProjectFixture(sessions); });
test.afterEach(async () => { await cleanupTask11Fixtures(fixture, foreign); foreign = fixture = undefined; });
test.afterAll(async () => { await anonymous.dispose(); await closeQaSessions(sessions); });

test([
  actionEvidenceTitle("analysis.overview.read", ["permissions"], "allows member reads and denies non-members"),
  actionEvidenceTitle("analysis.code-usage-stats.read", ["permissions"], "allows member reads and denies non-members"),
  actionEvidenceTitle("analysis.uncoded-segments.list", ["permissions"], "allows member reads and denies non-members"),
  actionEvidenceTitle("analysis.code-relationships.read", ["permissions"], "allows member reads and denies non-members"),
  actionEvidenceTitle("analysis.document-patterns.read", ["permissions"], "allows member reads and denies non-members"),
  actionEvidenceTitle("analysis.dashboard.read", ["permissions"], "allows member reads and denies non-members"),
].join(" | "), async () => {
  const paths = ["overview", "codes/stats", "segments", "segments/uncoded", "relationships", "document-patterns", "dashboard"];
  for (const path of paths) {
    for (const role of ["owner", "editor", "viewer"] as const) expect((await sessions[role].request.get(`/api/projects/${fixture!.project.id}/analysis/${path}`)).status()).toBe(200);
    expect((await sessions.intruder.request.get(`/api/projects/${fixture!.project.id}/analysis/${path}`)).status()).toBe(403);
    expect((await anonymous.get(`/api/projects/${fixture!.project.id}/analysis/${path}`)).status()).toBe(401);
  }
});

test([
  actionEvidenceTitle("analysis.overview.read", ["success"], "returns zeroed project-isolated analytics for an empty project"),
  actionEvidenceTitle("analysis.dashboard.read", ["success"], "returns zeroed project-isolated dashboard data for an empty project"),
  actionEvidenceTitle("analysis.code-relationships.read", ["success"], "returns bounded project-isolated relationships for an empty project"),
].join(" | "), async () => {
  await create(`/api/projects/${foreign!.project.id}/analysis/memos`, { title: `${foreign!.marker} sentinel` }, "memo");
  await create(`/api/projects/${foreign!.project.id}/analysis/insights`, { title: `${foreign!.marker} sentinel` }, "insight");
  const overview = await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/overview`));
  expect(overview.overview).toMatchObject({ documents_count: 0, segments_count: 0, codes_count: 0, memos_count: 0, insights_count: 0 });
  const dashboard = await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/dashboard`));
  expect(dashboard.overview).toMatchObject({ memos_count: 0, insights_count: 0 });
  expect(dashboard.stats).toEqual([]); expect(dashboard.relationships).toEqual([]); expect(dashboard.documentPatterns.patterns).toEqual([]);
  for (const query of ["?limit=0", "?limit=201", "?offset=-1", "?unexpected=1"]) expect((await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/relationships${query}`)).status()).toBe(400);
});

test([
  actionEvidenceTitle("analysis.overview.read", ["success"], "reports exact aggregate totals for a known corpus"),
  actionEvidenceTitle("analysis.code-usage-stats.read", ["success"], "reports used and zero-count codes for a known corpus"),
  actionEvidenceTitle("analysis.uncoded-segments.list", ["success"], "returns the exact uncoded segment for a known corpus"),
  actionEvidenceTitle("analysis.code-relationships.read", ["success"], "reports exact code co-occurrence for a known corpus"),
  actionEvidenceTitle("analysis.document-patterns.read", ["success"], "reports project-isolated document patterns"),
  actionEvidenceTitle("analysis.dashboard.read", ["success"], "combines exact project-isolated analytical reads"),
].join(" | "), async () => {
  const foreignDocument = await create(`/api/projects/${foreign!.project.id}/documents`, { title: `${foreign!.marker} foreign corpus`, content: "foreign evidence", status: "ready_for_coding" }, "document");
  const foreignSegment = await create(`/api/projects/${foreign!.project.id}/documents/${foreignDocument.id}/segments`, { base_document_revision: foreignDocument.revision, start_char: 0, end_char: 7, selected_text: "foreign" }, "segment");
  const foreignCode = await create(`/api/projects/${foreign!.project.id}/analysis/codes`, codeFixtureData({ name: `${foreign!.marker} foreign code`, color: "#990011" }), "code");
  expect((await sessions.owner.request.post(`/api/projects/${foreign!.project.id}/analysis/segments/${foreignSegment.id}/codes`, { data: { code_id: foreignCode.id } })).status()).toBe(201);

  const content = "alpha beta gamma delta";
  const document = await create(`/api/projects/${fixture!.project.id}/documents`, { title: `${fixture!.marker} corpus`, content, status: "ready_for_coding" }, "document");
  const segmentA = await create(`/api/projects/${fixture!.project.id}/documents/${document.id}/segments`, { base_document_revision: document.revision, start_char: 0, end_char: 5, selected_text: "alpha" }, "segment");
  const segmentB = await create(`/api/projects/${fixture!.project.id}/documents/${document.id}/segments`, { base_document_revision: document.revision, start_char: 6, end_char: 10, selected_text: "beta" }, "segment");
  const codeA = await create(`/api/projects/${fixture!.project.id}/analysis/codes`, codeFixtureData({ name: `${fixture!.marker} code A`, color: "#112233" }), "code");
  const codeB = await create(`/api/projects/${fixture!.project.id}/analysis/codes`, codeFixtureData({ name: `${fixture!.marker} code B`, color: "#445566" }), "code");
  const codeZero = await create(`/api/projects/${fixture!.project.id}/analysis/codes`, codeFixtureData({ name: `${fixture!.marker} zero`, color: "#778899" }), "code");
  for (const [segment, code, is_quote] of [[segmentA, codeA, true], [segmentA, codeB, false]] as const) {
    const response = await sessions.owner.request.post(`/api/projects/${fixture!.project.id}/analysis/segments/${segment.id}/codes`, { data: { code_id: code.id, is_quote } }); expect(response.status()).toBe(201);
  }
  const overview = (await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/overview`))).overview;
  expect(overview).toMatchObject({ documents_count: 1, segments_count: 2, codes_count: 3, coded_segments_count: 1, uncoded_segments_count: 1 });
  const stats = (await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/codes/stats?limit=10`))).stats as Array<Record<string, any>>;
  expect(stats).toContainEqual(expect.objectContaining({ code_id: codeA.id, coded_segments_count: 1, quotes_count: 1 }));
  expect(stats).toContainEqual(expect.objectContaining({ code_id: codeZero.id, coded_segments_count: 0 }));
  const uncoded = (await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/segments/uncoded`))).segments;
  expect(uncoded).toContainEqual(expect.objectContaining({ id: segmentB.id }));
  const codingSegments = (await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/segments?limit=10`))).segments;
  expect(codingSegments).toContainEqual(expect.objectContaining({
    id: segmentA.id,
    code_ids: [codeA.id, codeB.id],
    codes: expect.arrayContaining([
      expect.objectContaining({ id: codeA.id, name: `${fixture!.marker} code A` }),
      expect.objectContaining({ id: codeB.id, name: `${fixture!.marker} code B` }),
    ]),
  }));
  expect(codingSegments.find((segment: Record<string, any>) => segment.id === segmentA.id)).not.toHaveProperty("label");
  expect(codingSegments).toContainEqual(expect.objectContaining({ id: segmentB.id, code_ids: [], codes: [], is_coded: false }));
  const relationships = (await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/relationships`))).relationships;
  expect(relationships).toContainEqual(expect.objectContaining({ shared_segment_count: 1, segment_ids: [segmentA.id] }));
  const patterns = (await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/document-patterns`))).patterns;
  expect(patterns).toEqual(expect.arrayContaining([expect.objectContaining({ document_count: 1, total_segments: 1 })]));
  const dashboard = await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/dashboard`));
  expect(dashboard.overview).toMatchObject({ documents_count: 1, segments_count: 2, codes_count: 3, coded_segments_count: 1, uncoded_segments_count: 1 });
  expect(dashboard.stats).toEqual(expect.arrayContaining([
    expect.objectContaining({ code_id: codeA.id, coded_segments_count: 1 }),
    expect.objectContaining({ code_id: codeZero.id, coded_segments_count: 0 }),
  ]));
  expect(dashboard.relationships).toContainEqual(expect.objectContaining({ shared_segment_count: 1 }));
  expect(dashboard.documentPatterns.patterns).toEqual(expect.arrayContaining([expect.objectContaining({ document_count: 1 })]));
  expect(JSON.stringify({ overview, stats, uncoded, relationships, patterns, dashboard })).not.toContain(foreign!.marker);
  expect(JSON.stringify(dashboard)).not.toContain(foreignCode.id);

  const statsPage = await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/codes/stats?limit=1&offset=1`));
  const uncodedPage = await json(await sessions.owner.request.get(`/api/projects/${fixture!.project.id}/analysis/segments/uncoded?limit=1&offset=0`));
  expect(statsPage.stats).toHaveLength(1);
  expect(uncodedPage.segments).toEqual([expect.objectContaining({ id: segmentB.id })]);
});
