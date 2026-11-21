import { POST as createProject } from "@/app/api/projects/route";
import { GET as loadCurrentUser } from "@/app/api/users/me/route";
import { PATCH as updateDocument } from "@/app/api/projects/[id]/documents/[documentId]/route";
import { POST as createSegment } from "@/app/api/projects/[id]/documents/[documentId]/segments/route";
import { POST as createMemo } from "@/app/api/projects/[id]/analysis/memos/route";
import { POST as createInsight } from "@/app/api/projects/[id]/analysis/insights/route";
import { POST as assignCode } from "@/app/api/projects/[id]/analysis/segments/[segmentId]/codes/route";
import { POST as createInvitation } from "@/app/api/projects/[id]/team/route";
import { GET as listResearchVersions } from "@/app/api/projects/[id]/research-design/versions/route";
import { GET as listSampleVersions } from "@/app/api/projects/[id]/sample-config/versions/route";
import {
  SUPABASE_FAILURE_CASES,
  freshProviderFailure,
} from "@/__tests__/backend/supabase-failure-cases";

jest.mock("@/src/modules/auth/auth.guard", () => ({
  requireSession: jest.fn(),
}));
jest.mock("@/src/modules/projects/project.guard", () => ({
  requireProjectRole: jest.fn(),
}));
jest.mock("@/src/modules/projects/projects.repo", () => ({ ProjectsRepo: jest.fn() }));
jest.mock("@/src/modules/projects/projects.service", () => ({ ProjectsService: jest.fn() }));
jest.mock("@/src/modules/users/users.service", () => ({ getMe: jest.fn() }));
jest.mock("@/src/modules/documents/documents.repo", () => ({ DocumentsRepo: jest.fn() }));
jest.mock("@/src/modules/documents/documents.service", () => ({ DocumentsService: jest.fn() }));
jest.mock("@/src/modules/documents/document-segments.repo", () => ({ DocumentSegmentsRepo: jest.fn() }));
jest.mock("@/src/modules/documents/document-segments.service", () => ({ DocumentSegmentsService: jest.fn() }));
jest.mock("@/src/modules/analysis/analysis-memos.repo", () => ({ AnalysisMemosRepo: jest.fn() }));
jest.mock("@/src/modules/analysis/analysis-memos.service", () => ({ AnalysisMemosService: jest.fn() }));
jest.mock("@/src/modules/analysis/analysis-insights.repo", () => ({ AnalysisInsightsRepo: jest.fn() }));
jest.mock("@/src/modules/analysis/analysis-insights.service", () => ({ AnalysisInsightsService: jest.fn() }));
jest.mock("@/src/modules/analysis/analysis-segment-codes.repo", () => ({ AnalysisSegmentCodesRepo: jest.fn() }));
jest.mock("@/src/modules/analysis/analysis-segment-codes.service", () => ({ AnalysisSegmentCodesService: jest.fn() }));
jest.mock("@/src/modules/collaboration/collaboration.repo", () => ({ CollaborationRepo: jest.fn() }));
jest.mock("@/src/modules/collaboration/collaboration.service", () => ({ CollaborationService: jest.fn() }));
jest.mock("@/src/modules/research-design/research-design.repo", () => ({ ResearchDesignRepo: jest.fn() }));
jest.mock("@/src/modules/research-design/research-design.service", () => ({ ResearchDesignService: jest.fn() }));
jest.mock("@/src/modules/sample-config/sample-config.repo", () => ({ SampleConfigRepo: jest.fn() }));
jest.mock("@/src/modules/sample-config/sample-config.service", () => ({ SampleConfigService: jest.fn() }));

import { requireSession } from "@/src/modules/auth/auth.guard";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectsService } from "@/src/modules/projects/projects.service";
import { getMe } from "@/src/modules/users/users.service";
import { DocumentsService } from "@/src/modules/documents/documents.service";
import { DocumentSegmentsService } from "@/src/modules/documents/document-segments.service";
import { AnalysisMemosService } from "@/src/modules/analysis/analysis-memos.service";
import { AnalysisInsightsService } from "@/src/modules/analysis/analysis-insights.service";
import { AnalysisSegmentCodesService } from "@/src/modules/analysis/analysis-segment-codes.service";
import { CollaborationService } from "@/src/modules/collaboration/collaboration.service";
import { ResearchDesignService } from "@/src/modules/research-design/research-design.service";
import { SampleConfigService } from "@/src/modules/sample-config/sample-config.service";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const SEGMENT_ID = "33333333-3333-4333-8333-333333333333";
const CODE_ID = "44444444-4444-4444-8444-444444444444";
const USER = { id: "user-1", email: "owner@example.com" };

const mockCreateProject = jest.fn();
const mockUpdateDocument = jest.fn();
const mockCreateSegment = jest.fn();
const mockCreateMemo = jest.fn();
const mockCreateInsight = jest.fn();
const mockAssignCode = jest.fn();
const mockCreateInvitation = jest.fn();
const mockListResearchVersions = jest.fn();
const mockListSampleVersions = jest.fn();

function jsonRequest(path: string, method: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function projectContext() {
  return { params: Promise.resolve({ id: PROJECT_ID }) };
}

function documentContext() {
  return { params: Promise.resolve({ id: PROJECT_ID, documentId: DOCUMENT_ID }) };
}

function segmentContext() {
  return { params: Promise.resolve({ id: PROJECT_ID, segmentId: SEGMENT_ID }) };
}

async function readResponse(operation: Promise<Response>) {
  const response = await operation;
  return { status: response.status, body: await response.json() };
}

function expectNoPrivateProviderFields(body: unknown) {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(/select\s+secret_value/i);
  expect(serialized).not.toMatch(/https?:\/\//i);
  expect(serialized).not.toMatch(/provider-secret/i);
  expect(serialized).not.toMatch(/provider details/i);
  expect(serialized).not.toMatch(/provider hint/i);
  expect(serialized).not.toMatch(/provider stack/i);
  expect(serialized).not.toMatch(/\"(?:details|hint|stack)\"/i);
}

type RouteCase = {
  name: string;
  invoke: (error: unknown) => Promise<Response>;
  expectedError: string;
};

describe("public route dependency failure serializers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireSession as jest.Mock).mockResolvedValue({ supabase: {}, user: USER });
    (requireProjectRole as jest.Mock).mockResolvedValue({
      supabase: {},
      user: USER,
      member: { role: "owner" },
    });
    (ProjectsService as jest.Mock).mockImplementation(() => ({ createForUser: mockCreateProject }));
    (DocumentsService as jest.Mock).mockImplementation(() => ({ update: mockUpdateDocument }));
    (DocumentSegmentsService as jest.Mock).mockImplementation(() => ({ create: mockCreateSegment }));
    (AnalysisMemosService as jest.Mock).mockImplementation(() => ({ create: mockCreateMemo }));
    (AnalysisInsightsService as jest.Mock).mockImplementation(() => ({ create: mockCreateInsight }));
    (AnalysisSegmentCodesService as jest.Mock).mockImplementation(() => ({ create: mockAssignCode }));
    (CollaborationService as jest.Mock).mockImplementation(() => ({ inviteMember: mockCreateInvitation }));
    (ResearchDesignService as jest.Mock).mockImplementation(() => ({ listVersions: mockListResearchVersions }));
    (SampleConfigService as jest.Mock).mockImplementation(() => ({ listVersions: mockListSampleVersions }));
  });

  const rawSerializerRoutes: RouteCase[] = [
    {
      name: "project creation",
      expectedError: "DEPENDENCY_UNAVAILABLE",
      invoke: (error) => {
        mockCreateProject.mockRejectedValueOnce(error);
        return createProject(jsonRequest("/api/projects", "POST", { name: "Project" }));
      },
    },
    {
      name: "current user/profile load",
      expectedError: "DEPENDENCY_UNAVAILABLE",
      invoke: (error) => {
        (getMe as jest.Mock).mockRejectedValueOnce(error);
        return loadCurrentUser();
      },
    },
    {
      name: "document update",
      expectedError: "DEPENDENCY_UNAVAILABLE",
      invoke: (error) => {
        mockUpdateDocument.mockRejectedValueOnce(error);
        return updateDocument(
          jsonRequest("/document", "PATCH", { base_revision: 0, title: "Updated" }),
          documentContext()
        );
      },
    },
    {
      name: "document segment creation",
      expectedError: "DEPENDENCY_UNAVAILABLE",
      invoke: (error) => {
        mockCreateSegment.mockRejectedValueOnce(error);
        return createSegment(
          jsonRequest("/segments", "POST", {
            base_document_revision: 0,
            start_char: 0,
            end_char: 5,
            selected_text: "alpha",
          }),
          documentContext()
        );
      },
    },
    {
      name: "memo creation",
      expectedError: "DEPENDENCY_UNAVAILABLE",
      invoke: (error) => {
        mockCreateMemo.mockRejectedValueOnce(error);
        return createMemo(jsonRequest("/memos", "POST", { title: "Memo" }), projectContext());
      },
    },
    {
      name: "insight creation",
      expectedError: "DEPENDENCY_UNAVAILABLE",
      invoke: (error) => {
        mockCreateInsight.mockRejectedValueOnce(error);
        return createInsight(jsonRequest("/insights", "POST", { title: "Insight" }), projectContext());
      },
    },
    {
      name: "segment code assignment",
      expectedError: "DEPENDENCY_UNAVAILABLE",
      invoke: (error) => {
        mockAssignCode.mockRejectedValueOnce(error);
        return assignCode(jsonRequest("/codes", "POST", { code_id: CODE_ID }), segmentContext());
      },
    },
    {
      name: "research version listing",
      expectedError: "DEPENDENCY_UNAVAILABLE",
      invoke: (error) => {
        mockListResearchVersions.mockRejectedValueOnce(error);
        return listResearchVersions(new Request("http://localhost/research"), projectContext());
      },
    },
    {
      name: "sample version listing",
      expectedError: "DEPENDENCY_UNAVAILABLE",
      invoke: (error) => {
        mockListSampleVersions.mockRejectedValueOnce(error);
        return listSampleVersions(new Request("http://localhost/sample"), projectContext());
      },
    },
  ];

  it.each(rawSerializerRoutes)(
    "$name returns safe503 without provider message or private fields",
    async ({ invoke, expectedError }) => {
      for (const fixture of SUPABASE_FAILURE_CASES) {
        const error = Object.assign(freshProviderFailure(fixture) as object, { stack: "provider stack secret" });
        const observed = await readResponse(invoke(error));
        expect(observed).toEqual({ status: 503, body: { ok: false, error: expectedError } });
        expectNoPrivateProviderFields(observed.body);
        expect(JSON.stringify(observed.body).toLowerCase()).not.toContain(fixture.error.message.toLowerCase());
      }
    }
  );

  it.each(rawSerializerRoutes)("$name preserves literal domain errors", async ({ invoke }) => {
    for (const status of [400, 401, 403, 404, 409, 410]) {
      const observed = await readResponse(invoke(Object.assign(new Error("DOMAIN_FAILURE"), { status })));
      expect(observed).toEqual({ status, body: { ok: false, error: "DOMAIN_FAILURE" } });
    }
  });

  it("retains segment unique-constraint and known not-found message mapping", async () => {
    for (const [error, body, status] of [
      [{ code: "23505", message: "duplicate key" }, { ok: false, error: "SEGMENT_ALREADY_EXISTS" }, 409],
      [{ message: "Document does not exist or is deleted" }, { ok: false, error: "DOCUMENT_NOT_FOUND" }, 404],
      [{ message: "Selected text does not match document content range" }, { ok: false, error: "SELECTED_TEXT_DOES_NOT_MATCH_DOCUMENT" }, 400],
    ] as const) {
      mockCreateSegment.mockRejectedValueOnce(error);
      expect(await readResponse(createSegment(jsonRequest("/segments", "POST", { base_document_revision: 0, start_char: 0, end_char: 5, selected_text: "alpha" }), documentContext()))).toEqual({ status, body });
    }
  });

  it("retains invitation expiry, authorization and conflict errors", async () => {
    for (const [status, message] of [[410, "PROJECT_INVITATION_EXPIRED"], [403, "PROJECT_INVITATION_EMAIL_MISMATCH"], [409, "PROJECT_INVITATION_CONFLICT"]] as const) {
      mockCreateInvitation.mockRejectedValueOnce(Object.assign(new Error(message), { status }));
      expect(await readResponse(createInvitation(jsonRequest("/team", "POST", { email: "ana@example.com", role: "editor" }), projectContext()))).toEqual({ status, body: { ok: false, error: message } });
    }
  });

  it("team invitation redacts >=500 provider messages and private provider fields", async () => {
    const error = Object.assign(
      freshProviderFailure(SUPABASE_FAILURE_CASES[3]) as object,
      { stack: "provider stack secret" }
    );
    mockCreateInvitation.mockRejectedValueOnce(error);

    const observed = await readResponse(
      createInvitation(
        jsonRequest("/team", "POST", { email: "ana@example.com", role: "editor" }),
        projectContext()
      )
    );

    expect(observed).toEqual({
      status: 503,
      body: { ok: false, error: "DEPENDENCY_UNAVAILABLE" },
    });
    expectNoPrivateProviderFields(observed.body);
  });

  it.each(SUPABASE_FAILURE_CASES)(
    "project raw serializer status/message for $name",
    async (failureCase) => {
      const error = freshProviderFailure(failureCase);
      mockCreateProject.mockRejectedValueOnce(error);
      const observed = await readResponse(
        createProject(jsonRequest("/api/projects", "POST", { name: "Project" }))
      );

      expect(observed).toEqual({
        status: 503,
        body: { ok: false, error: "DEPENDENCY_UNAVAILABLE" },
      });
      expectNoPrivateProviderFields(observed.body);
    }
  );

  it.each(SUPABASE_FAILURE_CASES)(
    "team invitation serializer status/message for $name",
    async (failureCase) => {
      const error = freshProviderFailure(failureCase);
      mockCreateInvitation.mockRejectedValueOnce(error);
      const observed = await readResponse(
        createInvitation(
          jsonRequest("/team", "POST", { email: "ana@example.com", role: "editor" }),
          projectContext()
        )
      );

      expect(observed).toEqual({
        status: 503,
        body: {
          ok: false,
          error: "DEPENDENCY_UNAVAILABLE",
        },
      });
      expectNoPrivateProviderFields(observed.body);
    }
  );
});
