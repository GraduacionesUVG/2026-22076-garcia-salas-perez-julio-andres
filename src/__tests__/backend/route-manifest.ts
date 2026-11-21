export const HTTP_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
export type RouteFile = "app/api/route.ts" | `app/api/${string}/route.ts`;
export type ApiPath = "/api" | `/api/${string}`;
export type IntegrationSpecPath = `__tests__/integration/${string}.spec.ts`;
export type BackendRouteCoverageTuple = readonly [HttpMethod, ApiPath];
export type BackendRouteCoverageDeclaration =
  readonly BackendRouteCoverageTuple[];

export const ALLOWED_EXCLUSION_CATEGORIES = [
  "health probe",
  "local-only diagnostics",
  "OAuth callback mechanics",
  "supabase diagnostic ping",
] as const;

export type RouteExclusionCategory =
  (typeof ALLOWED_EXCLUSION_CATEGORIES)[number];

export interface AuthorizedRouteExclusion {
  readonly path: ApiPath;
  readonly method: HttpMethod;
  readonly category: RouteExclusionCategory;
}

export const AUTHORIZED_ROUTE_EXCLUSIONS = [
  { path: "/api/health", method: "GET", category: "health probe" },
  {
    path: "/api/debug/auth",
    method: "GET",
    category: "local-only diagnostics",
  },
  {
    path: "/api/auth/callback",
    method: "GET",
    category: "OAuth callback mechanics",
  },
  {
    path: "/api/supabase-ping",
    method: "GET",
    category: "supabase diagnostic ping",
  },
] as const satisfies readonly AuthorizedRouteExclusion[];

export type RouteModule =
  | "operations"
  | "admin"
  | "auth"
  | "projects"
  | "collaboration"
  | "delimitation"
  | "research-design"
  | "sample-config"
  | "participants"
  | "documents"
  | "analysis"
  | "ai";

export interface RouteExclusion {
  readonly methods: readonly HttpMethod[];
  readonly category: RouteExclusionCategory;
  readonly reason: string;
}

export interface RouteContract {
  readonly file: RouteFile;
  readonly path: ApiPath;
  readonly methods: readonly HttpMethod[];
  readonly module: RouteModule;
  readonly spec: IntegrationSpecPath | null;
  readonly exclusions: readonly RouteExclusion[];
}

function dynamicSegment(segment: string): string {
  let match = /^\[\[\.\.\.([^\[\]\/]+)\]\]$/.exec(segment);
  if (match) return `:${match[1]}*?`;

  match = /^\[\.\.\.([^\[\]\/]+)\]$/.exec(segment);
  if (match) return `:${match[1]}*`;

  match = /^\[([^\[\]\/]+)\]$/.exec(segment);
  if (match && !match[1].startsWith("...")) return `:${match[1]}`;

  if (segment.includes("[") || segment.includes("]")) {
    throw new Error(`Malformed dynamic route segment: ${segment}`);
  }
  return segment;
}

export function normalizeRoutePath(routeFile: string): ApiPath {
  const normalized = routeFile.replaceAll("\\", "/").replace(/^\.\//, "");
  const match = /(?:^|\/)app\/api(?:\/(.*))?\/route\.ts$/.exec(normalized);
  if (!match) throw new Error(`Not an app/api route file: ${routeFile}`);

  const suffix = match[1];
  if (!suffix) return "/api";
  const segments = suffix
    .split("/")
    .filter((segment) => !/^\([^()[\]\/]+\)$/.test(segment))
    .map(dynamicSegment);
  return segments.length === 0 ? "/api" : `/api/${segments.join("/")}`;
}

function route(
  file: RouteFile,
  methods: readonly HttpMethod[],
  module: RouteModule,
  spec: IntegrationSpecPath
): RouteContract {
  return {
    file,
    path: normalizeRoutePath(file),
    methods,
    module,
    spec,
    exclusions: [],
  };
}

function excludedRoute(
  file: RouteFile,
  methods: readonly HttpMethod[],
  module: RouteModule,
  category: RouteExclusionCategory,
  reason: string
): RouteContract {
  return {
    file,
    path: normalizeRoutePath(file),
    methods,
    module,
    spec: null,
    exclusions: [{ methods, category, reason }],
  };
}

const AUTH = "__tests__/integration/auth/auth-contracts.spec.ts";
const PROFILE = "__tests__/integration/auth/profile-contracts.spec.ts";
const PROJECTS = "__tests__/integration/projects/projects-contracts.spec.ts";
const TEAM = "__tests__/integration/collaboration/team-contracts.spec.ts";
const DELIMITATION =
  "__tests__/integration/delimitation/delimitation-contracts.spec.ts";
const RESEARCH_DESIGN =
  "__tests__/integration/research-design/research-design-contracts.spec.ts";
const SAMPLE_CONFIG =
  "__tests__/integration/sample-config/sample-config-contracts.spec.ts";
const PARTICIPANTS =
  "__tests__/integration/participants/participants-contracts.spec.ts";
const SOURCES = "__tests__/integration/documents/sources-contracts.spec.ts";
const DOCUMENTS =
  "__tests__/integration/documents/documents-contracts.spec.ts";
const DOCUMENT_VERSIONS =
  "__tests__/integration/documents/document-versions.spec.ts";
const DOCUMENT_LIFECYCLE =
  "__tests__/integration/documents/document-lifecycle.spec.ts";
const DOCUMENT_EXPORT =
  "__tests__/integration/documents/document-export.spec.ts";
const PROJECT_EXPORTS =
  "__tests__/integration/exports/project-exports.spec.ts";
const SEGMENTS = "__tests__/integration/analysis/segments-contracts.spec.ts";
const CODES = "__tests__/integration/analysis/codes-contracts.spec.ts";
const SEGMENT_CODES =
  "__tests__/integration/analysis/segment-codes-contracts.spec.ts";
const MEMOS = "__tests__/integration/analysis/memos-contracts.spec.ts";
const INSIGHTS = "__tests__/integration/analysis/insights-contracts.spec.ts";
const EVIDENCE = "__tests__/integration/analysis/evidence-links.spec.ts";
const DASHBOARD =
  "__tests__/integration/analysis/dashboard-contracts.spec.ts";
const AI = "__tests__/integration/ai/ai-contracts.spec.ts";

export const routeManifest: readonly RouteContract[] = [
  route("app/api/admin/users/route.ts", ["GET"], "admin", AUTH),
  excludedRoute("app/api/auth/callback/route.ts", ["GET"], "auth", "OAuth callback mechanics", "Exchanges the provider callback code and redirects the browser; provider mechanics are not an API contract."),
  route("app/api/auth/change-password/route.ts", ["POST"], "auth", AUTH),
  route("app/api/auth/forgot-password/route.ts", ["POST"], "auth", AUTH),
  route("app/api/auth/login/route.ts", ["POST"], "auth", AUTH),
  route("app/api/auth/logout/route.ts", ["POST"], "auth", AUTH),
  route("app/api/auth/me/route.ts", ["GET"], "auth", AUTH),
  route("app/api/auth/refresh/route.ts", ["POST"], "auth", AUTH),
  route("app/api/auth/register/route.ts", ["POST"], "auth", AUTH),
  route("app/api/auth/reset-password/route.ts", ["POST"], "auth", AUTH),
  excludedRoute("app/api/debug/auth/route.ts", ["GET"], "operations", "local-only diagnostics", "Reports local authentication diagnostics and is unavailable outside the local development environment."),
  excludedRoute("app/api/health/route.ts", ["GET"], "operations", "health probe", "Provides the deployment liveness probe without application-domain behavior."),
  route("app/api/profiles/me/route.ts", ["GET", "PATCH"], "auth", PROFILE),
  route("app/api/project-invitations/accept/route.ts", ["POST"], "collaboration", TEAM),
  route("app/api/projects/[id]/analysis/chat/route.ts", ["POST"], "ai", AI),
  route("app/api/projects/[id]/analysis/codes/[codeId]/route.ts", ["GET", "PATCH", "DELETE"], "analysis", CODES),
  route("app/api/projects/[id]/analysis/codes/route.ts", ["GET", "POST"], "analysis", CODES),
  route("app/api/projects/[id]/analysis/codes/stats/route.ts", ["GET"], "analysis", DASHBOARD),
  route("app/api/projects/[id]/analysis/dashboard/route.ts", ["GET"], "analysis", DASHBOARD),
  route("app/api/projects/[id]/analysis/document-patterns/route.ts", ["GET"], "analysis", DASHBOARD),
  route("app/api/projects/[id]/analysis/insights/[insightId]/links/[linkId]/route.ts", ["DELETE"], "analysis", EVIDENCE),
  route("app/api/projects/[id]/analysis/insights/[insightId]/links/route.ts", ["GET", "POST"], "analysis", EVIDENCE),
  route("app/api/projects/[id]/analysis/insights/[insightId]/route.ts", ["GET", "PATCH", "DELETE"], "analysis", INSIGHTS),
  route("app/api/projects/[id]/analysis/insights/route.ts", ["GET", "POST"], "analysis", INSIGHTS),
  route("app/api/projects/[id]/analysis/memos/[memoId]/links/[linkId]/route.ts", ["DELETE"], "analysis", EVIDENCE),
  route("app/api/projects/[id]/analysis/memos/[memoId]/links/route.ts", ["GET", "POST"], "analysis", EVIDENCE),
  route("app/api/projects/[id]/analysis/memos/[memoId]/route.ts", ["GET", "PATCH", "DELETE"], "analysis", MEMOS),
  route("app/api/projects/[id]/analysis/memos/route.ts", ["GET", "POST"], "analysis", MEMOS),
  route("app/api/projects/[id]/analysis/overview/route.ts", ["GET"], "analysis", DASHBOARD),
  route("app/api/projects/[id]/analysis/relationships/route.ts", ["GET"], "analysis", DASHBOARD),
  route("app/api/projects/[id]/analysis/segments/[segmentId]/codes/[segmentCodeId]/route.ts", ["PATCH", "DELETE"], "analysis", SEGMENT_CODES),
  route("app/api/projects/[id]/analysis/segments/[segmentId]/codes/route.ts", ["GET", "POST"], "analysis", SEGMENT_CODES),
  route("app/api/projects/[id]/analysis/segments/route.ts", ["GET"], "analysis", SEGMENTS),
  route("app/api/projects/[id]/analysis/segments/uncoded/route.ts", ["GET"], "analysis", DASHBOARD),
  route("app/api/projects/[id]/delimitation/chat/route.ts", ["POST"], "ai", AI),
  route("app/api/projects/[id]/delimitation/items/[itemId]/route.ts", ["PATCH", "DELETE"], "delimitation", DELIMITATION),
  route("app/api/projects/[id]/delimitation/items/route.ts", ["POST"], "delimitation", DELIMITATION),
  route("app/api/projects/[id]/delimitation/review/route.ts", ["POST"], "ai", AI),
  route("app/api/projects/[id]/delimitation/route.ts", ["GET", "PATCH", "PUT"], "delimitation", DELIMITATION),
  route("app/api/projects/[id]/delimitation/versions/[versionId]/restore/route.ts", ["POST"], "delimitation", DELIMITATION),
  route("app/api/projects/[id]/delimitation/versions/[versionId]/route.ts", ["GET"], "delimitation", DELIMITATION),
  route("app/api/projects/[id]/delimitation/versions/route.ts", ["GET", "POST"], "delimitation", DELIMITATION),
  route("app/api/projects/[id]/documents/[documentId]/duplicate/route.ts", ["POST"], "documents", DOCUMENT_LIFECYCLE),
  route("app/api/projects/[id]/documents/[documentId]/export/route.ts", ["GET"], "documents", DOCUMENT_EXPORT),
  route("app/api/projects/[id]/documents/[documentId]/restore/route.ts", ["POST"], "documents", DOCUMENT_LIFECYCLE),
  route("app/api/projects/[id]/documents/[documentId]/route.ts", ["GET", "PATCH", "DELETE"], "documents", DOCUMENTS),
  route("app/api/projects/[id]/documents/[documentId]/segments/[segmentId]/route.ts", ["GET", "PATCH", "DELETE"], "analysis", SEGMENTS),
  route("app/api/projects/[id]/documents/[documentId]/segments/route.ts", ["GET", "POST"], "analysis", SEGMENTS),
  route("app/api/projects/[id]/documents/[documentId]/versions/[versionId]/restore/route.ts", ["POST"], "documents", DOCUMENT_VERSIONS),
  route("app/api/projects/[id]/documents/[documentId]/versions/[versionId]/route.ts", ["GET"], "documents", DOCUMENT_VERSIONS),
  route("app/api/projects/[id]/documents/[documentId]/versions/route.ts", ["GET", "POST"], "documents", DOCUMENT_VERSIONS),
  route("app/api/projects/[id]/documents/route.ts", ["GET", "POST"], "documents", DOCUMENTS),
  route("app/api/projects/[id]/documents/sources/[sourceId]/route.ts", ["GET", "PATCH", "DELETE"], "documents", SOURCES),
  route("app/api/projects/[id]/documents/sources/route.ts", ["GET", "POST"], "documents", SOURCES),
  route("app/api/projects/[id]/documents/stats/route.ts", ["GET"], "documents", DOCUMENTS),
  route("app/api/projects/[id]/documents/trash/route.ts", ["GET"], "documents", DOCUMENT_LIFECYCLE),
  route("app/api/projects/[id]/exports/[exportType]/route.ts", ["GET"], "documents", PROJECT_EXPORTS),
  route("app/api/projects/[id]/participants/[participantId]/route.ts", ["GET", "PATCH", "DELETE"], "participants", PARTICIPANTS),
  route("app/api/projects/[id]/participants/route.ts", ["GET", "POST"], "participants", PARTICIPANTS),
  route("app/api/projects/[id]/research-design/chat/route.ts", ["POST"], "ai", AI),
  route("app/api/projects/[id]/research-design/evaluate/route.ts", ["GET"], "research-design", RESEARCH_DESIGN),
  route("app/api/projects/[id]/research-design/review/route.ts", ["POST"], "ai", AI),
  route("app/api/projects/[id]/research-design/route.ts", ["GET", "PATCH", "PUT"], "research-design", RESEARCH_DESIGN),
  route("app/api/projects/[id]/research-design/specific-objectives/[objectiveId]/route.ts", ["PATCH", "DELETE"], "research-design", RESEARCH_DESIGN),
  route("app/api/projects/[id]/research-design/specific-objectives/reorder/route.ts", ["POST"], "research-design", RESEARCH_DESIGN),
  route("app/api/projects/[id]/research-design/specific-objectives/route.ts", ["POST"], "research-design", RESEARCH_DESIGN),
  route("app/api/projects/[id]/research-design/versions/[versionId]/restore/route.ts", ["POST"], "research-design", RESEARCH_DESIGN),
  route("app/api/projects/[id]/research-design/versions/[versionId]/route.ts", ["GET"], "research-design", RESEARCH_DESIGN),
  route("app/api/projects/[id]/research-design/versions/route.ts", ["GET", "POST"], "research-design", RESEARCH_DESIGN),
  route("app/api/projects/[id]/route.ts", ["GET", "PATCH", "DELETE"], "projects", PROJECTS),
  route("app/api/projects/[id]/sample-config/chat/route.ts", ["POST"], "ai", AI),
  route("app/api/projects/[id]/sample-config/options/route.ts", ["GET"], "sample-config", SAMPLE_CONFIG),
  route("app/api/projects/[id]/sample-config/review/route.ts", ["POST"], "ai", AI),
  route("app/api/projects/[id]/sample-config/route.ts", ["GET", "PATCH", "PUT"], "sample-config", SAMPLE_CONFIG),
  route("app/api/projects/[id]/sample-config/versions/[versionId]/restore/route.ts", ["POST"], "sample-config", SAMPLE_CONFIG),
  route("app/api/projects/[id]/sample-config/versions/[versionId]/route.ts", ["GET"], "sample-config", SAMPLE_CONFIG),
  route("app/api/projects/[id]/sample-config/versions/route.ts", ["GET", "POST"], "sample-config", SAMPLE_CONFIG),
  route("app/api/projects/[id]/team/invitations/[invitationId]/revoke/route.ts", ["POST"], "collaboration", TEAM),
  route("app/api/projects/[id]/team/members/[userId]/route.ts", ["PATCH", "DELETE"], "collaboration", TEAM),
  route("app/api/projects/[id]/team/presence/route.ts", ["POST"], "collaboration", TEAM),
  route("app/api/projects/[id]/team/route.ts", ["GET", "POST"], "collaboration", TEAM),
  route("app/api/projects/[id]/workflow/route.ts", ["GET"], "projects", PROJECTS),
  route("app/api/projects/route.ts", ["GET", "POST"], "projects", PROJECTS),
  excludedRoute("app/api/supabase-ping/route.ts", ["GET"], "operations", "supabase diagnostic ping", "Checks local Supabase connectivity and configuration without application-domain behavior."),
  route("app/api/users/me/route.ts", ["GET", "PATCH"], "auth", PROFILE),
] as const;
