import {
  buildBackendTestReport,
  buildBackendTestReportResult,
  parseJestReport,
  parsePlaywrightReport,
  type ReportArtifact,
} from "@/__tests__/backend/report";
import { actionManifest } from "@/__tests__/backend/action-manifest";

const jestArtifact: ReportArtifact = {
  label: "unit",
  path: "__tests__/reports/jest-backend-unit.json",
  framework: "jest",
  state: "present",
  tests: [],
};

describe("backend report result parsing", () => {
  it("only readies a complete passing canonical run and blocks each missing dimension", () => {
    const timestamp = "2026-10-04T00:00:00.000Z";
    const labels = ["environment", "unit", "database-evidence", "integration", "no-ai", "backend-e2e", "cleanup-audit", "report"];
    const input = { generatedAt: timestamp,
      runManifest: { runId: "backend-fixture", startedAt: timestamp, finishedAt: timestamp,
        context: { gitSha: "abc123", dirty: false, nodeVersion: "v20.0.0", migrationsHash: "a".repeat(64), environmentHash: "b".repeat(64) },
        phases: labels.map(label => ({ label, startedAt: timestamp, finishedAt: timestamp, exitCode: 0 })) },
      artifacts: ["unit", "integration", "no-ai", "backend-e2e", "cleanup-audit"].map(label => ({ ...jestArtifact, label, tests: [{ framework: "jest" as const, module: label, file: "integration/memo.spec.ts", title: label === "cleanup-audit" ? "BACKEND CLEANUP AUDIT: zero markers" : "ACTION analysis.memo.create [persistence]: saved", outcome: "pass" as const, details: "" }] })),
      actionRequirements: [{ id: "analysis.memo.create", spec: "integration/memo.spec.ts", required: ["persistence"], presentation: "required" }],
      routeCoverage: { routeFileCount: 1, methodCount: 1, coveredMethodCount: 1, excludedMethodCount: 0, gate: "passed" as const, issues: [] },
      databaseEvidence: { state: "present" as const, issues: [] }, noAiGuardConfigured: true, commands: [], limitations: [] };
    expect(buildBackendTestReport(input)).toContain("Readiness: READY");
    const combined = "ACTION analysis.memo.create [persistence]: saved | ACTION analysis.memo.update [persistence]: updated";
    const combinedInput = { ...input, actionRequirements: [
      ...input.actionRequirements,
      { id: "analysis.memo.update", spec: "integration/memo.spec.ts", required: ["persistence"], presentation: "required" },
    ], artifacts: input.artifacts.map(artifact => artifact.label === "cleanup-audit" ? artifact : {
      ...artifact, tests: artifact.tests.map(test => ({ ...test, title: combined })),
    }) };
    expect(buildBackendTestReportResult(combinedInput).readiness).toBe("READY");
    const register = actionManifest.find(action => action.id === "auth.register.submit")!;
    const actionTitle = "ACTION auth.register.submit [success]: returns session-safe successful registration";
    const realisticJest = parseJestReport({ success: true, testResults: [{
      name: "/repo/__tests__/unit/api.auth.session-hardening.route.test.ts", status: "passed",
      assertionResults: [{ ancestorTitles: ["auth handler boundaries"], title: actionTitle, fullName: `auth handler boundaries ${actionTitle}`, status: "passed", failureMessages: [] }],
    }] }, input.artifacts[0]);
    const attributionInput = { ...input, actionRequirements: [{ ...register, required: ["success"] }],
      artifacts: input.artifacts.map(artifact => artifact.label === "unit" ? realisticJest : artifact) };
    expect(buildBackendTestReportResult(attributionInput).readiness).toBe("READY");
    for (const mutation of [
      { file: "/repo/__tests__/unit/unapproved.test.ts" },
      { file: "/repo/not__tests__/unit/api.auth.session-hardening.route.test.ts" },
      { file: "/repo/__tests__/unit/../unit/api.auth.session-hardening.route.test.ts" },
      { evidenceTitles: ["ordinary prose mentions ACTION auth.register.submit [success]: not an annotation"] },
      { evidenceTitles: ["ACTION auth.register.submit [success,unknown]: malformed"] },
      { evidenceTitles: [] },
      { outcome: "defect" as const },
    ]) {
      const invalid = { ...realisticJest, tests: realisticJest.tests.map(test => ({ ...test, ...mutation })) };
      expect(buildBackendTestReportResult({ ...attributionInput, artifacts: attributionInput.artifacts.map(artifact => artifact.label === "unit" ? invalid : artifact) }).readiness).toBe("BLOCKED");
    }
    // A valid action ID in an approved companion is not permission to claim any dimension.
    const overclaim = { ...realisticJest, tests: realisticJest.tests.map(test => ({ ...test, evidenceTitles: ["ACTION auth.register.submit [persistence]: wrong source"] })) };
    expect(buildBackendTestReport({ ...attributionInput, actionRequirements: [{ ...register, required: ["persistence"] }], artifacts: attributionInput.artifacts.map(artifact => artifact.label === "unit" ? overclaim : artifact) })).toContain("Missing action evidence: auth.register.submit/persistence");
    const restore = actionManifest.find(action => action.id === "delimitation.version.restore")!;
    const parentTitle = "ACTION delimitation.version.restore [permissions]: checks editor and denied roles";
    const nested = parsePlaywrightReport({ suites: [{ title: "versions-and-races.spec.ts", suites: [{ title: parentTitle,
      specs: [{ title: "editor may restore; viewer, intruder and anonymous denied", file: "integration/research-workflow/versions-and-races.spec.ts", tests: [{ status: "expected", results: [{ status: "passed" }] }] }],
    }] }] }, { ...input.artifacts[1], framework: "playwright" });
    expect(nested.state).toBe("present");
    expect(buildBackendTestReportResult({ ...input, actionRequirements: [{ ...restore, required: ["permissions"] }], artifacts: input.artifacts.map(artifact => artifact.label === "integration" ? nested : artifact) }).readiness).toBe("READY");
    const alias = actionManifest.find(action => action.id === "projects.current-user.read")!;
    const sharedRead = { ...realisticJest, tests: realisticJest.tests.map(test => ({ ...test, file: "integration/auth/profile-contracts.spec.ts", evidenceTitles: ["ACTION profile.me.read [success,permissions]: reads shared user endpoint"] })) };
    expect(buildBackendTestReportResult({ ...input, actionRequirements: [alias], artifacts: input.artifacts.map(artifact => artifact.label === "unit" ? sharedRead : artifact) }).readiness).toBe("READY");
    const usableTitle = "ACTION analysis.memo.create [persistence]: saved";
    const completeJest = parseJestReport({ success: true, numTotalTests: 1, numPassedTests: 1, numTotalTestSuites: 1, numPassedTestSuites: 1, testResults: [{ name: "integration/memo.spec.ts", status: "passed", assertionResults: [{ title: usableTitle, fullName: usableTitle, status: "passed", failureMessages: [] }] }] }, input.artifacts[0]);
    expect(completeJest.state).toBe("present");
    expect(buildBackendTestReportResult({ ...input, artifacts: input.artifacts.map(artifact => artifact.label === "unit" ? completeJest : artifact) }).readiness).toBe("READY");
    const malformedIdentityResults = [
      { name: "integration/memo.spec.ts", status: "passed", assertionResults: [{ title: usableTitle, fullName: usableTitle, status: "passed" }, { title: "", fullName: "blank local title", status: "passed" }] },
      { name: "integration/memo.spec.ts", status: "passed", assertionResults: [{ title: usableTitle, fullName: usableTitle, status: "passed" }, { title: " \t ", fullName: "whitespace local title", status: "passed" }] },
      { name: "integration/memo.spec.ts", assertionResults: [{ title: usableTitle, fullName: usableTitle, status: "passed" }] },
      { name: "integration/memo.spec.ts", status: "passed", assertionResults: [{ title: usableTitle, fullName: usableTitle, status: "passed" }, { title: "valid fallback", fullName: " ", status: "passed" }] },
      { name: "integration/memo.spec.ts", status: "passed", assertionResults: [{ fullName: usableTitle, status: "passed" }] },
      { name: "integration/memo.spec.ts", status: "passed", assertionResults: [{ title: usableTitle, status: "passed" }] },
    ].map(badSuite => {
      const parsed = parseJestReport({ success: true, testResults: [badSuite] }, input.artifacts[0]);
      expect(parsed.tests.some(test => test.title.startsWith("ACTION "))).toBe(true);
      const result = buildBackendTestReportResult({ ...input, artifacts: input.artifacts.map(artifact => artifact.label === "unit" ? parsed : artifact) });
      return { state: parsed.state, readiness: result.readiness, exitCode: result.exitCode };
    });
    expect(malformedIdentityResults).toEqual(Array(6).fill({ state: "invalid", readiness: "BLOCKED", exitCode: 1 }));
    const goodAssertion = { title: "ACTION analysis.memo.create [persistence]: saved", status: "passed" };
    const malformedJest = parseJestReport({ success: true, numTotalTests: 2, numFailedTestSuites: 1, numRuntimeErrorTestSuites: 1, testResults: [{ name: "integration/memo.spec.ts", status: "passed", assertionResults: [goodAssertion, null] }] }, input.artifacts[0]);
    const malformedPlaywright = parsePlaywrightReport({ suites: [{ specs: [{ title: goodAssertion.title, file: "integration/memo.spec.ts", tests: [null, { status: "expected", results: [{ status: "passed" }, {}] }] }] }] }, { ...input.artifacts[1], framework: "playwright" });
    for (const replacement of [malformedJest, malformedPlaywright]) {
      expect(replacement.state).toBe("invalid");
      expect(buildBackendTestReport({ ...input, artifacts: input.artifacts.map(artifact => artifact.label === replacement.label ? replacement : artifact) })).toContain("Readiness: BLOCKED");
    }
    expect(buildBackendTestReport({ ...input, artifacts: input.artifacts.map(artifact => ({ ...artifact, tests: artifact.tests.map(test => ({ ...test, title: "ACTION analysis.memo.create [persistence,unknown]: saved" })) })) })).toContain("Missing action evidence: analysis.memo.create/persistence");
    for (const label of labels) expect(buildBackendTestReport({ ...input, runManifest: { ...input.runManifest, phases: input.runManifest.phases.filter(phase => phase.label !== label) } })).toContain("Readiness: BLOCKED");
    expect(buildBackendTestReport({ ...input, actionRequirements: [{ ...input.actionRequirements[0], required: ["validation"] }] })).toContain("Missing action evidence: analysis.memo.create/validation");
  });
  it.each([null, {}, { status: "invented", title: "bad" }])("invalidates malformed Jest assertions without losing RED diagnostics: %s", malformed => {
    const artifact = parseJestReport({ success: false, numTotalTests: 2, testResults: [{ name: "unit/red.test.ts", status: "failed", assertionResults: [{ title: "RED: legitimate gap", status: "failed", failureMessages: ["expected 403"] }, malformed] }] }, jestArtifact);
    expect(artifact.state).toBe("invalid");
    expect(artifact.tests.some(test => test.outcome === "product-red")).toBe(true);
  });
  it.each([{ numFailedTestSuites: 1 }, { numRuntimeErrorTestSuites: 1 }, { numTotalTests: 2 }, { numPassedTests: 2 }, { numFailedTests: 1 }, { numTotalTestSuites: 2 }, { numFailedTests: "0" }])("rejects inconsistent Jest counters with passing assertions: %s", counters => {
    expect(parseJestReport({ success: true, ...counters, testResults: [{ name: "unit/good.test.ts", status: "passed", assertionResults: [{ title: "good", status: "passed" }] }] }, jestArtifact).state).toBe("invalid");
  });
  it("retains RED assertions despite a contradictory zero-test counter", () => {
    const parsed = parseJestReport({ numTotalTests: 0, testResults: [{ name: "unit/red.test.ts", assertionResults: [{ title: "RED: real gap", status: "failed", failureMessages: ["real diagnostic"] }] }] }, jestArtifact);
    expect(parsed.state).toBe("invalid");
    expect(parsed.tests[0]?.details).toBe("real diagnostic");
  });
  it("invalidates blank identity fields while retaining an otherwise useful RED identifier", () => {
    const parsed = parseJestReport({ success: false, testResults: [{ name: "unit/red.test.ts", status: "failed", assertionResults: [{ title: "RED: real gap", fullName: " ", status: "failed", failureMessages: ["real diagnostic"] }] }] }, jestArtifact);
    expect(parsed.state).toBe("invalid");
    expect(parsed.tests[0]?.outcome).toBe("product-red");
    expect(parsed.tests[0]?.details).toBe("real diagnostic");
  });
  it.each(["", " \t ", undefined])("invalidates empty Playwright spec identifiers alongside passing evidence: %s", identifier => {
    for (const field of ["title", "file"]) {
      const spec = { title: "ACTION analysis.memo.create [persistence]: saved", file: "integration/memo.spec.ts", tests: [{ status: "expected", results: [{ status: "passed" }] }] };
      const parsed = parsePlaywrightReport({ suites: [{ specs: [spec, { ...spec, [field]: identifier }] }] }, jestArtifact);
      expect(parsed.state).toBe("invalid");
    }
  });
  it.each([
    { suites: [{ specs: [{ title: "RED: real gap", file: "integration/gap.spec.ts", tests: [{ status: "unexpected", results: [{ status: "failed", errors: [{ message: "real diagnostic" }] }] }] }] }], errors: [{ message: "worker failure" }] },
    { suites: [{ specs: [{ title: "good", file: "integration/good.spec.ts", tests: [{ status: "expected", results: [{ status: "passed" }] }] }] }], stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0 } },
    { suites: [{ specs: [{ title: "good", file: "integration/good.spec.ts", tests: [{ status: "expected", results: [{ status: "passed" }] }] }, {}] }] },
  ])("rejects inconsistent/malformed Playwright metadata and keeps valid outcomes", value => {
    const parsed = parsePlaywrightReport(value, jestArtifact);
    expect(parsed.state).toBe("invalid");
    expect(parsed.tests).toHaveLength(1);
  });
  it.each([null, {}, { status: "invented" }])("invalidates malformed Playwright results alongside a passing attempt: %s", malformed => {
    expect(parsePlaywrightReport({ suites: [{ specs: [{ title: "good", file: "integration/good.spec.ts", tests: [{ status: "expected", results: [{ status: "passed" }, malformed] }] }] }] }, jestArtifact).state).toBe("invalid");
  });
  it("returns nonzero structured readiness when failed diagnostics quote READY", () => {
    const result = buildBackendTestReportResult({ generatedAt: "2026-10-04", artifacts: [{ ...jestArtifact, tests: [{ framework: "jest", module: "unit", file: "unit/report.test.ts", title: "RED: readiness", outcome: "product-red", details: "expected Readiness: READY" }] }], routeCoverage: { routeFileCount: 0, methodCount: 0, coveredMethodCount: 0, excludedMethodCount: 0, gate: "not-run", issues: [] }, noAiGuardConfigured: false, commands: [], limitations: [] });
    expect(result.markdown).toContain("Readiness: BLOCKED");
    expect(result.markdown).toContain("expected Readiness: READY");
    expect(result.readiness).toBe("BLOCKED");
    expect(result.exitCode).toBe(1);
  });
  it("retains marked product failures when Jest reports failed suites", () => {
    const parsed = parseJestReport({ success: false, numFailedTestSuites: 1, numTotalTests: 1, testResults: [{ name: "unit/product.test.ts", status: "failed", failureMessage: "assertion failed", assertionResults: [{ title: "RED: missing product contract", status: "failed", failureMessages: ["expected 403"] }] }] }, jestArtifact);
    expect(parsed.tests[0]?.outcome).toBe("product-red");
  });
  it("blocks missing canonical evidence and missing action dimensions", () => {
    const report = buildBackendTestReport({ generatedAt: "2026-10-04", artifacts: [],
      routeCoverage: { routeFileCount: 0, methodCount: 0, coveredMethodCount: 0, excludedMethodCount: 0, gate: "not-run", issues: [] },
      noAiGuardConfigured: false, commands: [], limitations: [] });
    expect(report).toContain("Readiness: BLOCKED");
    expect(report).toContain("Database evidence");
    expect(report).toContain("Missing action evidence: analysis.memo.create/persistence");
  });
  it("retains assertion outcomes and coverage when Jest fails its threshold", () => {
    const result = parseJestReport({ success: false, numTotalTests: 1, coverageMap: { "file.ts": { s: { 0: 1, 1: 0 }, f: { 0: 1 }, b: { 0: [1, 0] }, statementMap: {}, fnMap: {}, branchMap: {} } }, testResults: [{ name: "unit/a.test.ts", status: "passed", assertionResults: [{ title: "works", status: "passed" }] }] }, jestArtifact);
    expect(result.tests).toHaveLength(1);
    expect(result.diagnostic).toContain("unsuccessful");
    expect(result.diagnostic).toContain("statements 50%");
  });
  it("preserves Playwright stdout metrics and excludes malformed observations", () => {
    const line = 'BACKEND PERFORMANCE: {"path":"/api/projects/run/workflow","concurrency":1,"samples":5,"p50":10,"p95":20,"p99":20,"errors":1,"timeouts":1,"rateLimited":0}';
    const parsed = parsePlaywrightReport({ suites: [{ specs: [{ title: "bounded performance", file: "performance/latency-smoke.spec.ts", tests: [{ status: "unexpected", results: [{ status: "failed", stdout: [{ text: `${line}\n` }], errors: [{ message: "unsafe" }] }] }] }] }] }, jestArtifact);
    expect(parsed.performanceLogs).toEqual([line]);
    const input = { generatedAt: "2026-10-04", artifacts: [parsed], routeCoverage: { routeFileCount: 0, methodCount: 0, coveredMethodCount: 0, excludedMethodCount: 0, gate: "not-run" as const, issues: [] }, noAiGuardConfigured: false, commands: [], limitations: [] };
    expect(buildBackendTestReport(input)).toContain("| /api/projects/run/workflow | 1 | 5 | 10 | 20 | 20 | 1 | 1 | 0 |");
    expect(buildBackendTestReport({ ...input, artifacts: [{ ...parsed, performanceLogs: ["BACKEND PERFORMANCE: {}", "BACKEND PERFORMANCE: not-json"] }] })).toContain("Performance: NOT RUN");
  });
  it("reports performance metrics only from recorded JSON lines", () => {
    const input = {
      generatedAt: "2026-10-04", artifacts: [],
      routeCoverage: { routeFileCount: 0, methodCount: 0, coveredMethodCount: 0, excludedMethodCount: 0, gate: "not-run" as const, issues: [] },
      noAiGuardConfigured: false, commands: [], limitations: [],
    };
    expect(buildBackendTestReport(input)).toContain("Performance: NOT RUN");
    expect(buildBackendTestReport({ ...input, artifacts: [{
      label: "performance", path: "perf.json", framework: "playwright", state: "present", tests: [],
      performanceLogs: ['BACKEND PERFORMANCE: {"path":"/api/projects/run/workflow","concurrency":3,"samples":15,"p50":10,"p95":20,"p99":30,"errors":0,"timeouts":0,"rateLimited":0}'],
    }] })).toContain("| /api/projects/run/workflow | 3 | 15 | 10 | 20 | 30 | 0 | 0 | 0 |");
  });
  it.each([
    [{ success: false, numTotalTests: 1, testResults: [] }, "unsuccessful"],
    [{ success: true, numFailedTestSuites: 1, numTotalTests: 1, testResults: [] }, "failed suite"],
    [{ success: true, numRuntimeErrorTestSuites: 1, numTotalTests: 1, testResults: [] }, "runtime"],
    [{ success: true, numTotalTests: 0, testResults: [] }, "zero tests"],
  ])("rejects invalid Jest run metadata: %s", (value, diagnostic) => {
    const artifact = parseJestReport(value, jestArtifact);
    expect(artifact.state).toBe("invalid");
    expect(artifact.diagnostic?.toLowerCase()).toContain(diagnostic);
  });

  it("rejects empty Playwright suites and top-level errors", () => {
    const base: ReportArtifact = {
      label: "integration",
      path: "integration.json",
      framework: "playwright",
      state: "present",
      tests: [],
    };
    expect(parsePlaywrightReport({ suites: [], errors: [] }, base).state).toBe("invalid");
    expect(
      parsePlaywrightReport(
        { suites: [{ specs: [] }], errors: [{ message: "worker crashed" }] },
        base
      ).diagnostic
    ).toContain("top-level");
  });

  it("does not classify an empty attempt as skipped", () => {
    const artifact = parsePlaywrightReport(
      {
        suites: [{ specs: [
          { title: "no result", file: "x.spec.ts", tests: [{ status: "unexpected", results: [] }] },
          { title: "empty attempt", file: "x.spec.ts", tests: [{ status: "unexpected", results: [{}] }] },
          { title: "intentional skip", file: "x.spec.ts", tests: [{ status: "skipped", results: [] }] },
        ] }],
      },
      { label: "integration", path: "x", framework: "playwright", state: "present", tests: [] }
    );
    expect(artifact.tests.map((test) => test.outcome)).toEqual([
      "infrastructure",
      "infrastructure",
      "skipped",
    ]);
  });

  it("rejects Jest suite-level failures even when assertion rows look successful", () => {
    const artifact = parseJestReport(
      {
        success: true,
        numTotalTests: 1,
        testResults: [{
          name: "suite.test.ts",
          status: "failed",
          failureMessage: "runtime teardown failed",
          assertionResults: [{ title: "looked green", status: "passed", failureMessages: [] }],
        }],
      },
      jestArtifact
    );
    expect(artifact.state).toBe("invalid");
    expect(artifact.diagnostic).toContain("suite-level");
  });

  it("lets infrastructure evidence override a product marker and treats product timeouts conservatively", () => {
    const artifact = parsePlaywrightReport(
      {
        suites: [{ specs: [
          { title: "PRODUCT GAP: server starts", file: "a.spec.ts", tests: [{ status: "unexpected", results: [{ status: "failed", errors: [{ message: "ECONNREFUSED" }] }] }] },
          { title: "PRODUCT GAP: slow filter", file: "b.spec.ts", tests: [{ status: "unexpected", results: [{ status: "timedOut", errors: [{ message: "expect.poll timed out" }] }] }] },
          { title: "ordinary slow filter", file: "c.spec.ts", tests: [{ status: "unexpected", results: [{ status: "timedOut", errors: [{ message: "expect.poll timed out" }] }] }] },
        ] }],
      },
      { label: "integration", path: "x", framework: "playwright", state: "present", tests: [] }
    );
    expect(artifact.tests.map((test) => test.outcome)).toEqual([
      "infrastructure",
      "product-red",
      "defect",
    ]);
  });

  it.each([
    "fetch failed",
    "UND_ERR_CONNECT_TIMEOUT",
    "Attention Required! | Cloudflare",
    "Sorry, you have been blocked",
  ]) (
    "classifies %s as infrastructure",
    (message) => {
      const artifact = parsePlaywrightReport(
        {
          suites: [{ specs: [{
            title: "ordinary request",
            file: "integration/analysis/codes-contracts.spec.ts",
            tests: [{
              status: "unexpected",
              results: [{ status: "failed", errors: [{ message }] }],
            }],
          }] }],
        },
        { label: "integration", path: "x", framework: "playwright", state: "present", tests: [] }
      );

      expect(artifact.tests[0]).toMatchObject({
        module: "analysis",
        outcome: "infrastructure",
      });
    }
  );

  it.each([
    ["integration/projects/projects-contracts.spec.ts", "projects"],
    ["e2e/backend/backend-lifecycle.spec.ts", "backend-e2e"],
  ])("recognizes relative report path %s", (file, module) => {
    const artifact = parsePlaywrightReport(
      {
        suites: [{ specs: [{
          title: "passes",
          file,
          tests: [{ status: "expected", results: [{ status: "passed" }] }],
        }] }],
      },
      { label: "integration", path: "x", framework: "playwright", state: "present", tests: [] }
    );

    expect(artifact.tests[0]?.module).toBe(module);
  });
  it("separates Jest pass, skipped, product RED, defect, and infrastructure results", () => {
    const artifact = parseJestReport(
      {
        testResults: [
          {
            name: "C:/repo/__tests__/unit/backend-report.test.ts",
            assertionResults: [
              { title: "renders a report", status: "passed", failureMessages: [] },
              { title: "future contract", status: "pending", failureMessages: [] },
              {
                title: "RED: archived projects remain visible",
                status: "failed",
                failureMessages: ["Expected hidden, received visible"],
              },
              {
                title: "@product-red role is rejected independently",
                status: "failed",
                failureMessages: ["Expected 400, received 200"],
              },
              {
                title: "rejects malformed input",
                status: "failed",
                failureMessages: ["Expected 400, received 500"],
              },
              {
                title: "loads the QA environment",
                status: "failed",
                failureMessages: ["TEST_OWNER_EMAIL is required"],
              },
            ],
          },
        ],
      },
      jestArtifact
    );

    expect(artifact.tests.map(({ outcome }) => outcome)).toEqual([
      "pass",
      "skipped",
      "product-red",
      "product-red",
      "defect",
      "infrastructure",
    ]);
    expect(artifact.tests[0].module).toBe("unit");
  });

  it("parses nested Playwright suites and treats timed out setup as infrastructure", () => {
    const artifact = parsePlaywrightReport(
      {
        suites: [
          {
            title: "projects",
            suites: [],
            specs: [
              {
                title: "creates a project",
                file: "__tests__/integration/projects/projects-contracts.spec.ts",
                tests: [{ status: "expected", results: [{ status: "passed" }] }],
              },
              {
                title: "PRODUCT GAP: filters archived projects",
                file: "__tests__/integration/projects/projects-contracts.spec.ts",
                tests: [
                  {
                    status: "unexpected",
                    results: [
                      { status: "failed", errors: [{ message: "Expected []" }] },
                    ],
                  },
                ],
              },
              {
                title: "starts the backend",
                file: "__tests__/integration/auth/qa-accounts.spec.ts",
                tests: [
                  {
                    status: "unexpected",
                    results: [
                      {
                        status: "timedOut",
                        errors: [{ message: "webServer did not become ready" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        label: "integration",
        path: "__tests__/reports/playwright-backend-integration.json",
        framework: "playwright",
        state: "present",
        tests: [],
      }
    );

    expect(artifact.tests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: "projects", outcome: "pass" }),
        expect.objectContaining({ module: "projects", outcome: "product-red" }),
        expect.objectContaining({ module: "auth", outcome: "infrastructure" }),
      ])
    );
  });

  it("rejects malformed JSON shapes instead of reporting an empty passing run", () => {
    const artifact = parseJestReport({ success: true }, jestArtifact);

    expect(artifact.state).toBe("invalid");
    expect(artifact.tests).toEqual([]);
    expect(artifact.diagnostic).toContain("testResults");
  });
});

describe("backend robustness Markdown", () => {
  it("renders coherent run identity, timestamps, and phase exit codes", () => {
    const markdown = buildBackendTestReport({
      generatedAt: "2026-07-12T18:03:00.000Z",
      runManifest: {
        runId: "backend-run-123",
        startedAt: "2026-07-12T18:00:00.000Z",
        finishedAt: "2026-07-12T18:02:00.000Z",
        context: {
          gitSha: "abc123",
          dirty: true,
          nodeVersion: "v22.0.0",
          migrationsHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          environmentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
        phases: [{ label: "unit", startedAt: "2026-07-12T18:00:10.000Z", finishedAt: "2026-07-12T18:01:00.000Z", exitCode: 0 }],
      },
      artifacts: [],
      routeCoverage: { routeFileCount: 0, methodCount: 0, coveredMethodCount: 0, excludedMethodCount: 0, gate: "not-run", issues: [] },
      noAiGuardConfigured: false,
      commands: [],
      limitations: [],
    });
    expect(markdown).toContain("backend-run-123");
    expect(markdown).toContain("2026-07-12T18:00:00.000Z");
    expect(markdown).toContain("| unit | 2026-07-12T18:00:10.000Z | 2026-07-12T18:01:00.000Z | 0 |");
    expect(markdown).toContain("Git SHA: abc123");
    expect(markdown).toContain("Working tree dirty: true");
    expect(markdown).toContain("Migration hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(markdown).toContain("Environment hash: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("does not render malformed run-context values as report identity", () => {
    const markdown = buildBackendTestReport({
      generatedAt: "2026-07-12T18:03:00.000Z",
      runManifest: {
        runId: "backend-run-123",
        startedAt: "2026-07-12T18:00:00.000Z",
        finishedAt: "2026-07-12T18:02:00.000Z",
        context: {
          gitSha: "not-a-sha",
          dirty: false,
          nodeVersion: "not-a-node-version",
          migrationsHash: "not-a-hash",
          environmentHash: "not-a-hash",
        },
        phases: [],
      },
      artifacts: [],
      routeCoverage: { routeFileCount: 0, methodCount: 0, coveredMethodCount: 0, excludedMethodCount: 0, gate: "not-run", issues: [] },
      noAiGuardConfigured: false,
      commands: [],
      limitations: [],
    });

    expect(markdown).toContain("Git SHA: INVALID");
    expect(markdown).toContain("Migration hash: INVALID");
    expect(markdown).toContain("Environment hash: INVALID");
    expect(markdown).not.toContain("not-a-hash");
  });

  it("renders a context-less legacy manifest as invalid evidence instead of throwing", () => {
    expect(() =>
      buildBackendTestReport({
        generatedAt: "2026-07-12T18:03:00.000Z",
        runManifest: {
          runId: undefined as unknown as string,
          startedAt: undefined as unknown as string,
          finishedAt: undefined as unknown as string | null,
          context: undefined as unknown as {
            gitSha: string;
            dirty: boolean;
            nodeVersion: string;
            migrationsHash: string;
            environmentHash: string;
          },
          phases: [],
        },
        artifacts: [],
        routeCoverage: { routeFileCount: 0, methodCount: 0, coveredMethodCount: 0, excludedMethodCount: 0, gate: "not-run", issues: [] },
        noAiGuardConfigured: false,
        commands: [],
        limitations: [],
      })
    ).not.toThrow();

    const markdown = buildBackendTestReport({
      generatedAt: "2026-07-12T18:03:00.000Z",
      runManifest: {
        runId: undefined as unknown as string,
        startedAt: undefined as unknown as string,
        finishedAt: undefined as unknown as string | null,
        context: undefined as unknown as {
          gitSha: string;
          dirty: boolean;
          nodeVersion: string;
          migrationsHash: string;
          environmentHash: string;
        },
        phases: [],
      },
      artifacts: [],
      routeCoverage: { routeFileCount: 0, methodCount: 0, coveredMethodCount: 0, excludedMethodCount: 0, gate: "not-run", issues: [] },
      noAiGuardConfigured: false,
      commands: [],
      limitations: [],
    });

    expect(markdown).toContain("Git SHA: INVALID");
    expect(markdown).toContain("Environment hash: INVALID");
    expect(markdown).toContain("Run ID: INVALID");
  });

  it("does not render a valid Node-version prefix with an unrecognized suffix", () => {
    const markdown = buildBackendTestReport({
      generatedAt: "2026-07-12T18:03:00.000Z",
      runManifest: {
        runId: "backend-run-123",
        startedAt: "2026-07-12T18:00:00.000Z",
        finishedAt: "2026-07-12T18:02:00.000Z",
        context: {
          gitSha: "abc123",
          dirty: false,
          nodeVersion: "v22.0.0-unrecognized",
          migrationsHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          environmentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
        phases: [],
      },
      artifacts: [],
      routeCoverage: { routeFileCount: 0, methodCount: 0, coveredMethodCount: 0, excludedMethodCount: 0, gate: "not-run", issues: [] },
      noAiGuardConfigured: false,
      commands: [],
      limitations: [],
    });

    expect(markdown).toContain("Node version: INVALID");
    expect(markdown).not.toContain("v22.0.0-unrecognized");
  });

  it("redacts credentials, cookies, URLs, tokens, API keys, and generic secrets", () => {
    const markdown = buildBackendTestReport({
      generatedAt: "2026-07-12T18:00:00.000Z",
      artifacts: [{
        ...jestArtifact,
        diagnostic: "authorization=diagnostic-secret",
        tests: [{
          framework: "jest", module: "unit", file: "x", title: "fails safely",
          outcome: "defect",
          details: "password=hunter2 token: abc123 API_KEY=key123 cookie=session%3Dsecret https://user:pass@example.com/private secret='hidden'",
        }],
      }],
      routeCoverage: { routeFileCount: 1, methodCount: 1, coveredMethodCount: 1, excludedMethodCount: 0, gate: "passed", issues: ["cookie=route-secret"] },
      noAiGuardConfigured: false,
      commands: ["run --token=command-secret"],
      limitations: ["See https://example.com/private-limit and password=limit-secret"],
    });
    for (const secret of ["hunter2", "abc123", "key123", "session%3Dsecret", "user:pass", "hidden", "/private", "diagnostic-secret", "route-secret", "command-secret", "limit-secret", "private-limit"]) {
      expect(markdown).not.toContain(secret);
    }
    expect(markdown).toContain("[REDACTED]");
  });

  it("describes route evidence as manifest ownership and static coverage", () => {
    const markdown = buildBackendTestReport({
      generatedAt: "2026-07-12T18:00:00.000Z",
      artifacts: [],
      routeCoverage: { routeFileCount: 1, methodCount: 2, coveredMethodCount: 2, excludedMethodCount: 0, gate: "passed", issues: [] },
      noAiGuardConfigured: false,
      commands: [],
      limitations: [],
    });
    expect(markdown).toContain("manifest ownership/static coverage");
    expect(markdown).not.toContain("covered by specs");
  });
  it("states missing runs as not run and never infers success", () => {
    const markdown = buildBackendTestReport({
      generatedAt: "2026-07-12T18:00:00.000Z",
      artifacts: [
        {
          ...jestArtifact,
          state: "missing",
          diagnostic: "Result file was not found.",
        },
      ],
      routeCoverage: {
        routeFileCount: 83,
        methodCount: 127,
        coveredMethodCount: 123,
        excludedMethodCount: 4,
        gate: "not-run",
        issues: [],
      },
      noAiGuardConfigured: true,
      commands: ["npm run test:backend:unit"],
      limitations: ["Live suites were not executed while generating this report."],
    });

    expect(markdown).toContain("NOT RUN / RESULT MISSING");
    expect(markdown).toContain("Route coverage gate was not run");
    expect(markdown).toContain("No-AI guarantee: NOT DEMONSTRATED");
    expect(markdown).toContain("Cleanup audit: NOT DEMONSTRATED");
    expect(markdown).not.toContain("All tests passed");
  });

  it("renders database evidence as not demonstrated when catalog access is absent", () => {
    const markdown = buildBackendTestReport({
      generatedAt: "2026-07-12T18:00:00.000Z",
      artifacts: [],
      routeCoverage: { routeFileCount: 0, methodCount: 0, coveredMethodCount: 0, excludedMethodCount: 0, gate: "not-run", issues: [] },
      noAiGuardConfigured: false,
      databaseEvidence: {
        state: "not-demonstrated",
        issues: ["TEST_DATABASE_READONLY_URL is not configured."],
      },
      commands: [],
      limitations: [],
    });

    expect(markdown).toContain("Database catalog evidence: **NOT DEMONSTRATED**");
    expect(markdown).toContain("TEST_DATABASE_READONLY_URL is not configured");
    expect(markdown).not.toContain("Database catalog evidence: **PRESENT**");
  });

  it("renders current validated database evidence as present", () => {
    const markdown = buildBackendTestReport({
      generatedAt: "2026-07-12T18:00:00.000Z",
      artifacts: [],
      routeCoverage: { routeFileCount: 0, methodCount: 0, coveredMethodCount: 0, excludedMethodCount: 0, gate: "not-run", issues: [] },
      noAiGuardConfigured: false,
      databaseEvidence: { state: "present", issues: [] },
      commands: [],
      limitations: [],
    });

    expect(markdown).toContain("Database catalog evidence: **PRESENT**");
    expect(markdown).toContain(
      "Database behavioral evidence is recorded separately in the required integration artifact"
    );
  });

  it("reports clean guarded no-AI evidence and cleanup evidence only when recorded", () => {
    const markdown = buildBackendTestReport({
      generatedAt: "2026-07-12T18:00:00.000Z",
      artifacts: [
        {
          label: "no-ai",
          path: "__tests__/reports/playwright-backend-no-ai.json",
          framework: "playwright",
          state: "present",
          tests: [
            {
              framework: "playwright",
              module: "ai",
              file: "__tests__/integration/ai/ai-contracts.spec.ts",
              title: "provider is unavailable without an AI key",
              outcome: "pass",
              details: "",
            },
            {
              framework: "playwright",
              module: "security",
              file: "__tests__/integration/security/cleanup-audit.spec.ts",
              title: "BACKEND CLEANUP AUDIT: no exact run marker remains",
              outcome: "pass",
              details: "",
            },
          ],
        },
      ],
      routeCoverage: {
        routeFileCount: 83,
        methodCount: 127,
        coveredMethodCount: 123,
        excludedMethodCount: 4,
        gate: "passed",
        issues: [],
      },
      noAiGuardConfigured: true,
      commands: ["npm run test:backend:no-ai"],
      limitations: [],
    });

    expect(markdown).toContain("No-AI guarantee: VERIFIED FOR THE RECORDED GUARDED RUN");
    expect(markdown).toContain("Cleanup audit: CLEAN FOR THE RECORDED RUN");
    expect(markdown).toContain("123 methods assigned static spec owners");
    expect(markdown).toContain("4 documented exclusions");
  });

  it("lists product RED separately from defects and infrastructure", () => {
    const markdown = buildBackendTestReport({
      generatedAt: "2026-07-12T18:00:00.000Z",
      artifacts: [
        {
          ...jestArtifact,
          tests: [
            {
              framework: "jest",
              module: "analysis",
              file: "analysis.test.ts",
              title: "RED: stale offsets",
              outcome: "product-red",
              details: "expected rejection",
            },
            {
              framework: "jest",
              module: "documents",
              file: "documents.test.ts",
              title: "rejects invalid upload",
              outcome: "defect",
              details: "received 500",
            },
            {
              framework: "jest",
              module: "auth",
              file: "auth.test.ts",
              title: "loads credentials",
              outcome: "infrastructure",
              details: "TEST_OWNER_EMAIL is required",
            },
          ],
        },
      ],
      routeCoverage: {
        routeFileCount: 0,
        methodCount: 0,
        coveredMethodCount: 0,
        excludedMethodCount: 0,
        gate: "failed",
        issues: ["Unowned route method: GET /api/new"],
      },
      noAiGuardConfigured: false,
      commands: [],
      limitations: [],
    });

    expect(markdown).toContain("## Product RED");
    expect(markdown).toContain("## Defects");
    expect(markdown).toContain("## Infrastructure");
    expect(markdown).toContain("Unowned route method: GET /api/new");
  });
});
