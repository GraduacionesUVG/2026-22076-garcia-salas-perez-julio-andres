import { parseActionEvidenceSegments } from "./action-evidence";
import { evidenceFileMatches, type EvidenceSource } from "./action-evidence-sources";
export type TestFramework = "jest" | "playwright";
export type TestOutcome =
  | "pass"
  | "skipped"
  | "product-red"
  | "defect"
  | "infrastructure";
export type ArtifactState = "present" | "missing" | "invalid";

export interface ParsedTestResult {
  framework: TestFramework;
  module: string;
  file: string;
  title: string;
  evidenceTitles?: string[];
  outcome: TestOutcome;
  details: string;
}

export interface ReportArtifact {
  label: string;
  path: string;
  framework: TestFramework;
  state: ArtifactState;
  tests: ParsedTestResult[];
  diagnostic?: string;
  performanceLogs?: string[];
}

export interface RouteCoverageSummary {
  routeFileCount: number;
  methodCount: number;
  coveredMethodCount: number;
  excludedMethodCount: number;
  gate: "passed" | "failed" | "not-run";
  issues: string[];
}

export interface RunContext {
  gitSha: string;
  dirty: boolean;
  nodeVersion: string;
  migrationsHash: string;
  environmentHash: string;
}

export interface BackendTestReportInput {
  reportInProgress?: boolean;
  actionRequirements?: readonly { id: string; spec: string; required: readonly string[]; presentation: string; evidenceSources?: readonly EvidenceSource[] }[];
  generatedAt: string;
  runManifest?: {
    runId: string;
    startedAt: string;
    finishedAt: string | null;
    context: RunContext;
    phases: Array<{
      label: string;
      startedAt: string;
      finishedAt: string | null;
      exitCode: number | null;
    }>;
  };
  artifacts: ReportArtifact[];
  routeCoverage: RouteCoverageSummary;
  noAiGuardConfigured: boolean;
  databaseEvidence?: {
    state: "present" | "not-demonstrated" | "invalid";
    issues: string[];
  };
  commands: string[];
  limitations: string[];
}

const PRODUCT_RED_PATTERN =
  /(?:@product-red|(?:^|\b)(?:RED:|PRODUCT GAP:|KNOWN PRODUCT GAP:))/i;
const INFRASTRUCTURE_PATTERN =
  /(?:ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|UND_ERR_CONNECT_TIMEOUT|Attention Required!|you have been blocked|webServer|did not become ready|No tests found|TEST_[A-Z_]+ is required|API route root not found|browser.*(?:closed|launch)|Process exited)/i;
const CLEANUP_AUDIT_PATTERN = /BACKEND CLEANUP AUDIT:/i;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    const itemRecord = record(item);
    return typeof itemRecord?.message === "string" ? [itemRecord.message] : [];
  });
}

function moduleFromFile(file: string): string {
  const normalized = file.replaceAll("\\", "/");
  const integration = /\/(?:__tests__\/)?integration\/([^/]+)/.exec(`/${normalized}`);
  if (integration) {
    return integration[1].endsWith(".spec.ts") ? "integration" : integration[1];
  }
  if (/\/(?:__tests__\/)?e2e\/backend\//.test(`/${normalized}`)) return "backend-e2e";
  if (/\/(?:__tests__\/)?e2e\//.test(`/${normalized}`)) return "e2e";
  if (/\/(?:__tests__\/)?unit\//.test(`/${normalized}`)) return "unit";
  return "unknown";
}

function classifyFailure(title: string, details: string): TestOutcome {
  if (INFRASTRUCTURE_PATTERN.test(details)) return "infrastructure";
  if (PRODUCT_RED_PATTERN.test(title)) return "product-red";
  return "defect";
}

function invalidArtifact(
  artifact: ReportArtifact,
  diagnostic: string
): ReportArtifact {
  return { ...artifact, state: "invalid", tests: [], diagnostic };
}

export function parseJestReport(
  value: unknown,
  artifact: ReportArtifact
): ReportArtifact {
  const root = record(value);
  if (!root || !Array.isArray(root.testResults)) {
    return invalidArtifact(artifact, "Jest result does not contain a testResults array.");
  }
  if (root.success === false && root.testResults.length === 0) {
    return invalidArtifact(artifact, "Jest run was top-level unsuccessful.");
  }
  if (typeof root.numFailedTestSuites === "number" && root.numFailedTestSuites > 0 && root.testResults.length === 0) {
    return invalidArtifact(artifact, "Jest run recorded a failed suite.");
  }
  if (
    typeof root.numRuntimeErrorTestSuites === "number" &&
    root.numRuntimeErrorTestSuites > 0 && root.testResults.length === 0
  ) {
    return invalidArtifact(artifact, "Jest run recorded a runtime error suite.");
  }
  if (root.numTotalTests === 0 && root.testResults.length === 0) {
    return invalidArtifact(artifact, "Jest run recorded zero tests.");
  }

  const tests: ParsedTestResult[] = [];
  let suiteFailure = false;
  const issues: string[] = [];
  const suiteCounts = { failed: 0, passed: 0, pending: 0, runtime: 0 };
  let failedAssertions = 0;
  let pendingAssertions = 0;
  let todoAssertions = 0;
  for (const rawSuite of root.testResults) {
    const suite = record(rawSuite);
    if (!suite || !Array.isArray(suite.assertionResults)) {
      issues.push("Jest testResults contains an entry without assertionResults.");
      continue;
    }
    if (
      suite.status === "failed" ||
      (typeof suite.failureMessage === "string" && suite.failureMessage.trim()) ||
      record(suite.testExecError)
    ) {
      suiteFailure = true;
      suiteCounts.failed += 1;
    } else if (suite.status === "passed") {
      suiteCounts.passed += 1;
    } else if (["pending", "skipped", "disabled"].includes(String(suite.status))) {
      suiteCounts.pending += 1;
    }
    if (suite.testExecError != null) suiteCounts.runtime += 1;
    if (typeof suite.status !== "string" || !["passed", "failed", "pending"].includes(suite.status)) issues.push("Missing or invalid Jest suite status.");
    const file = typeof suite.name === "string" ? suite.name : "unknown";
    if (file === "unknown" || !file.trim()) issues.push("Malformed Jest suite filename.");
    for (const rawAssertion of suite.assertionResults) {
      const assertion = record(rawAssertion);
      if (!assertion) { issues.push("Malformed Jest assertion."); continue; }
      const title =
        typeof assertion.fullName === "string" && assertion.fullName.trim()
          ? assertion.fullName
          : typeof assertion.title === "string"
            ? assertion.title
            : "unnamed Jest assertion";
      const status = typeof assertion.status === "string" ? assertion.status : "";
      if (["title", "fullName"].some(key => typeof assertion[key] !== "string" || !String(assertion[key]).trim())) issues.push("Missing or malformed Jest assertion identifier.");
      if (!["passed", "failed", "pending", "todo", "disabled", "skipped"].includes(status) || title === "unnamed Jest assertion" || !title.trim()) {
        issues.push("Malformed Jest assertion title or status.");
        continue;
      }
      if (assertion.failureMessages !== undefined && (!Array.isArray(assertion.failureMessages) || assertion.failureMessages.some(value => typeof value !== "string"))) issues.push("Malformed Jest failure messages.");
      const details = strings(assertion.failureMessages).join("\n");
      let outcome: TestOutcome;
      if (["pending", "todo", "disabled", "skipped"].includes(status)) {
        outcome = "skipped";
        pendingAssertions += 1;
        if (status === "todo") todoAssertions += 1;
      } else if (status === "passed") {
        outcome = "pass";
      } else {
        outcome = classifyFailure(title, details);
        failedAssertions += 1;
        if (suite.status === "passed") issues.push("Passed Jest suite contains a failed assertion.");
      }
      tests.push({
        framework: "jest",
        evidenceTitles: [...strings(assertion.ancestorTitles), String(assertion.title ?? "")],
        module: moduleFromFile(file),
        file,
        title,
        outcome,
        details,
      });
    }
  }

  const counters: Record<string, number> = {
    numTotalTests: tests.length, numPassedTests: tests.filter(test => test.outcome === "pass").length,
    numFailedTests: failedAssertions, numPendingTests: pendingAssertions, numTodoTests: todoAssertions,
    numTotalTestSuites: root.testResults.length, numFailedTestSuites: suiteCounts.failed,
    numPassedTestSuites: suiteCounts.passed, numPendingTestSuites: suiteCounts.pending,
    numRuntimeErrorTestSuites: suiteCounts.runtime,
  };
  for (const [name, expected] of Object.entries(counters)) {
    const count = root[name];
    if (count !== undefined && (!Number.isInteger(count) || count !== expected)) issues.push(`Jest ${name} count does not match parsed evidence.`);
  }
  if (root.success !== undefined && typeof root.success !== "boolean") issues.push("Invalid Jest success flag.");
  if (root.success === true && (suiteFailure || failedAssertions > 0)) issues.push("Jest success flag contradicts failed evidence.");
  if (Number(root.numFailedTestSuites) > 0) issues.push("Jest run recorded a failed suite.");
  if (Number(root.numRuntimeErrorTestSuites) > 0) issues.push("Jest run recorded a runtime error suite.");

  if (tests.length === 0) {
    return invalidArtifact(artifact, "Jest result contains no assertion results.");
  }
  const coverage = record(root.coverageMap);
  const percentages = ["s", "f", "b"].map((key, index) => {
    const counts = Object.values(coverage ?? {}).flatMap(file => Object.values(record(record(file)?.[key]) ?? {}).flat()).filter((value): value is number => typeof value === "number");
    return `${["statements", "functions", "branches"][index]} ${counts.length ? `${Math.round(counts.filter(value => value > 0).length / counts.length * 10000) / 100}%` : "not recorded"}`;
  });
  const coveredLines = Object.values(coverage ?? {}).flatMap(file => {
    const item = record(file);
    const statements = record(item?.s) ?? {};
    const locations = record(item?.statementMap) ?? {};
    const lines = new Map<number, number>();
    for (const [id, location] of Object.entries(locations)) {
      const line = record(record(location)?.start)?.line;
      const count = statements[id];
      if (typeof line === "number" && typeof count === "number") lines.set(line, Math.max(lines.get(line) ?? 0, count));
    }
    return [...lines.values()];
  });
  percentages.push(`lines ${coveredLines.length ? `${Math.round(coveredLines.filter(value => value > 0).length / coveredLines.length * 10000) / 100}%` : "not recorded"}`);
  if (suiteFailure) issues.push("Jest result contains a suite-level failure or runtime error.");
  if (root.success === false) issues.push("Jest run was top-level unsuccessful (assertion outcomes retained; coverage/threshold failure).");
  return { ...artifact, state: issues.length ? "invalid" : "present", tests, diagnostic: issues.length ? `${issues.join(" ")} Assertion outcomes retained; ${percentages.join(", ")}` : undefined };
}

function playwrightSpecs(
  suites: unknown[],
  tests: ParsedTestResult[],
  aggregateCounts: Record<string, number>,
  ancestors: string[] = []
): boolean {
  let valid = true;
  for (const rawSuite of suites) {
    const suite = record(rawSuite);
    if (!suite) { valid = false; continue; }
    const titles = [...ancestors, ...(typeof suite.title === "string" ? [suite.title] : [])];
    if (!Array.isArray(suite.specs) && !Array.isArray(suite.suites)) valid = false;
    if ((suite.specs !== undefined && !Array.isArray(suite.specs)) || (suite.suites !== undefined && !Array.isArray(suite.suites))) valid = false;
    if (Array.isArray(suite.specs)) {
      for (const rawSpec of suite.specs) {
        const spec = record(rawSpec);
        if (!spec || !Array.isArray(spec.tests)) { valid = false; continue; }
        const title = typeof spec.title === "string" ? spec.title : "unnamed Playwright test";
        const file = typeof spec.file === "string" ? spec.file : "unknown";
        if (title === "unnamed Playwright test" || file === "unknown" || !title.trim() || !file.trim() || spec.tests.length === 0) valid = false;
        for (const rawTest of spec.tests) {
          const test = record(rawTest);
          if (!test) { valid = false; continue; }
          const results = Array.isArray(test.results)
            ? test.results.map(record).filter((item): item is Record<string, unknown> => item !== null)
            : [];
          if (!Array.isArray(test.results) || results.length !== test.results.length || results.some(result => !["passed", "failed", "timedOut", "skipped", "interrupted"].includes(String(result.status)))) valid = false;
          if (!["expected", "unexpected", "flaky", "skipped"].includes(String(test.status))) valid = false;
          else aggregateCounts[String(test.status)] += 1;
          if (results.some(result => result.errors !== undefined && (!Array.isArray(result.errors) || result.errors.some(error => typeof record(error)?.message !== "string")))) valid = false;
          const details = results
            .flatMap((result) => strings(result.errors))
            .join("\n");
          const statuses = results.map((result) => result.status);
          const aggregateStatus = typeof test.status === "string" ? test.status : "";
          let outcome: TestOutcome;
          if (aggregateStatus === "skipped") {
            outcome = "skipped";
          } else if (results.length === 0 || statuses.every(status => status === undefined)) {
            outcome = "infrastructure";
          } else if (statuses.every((status) => status === "skipped")) {
            outcome = "skipped";
          } else if (
            aggregateStatus === "expected" &&
            statuses.length > 0 &&
            statuses.every((status) => status === "passed")
          ) {
            outcome = "pass";
          } else {
            outcome = classifyFailure(title, details);
          }
          tests.push({
            framework: "playwright",
            evidenceTitles: [...titles, title],
            module: moduleFromFile(file),
            file,
            title,
            outcome,
            details,
          });
        }
      }
    }
    if (Array.isArray(suite.suites) && !playwrightSpecs(suite.suites, tests, aggregateCounts, titles)) {
      valid = false;
    }
  }
  return valid;
}

export function parsePlaywrightReport(
  value: unknown,
  artifact: ReportArtifact
): ReportArtifact {
  const root = record(value);
  if (!root || !Array.isArray(root.suites)) {
    return invalidArtifact(
      artifact,
      "Playwright result does not contain a suites array."
    );
  }
  const issues: string[] = [];
  if (root.errors !== undefined && (!Array.isArray(root.errors) || root.errors.length > 0)) issues.push("Playwright result contains top-level errors.");
  if (root.suites.length === 0) {
    return invalidArtifact(artifact, "Playwright result contains an empty suites array.");
  }
  const tests: ParsedTestResult[] = [];
  const aggregateCounts: Record<string, number> = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
  if (!playwrightSpecs(root.suites, tests, aggregateCounts)) issues.push("Playwright suites contain a malformed entry.");
  if (root.stats !== undefined) {
    const stats = record(root.stats);
    if (!stats || Object.entries(aggregateCounts).some(([key, count]) => !Number.isInteger(stats[key]) || stats[key] !== count)) issues.push("Playwright stats counts do not match parsed evidence.");
  }
  if (tests.length === 0) {
    return invalidArtifact(artifact, [...issues, "Playwright result contains zero tests."].join(" "));
  }
  return { ...artifact, state: issues.length ? "invalid" : "present", tests, diagnostic: issues.length ? `${issues.join(" ")} Valid outcomes retained.` : undefined, performanceLogs: performanceLogs(root.suites) };
}

function performanceLogs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(performanceLogs);
  const item = record(value);
  if (!item) return [];
  return Object.entries(item).flatMap(([key, nested]) => key === "stdout"
    ? (Array.isArray(nested) ? nested : []).flatMap(output => {
        const text = typeof output === "string" ? output : record(output)?.text;
        return typeof text === "string" ? text.split("\n").filter(line => line.startsWith("BACKEND PERFORMANCE: ")) : [];
      })
    : typeof nested === "object" ? performanceLogs(nested) : []);
}

function countOutcomes(tests: ParsedTestResult[]): Record<TestOutcome, number> {
  const counts: Record<TestOutcome, number> = {
    pass: 0,
    skipped: 0,
    "product-red": 0,
    defect: 0,
    infrastructure: 0,
  };
  for (const test of tests) counts[test.outcome] += 1;
  return counts;
}

function redact(value: string): string {
  return value
    .replace(/https?:\/\/[^\s)>\]]+/giu, "[REDACTED_URL]")
    .replace(/\bBearer\s+[^\s,;]+/giu, "Bearer [REDACTED]")
    .replace(
      /\b(password|token|api[_-]?key|cookie|secret|authorization)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,
      "$1=[REDACTED]"
    );
}

function escapeCell(value: unknown): string {
  return redact(typeof value === "string" ? value : "INVALID")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .trim();
}

function displayRunContext(context: unknown): Record<keyof RunContext, string> {
  const values =
    typeof context === "object" && context !== null
      ? (context as Partial<RunContext>)
      : {};
  const hash = (value: unknown, allowSentinel = false) =>
    (typeof value === "string" && /^[a-f0-9]{64}$/iu.test(value)) ||
    (allowSentinel && value === "not-configured")
      ? String(value)
      : "INVALID";
  return {
    gitSha:
      typeof values.gitSha === "string" && /^[a-f0-9]{3,64}$/iu.test(values.gitSha)
        ? values.gitSha
        : "INVALID",
    dirty: typeof values.dirty === "boolean" ? String(values.dirty) : "INVALID",
    nodeVersion:
      typeof values.nodeVersion === "string" && /^v?\d+\.\d+\.\d+$/u.test(values.nodeVersion)
      ? values.nodeVersion
      : "INVALID",
    migrationsHash: hash(values.migrationsHash),
    environmentHash: hash(values.environmentHash, true),
  };
}

function resultSection(
  heading: string,
  tests: ParsedTestResult[],
  outcome: TestOutcome
): string[] {
  const matching = tests.filter((test) => test.outcome === outcome);
  const lines = [`## ${heading}`, ""];
  if (matching.length === 0) {
    lines.push("None recorded in the available result artifacts.", "");
    return lines;
  }
  for (const test of matching) {
    const detail = test.details ? `: ${escapeCell(test.details)}` : "";
    lines.push(`- \`${escapeCell(test.module)}\` ${escapeCell(test.title)}${detail}`);
  }
  lines.push("");
  return lines;
}

export function buildBackendTestReportResult(input: BackendTestReportInput): { markdown: string; readiness: "READY" | "BLOCKED"; exitCode: number } {
  const availableTests = input.artifacts
    .filter((artifact) => artifact.state === "present" || artifact.state === "invalid")
    .flatMap((artifact) => artifact.tests);
  const modules = [...new Set(availableTests.map((test) => test.module))].sort();
  const lines = [
    "# Backend Robustness Report",
    "",
    `Generated: ${input.generatedAt}`,
  ];
  const blockers: string[] = [];
  const requiredPhases = ["environment", "unit", "database-evidence", "integration", "no-ai", "backend-e2e", "cleanup-audit", ...(input.reportInProgress ? [] : ["report"])];
  const manifest = input.runManifest;
  if (!manifest?.finishedAt) blockers.push("Run manifest missing or incomplete");
  const identity = displayRunContext(manifest?.context);
  if (Object.values(identity).includes("INVALID") || identity.dirty !== "false" || identity.environmentHash === "not-configured") blockers.push("Run context missing, invalid, unapproved, or dirty");
  for (const label of requiredPhases) {
    const phase = manifest?.phases.find(value => value.label === label);
    if (!phase?.finishedAt || phase.exitCode !== 0) blockers.push(`Required phase missing, incomplete, or failed: ${label}`);
    if (!["environment", "database-evidence", "report"].includes(label)) {
      const artifact = input.artifacts.find(value => value.label === label);
      if (!artifact || artifact.state !== "present" || artifact.diagnostic || !artifact.tests.length || artifact.tests.some(test => test.outcome !== "pass")) blockers.push(`Required artifact missing, invalid, skipped, or failed: ${label}`);
    }
  }
  if (input.databaseEvidence?.state !== "present" || input.databaseEvidence.issues.length) blockers.push("Database evidence missing or invalid");
  if (!input.noAiGuardConfigured) blockers.push("No-AI guard missing");
  if (input.routeCoverage.gate !== "passed" || input.routeCoverage.issues.length) blockers.push("Route manifest gate missing or failed");
  const requirements = input.actionRequirements ?? [{ id: "analysis.memo.create", spec: "", required: ["persistence"], presentation: "required" }];
  const annotations = (test: ParsedTestResult) => (test.evidenceTitles ?? [test.title]).filter(title => title.startsWith("ACTION "));
  if (availableTests.some(test => annotations(test).some(title => !parseActionEvidenceSegments(title)))) blockers.push("Malformed action evidence");
  if (!input.actionRequirements?.length) blockers.push("Action manifest missing");
  for (const action of requirements.filter(value => value.presentation === "required")) {
    for (const dimension of action.required) {
      const found = availableTests.some(test => {
        const sources = action.evidenceSources ?? [{ file: action.spec, actionId: action.id, dimensions: action.required }];
        return test.outcome === "pass" && annotations(test).some(title =>
          parseActionEvidenceSegments(title)?.some(evidence => evidence.dimensions.some(value => value === dimension)
            && sources.some(source => source.actionId === evidence.actionId && source.dimensions.includes(dimension)
              && evidenceFileMatches(test.file, source.file))));
      });
      if (!found) blockers.push(`Missing action evidence: ${action.id}/${dimension}`);
    }
  }
  const cleanupArtifact = input.artifacts.find(value => value.label === "cleanup-audit");
  if (!cleanupArtifact?.tests.some(test => CLEANUP_AUDIT_PATTERN.test(test.title) && test.outcome === "pass")) blockers.push("Exact read-only cleanup audit missing");
  lines.push(`Readiness: ${blockers.length ? "BLOCKED" : "READY"}`, "", ...blockers.map(value => `- ${value}`), "");

  if (input.runManifest) {
    const context = displayRunContext(input.runManifest.context);
    lines.push(
      `Run ID: ${escapeCell(input.runManifest.runId)}`,
      `Run started: ${escapeCell(input.runManifest.startedAt)}`,
      `Run finished: ${escapeCell(input.runManifest.finishedAt ?? "INCOMPLETE")}`,
      `Git SHA: ${escapeCell(context.gitSha)}`,
      `Working tree dirty: ${context.dirty}`,
      `Workspace dirty: ${context.dirty}`,
      `Node version: ${escapeCell(context.nodeVersion)}`,
      `Migration hash: ${escapeCell(context.migrationsHash)}`,
      `Environment hash: ${escapeCell(context.environmentHash)}`,
      "",
      "## Run Phases",
      "",
      "| Phase | Started | Finished | Exit code |",
      "| --- | --- | --- | ---: |"
    );
    for (const phase of input.runManifest.phases) {
      lines.push(
        `| ${escapeCell(phase.label)} | ${escapeCell(phase.startedAt)} | ${escapeCell(phase.finishedAt ?? "INCOMPLETE")} | ${phase.exitCode ?? ""} |`
      );
    }
    lines.push("");
  }

  lines.push(
    "## Result Sources",
    "",
    "| Run | Framework | Result | Tests |",
    "| --- | --- | --- | ---: |",
  );

  for (const artifact of input.artifacts) {
    const result =
      artifact.state === "present"
        ? "RECORDED"
        : artifact.state === "missing"
          ? "NOT RUN / RESULT MISSING"
          : "INVALID RESULT";
    const diagnostic = artifact.diagnostic ? ` (${escapeCell(artifact.diagnostic)})` : "";
    lines.push(
      `| ${escapeCell(artifact.label)} | ${artifact.framework} | ${result}${diagnostic} | ${artifact.tests.length} |`
    );
  }

  lines.push(
    "",
    "## Outcomes By Module",
    "",
    "| Module | Pass | Product RED | Defect | Infrastructure | Skipped |",
    "| --- | ---: | ---: | ---: | ---: | ---: |"
  );
  if (modules.length === 0) {
    lines.push("| No recorded tests | 0 | 0 | 0 | 0 | 0 |");
  } else {
    for (const moduleName of modules) {
      const counts = countOutcomes(
        availableTests.filter((test) => test.module === moduleName)
      );
      lines.push(
        `| ${escapeCell(moduleName)} | ${counts.pass} | ${counts["product-red"]} | ${counts.defect} | ${counts.infrastructure} | ${counts.skipped} |`
      );
    }
  }

  const route = input.routeCoverage;
  const metricRows = input.artifacts.filter(artifact => artifact.state === "present")
    .flatMap(artifact => artifact.performanceLogs ?? []).flatMap(line => {
      try {
        const metric = record(JSON.parse(line.replace(/^BACKEND PERFORMANCE: /, "")));
        if (!metric || typeof metric.path !== "string" || ![1, 3, 5].includes(Number(metric.concurrency)) ||
          !["samples", "p50", "p95", "p99", "errors", "timeouts", "rateLimited"].every(key =>
            typeof metric[key] === "number" && Number.isFinite(metric[key]) && Number(metric[key]) >= 0) || Number(metric.samples) === 0) return [];
        return [`| ${escapeCell(metric.path)} | ${metric.concurrency} | ${metric.samples} | ${metric.p50} | ${metric.p95} | ${metric.p99} | ${metric.errors} | ${metric.timeouts} | ${metric.rateLimited} |`];
      } catch { return []; }
    });
  lines.push("", "## Performance Evidence", "", metricRows.length ? "Performance: RECORDED OBSERVATIONS (not a benchmark or a pass)." : "Performance: NOT RUN / METRICS ABSENT OR INVALID.");
  if (metricRows.length) lines.push("", "| Path | Concurrency | Samples | p50 | p95 | p99 | Errors | Timeouts | 429 |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |", ...metricRows);
  lines.push("", "## Route Method Coverage", "", "Evidence type: manifest ownership/static coverage.");
  if (route.gate === "not-run") {
    lines.push(
      "Route coverage gate was not run; manifest declarations are not claimed as verified.",
      `Unverified manifest inventory: ${route.routeFileCount} route files, ${route.methodCount} methods, ${route.coveredMethodCount} assigned to specs, and ${route.excludedMethodCount} documented exclusions.`
    );
  } else {
    lines.push(
      `Gate: **${route.gate.toUpperCase()}**. ${route.routeFileCount} route files, ${route.methodCount} methods, ${route.coveredMethodCount} methods assigned static spec owners, and ${route.excludedMethodCount} documented exclusions.`
    );
  }
  for (const issue of route.issues) lines.push(`- ${escapeCell(issue)}`);

  const noAiArtifact = input.artifacts.find((artifact) => artifact.label === "no-ai");
  const noAiVerified =
    input.noAiGuardConfigured &&
    noAiArtifact?.state === "present" &&
    noAiArtifact.tests.length > 0 &&
    noAiArtifact.tests.every((test) => test.outcome === "pass");
  lines.push(
    "",
    "## Safety Evidence",
    "",
    noAiVerified
      ? "No-AI guarantee: VERIFIED FOR THE RECORDED GUARDED RUN. The dedicated result is clean and the server/network guard configuration was detected."
      : "No-AI guarantee: NOT DEMONSTRATED. A missing, invalid, skipped, or failing guarded run cannot prove that no AI request occurred."
  );

  const databaseEvidence = input.databaseEvidence ?? {
    state: "not-demonstrated" as const,
    issues: ["No database evidence artifact was supplied."],
  };
  const databaseState = databaseEvidence.state.replace("-", " ").toUpperCase();
  lines.push(`Database catalog evidence: **${databaseState}**.`);
  for (const issue of databaseEvidence.issues) {
    lines.push(`- ${escapeCell(issue)}`);
  }
  lines.push(
    "Database behavioral evidence is recorded separately in the required integration artifact; catalog evidence alone does not demonstrate those behaviors."
  );

  const cleanupTests = availableTests.filter((test) => CLEANUP_AUDIT_PATTERN.test(test.title));
  if (cleanupTests.length === 0) {
    lines.push(
      "Cleanup audit: NOT DEMONSTRATED. No explicit `BACKEND CLEANUP AUDIT:` result was recorded."
    );
  } else if (cleanupTests.every((test) => test.outcome === "pass")) {
    lines.push("Cleanup audit: CLEAN FOR THE RECORDED RUN.");
  } else {
    lines.push("Cleanup audit: FAILED OR INCOMPLETE FOR THE RECORDED RUN.");
  }

  lines.push(
    "",
    ...resultSection("Product RED", availableTests, "product-red"),
    ...resultSection("Defects", availableTests, "defect"),
    ...resultSection("Infrastructure", availableTests, "infrastructure"),
    ...resultSection("Skipped", availableTests, "skipped"),
    "## Commands",
    ""
  );
  if (input.commands.length === 0) lines.push("No commands were supplied.");
  else for (const command of input.commands) lines.push(`- \`${escapeCell(command)}\``);

  lines.push("", "## Limitations", "");
  if (input.limitations.length === 0) lines.push("None recorded.");
  else for (const limitation of input.limitations) lines.push(`- ${escapeCell(limitation)}`);

  return { markdown: `${lines.join("\n")}\n`, readiness: blockers.length ? "BLOCKED" : "READY", exitCode: blockers.length ? 1 : 0 };
}

export function buildBackendTestReport(input: BackendTestReportInput): string {
  return buildBackendTestReportResult(input).markdown;
}
