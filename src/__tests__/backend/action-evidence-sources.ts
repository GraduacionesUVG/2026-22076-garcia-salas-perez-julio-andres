// Reviewed companion ownership, not inferred at runtime from matching ACTION IDs.
// Each file may contribute only these action/dimension pairs.
export const companionEvidence: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  "__tests__/integration/auth/auth-negative.spec.ts": {
    "profile.me.read": ["permissions"], "profile.me.update": ["permissions"], "profile.password.change": ["permissions"],
    "auth.login.submit": ["validation"], "auth.register.submit": ["validation"], "auth.forgot-password.submit": ["validation", "cleanup"],
  },
  "__tests__/unit/api.auth.session-hardening.route.test.ts": {
    "auth.forgot-password.submit": ["success", "persistence", "permissions"], "auth.register.submit": ["success", "permissions"],
    "auth.reset-password.submit": ["success", "permissions"], "profile.session.logout": ["permissions", "validation"],
  },
  "__tests__/unit/auth.service.password-success.test.ts": {
    "profile.password.change": ["success", "persistence"], "auth.reset-password.submit": ["persistence"], "auth.register.submit": ["persistence"],
  },
  "__tests__/integration/projects/projects-authorization.spec.ts": {
    "projects.project.delete": ["permissions"], "projects.project.update": ["permissions"],
    "projects.project.read": ["permissions"],
    "projects.projects.list": ["permissions"], "projects.project.create": ["permissions"],
  },
  "__tests__/integration/collaboration/team-races.spec.ts": {
    "team.project-invitation.accept": ["success", "persistence", "concurrency", "cleanup"],
  },
  "__tests__/integration/security/concurrency.spec.ts": { "team.project-invitation.accept": ["concurrency", "cleanup"] },
  "__tests__/integration/research-workflow/versions-and-races.spec.ts": {
    "delimitation.versions.list": ["success", "permissions", "cleanup"], "delimitation.version-detail.read": ["success", "permissions", "cleanup"],
    "research-design.versions.list": ["success", "permissions", "cleanup"], "sample-config.versions.list": ["success", "permissions", "cleanup"],
    "delimitation.version.create": ["success", "persistence", "permissions", "cleanup", "validation", "duplicate", "concurrency"],
    "research-design.version.create": ["success", "persistence", "permissions", "cleanup", "validation", "duplicate", "concurrency"],
    "sample-config.version.create": ["success", "persistence", "permissions", "cleanup", "validation", "duplicate", "concurrency"],
    "delimitation.version.restore": ["success", "persistence", "permissions", "cleanup", "validation", "duplicate", "concurrency"],
    "research-design.version.restore": ["success", "persistence", "permissions", "cleanup", "validation", "duplicate", "concurrency"],
    "sample-config.version.restore": ["success", "persistence", "permissions", "cleanup", "validation", "duplicate", "concurrency"],
  },
  "__tests__/integration/security/error-contracts.spec.ts": {
    "delimitation.chat": ["permissions", "validation", "dependency-failure", "cleanup"],
    "delimitation.review.evaluate": ["permissions", "validation", "dependency-failure", "cleanup"],
    "research-design.chat": ["permissions", "validation", "dependency-failure", "cleanup"],
    "research-design.review.generate": ["permissions", "validation", "dependency-failure", "cleanup"],
    "sample-config.chat": ["permissions", "validation", "dependency-failure", "cleanup"],
    "sample-config.review.generate": ["permissions", "validation", "dependency-failure", "cleanup"],
  },
  "__tests__/unit/ai-routes-no-provider.test.ts": {
    "analysis.chat": ["permissions", "validation", "dependency-failure", "success", "cleanup"],
    "delimitation.chat": ["permissions", "validation", "dependency-failure", "success"],
    "delimitation.review.evaluate": ["permissions", "validation", "dependency-failure"],
    "research-design.chat": ["permissions", "validation", "dependency-failure", "success"],
    "research-design.review.generate": ["permissions", "validation", "dependency-failure"],
    "sample-config.chat": ["permissions", "validation", "dependency-failure", "success"],
    "sample-config.review.generate": ["permissions", "validation", "dependency-failure"],
  },
  "__tests__/unit/api.delimitation-review.route.test.ts": { "delimitation.review.evaluate": ["success"] },
  "__tests__/unit/ai-workflow-review-success.test.ts": { "research-design.review.generate": ["success"], "sample-config.review.generate": ["success"] },
  "__tests__/integration/documents/document-lifecycle.spec.ts": {
    "corpus.document.duplicate": ["success", "persistence", "cleanup", "validation", "duplicate", "concurrency", "permissions"],
    "corpus.document.delete": ["success", "persistence", "cleanup"], "corpus.trash.read": ["success", "permissions"],
    "corpus.document.restore": ["success", "persistence", "duplicate", "concurrency", "cleanup", "permissions", "validation"],
  },
  "__tests__/integration/analysis/code-tree-integrity.spec.ts": { "analysis.code.update": ["validation", "concurrency"], "analysis.code.delete": ["validation"] },
};

export interface EvidenceSource { file: string; actionId: string; dimensions: readonly string[] }
interface OwnedAction { id: string; route: readonly string[]; spec: string; required: readonly string[] }

// Same HTTP method/path AND identical applicable contract; this is backend-only
// evidence reuse, never a claim that either frontend callsite/button was exercised.
export const sharedRouteAliases: Readonly<Record<string, string>> = {
  "profile.sidebar-user.read": "profile.me.read",
  "projects.current-user.read": "profile.me.read",
  "projects.modal-create": "projects.project.create",
};

export function evidenceSourcesFor(action: OwnedAction, actions: readonly OwnedAction[]): EvidenceSource[] {
  const ownerId = sharedRouteAliases[action.id] ?? action.id;
  const owner = actions.find(candidate => candidate.id === ownerId);
  if (!owner || action.route.join(" ") !== owner.route.join(" ") || action.spec !== owner.spec
    || [...action.required].sort().join(",") !== [...owner.required].sort().join(",")) {
    throw new Error(`Invalid action evidence ownership: ${action.id}`);
  }
  return [
    { file: owner.spec, actionId: owner.id, dimensions: owner.required },
    ...Object.entries(companionEvidence).flatMap(([file, entries]) => entries[owner.id]
      ? [{ file, actionId: owner.id, dimensions: entries[owner.id] }] : []),
  ];
}

export function evidenceFileMatches(actual: string, approved: string): boolean {
  const normalize = (value: string) => {
    const path = value.replaceAll("\\", "/");
    if (path.split("/").some(part => part === ".." || part === ".")) return null;
    return /^(?:integration|unit|e2e)\//u.test(path) ? `__tests__/${path}` : path;
  };
  const file = normalize(actual); const source = normalize(approved);
  return !!file && !!source && (file === source || file.endsWith(`/${source}`));
}
