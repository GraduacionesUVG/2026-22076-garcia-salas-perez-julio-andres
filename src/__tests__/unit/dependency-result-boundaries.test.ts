import { PostgrestClient } from "@supabase/postgrest-js";
import { ProjectsRepo } from "@/src/modules/projects/projects.repo";
import { ProjectsService } from "@/src/modules/projects/projects.service";
import { UsersRepo } from "@/src/modules/users/users.repo";
import { getMe, updateMe } from "@/src/modules/users/users.service";
import { DocumentsRepo } from "@/src/modules/documents/documents.repo";
import { DocumentsService } from "@/src/modules/documents/documents.service";
import { DocumentSegmentsRepo } from "@/src/modules/documents/document-segments.repo";
import { DocumentSegmentsService } from "@/src/modules/documents/document-segments.service";
import { AnalysisMemosRepo } from "@/src/modules/analysis/analysis-memos.repo";
import { AnalysisMemosService } from "@/src/modules/analysis/analysis-memos.service";
import { AnalysisInsightsRepo } from "@/src/modules/analysis/analysis-insights.repo";
import { AnalysisInsightsService } from "@/src/modules/analysis/analysis-insights.service";
import { AnalysisSegmentCodesRepo } from "@/src/modules/analysis/analysis-segment-codes.repo";
import { AnalysisSegmentCodesService } from "@/src/modules/analysis/analysis-segment-codes.service";
import { CollaborationRepo } from "@/src/modules/collaboration/collaboration.repo";
import { ResearchDesignRepo } from "@/src/modules/research-design/research-design.repo";
import { ResearchDesignService } from "@/src/modules/research-design/research-design.service";
import { SampleConfigRepo } from "@/src/modules/sample-config/sample-config.repo";
import { SampleConfigService } from "@/src/modules/sample-config/sample-config.service";
import { requireSession } from "@/src/modules/auth/auth.guard";
import { requireProjectMember } from "@/src/modules/projects/project.guard";
import { GET as listProjects, POST as createProject } from "@/app/api/projects/route";
import { GET as loadUser } from "@/app/api/users/me/route";
import { GET as loadDocument } from "@/app/api/projects/[id]/documents/[documentId]/route";
import { POST as createSegment } from "@/app/api/projects/[id]/documents/[documentId]/segments/route";

jest.mock("@/src/modules/auth/auth.guard", () => ({ requireSession: jest.fn() }));

const PID = "11111111-1111-4111-8111-111111111111";
const DID = "22222222-2222-4222-8222-222222222222";
const USER = { id: "user-1", email: "owner@example.test" };
const PRIVATE = "select secret_value from private_table https://synthetic.invalid/?token=provider-secret";
type Db = ConstructorParameters<typeof ProjectsRepo>[0];
type Fixture = { name: string; status: number; body: unknown; text?: boolean };
const FAILURES: Fixture[] = [
  { name: "HTTP429 JSON body without status", status: 429, body: { message: PRIVATE } },
  { name: "HTTP502 HTML", status: 502, body: `<html>${PRIVATE}</html>`, text: true },
  { name: "HTTP504 PGRST003 pool timeout", status: 504, body: { code: "PGRST003", message: PRIVATE, details: "provider details", hint: "provider hint" } },
  { name: "HTTP500 JSON", status: 500, body: { message: PRIVATE } },
  { name: "HTTP501 JSON", status: 501, body: { message: PRIVATE } },
  { name: "HTTP503 JSON", status: 503, body: { message: PRIVATE } },
  { name: "HTTP505 JSON", status: 505, body: { message: PRIVATE } },
  { name: "HTTP429 with misleading body status", status: 429, body: { status: 400, message: PRIVATE } },
];

function client(fixtures: Fixture[], thrown?: unknown) {
  const requests: Array<{ url: string; method: string }> = [];
  const db = new PostgrestClient("https://synthetic.invalid/rest/v1", {
    fetch: async (url, init) => {
      requests.push({ url: String(url), method: init?.method ?? "GET" });
      if (thrown) throw thrown;
      const fixture = fixtures[Math.min(requests.length - 1, fixtures.length - 1)];
      if (!fixture) throw new Error("Missing synthetic response fixture");
      return new Response(fixture.text ? String(fixture.body) : JSON.stringify(fixture.body), {
        status: fixture.status,
        headers: { "content-type": fixture.text ? "text/html" : "application/json" },
      });
    },
  });
  return { db: db as unknown as Db, requests };
}

function session(db: Db) {
  (requireSession as jest.Mock).mockResolvedValue({ supabase: db, user: USER });
}

async function publicError(operation: Promise<unknown>) {
  try { await operation; throw new Error("Expected rejection"); }
  catch (error) {
    const candidate = error as { status?: number; message?: string };
    return { status: candidate.status ?? 500, body: { ok: false, error: candidate.message ?? "Server error" } };
  }
}

async function response(operation: Promise<Response>) {
  const value = await operation;
  return { status: value.status, body: await value.json() };
}

function safe(observed: unknown) {
  expect(observed).toEqual({ status: 503, body: { ok: false, error: "DEPENDENCY_UNAVAILABLE" } });
  expect(JSON.stringify(observed)).not.toMatch(/private_table|secret_value|https?:|provider-secret|<html>|details|hint|stack/i);
}

const READS: Array<{ name: string; run: (db: Db) => Promise<unknown> }> = [
  { name: "project relation lookup", run: db => new ProjectsService(new ProjectsRepo(db)).listForUser(USER.id) },
  { name: "profile maybeSingle", run: db => getMe({ supabase: db, user: USER }) },
  { name: "document built query", run: db => new DocumentsService(new DocumentsRepo(db)).listByProject(PID, { limit: 25, offset: 0, include_deleted: false } as never) },
  { name: "document count/head query", run: db => new DocumentsRepo(db).hasActiveSegments({ projectId: PID, documentId: DID }) },
  { name: "segment pre-mutation read", run: db => new DocumentSegmentsService(new DocumentSegmentsRepo(db)).create({ projectId: PID, documentId: DID, actorUserId: USER.id, input: { start_char: 0, end_char: 5, selected_text: "alpha", base_document_revision: 0 } as never }) },
  { name: "memo built query", run: db => new AnalysisMemosService(new AnalysisMemosRepo(db)).listByProject(PID, { limit: 25, offset: 0, include_deleted: false } as never) },
  { name: "insight built query", run: db => new AnalysisInsightsService(new AnalysisInsightsRepo(db)).listByProject(PID, { limit: 25, offset: 0, include_deleted: false } as never) },
  { name: "segment-code pre-mutation read", run: db => new AnalysisSegmentCodesService(new AnalysisSegmentCodesRepo(db)).create({ projectId: PID, segmentId: DID, actorUserId: USER.id, input: { code_id: PID } as never }) },
  { name: "collaboration RPC", run: db => new CollaborationRepo(db).hasMemberEmail({ projectId: PID, email: "member@example.test" }) },
  { name: "research version read", run: db => new ResearchDesignService(new ResearchDesignRepo(db)).listVersions(PID) },
  { name: "sample version read", run: db => new SampleConfigService(new SampleConfigRepo(db)).listVersions(PID) },
];

describe("installed SDK returned-result boundaries (no network)", () => {
  let globalFetch: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    globalFetch = jest.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("Real network fetch forbidden"); });
  });
  afterEach(() => {
    expect(globalFetch).not.toHaveBeenCalled();
    globalFetch.mockRestore();
  });

  it.each(FAILURES)("redacts $name through actual SDK, project repository/service and GET", async fixture => {
    const { db, requests } = client([fixture]);
    session(db);
    safe(await response(listProjects()));
    expect(requests).toHaveLength(1);
  });

  it.each(READS)("normalizes actual SDK result at $name", async ({ run }) => {
    for (const fixture of FAILURES.slice(0, 3)) {
      const { db, requests } = client([fixture]);
      safe(await publicError(run(db)));
      expect(requests).toHaveLength(1);
      expect(requests[0].method).not.toBe("PATCH");
    }
  });

  it.each(FAILURES.slice(0, 3))("does not retry project mutation or follow membership on $name", async fixture => {
    const { db, requests } = client([fixture]);
    session(db);
    safe(await response(createProject(new Request("http://localhost/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Synthetic" }) }))));
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
  });

  it("stops profile mutation after a genuine SDK read failure", async () => {
    const { db, requests } = client([FAILURES[0]]);
    safe(await publicError(updateMe({ supabase: db, user: USER, input: { full_name: "Synthetic" } })));
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
  });

  it("normalizes SDK-caught transport rejection without inventing error.status", async () => {
    const { db, requests } = client([], new Error("Synthetic connection dropped " + PRIVATE));
    safe(await publicError(new ProjectsService(new ProjectsRepo(db)).listForUser(USER.id)));
    expect(requests).toHaveLength(1);
  });

  it("preserves genuine domain400/401/403/404/409 from separate SDK status", async () => {
    for (const [status, code] of [[400, "22023"], [401, "PGRST301"], [403, "42501"], [404, "PGRST205"], [409, "23505"]] as const) {
      const { db } = client([{ name: "domain", status, body: { code, status: 503, message: "DOMAIN_FAILURE", details: null, hint: null } }]);
      session(db);
      expect(await response(loadUser())).toEqual({ status, body: { ok: false, error: "DOMAIN_FAILURE" } });
      await expect(new UsersRepo(db).getProfileById(USER.id)).rejects.toMatchObject({ code, message: "DOMAIN_FAILURE", status });
    }
  });

  it("retains success, SDK zero-row maybeSingle and optional-profile results", async () => {
    const { db } = client([{ name: "success", status: 200, body: [] }]);
    session(db);
    expect(await response(listProjects())).toEqual({ status: 200, body: { ok: true, projects: [] } });
    expect(await response(loadUser())).toEqual({ status: 200, body: { ok: true, user: USER, profile: null } });
  });

  it("retains successful document mutation and one event write", async () => {
    const row = { id: DID, project_id: PID, title: "Synthetic", content: "alpha", document_type: "field_note", metadata: {}, revision: 0 };
    const { db, requests } = client([{ name: "document", status: 201, body: row }, { name: "event", status: 201, body: null }]);
    await expect(new DocumentsService(new DocumentsRepo(db)).create({ projectId: PID, actorUserId: USER.id, input: { title: "Synthetic", content: "alpha" } as never })).resolves.toEqual(row);
    expect(requests).toHaveLength(2);
    expect(requests.map(item => item.method)).toEqual(["POST", "POST"]);
  });

  it("retains SDK23505 route mapping after successful membership", async () => {
    const { db } = client([
      { name: "member", status: 200, body: [{ project_id: PID, user_id: USER.id, role: "owner" }] },
      { name: "duplicate", status: 409, body: { code: "23505", message: "duplicate segment", details: null, hint: null } },
    ]);
    session(db);
    expect(await response(createSegment(new Request("http://localhost/segments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ start_char: 0, end_char: 5, selected_text: "alpha", base_document_revision: 0 }) }), { params: Promise.resolve({ id: PID, documentId: DID }) }))).toEqual({ status: 409, body: { ok: false, error: "SEGMENT_ALREADY_EXISTS" } });
  });

  it.each(FAILURES.slice(0, 3))("membership dependency $name does not become403", async fixture => {
    const { db } = client([fixture]);
    session(db);
    safe(await response(loadDocument(new Request("http://localhost/document"), { params: Promise.resolve({ id: PID, documentId: DID }) })));
  });

  it("retains safe forbidden on actual SDK membership403 and unknown nontransient errors", async () => {
    for (const fixture of [
      { name: "permission", status: 403, body: { code: "42501", message: "permission denied for table project_members " + PRIVATE } },
      { name: "unknown", status: 400, body: { code: "22023", message: "private membership failure " + PRIVATE } },
    ]) {
      const { db, requests } = client([fixture]);
      session(db);
      expect(await response(loadDocument(new Request("http://localhost/document"), { params: Promise.resolve({ id: PID, documentId: DID }) }))).toEqual({ status: 403, body: { ok: false, error: "FORBIDDEN" } });
      expect(requests).toHaveLength(1);
      await expect(requireProjectMember(PID)).rejects.toMatchObject({ status: 403, message: "FORBIDDEN" });
    }
  });
});
