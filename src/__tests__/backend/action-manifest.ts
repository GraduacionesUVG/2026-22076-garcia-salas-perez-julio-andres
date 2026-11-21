import type { ApiPath, HttpMethod, IntegrationSpecPath } from "./route-manifest";
import { routeManifest } from "./route-manifest";
import { evidenceSourcesFor, type EvidenceSource } from "./action-evidence-sources";

export type BackendActor = "anonymous" | "owner" | "editor" | "viewer" | "intruder";
export type EvidenceDimension =
  | "success" | "persistence" | "permissions" | "validation"
  | "duplicate" | "concurrency" | "dependency-failure" | "cleanup";

export interface OutOfScopePresentationContract {
  id:
    | "analysis.insights.tag-filter"
    | "analysis.memos.tag-filter"
    | "corpus.participant.groups"
    | "corpus.participant.revision";
  reason: "No current frontend backend action consumes this contract";
}

export interface BackendActionContract {
  id: `${string}.${string}`;
  label: string;
  sources: readonly { file: `features/${string}`; symbol: string }[];
  route: readonly [HttpMethod, ApiPath];
  spec: IntegrationSpecPath;
  required: readonly EvidenceDimension[];
  presentation: "required" | "out-of-scope";
  outOfScopeReason?: string;
  outOfScopeContracts?: readonly OutOfScopePresentationContract[];
  persistenceException?: "streaming-ai-no-durable-write";
  evidenceSources?: readonly EvidenceSource[];
}

export interface FrontendActionExclusion {
  file: `features/${string}`;
  symbol: string;
  method: HttpMethod;
  canonicalPath: string;
  reason: string;
}

type Declaration = readonly [
  id: BackendActionContract["id"],
  sources: readonly (readonly [file: string, symbol: string])[],
  method: HttpMethod,
  path: ApiPath,
];

// Explicit, versioned ownership inventory. Source discovery never generates entries here.
const declarations = [
  ["analysis.chat", [["projects/analysis/components/AnalysisAssistantSidebar.jsx", "AnalysisAssistantSidebar"]], "POST", "/api/projects/:id/analysis/chat"],
  ["analysis.code-relationships.read", [["projects/analysis/api/analysis.api.js", "getAnalysisCodeRelationships"]], "GET", "/api/projects/:id/analysis/relationships"],
  ["analysis.code-usage-stats.read", [["projects/analysis/api/analysis.api.js", "getAnalysisCodeUsageStats"]], "GET", "/api/projects/:id/analysis/codes/stats"],
  ["analysis.code.create", [["projects/analysis/api/analysis.api.js", "createAnalysisCode"]], "POST", "/api/projects/:id/analysis/codes"],
  ["analysis.code.delete", [["projects/analysis/api/analysis.api.js", "deleteAnalysisCode"]], "DELETE", "/api/projects/:id/analysis/codes/:codeId"],
  ["analysis.code.read", [["projects/analysis/api/analysis.api.js", "getAnalysisCode"]], "GET", "/api/projects/:id/analysis/codes/:codeId"],
  ["analysis.code.update", [["projects/analysis/api/analysis.api.js", "updateAnalysisCode"]], "PATCH", "/api/projects/:id/analysis/codes/:codeId"],
  ["analysis.codes.list", [["projects/analysis/api/analysis.api.js", "getAnalysisCodes"]], "GET", "/api/projects/:id/analysis/codes"],
  ["analysis.dashboard.read", [["projects/analysis/api/analysis.api.js", "getAnalysisDashboard"]], "GET", "/api/projects/:id/analysis/dashboard"],
  ["analysis.document-patterns.read", [["projects/analysis/api/analysis.api.js", "getAnalysisDocumentPatterns"]], "GET", "/api/projects/:id/analysis/document-patterns"],
  ["analysis.insight-link.create", [["projects/analysis/api/analysis.api.js", "createAnalysisInsightLink"]], "POST", "/api/projects/:id/analysis/insights/:insightId/links"],
  ["analysis.insight-link.delete", [["projects/analysis/api/analysis.api.js", "deleteAnalysisInsightLink"]], "DELETE", "/api/projects/:id/analysis/insights/:insightId/links/:linkId"],
  ["analysis.insight-links.list", [["projects/analysis/api/analysis.api.js", "getAnalysisInsightLinks"]], "GET", "/api/projects/:id/analysis/insights/:insightId/links"],
  ["analysis.insight.create", [["projects/analysis/api/analysis.api.js", "createAnalysisInsight"]], "POST", "/api/projects/:id/analysis/insights"],
  ["analysis.insight.delete", [["projects/analysis/api/analysis.api.js", "deleteAnalysisInsight"]], "DELETE", "/api/projects/:id/analysis/insights/:insightId"],
  ["analysis.insight.read", [["projects/analysis/api/analysis.api.js", "getAnalysisInsight"]], "GET", "/api/projects/:id/analysis/insights/:insightId"],
  ["analysis.insight.update", [["projects/analysis/api/analysis.api.js", "updateAnalysisInsight"]], "PATCH", "/api/projects/:id/analysis/insights/:insightId"],
  ["analysis.insights.list", [["projects/analysis/api/analysis.api.js", "getAnalysisInsights"]], "GET", "/api/projects/:id/analysis/insights"],
  ["analysis.memo-link.create", [["projects/analysis/api/analysis.api.js", "createAnalysisMemoLink"]], "POST", "/api/projects/:id/analysis/memos/:memoId/links"],
  ["analysis.memo-link.delete", [["projects/analysis/api/analysis.api.js", "deleteAnalysisMemoLink"]], "DELETE", "/api/projects/:id/analysis/memos/:memoId/links/:linkId"],
  ["analysis.memo-links.list", [["projects/analysis/api/analysis.api.js", "getAnalysisMemoLinks"]], "GET", "/api/projects/:id/analysis/memos/:memoId/links"],
  ["analysis.memo.create", [["projects/analysis/api/analysis.api.js", "createAnalysisMemo"]], "POST", "/api/projects/:id/analysis/memos"],
  ["analysis.memo.delete", [["projects/analysis/api/analysis.api.js", "deleteAnalysisMemo"]], "DELETE", "/api/projects/:id/analysis/memos/:memoId"],
  ["analysis.memo.read", [["projects/analysis/api/analysis.api.js", "getAnalysisMemo"]], "GET", "/api/projects/:id/analysis/memos/:memoId"],
  ["analysis.memo.update", [["projects/analysis/api/analysis.api.js", "updateAnalysisMemo"]], "PATCH", "/api/projects/:id/analysis/memos/:memoId"],
  ["analysis.memos.list", [["projects/analysis/api/analysis.api.js", "getAnalysisMemos"]], "GET", "/api/projects/:id/analysis/memos"],
  ["analysis.overview.read", [["projects/analysis/api/analysis.api.js", "getAnalysisOverview"]], "GET", "/api/projects/:id/analysis/overview"],
  ["analysis.segment-code.create", [["projects/analysis/api/analysis.api.js", "createSegmentCode"]], "POST", "/api/projects/:id/analysis/segments/:segmentId/codes"],
  ["analysis.segment-code.delete", [["projects/analysis/api/analysis.api.js", "deleteSegmentCode"]], "DELETE", "/api/projects/:id/analysis/segments/:segmentId/codes/:segmentCodeId"],
  ["analysis.segment-code.update", [["projects/analysis/api/analysis.api.js", "updateSegmentCode"]], "PATCH", "/api/projects/:id/analysis/segments/:segmentId/codes/:segmentCodeId"],
  ["analysis.segment-codes.list", [["projects/analysis/api/analysis.api.js", "getSegmentCodes"]], "GET", "/api/projects/:id/analysis/segments/:segmentId/codes"],
  ["analysis.segments.list", [["projects/analysis/api/analysis.api.js", "getAnalysisSegments"]], "GET", "/api/projects/:id/analysis/segments"],
  ["analysis.uncoded-segments.list", [["projects/analysis/api/analysis.api.js", "getAnalysisUncodedSegments"]], "GET", "/api/projects/:id/analysis/segments/uncoded"],
  ["auth.forgot-password.submit", [["auth/components/forgot-password/ForgotPasswordForm.jsx", "onSubmit"]], "POST", "/api/auth/forgot-password"],
  ["auth.login.submit", [["auth/components/login/LoginForm.jsx", "onSubmit"]], "POST", "/api/auth/login"],
  ["auth.register.submit", [["auth/components/register/RegisterForm.jsx", "onSubmit"]], "POST", "/api/auth/register"],
  ["auth.reset-password.submit", [["auth/components/reset/ResetPasswordForm.jsx", "onSubmit"]], "POST", "/api/auth/reset-password"],
  ["corpus.document-segment.create", [["projects/corpus/api/corpus.api.js", "createCorpusDocumentSegment"]], "POST", "/api/projects/:id/documents/:documentId/segments"],
  ["corpus.document-segment.delete", [["projects/corpus/api/corpus.api.js", "deleteCorpusDocumentSegment"]], "DELETE", "/api/projects/:id/documents/:documentId/segments/:segmentId"],
  ["corpus.document-segment.update", [["projects/corpus/api/corpus.api.js", "updateCorpusDocumentSegment"]], "PATCH", "/api/projects/:id/documents/:documentId/segments/:segmentId"],
  ["corpus.document-segments.list", [["projects/corpus/api/corpus.api.js", "getCorpusDocumentSegments"]], "GET", "/api/projects/:id/documents/:documentId/segments"],
  ["corpus.document-version.create", [["projects/corpus/api/corpus.api.js", "createCorpusDocumentVersion"]], "POST", "/api/projects/:id/documents/:documentId/versions"],
  ["corpus.document-version.read", [["projects/corpus/api/corpus.api.js", "getCorpusDocumentVersion"]], "GET", "/api/projects/:id/documents/:documentId/versions/:versionId"],
  ["corpus.document-version.restore", [["projects/corpus/api/corpus.api.js", "restoreCorpusDocumentVersion"]], "POST", "/api/projects/:id/documents/:documentId/versions/:versionId/restore"],
  ["corpus.document-versions.list", [["projects/corpus/api/corpus.api.js", "getCorpusDocumentVersions"]], "GET", "/api/projects/:id/documents/:documentId/versions"],
  ["corpus.document.create", [["projects/corpus/api/corpus.api.js", "createCorpusDocument"]], "POST", "/api/projects/:id/documents"],
  ["corpus.document.delete", [["projects/corpus/api/corpus.api.js", "deleteCorpusDocument"]], "DELETE", "/api/projects/:id/documents/:documentId"],
  ["corpus.document.duplicate", [["projects/corpus/api/corpus.api.js", "duplicateCorpusDocument"]], "POST", "/api/projects/:id/documents/:documentId/duplicate"],
  ["corpus.document.export", [["projects/corpus/api/corpus.api.js", "getCorpusDocumentExportUrl"], ["projects/corpus/components/CorpusDocumentCard.jsx", "CorpusDocumentCard.download"]], "GET", "/api/projects/:id/documents/:documentId/export"],
  ["corpus.document.read", [["projects/corpus/api/corpus.api.js", "getCorpusDocument"]], "GET", "/api/projects/:id/documents/:documentId"],
  ["corpus.document.restore", [["projects/corpus/api/corpus.api.js", "restoreCorpusDocument"]], "POST", "/api/projects/:id/documents/:documentId/restore"],
  ["corpus.document.update", [["projects/corpus/api/corpus.api.js", "updateCorpusDocument"]], "PATCH", "/api/projects/:id/documents/:documentId"],
  ["corpus.documents.list", [["projects/corpus/api/corpus.api.js", "getCorpusDocuments"]], "GET", "/api/projects/:id/documents"],
  ["corpus.participant.create", [["projects/corpus/api/corpusCatalog.api.js", "createCorpusParticipant"]], "POST", "/api/projects/:id/participants"],
  ["corpus.participant.delete", [["projects/corpus/api/corpusCatalog.api.js", "deleteCorpusParticipant"]], "DELETE", "/api/projects/:id/participants/:participantId"],
  ["corpus.participant.read", [["projects/corpus/api/corpusCatalog.api.js", "getCorpusParticipant"]], "GET", "/api/projects/:id/participants/:participantId"],
  ["corpus.participant.update", [["projects/corpus/api/corpusCatalog.api.js", "updateCorpusParticipant"]], "PATCH", "/api/projects/:id/participants/:participantId"],
  ["corpus.participants.list", [["projects/corpus/api/corpusCatalog.api.js", "getCorpusParticipants"]], "GET", "/api/projects/:id/participants"],
  ["corpus.source.create", [["projects/corpus/api/corpusCatalog.api.js", "createCorpusSource"]], "POST", "/api/projects/:id/documents/sources"],
  ["corpus.source.delete", [["projects/corpus/api/corpusCatalog.api.js", "deleteCorpusSource"]], "DELETE", "/api/projects/:id/documents/sources/:sourceId"],
  ["corpus.source.update", [["projects/corpus/api/corpusCatalog.api.js", "updateCorpusSource"]], "PATCH", "/api/projects/:id/documents/sources/:sourceId"],
  ["corpus.sources.list", [["projects/corpus/api/corpusCatalog.api.js", "getCorpusSources"]], "GET", "/api/projects/:id/documents/sources"],
  ["corpus.stats.read", [["projects/corpus/api/corpus.api.js", "getCorpusStats"]], "GET", "/api/projects/:id/documents/stats"],
  ["corpus.trash.read", [["projects/corpus/api/corpus.api.js", "getCorpusTrash"]], "GET", "/api/projects/:id/documents/trash"],
  ["delimitation.chat", [["projects/delimitation/hooks/useDelimitationChat.js", "useDelimitationChat"]], "POST", "/api/projects/:id/delimitation/chat"],
  ["delimitation.criteria-item.create", [["projects/delimitation/api/delimitation.api.js", "addCriteriaItem"]], "POST", "/api/projects/:id/delimitation/items"],
  ["delimitation.criteria-item.delete", [["projects/delimitation/api/delimitation.api.js", "deleteCriteriaItem"]], "DELETE", "/api/projects/:id/delimitation/items/:itemId"],
  ["delimitation.criteria-item.update", [["projects/delimitation/api/delimitation.api.js", "updateCriteriaItem"]], "PATCH", "/api/projects/:id/delimitation/items/:itemId"],
  ["delimitation.review.evaluate", [["projects/delimitation/api/delimitation.review.api.js", "evaluateDelimitationReview"]], "POST", "/api/projects/:id/delimitation/review"],
  ["delimitation.session.read", [["projects/delimitation/api/delimitation.api.js", "getDelimitation"]], "GET", "/api/projects/:id/delimitation"],
  ["delimitation.session.save", [["projects/delimitation/api/delimitation.api.js", "saveDelimitation"]], "PATCH", "/api/projects/:id/delimitation"],
  ["delimitation.version-detail.read", [["projects/delimitation/api/delimitation.versions.api.js", "fetchDelimitationVersionDetail"]], "GET", "/api/projects/:id/delimitation/versions/:versionId"],
  ["delimitation.version.create", [["projects/delimitation/api/delimitation.versions.api.js", "createDelimitationVersion"]], "POST", "/api/projects/:id/delimitation/versions"],
  ["delimitation.version.restore", [["projects/delimitation/api/delimitation.versions.api.js", "restoreDelimitationVersion"]], "POST", "/api/projects/:id/delimitation/versions/:versionId/restore"],
  ["delimitation.versions.list", [["projects/delimitation/api/delimitation.versions.api.js", "fetchDelimitationVersions"]], "GET", "/api/projects/:id/delimitation/versions"],
  ["exports.bundle.download", [["projects/analysis/components/AnalysisOverviewSection.jsx", "AnalysisOverviewSection.export.bundle"], ["projects/analysis/components/AnalysisOverviewSection.jsx", "AnalysisOverviewSection.export.bundle.call2"], ["projects/analysis/components/AnalysisOverviewSection.jsx", "AnalysisOverviewSection.export.bundle.call3"], ["projects/report/components/ReportEditorSection.jsx", "ReportEditorSection.export.bundle"]], "GET", "/api/projects/:id/exports/:exportType"],
  ["exports.codebook.download", [["projects/analysis/components/AnalysisCodesSection.jsx", "AnalysisCodebookView.export.codebook"], ["projects/analysis/components/AnalysisCodesSection.jsx", "AnalysisCodebookView.export.codebook.call2"]], "GET", "/api/projects/:id/exports/:exportType"],
  ["exports.dashboard.download", [["projects/analysis/components/AnalysisOverviewSection.jsx", "AnalysisOverviewSection.export.dashboard"]], "GET", "/api/projects/:id/exports/:exportType"],
  ["exports.evidence.download", [["projects/analysis/components/AnalysisOverviewSection.jsx", "AnalysisOverviewSection.export.evidence"]], "GET", "/api/projects/:id/exports/:exportType"],
  ["exports.insights.download", [["projects/analysis/components/AnalysisInsightsSection.jsx", "AnalysisInsightsSection.export.insights"], ["projects/report/components/ReportEditorSection.jsx", "ReportEditorSection.export.insights"]], "GET", "/api/projects/:id/exports/:exportType"],
  ["exports.protocol.download", [["projects/sample-config/components/SampleConfigEditorSection.jsx", "SampleConfigEditorSection.export.protocol"], ["projects/sample-config/components/SampleConfigEditorSection.jsx", "SampleConfigEditorSection.export.protocol.call2"]], "GET", "/api/projects/:id/exports/:exportType"],
  ["exports.quotes.download", [["projects/analysis/components/AnalysisInsightsSection.jsx", "AnalysisInsightsSection.export.quotes"], ["projects/report/components/ReportEditorSection.jsx", "ReportEditorSection.export.quotes"]], "GET", "/api/projects/:id/exports/:exportType"],
  ["profile.me.read", [["profile/api/profile.api.js", "fetchMe"]], "GET", "/api/users/me"],
  ["profile.me.update", [["profile/api/profile.api.js", "updateMe"]], "PATCH", "/api/users/me"],
  ["profile.password.change", [["profile/api/profile.api.js", "changePassword"]], "POST", "/api/auth/change-password"],
  ["profile.session.logout", [["profile/api/profile.api.js", "logout"]], "POST", "/api/auth/logout"],
  ["profile.sidebar-user.read", [["dashboard/components/Sidebar.jsx", "loadSidebarUser"]], "GET", "/api/users/me"],
  ["projects.current-user.read", [["projects/api/projects.api.js", "fetchCurrentUser"]], "GET", "/api/users/me"],
  ["projects.modal-create", [["projects/components/CreateProjectModal.jsx", "handleSubmit"]], "POST", "/api/projects"],
  ["projects.project.create", [["projects/api/projects.api.js", "createProject"]], "POST", "/api/projects"],
  ["projects.project.delete", [["projects/api/projects.api.js", "deleteProject"]], "DELETE", "/api/projects/:id"],
  ["projects.project.read", [["projects/analysis/hooks/useAnalysisMemos.js", "openLinksPanel"]], "GET", "/api/projects/:id"],
  ["projects.project.update", [["projects/api/projects.api.js", "updateProject"]], "PATCH", "/api/projects/:id"],
  ["projects.projects.list", [["projects/api/projects.api.js", "fetchProjects"]], "GET", "/api/projects"],
  ["research-design.chat", [["projects/research-design/hooks/useResearchDesignChat.js", "useResearchDesignChat"]], "POST", "/api/projects/:id/research-design/chat"],
  ["research-design.evaluation.read", [["projects/research-design/api/researchDesign.review.api.js", "getResearchDesignEvaluation"]], "GET", "/api/projects/:id/research-design/evaluate"],
  ["research-design.review.generate", [["projects/research-design/api/researchDesign.review.api.js", "generateResearchDesignReview"]], "POST", "/api/projects/:id/research-design/review"],
  ["research-design.session.read", [["projects/research-design/api/researchDesign.api.js", "getResearchDesign"]], "GET", "/api/projects/:id/research-design"],
  ["research-design.session.save", [["projects/research-design/api/researchDesign.api.js", "saveResearchDesign"]], "PATCH", "/api/projects/:id/research-design"],
  ["research-design.specific-objective.create", [["projects/research-design/api/researchDesign.api.js", "createSpecificObjective"]], "POST", "/api/projects/:id/research-design/specific-objectives"],
  ["research-design.specific-objective.delete", [["projects/research-design/api/researchDesign.api.js", "deleteSpecificObjective"]], "DELETE", "/api/projects/:id/research-design/specific-objectives/:objectiveId"],
  ["research-design.specific-objective.update", [["projects/research-design/api/researchDesign.api.js", "updateSpecificObjective"]], "PATCH", "/api/projects/:id/research-design/specific-objectives/:objectiveId"],
  ["research-design.specific-objectives.reorder", [["projects/research-design/api/researchDesign.api.js", "reorderSpecificObjectives"]], "POST", "/api/projects/:id/research-design/specific-objectives/reorder"],
  ["research-design.version.create", [["projects/research-design/api/researchDesign.versions.api.js", "createResearchDesignVersion"]], "POST", "/api/projects/:id/research-design/versions"],
  ["research-design.version.restore", [["projects/research-design/api/researchDesign.versions.api.js", "restoreResearchDesignVersion"]], "POST", "/api/projects/:id/research-design/versions/:versionId/restore"],
  ["research-design.versions.list", [["projects/research-design/api/researchDesign.versions.api.js", "getResearchDesignVersions"]], "GET", "/api/projects/:id/research-design/versions"],
  ["sample-config.chat", [["projects/sample-config/hooks/useSampleConfigChat.js", "useSampleConfigChat"]], "POST", "/api/projects/:id/sample-config/chat"],
  ["sample-config.options.read", [["projects/sample-config/api/sampleConfig.api.js", "getSampleConfigOptions"]], "GET", "/api/projects/:id/sample-config/options"],
  ["sample-config.review.generate", [["projects/sample-config/api/sampleConfig.review.api.js", "generateSampleConfigReview"]], "POST", "/api/projects/:id/sample-config/review"],
  ["sample-config.session.read", [["projects/sample-config/api/sampleConfig.api.js", "getSampleConfig"]], "GET", "/api/projects/:id/sample-config"],
  ["sample-config.session.update", [["projects/sample-config/api/sampleConfig.api.js", "updateSampleConfig"]], "PATCH", "/api/projects/:id/sample-config"],
  ["sample-config.version.create", [["projects/sample-config/api/sampleConfig.versions.api.js", "createSampleConfigVersion"]], "POST", "/api/projects/:id/sample-config/versions"],
  ["sample-config.version.restore", [["projects/sample-config/api/sampleConfig.versions.api.js", "restoreSampleConfigVersion"]], "POST", "/api/projects/:id/sample-config/versions/:versionId/restore"],
  ["sample-config.versions.list", [["projects/sample-config/api/sampleConfig.versions.api.js", "getSampleConfigVersions"]], "GET", "/api/projects/:id/sample-config/versions"],
  ["team.invitation.revoke", [["projects/team/api/team.api.js", "revokeTeamInvitation"]], "POST", "/api/projects/:id/team/invitations/:invitationId/revoke"],
  ["team.member-role.update", [["projects/team/api/team.api.js", "updateTeamMemberRole"]], "PATCH", "/api/projects/:id/team/members/:userId"],
  ["team.member.invite", [["projects/team/api/team.api.js", "inviteTeamMember"]], "POST", "/api/projects/:id/team"],
  ["team.member.remove", [["projects/team/api/team.api.js", "removeTeamMember"]], "DELETE", "/api/projects/:id/team/members/:userId"],
  ["team.presence.touch", [["projects/team/api/team.api.js", "touchTeamPresence"]], "POST", "/api/projects/:id/team/presence"],
  ["team.project-invitation.accept", [["projects/team/api/team.api.js", "acceptProjectInvitation"]], "POST", "/api/project-invitations/accept"],
  ["team.workspace.read", [["projects/team/api/team.api.js", "getTeamWorkspace"]], "GET", "/api/projects/:id/team"],
  ["workflow.project-workflow.read", [["projects/workspace/api/projectWorkflow.api.js", "getProjectWorkflow"]], "GET", "/api/projects/:id/workflow"],
] as const satisfies readonly Declaration[];

// Streaming and generated-review routes do not mutate project state. Their
// provider boundary contracts require a successful mocked response plus
// authorization, validation, dependency-failure, and fixture-cleanup proof.
export const nonPersistingWorkflowAiActions = new Set<BackendActionContract["id"]>([
  "analysis.chat",
  "delimitation.chat",
  "delimitation.review.evaluate",
  "research-design.chat",
  "research-design.review.generate",
  "sample-config.chat",
  "sample-config.review.generate",
]);

const participantOutOfScopeContracts: Partial<Record<
  BackendActionContract["id"],
  readonly OutOfScopePresentationContract[]
>> = {
  "corpus.participants.list": [{
    id: "corpus.participant.groups",
    reason: "No current frontend backend action consumes this contract",
  }],
  "corpus.participant.update": [{
    id: "corpus.participant.revision",
    reason: "No current frontend backend action consumes this contract",
  }],
};

const analysisOutOfScopeContracts: Partial<Record<
  BackendActionContract["id"],
  readonly OutOfScopePresentationContract[]
>> = {
  "analysis.insights.list": [{
    id: "analysis.insights.tag-filter",
    reason: "No current frontend backend action consumes this contract",
  }],
  "analysis.memos.list": [{
    id: "analysis.memos.tag-filter",
    reason: "No current frontend backend action consumes this contract",
  }],
};

function contract([id, sourceTuples, method, routePath]: Declaration): BackendActionContract {
  const matchingRoute = routeManifest.find(
    (route) => route.path === routePath && route.methods.includes(method)
  );
  if (!matchingRoute?.spec) throw new Error(`Action has no backed route contract: ${id}`);
  const mutation = method !== "GET" && method !== "HEAD";
  const required: EvidenceDimension[] = nonPersistingWorkflowAiActions.has(id)
    ? ["success", "permissions", "validation", "dependency-failure", "cleanup"]
    : mutation
    ? ["success", "persistence", "permissions", "validation", "cleanup"]
    : ["success", "permissions"];
  if (mutation && /(?:create|link|version|restore|invite|coding)/u.test(id)) {
    required.push("duplicate");
  }
  return {
    id,
    label: id.replace(/[.-]/gu, " "),
    sources: sourceTuples.map(([file, symbol]) => ({
      file: `features/${file}` as `features/${string}`,
      symbol,
    })),
    route: [method, routePath],
    spec: matchingRoute.spec,
    required,
    presentation: "required",
    ...((participantOutOfScopeContracts[id] ?? analysisOutOfScopeContracts[id])
      ? { outOfScopeContracts: participantOutOfScopeContracts[id] ?? analysisOutOfScopeContracts[id] }
      : {}),
    ...(nonPersistingWorkflowAiActions.has(id)
      ? { persistenceException: "streaming-ai-no-durable-write" as const }
      : {}),
  };
}

const ownedActions = declarations.map(contract);
export const actionManifest: readonly BackendActionContract[] = ownedActions.map(action => ({
  ...action, evidenceSources: evidenceSourcesFor(action, ownedActions),
}));

function sharedBuilder(
  file: FrontendActionExclusion["file"],
  symbol: string,
  canonicalPath: string
): FrontendActionExclusion {
  return {
    file,
    symbol,
    method: "GET",
    canonicalPath,
    reason: "Pure shared URL builder; concrete HTTP actions using this path have separate owners.",
  };
}

export const actionExclusions: readonly FrontendActionExclusion[] = [
  {
    file: "features/projects/exports/helpers/projectExports.helpers.js",
    symbol: "buildProjectExportUrl",
    method: "GET",
    canonicalPath: "/api/projects/:*/exports/:*",
    reason: "Generic URL builder; each concrete export type has its own owned presentation action.",
  },
  {
    file: "features/projects/exports/helpers/projectExports.helpers.js",
    symbol: "fetchProjectExport",
    method: "GET",
    canonicalPath: "/api/projects/:*/exports/:*",
    reason: "Generic validated export fetch; concrete export types are owned by their component action declarations.",
  },
  ...[
    sharedBuilder("features/projects/analysis/api/analysis.api.js", "getSegmentCodeRoute", "/api/projects/:*/analysis/segments/:*/codes/:*"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getAnalysisApiBase", "/api/projects/:*/analysis"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getAnalysisCodeApiBase", "/api/projects/:*/analysis/codes/:*"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getAnalysisCodesApiBase", "/api/projects/:*/analysis/codes"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getAnalysisDashboardApiBase", "/api/projects/:*/analysis/dashboard"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getAnalysisInsightApiBase", "/api/projects/:*/analysis/insights/:*"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getAnalysisInsightLinkApiBase", "/api/projects/:*/analysis/insights/:*/links/:*"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getAnalysisInsightLinksApiBase", "/api/projects/:*/analysis/insights/:*/links"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getAnalysisInsightsApiBase", "/api/projects/:*/analysis/insights"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getAnalysisMemoApiBase", "/api/projects/:*/analysis/memos/:*"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getAnalysisMemoLinkApiBase", "/api/projects/:*/analysis/memos/:*/links/:*"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getAnalysisMemoLinksApiBase", "/api/projects/:*/analysis/memos/:*/links"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getAnalysisMemosApiBase", "/api/projects/:*/analysis/memos"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getProjectApiBase", "/api/projects/:*"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getSegmentCodeApiBase", "/api/projects/:*/analysis/segments/:*/codes/:*"),
    sharedBuilder("features/projects/analysis/helpers/analysis.helpers.js", "getSegmentCodesApiBase", "/api/projects/:*/analysis/segments/:*/codes"),
    sharedBuilder("features/projects/corpus/helpers/corpus.helpers.js", "getDocumentApiBase", "/api/projects/:*/documents/:*"),
    sharedBuilder("features/projects/corpus/helpers/corpus.helpers.js", "getDocumentsApiBase", "/api/projects/:*/documents"),
    sharedBuilder("features/projects/corpus/helpers/corpus.helpers.js", "getParticipantsApiBase", "/api/projects/:*/participants"),
    sharedBuilder("features/projects/corpus/helpers/corpus.helpers.js", "getProjectApiBase", "/api/projects/:*"),
    sharedBuilder("features/projects/corpus/helpers/corpus.helpers.js", "getSegmentsApiBase", "/api/projects/:*/documents/:*/segments"),
    sharedBuilder("features/projects/corpus/helpers/corpus.helpers.js", "getSourcesApiBase", "/api/projects/:*/documents/sources"),
    sharedBuilder("features/projects/corpus/helpers/corpus.helpers.js", "getVersionsApiBase", "/api/projects/:*/documents/:*/versions"),
    sharedBuilder("features/projects/team/helpers/team.helpers.js", "getTeamApiBase", "/api/projects/:*/team"),
    sharedBuilder("features/projects/workspace/api/projectWorkflow.api.js", "getProjectWorkflowApiHref", "/api/projects/:*/workflow"),
  ],
];
