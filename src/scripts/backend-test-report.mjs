import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const {
  artifactCoherence,
  createRunManifest,
  finishPhase,
  startPhase,
} = require("../__tests__/backend/run-manifest.cjs");
const { collectRunContext } = require("../__tests__/backend/run-context.cjs");
const { acquireRunLock } = require("../__tests__/backend/run-lock.cjs");
const { executePhases } = require("../__tests__/backend/gate.cjs");
const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const reportsDir = path.join(root, "__tests__", "reports");
const manifestPath = path.join(reportsDir, "backend-run-manifest.json");
const databaseEvidencePath = path.join(reportsDir, "database-evidence.json");

const resultFiles = {
  unit: "jest-backend-unit.json",
  integration: "playwright-backend-integration.json",
  "no-ai": "playwright-backend-no-ai.json",
  "backend-e2e": "playwright-backend-e2e.json",
  "cleanup-audit": "playwright-backend-cleanup-audit.json",
  "database-evidence": "database-evidence.json",
};

function outputPath(name) {
  mkdirSync(reportsDir, { recursive: true });
  return path.join(reportsDir, name);
}

function freshOutputPath(name) {
  const destination = outputPath(name);
  rmSync(destination, { force: true });
  return destination;
}

function resultRelative(label) {
  return `__tests__/reports/${resultFiles[label] ?? `${label}.json`}`;
}

function writeManifest(manifest) {
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function collectCurrentRunContext(requireApprovedHost = false) {
  let supabaseHost;
  try {
    const environmentModule = await importTypeScript("__tests__/backend/environment-guard.ts");
    supabaseHost = environmentModule.assertSafeBackendEnvironment(process.env).supabaseHost;
  } catch {
    if (requireApprovedHost) {
      throw new Error("Backend report gate requires an approved Supabase host.");
    }
  }
  return collectRunContext(root, { supabaseHost });
}

async function beginFreshRun(requireApprovedHost = false) {
  const context = await collectCurrentRunContext(requireApprovedHost);
  if (requireApprovedHost) validateQaIdentity();
  mkdirSync(reportsDir, { recursive: true });
  for (const file of [
    ...Object.values(resultFiles),
    "backend-robustness.md",
    path.basename(manifestPath),
  ]) {
    rmSync(path.join(reportsDir, file), { force: true });
  }
  const manifest = createRunManifest(
    new Date().toISOString(),
    undefined,
    context
  );
  writeManifest(manifest);
  return manifest;
}

function validateQaIdentity() {
  for (const name of ["TEST_OWNER_EMAIL", "TEST_EDITOR_EMAIL", "TEST_VIEWER_EMAIL", "TEST_INTRUDER_EMAIL"]) {
    if (!/^qa_backend_[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(process.env[name] ?? "")) throw new Error(`${name} must identify a fixed QA account`);
  }
  if (!process.env.TEST_USER_PASSWORD?.trim()) throw new Error("TEST_USER_PASSWORD is required");
  if (!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY)?.trim()) throw new Error("Supabase anon key is required");
}

function reportRunManifest(manifest) {
  if (!manifest || typeof manifest !== "object") return undefined;
  const phases =
    manifest.phases && typeof manifest.phases === "object"
      ? Object.entries(manifest.phases).map(([label, phase]) => {
          const values = phase && typeof phase === "object" ? phase : {};
          return {
            label,
            startedAt: values.startedAt,
            finishedAt: values.finishedAt,
            exitCode: values.exitCode,
          };
        })
      : [];
  return {
    runId: manifest.runId,
    startedAt: manifest.startedAt,
    finishedAt: manifest.finishedAt,
    context: manifest.context,
    phases,
  };
}

function readManifest() {
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

function runNode(modulePath, args, env = process.env) {
  const result = spawnSync(process.execPath, [modulePath, ...args], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

function runJest(target, args) {
  return runNode(require.resolve("jest/bin/jest"), [
    "--config",
    "jest.backend.config.cjs",
    ...args,
    "--json",
    `--outputFile=${freshOutputPath(target)}`,
  ]);
}

function runDatabaseEvidence() {
  return runNode(
    path.join(root, "scripts", "backend-database-evidence.mjs"),
    [],
    {
      ...process.env,
      BACKEND_DATABASE_EVIDENCE_OUTPUT: databaseEvidencePath,
    }
  );
}

function integrationSpecs(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!["ai", "performance"].includes(entry.name)) files.push(...integrationSpecs(absolute));
    } else if (entry.isFile() && entry.name.endsWith(".spec.ts")) {
      const relative = path.relative(root, absolute).replaceAll("\\", "/");
      if (
        // Superseded by fixed-QA contracts; legacy api.* specs create permanent random users.
        !relative.startsWith("__tests__/integration/api.") &&
        relative !== "__tests__/integration/auth/qa-accounts.spec.ts" &&
        relative !== "__tests__/integration/exports/project-exports.spec.ts"
      ) {
        files.push(relative);
      }
    }
  }
  return files.sort();
}

function runPlaywright(target, args, options = {}) {
  const selectedArgs = options.ordinaryIntegration
    ? integrationSpecs(path.join(root, "__tests__", "integration"))
    : args;
  if (selectedArgs.length === 0) {
    console.error("No Playwright specs were selected.");
    return 1;
  }
  return runNode(
    require.resolve("@playwright/test/cli"),
    [
      "test",
      ...selectedArgs,
      ...(options.ordinary
        ? ["--config=playwright.backend.config.ts", "--project=backend", "--workers=1"]
        : []),
      "--reporter=line,./__tests__/backend/safe-playwright-json.cjs",
    ],
    {
      ...process.env,
      PLAYWRIGHT_JSON_OUTPUT_NAME: freshOutputPath(target),
    }
  );
}

async function importTypeScript(relativePath) {
  const absolute = path.join(root, relativePath);
  const source = readFileSync(absolute, "utf8");
  let transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      sourceMap: false,
    },
    fileName: absolute,
  }).outputText;
  for (const match of [...transpiled.matchAll(/from "(\.\/[^".]+(?:-[^".]+)*)"/g)]) {
    const dependency = path.join(path.dirname(relativePath), `${match[1]}.ts`);
    const dependencySource = ts.transpileModule(readFileSync(path.join(root, dependency), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
    transpiled = transpiled.replace(match[0], `from "data:text/javascript;base64,${Buffer.from(dependencySource).toString("base64")}"`);
  }
  const sourceUrl = pathToFileURL(absolute).href;
  const encoded = Buffer.from(`${transpiled}\n//# sourceURL=${sourceUrl}`).toString(
    "base64"
  );
  return import(`data:text/javascript;base64,${encoded}`);
}

function readArtifact(label, framework, parser, manifest, expectedContext) {
  const relative = resultRelative(label);
  const absolute = path.join(root, relative);
  const base = { label, path: relative, framework, state: "present", tests: [] };
  if (!existsSync(absolute)) {
    return {
      ...base,
      state: "missing",
      diagnostic: "Result file was not found; this run is not claimed.",
    };
  }
  const coherence = artifactCoherence(
    manifest,
    label,
    relative,
    statSync(absolute).mtimeMs,
    expectedContext
  );
  if (!coherence.coherent) {
    return {
      ...base,
      state: "invalid",
      diagnostic: coherence.diagnostic,
    };
  }
  try {
    return parser(JSON.parse(readFileSync(absolute, "utf8")), base);
  } catch (error) {
    return {
      ...base,
      state: "invalid",
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}

function routeGate(unitArtifact) {
  if (unitArtifact.state !== "present") return "not-run";
  const assertions = unitArtifact.tests.filter(
    (test) =>
      test.file.replaceAll("\\", "/").endsWith(
        "/__tests__/unit/backend-route-manifest.test.ts"
      ) && test.title.includes("repository route manifest")
  );
  if (assertions.some((test) => test.outcome !== "pass")) return "failed";
  return assertions.length >= 2 ? "passed" : "not-run";
}

function routeSummary(routeManifest, unitArtifact) {
  const routeFiles = new Set();
  const issues = [];
  let methodCount = 0;
  let coveredMethodCount = 0;
  let excludedMethodCount = 0;

  for (const contract of routeManifest) {
    routeFiles.add(contract.file);
    methodCount += contract.methods.length;
    if (contract.spec) {
      coveredMethodCount += contract.methods.length;
      if (!existsSync(path.join(root, contract.spec))) {
        issues.push(`Missing declared spec: ${contract.spec}`);
      }
    } else {
      excludedMethodCount += contract.methods.length;
    }
  }

  const gate = routeGate(unitArtifact);
  if (gate === "not-run") {
    issues.push("The repository route-manifest gate has no recorded passing result.");
  }
  return {
    routeFileCount: routeFiles.size,
    methodCount,
    coveredMethodCount,
    excludedMethodCount,
    gate,
    issues,
  };
}

function noAiGuardConfigured() {
  const configPath = path.join(root, "playwright.backend-no-ai.config.ts");
  const preloadPath = path.join(root, "__tests__", "backend", "no-external-network.cjs");
  const serverPath = path.join(root, "__tests__", "backend", "start-no-ai-server.cjs");
  if (![configPath, preloadPath, serverPath].every(existsSync)) return false;
  const config = readFileSync(configPath, "utf8");
  const preload = readFileSync(preloadPath, "utf8");
  const server = readFileSync(serverPath, "utf8");
  return (
    /AI_GATEWAY_API_KEY:\s*""/.test(config) &&
    /workers:\s*1/.test(config) &&
    config.includes("BACKEND_NO_EXTERNAL_NETWORK") &&
    preload.includes("Outbound network blocked by test guard") &&
    server.includes("no-external-network.cjs")
  );
}

function readDatabaseEvidence(
  databaseModule,
  expectedMigrationsHash,
  manifest,
  expectedContext
) {
  if (!existsSync(databaseEvidencePath)) {
    return {
      state: "not-demonstrated",
      issues: ["Database evidence result was not found."],
    };
  }
  const coherence = artifactCoherence(
    manifest,
    "database-evidence",
    resultRelative("database-evidence"),
    statSync(databaseEvidencePath).mtimeMs,
    expectedContext
  );
  if (!coherence.coherent) {
    return { state: "invalid", issues: [coherence.diagnostic] };
  }
  try {
    const evidence = JSON.parse(readFileSync(databaseEvidencePath, "utf8"));
    const validation = databaseModule.validateDatabaseEvidence(
      evidence,
      expectedMigrationsHash
    );
    if (validation.state !== "present") return validation;
    const approvedHost = process.env.TEST_ALLOWED_SUPABASE_HOST;
    const approvedDatabase = process.env.TEST_ALLOWED_DATABASE_NAME ?? "postgres";
    if (!approvedHost) {
      return {
        state: "invalid",
        issues: ["Approved database target is not configured for report validation."],
      };
    }
    return databaseModule.validateDatabaseEvidenceTarget(
      evidence,
      databaseModule.databaseTargetHash(approvedHost, approvedDatabase),
      approvedDatabase
    );
  } catch {
    return {
      state: "invalid",
      issues: ["Database evidence result is not valid JSON."],
    };
  }
}

async function generateReport(requireApprovedHost = false, reportInProgress = false) {
  const reportModule = await importTypeScript("__tests__/backend/report.ts");
  const databaseModule = await importTypeScript(
    "__tests__/backend/database-evidence.ts"
  );
  const manifestModule = await importTypeScript(
    "__tests__/backend/route-manifest.ts"
  );
  const actionModule = await importTypeScript("__tests__/backend/action-manifest.ts");
  const manifest = readManifest();
  const expectedContext = await collectCurrentRunContext(requireApprovedHost);
  const artifacts = [
    readArtifact("unit", "jest", reportModule.parseJestReport, manifest, expectedContext),
    readArtifact("integration", "playwright", reportModule.parsePlaywrightReport, manifest, expectedContext),
    readArtifact("no-ai", "playwright", reportModule.parsePlaywrightReport, manifest, expectedContext),
    readArtifact("backend-e2e", "playwright", reportModule.parsePlaywrightReport, manifest, expectedContext),
    readArtifact("cleanup-audit", "playwright", reportModule.parsePlaywrightReport, manifest, expectedContext),
  ];
  const report = reportModule.buildBackendTestReportResult({
    reportInProgress,
    actionRequirements: actionModule.actionManifest,
    generatedAt: new Date().toISOString(),
    runManifest: reportRunManifest(manifest),
    artifacts,
    routeCoverage: routeSummary(manifestModule.routeManifest, artifacts[0]),
    noAiGuardConfigured: noAiGuardConfigured(),
    databaseEvidence: readDatabaseEvidence(
      databaseModule,
      expectedContext.migrationsHash,
      manifest,
      expectedContext
    ),
    commands: [
      "npm run test:backend:unit",
      "npm run test:backend:integration",
      "npm run test:backend:no-ai",
      "npm run test:backend:e2e",
      "npm run test:backend:all",
      "npm run test:backend:report",
      "node scripts/backend-test-report.mjs run-database-evidence",
    ],
    limitations: [
      "Only JSON artifacts present at generation time are summarized; absent artifacts are not treated as passing runs.",
      "Product RED is marker-based (`RED:`, `PRODUCT GAP:`, or `@product-red`); unmarked assertion failures are reported as defects.",
      "Route totals describe manifest ownership and static declaration coverage, not executed behavioral coverage.",
      "Legacy `__tests__/integration/api.*.spec.ts` files are excluded because they create permanent random users and are superseded by fixed-QA contract specs.",
      "Shared-database timings include local server, network, and database latency and are not deterministic benchmarks.",
    ],
  });
  const destination = outputPath("backend-robustness.md");
  writeFileSync(destination, report.markdown, "utf8");
  console.log(path.relative(root, destination).replaceAll("\\", "/"));
  return report.exitCode;
}

async function runPhases(phases, { requireApprovedHost = false, canonical = false } = {}) {
  let manifest = await beginFreshRun(requireApprovedHost);
  const exitCode = await executePhases(phases, label => {
    console.log(`\n=== backend ${label} ===`);
    manifest = startPhase(manifest, label, resultRelative(label));
    writeManifest(manifest);
  }, (label, phaseCode) => {
    manifest = finishPhase(manifest, label, phaseCode);
    writeManifest(manifest);
  });

  manifest = { ...manifest, finishedAt: new Date().toISOString() };
  writeManifest(manifest);
  manifest = startPhase(manifest, "report", "__tests__/reports/backend-robustness.md");
  manifest = { ...manifest, finishedAt: new Date().toISOString() };
  writeManifest(manifest);
  let reportCode = 1;
  try { reportCode = await generateReport(requireApprovedHost, true); }
  finally {
    manifest = finishPhase(manifest, "report", reportCode);
    manifest = { ...manifest, finishedAt: new Date().toISOString() };
    writeManifest(manifest);
  }
  await generateReport(requireApprovedHost);
  return exitCode || (canonical ? reportCode : 0);
}

async function main() {
  const [mode = "report", ...args] = process.argv.slice(2);
  if (mode === "report") {
    return generateReport();
  }
  if (mode === "run-jest") {
    return runPhases([["unit", () => runJest(resultFiles.unit, args)]]);
  }
  if (mode === "run-integration") {
    const lock = acquireRunLock(root);
    try {
      return await runPhases([["integration", () => runPlaywright(resultFiles.integration, [], {
        ordinaryIntegration: true,
        ordinary: true,
      })]], { requireApprovedHost: true });
    } finally {
      lock.release();
    }
  }
  if (mode === "run-database-evidence") {
    return runPhases([["database-evidence", () => runDatabaseEvidence()]]);
  }
  if (mode === "run-no-ai") {
    const lock = acquireRunLock(root);
    try {
      return await runPhases([["no-ai", () => runPlaywright(resultFiles["no-ai"], [
        "__tests__/integration/ai",
        "__tests__/integration/exports/project-exports.spec.ts",
        "--config=playwright.backend-no-ai.config.ts",
        "--workers=1",
      ])]], { requireApprovedHost: true });
    } finally {
      lock.release();
    }
  }
  if (mode === "run-backend-e2e") {
    const lock = acquireRunLock(root);
    try {
      return await runPhases([["backend-e2e", () => runPlaywright(resultFiles["backend-e2e"], [
        "__tests__/e2e/backend/backend-lifecycle.spec.ts",
        "__tests__/e2e/backend/research-workflow-lifecycle.spec.ts",
        "__tests__/e2e/backend/corpus-analysis-lifecycle.spec.ts",
        "__tests__/e2e/backend/collaboration-report-lifecycle.spec.ts",
      ], { ordinary: true })]], { requireApprovedHost: true });
    } finally {
      lock.release();
    }
  }
  if (mode === "run-all" || mode === "run-gate") {
    const phases = [
      ["environment", () => { validateQaIdentity(); return 0; }],
      ["unit", () => runJest(resultFiles.unit, ["--runInBand", "--coverage"])],
      ["database-evidence", () => runDatabaseEvidence()],
      [
        "integration",
        () =>
          runPlaywright(resultFiles.integration, [], {
            ordinaryIntegration: true,
            ordinary: true,
          }),
      ],
      [
        "no-ai",
        () =>
          runPlaywright(resultFiles["no-ai"], [
            "__tests__/integration/ai",
            "__tests__/integration/exports/project-exports.spec.ts",
            "--config=playwright.backend-no-ai.config.ts",
            "--workers=1",
          ]),
      ],
      [
        "backend-e2e",
        () =>
          runPlaywright(
            resultFiles["backend-e2e"],
            [
              "__tests__/e2e/backend/backend-lifecycle.spec.ts",
              "__tests__/e2e/backend/research-workflow-lifecycle.spec.ts",
              "__tests__/e2e/backend/corpus-analysis-lifecycle.spec.ts",
              "__tests__/e2e/backend/collaboration-report-lifecycle.spec.ts",
            ],
            { ordinary: true }
          ),
      ],
      [
        "cleanup-audit",
        () =>
          runPlaywright(
            resultFiles["cleanup-audit"],
            ["__tests__/e2e/backend/zz-cleanup-audit.spec.ts"],
            { ordinary: true }
          ),
      ],
    ];
    const lock = acquireRunLock(root);
    try {
      return await runPhases(phases, { requireApprovedHost: true, canonical: true });
    } finally {
      lock.release();
    }
  }
  console.error(`Unknown mode: ${mode}`);
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) process.exitCode = await main();
export { importTypeScript, integrationSpecs };
