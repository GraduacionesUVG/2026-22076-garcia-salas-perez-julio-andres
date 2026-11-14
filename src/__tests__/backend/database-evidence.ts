import { createHash } from "node:crypto";

export const EXPECTED_MIGRATION_VERSIONS = [
  "20260720000253", "20260720000655", "20260720001136",
  "20260720001337", "20260823174500", "20260823193000",
  "20261004174509",
  "20261004180332",
  "20261004185407",
  "20261101060029",
] as const;

export const REQUIRED_DATABASE_FUNCTIONS = [
  { name: "project_member_profiles_safe", identityArguments: "p_project_id uuid, p_user_ids uuid[]", result: "TABLE(id uuid, full_name text, email text, username text)" },
  { name: "set_project_participant_revision", identityArguments: "", result: "trigger" },
  { name: "restore_workflow_version", identityArguments: "p_workflow text, p_project_id uuid, p_version_id uuid, p_actor_id uuid, p_expected_revision bigint, p_create_backup boolean", result: "jsonb" },
  { name: "save_workflow_snapshot", identityArguments: "p_workflow text, p_project_id uuid, p_actor_id uuid, p_snapshot jsonb, p_children jsonb, p_label text, p_trigger_type text, p_content_hash text", result: "jsonb" },
  { name: "accept_project_invitation_atomic", identityArguments: "p_token text", result: "jsonb" },
  { name: "remove_project_member_atomic", identityArguments: "p_project_id uuid, p_user_id uuid, p_actor_user_id uuid", result: "void" },
  { name: "get_project_analysis_overview", identityArguments: "input_project_id uuid", result: "jsonb" },
  { name: "utf16_normalized_length", identityArguments: "input_text text", result: "integer" },
  { name: "utf16_normalized_slice", identityArguments: "input_text text, start_unit integer, end_unit integer", result: "text" },
] as const;

export const REQUIRED_DATABASE_INDEXES = [
  { name: "project_members_user_id_project_id_idx", table: "project_members", method: "btree", unique: false, valid: true, ready: true, columns: ["user_id", "project_id"], includedColumns: [], predicate: null },
  { name: "project_delimitation_version_items_version_position_idx", table: "project_delimitation_version_items", method: "btree", unique: false, valid: true, ready: true, columns: ["version_id", "position", "created_at"], includedColumns: [], predicate: null },
] as const;

export const REQUIRED_DATABASE_TRIGGERS = [
  { name: "trg_project_participants_revision", table: "project_participants", function: "set_project_participant_revision", enabled: "O", definition: "CREATE TRIGGER trg_project_participants_revision BEFORE INSERT OR UPDATE ON project_participants FOR EACH ROW EXECUTE FUNCTION set_project_participant_revision()" },
  { name: "guard_document_content_with_segments", table: "project_documents", function: "guard_document_content_with_segments", enabled: "O", definition: "CREATE TRIGGER guard_document_content_with_segments BEFORE UPDATE OF content ON project_documents FOR EACH ROW EXECUTE FUNCTION guard_document_content_with_segments()" },
  { name: "guard_code_soft_delete_dependencies", table: "project_codes", function: "guard_code_soft_delete_dependencies", enabled: "O", definition: "CREATE TRIGGER guard_code_soft_delete_dependencies BEFORE UPDATE OF deleted_at ON project_codes FOR EACH ROW EXECUTE FUNCTION guard_code_soft_delete_dependencies()" },
  { name: "prevent_project_code_cycle", table: "project_codes", function: "prevent_project_code_cycle", enabled: "O", definition: "CREATE TRIGGER prevent_project_code_cycle BEFORE INSERT OR UPDATE OF project_id, parent_code_id ON project_codes FOR EACH ROW EXECUTE FUNCTION prevent_project_code_cycle()" },
  { name: "reject_duplicate_delimitation_snapshot", table: "project_delimitation_versions", function: "reject_duplicate_workflow_snapshot", enabled: "O", definition: "CREATE TRIGGER reject_duplicate_delimitation_snapshot BEFORE INSERT ON project_delimitation_versions FOR EACH ROW EXECUTE FUNCTION reject_duplicate_workflow_snapshot()" },
  { name: "reject_duplicate_research_design_snapshot", table: "project_research_design_versions", function: "reject_duplicate_workflow_snapshot", enabled: "O", definition: "CREATE TRIGGER reject_duplicate_research_design_snapshot BEFORE INSERT ON project_research_design_versions FOR EACH ROW EXECUTE FUNCTION reject_duplicate_workflow_snapshot()" },
  { name: "reject_duplicate_sample_config_snapshot", table: "project_sample_config_versions", function: "reject_duplicate_workflow_snapshot", enabled: "O", definition: "CREATE TRIGGER reject_duplicate_sample_config_snapshot BEFORE INSERT ON project_sample_config_versions FOR EACH ROW EXECUTE FUNCTION reject_duplicate_workflow_snapshot()" },
] as const;

export const REQUIRED_DATABASE_FOREIGN_KEYS = [
  { name: "project_members_project_id_fkey", table: "project_members", columns: ["project_id"], referencedTable: "projects", referencedColumns: ["id"], onUpdate: "NO ACTION", onDelete: "CASCADE", deferrable: false, initiallyDeferred: false },
  { name: "project_documents_project_id_fkey", table: "project_documents", columns: ["project_id"], referencedTable: "projects", referencedColumns: ["id"], onUpdate: "NO ACTION", onDelete: "CASCADE", deferrable: false, initiallyDeferred: false },
  { name: "project_document_segments_document_fkey", table: "project_document_segments", columns: ["project_id", "document_id"], referencedTable: "project_documents", referencedColumns: ["project_id", "id"], onUpdate: "NO ACTION", onDelete: "CASCADE", deferrable: false, initiallyDeferred: false },
] as const;

export const REQUIRED_DATABASE_POLICIES = [
  { name: "pm_select_members", table: "project_members", command: "SELECT", roles: ["public"], permissive: "PERMISSIVE", qual: "is_project_member(project_id)", withCheck: null, rlsEnabled: true },
  { name: "documents_select_members", table: "project_documents", command: "SELECT", roles: ["authenticated"], permissive: "PERMISSIVE", qual: "is_project_member(project_id)", withCheck: null, rlsEnabled: true },
] as const;

export const DATABASE_BEHAVIORAL_EVIDENCE_SCOPE = {
  state: "separate-required-artifact",
  artifact: "__tests__/reports/playwright-backend-integration.json",
  suite: "__tests__/integration/security/database-capabilities.spec.ts",
  requiredContracts: [
    "code-cycle prevention rejects a descendant parent and preserves the tree",
    "duplicate workflow snapshots converge on one persisted version",
    "segment persistence uses normalized UTF-16 offsets",
    "analysis overview returns project-scoped aggregate output",
    "invitation acceptance is atomic under a simultaneous replay",
    "project document RLS is visible to its owner and hidden from a nonmember",
    "project teammates see the owner's directory identity without gaining management rights",
  ],
} as const;

export type DatabaseEvidenceState = "present" | "not-demonstrated" | "invalid";
export interface DatabaseEvidenceValidation { state: DatabaseEvidenceState; issues: string[] }

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function issueStrings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}
function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}
function normalized(value: string): string { return value.toLowerCase().replace(/\s+/gu, " ").trim(); }
function normalizedIdentifier(value: string): string { return value.replace(/^"(.*)"$/u, "$1").replaceAll('""', '"'); }
function exactStringArray(actual: unknown, expected: readonly string[]): boolean {
  const values = stringArray(actual);
  return values !== null && values.length === expected.length && values.every((value, index) => normalizedIdentifier(value) === expected[index]);
}

function exactMigrationSet(value: unknown, label: string, expected: readonly string[], issues: string[]): void {
  const actual = stringArray(value);
  if (!actual) { issues.push(`${label} must be an array of migration versions.`); return; }
  const sorted = [...actual].sort((left, right) => left.localeCompare(right));
  if (actual.some((version, index) => version !== sorted[index])) issues.push(`${label} must be sorted.`);
  for (const version of expected) if (!actual.includes(version)) issues.push(`Missing applied migration: ${version}.`);
  for (const version of actual) if (!expected.includes(version)) issues.push(`Unexpected applied migration: ${version}.`);
}

function requireFunctions(value: unknown, issues: string[]): void {
  if (!Array.isArray(value)) { issues.push("Catalog functions must be an array."); return; }
  const entries = value.map(record).filter((item) => item !== null);
  if (entries.length !== value.length) issues.push("Catalog functions contain malformed entries.");
  for (const required of REQUIRED_DATABASE_FUNCTIONS) {
    const exact = entries.some((item) => item.name === required.name && item.identityArguments === required.identityArguments && item.result === required.result);
    if (!exact) issues.push(`Function ${required.name} must have signature (${required.identityArguments}) returns ${required.result}.`);
  }
}

function requireIndexes(value: unknown, issues: string[]): void {
  if (!Array.isArray(value)) { issues.push("Catalog indexes must be an array."); return; }
  const entries = value.map(record).filter((item) => item !== null);
  if (entries.length !== value.length) issues.push("Catalog indexes contain malformed entries.");
  for (const required of REQUIRED_DATABASE_INDEXES) {
    const item = entries.find((entry) => entry.name === required.name);
    if (!item) { issues.push(`Missing index: ${required.name}.`); continue; }
    if (item.table !== required.table) issues.push(`Index ${required.name} table does not match.`);
    if (item.method !== required.method) issues.push(`Index ${required.name} method does not match.`);
    if (item.unique !== required.unique) issues.push(`Index ${required.name} unique property does not match.`);
    if (item.valid !== required.valid || item.ready !== required.ready) issues.push(`Index ${required.name} validity state does not match.`);
    if (!exactStringArray(item.columns, required.columns)) issues.push(`Index ${required.name} ordered columns do not match.`);
    if (!exactStringArray(item.includedColumns, required.includedColumns)) issues.push(`Index ${required.name} included columns do not match.`);
    if (item.predicate !== required.predicate) issues.push(`Index ${required.name} predicate does not match.`);
  }
}

function requireTriggers(value: unknown, issues: string[]): void {
  if (!Array.isArray(value)) { issues.push("Catalog triggers must be an array."); return; }
  const entries = value.map(record).filter((item) => item !== null);
  if (entries.length !== value.length) issues.push("Catalog triggers contain malformed entries.");
  for (const required of REQUIRED_DATABASE_TRIGGERS) {
    const item = entries.find((entry) => entry.name === required.name);
    if (!item) { issues.push(`Missing trigger: ${required.name}.`); continue; }
    if (item.table !== required.table || item.function !== required.function) issues.push(`Trigger ${required.name} table or function does not match.`);
    if (item.enabled !== required.enabled) issues.push(`Trigger ${required.name} enabled state does not match.`);
    if (typeof item.definition !== "string" || normalized(item.definition) !== normalized(required.definition)) issues.push(`Trigger ${required.name} definition does not match.`);
  }
}

function requireForeignKeys(value: unknown, issues: string[]): void {
  if (!Array.isArray(value)) { issues.push("Catalog foreign keys must be an array."); return; }
  const entries = value.map(record).filter((item) => item !== null);
  if (entries.length !== value.length) issues.push("Catalog foreign keys contain malformed entries.");
  for (const required of REQUIRED_DATABASE_FOREIGN_KEYS) {
    const item = entries.find((entry) => entry.name === required.name);
    if (!item) { issues.push(`Missing foreign key ${required.name}.`); continue; }
    if (item.table !== required.table || !exactStringArray(item.columns, required.columns) || item.referencedTable !== required.referencedTable || !exactStringArray(item.referencedColumns, required.referencedColumns)) issues.push(`Foreign key ${required.name} columns or referenced columns do not match.`);
    if (item.onUpdate !== required.onUpdate) issues.push(`Foreign key ${required.name} ON UPDATE action does not match.`);
    if (item.onDelete !== required.onDelete) issues.push(`Foreign key ${required.name} ON DELETE action does not match.`);
    if (item.deferrable !== required.deferrable || item.initiallyDeferred !== required.initiallyDeferred) issues.push(`Foreign key ${required.name} deferrable state does not match.`);
  }
}

function requirePolicies(value: unknown, issues: string[]): void {
  if (!Array.isArray(value)) { issues.push("Catalog RLS policies must be an array."); return; }
  const entries = value.map(record).filter((item) => item !== null);
  if (entries.length !== value.length) issues.push("Catalog RLS policies contain malformed entries.");
  for (const required of REQUIRED_DATABASE_POLICIES) {
    const item = entries.find((entry) => entry.name === required.name && entry.table === required.table);
    if (!item) { issues.push(`Missing RLS policy ${required.name} on ${required.table}.`); continue; }
    if (item.rlsEnabled !== true) issues.push(`RLS is not enabled for ${required.table}.`);
    if (item.command !== required.command) issues.push(`Policy ${required.name} command does not match.`);
    if (!exactStringArray(item.roles, required.roles)) issues.push(`Policy ${required.name} roles do not match.`);
    if (item.permissive !== required.permissive) issues.push(`Policy ${required.name} permissiveness does not match.`);
    if (typeof item.qual !== "string" || normalized(item.qual) !== normalized(required.qual)) issues.push(`Policy ${required.name} qual does not match.`);
    if (item.withCheck !== required.withCheck) issues.push(`Policy ${required.name} with-check does not match.`);
  }
}

function requireBehavioralScope(value: unknown, issues: string[]): void {
  const item = record(value);
  if (!item || item.state !== DATABASE_BEHAVIORAL_EVIDENCE_SCOPE.state || item.artifact !== DATABASE_BEHAVIORAL_EVIDENCE_SCOPE.artifact || item.suite !== DATABASE_BEHAVIORAL_EVIDENCE_SCOPE.suite || !exactStringArray(item.requiredContracts, DATABASE_BEHAVIORAL_EVIDENCE_SCOPE.requiredContracts)) {
    issues.push("Database behavioral evidence scope does not match the required integration artifact.");
  }
}

export function databaseTargetHash(hostname: string, database: string): string {
  return createHash("sha256").update(hostname.trim().toLowerCase()).update("\0").update(database.trim().toLowerCase()).digest("hex");
}

export function validateDatabaseEvidenceTarget(
  value: unknown,
  expectedEnvironmentHash: string,
  expectedDatabase = "postgres"
): DatabaseEvidenceValidation {
  const evidence = record(value);
  if (!/^[a-f0-9]{64}$/iu.test(expectedEnvironmentHash)) return { state: "invalid", issues: ["Expected environment hash is invalid."] };
  if (!/^[A-Za-z0-9_-]+$/u.test(expectedDatabase)) return { state: "invalid", issues: ["Expected database name is invalid."] };
  if (evidence?.targetEnvironmentHash !== expectedEnvironmentHash || evidence.targetDatabase !== expectedDatabase) return { state: "invalid", issues: ["Database evidence target does not match the current test environment."] };
  return { state: "present", issues: [] };
}

export function validateDatabaseEvidence(value: unknown, expectedMigrationsHash: string): DatabaseEvidenceValidation {
  const evidence = record(value);
  if (!evidence) return { state: "invalid", issues: ["Database evidence must be a JSON object."] };
  const rawIssues = issueStrings(evidence.issues);
  if (evidence.state === "not-demonstrated") return { state: "not-demonstrated", issues: rawIssues && rawIssues.length > 0 ? rawIssues : ["Database evidence was not demonstrated."] };
  if (evidence.state === "invalid") return { state: "invalid", issues: rawIssues && rawIssues.length > 0 ? rawIssues : ["Database evidence was marked invalid."] };
  if (evidence.state !== "present") return { state: "invalid", issues: ["Database evidence has an invalid state."] };

  const issues: string[] = [];
  if (rawIssues === null) issues.push("Database evidence issues must be an array of strings."); else if (rawIssues.length > 0) issues.push(...rawIssues);
  if (!/^[a-f0-9]{64}$/iu.test(expectedMigrationsHash)) issues.push("Expected migration hash is invalid.");
  if (!/^[a-f0-9]{64}$/iu.test(String(evidence.targetEnvironmentHash ?? ""))) issues.push("Database evidence target environment hash is invalid.");
  if (typeof evidence.targetDatabase !== "string" || evidence.targetDatabase.length === 0) issues.push("Database evidence target database is invalid.");
  if (evidence.transactionReadOnly !== true) issues.push("Catalog evidence was not collected in a read-only transaction.");
  if (evidence.roleSuperuser !== false) issues.push("Catalog evidence role must not be a superuser.");
  if (evidence.roleBypassRls !== false) issues.push("Catalog evidence role must not bypass RLS.");
  if (evidence.migrationsHash !== expectedMigrationsHash) issues.push("Database evidence migration hash does not match the current repository.");
  const expectedVersions = stringArray(evidence.expectedMigrationVersions);
  if (expectedVersions === null || expectedVersions.length !== EXPECTED_MIGRATION_VERSIONS.length || expectedVersions.some((version, index) => version !== EXPECTED_MIGRATION_VERSIONS[index])) issues.push("Database evidence expected migration versions do not match the repository contract.");
  exactMigrationSet(evidence.appliedMigrations, "Applied migrations", EXPECTED_MIGRATION_VERSIONS, issues);
  requireFunctions(evidence.requiredFunctions, issues);
  requireIndexes(evidence.requiredIndexes, issues);
  requireTriggers(evidence.requiredTriggers, issues);
  requireForeignKeys(evidence.foreignKeys, issues);
  requirePolicies(evidence.policies, issues);
  requireBehavioralScope(evidence.behavioralEvidence, issues);
  return issues.length === 0 ? { state: "present", issues: [] } : { state: "invalid", issues };
}
