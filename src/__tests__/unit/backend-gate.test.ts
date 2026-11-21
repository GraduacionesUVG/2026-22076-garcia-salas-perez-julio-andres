/* eslint-disable @typescript-eslint/no-require-imports */
export {};
const { executePhases } = require("../backend/gate.cjs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
describe("canonical gate orchestration", () => {
  it("standalone report exits nonzero even when genuine failure details quote READY", () => {
    const root = path.resolve(__dirname, "../..");
    const fixture = mkdtempSync(path.join(tmpdir(), "task13-blocked-report-"));
    try {
      mkdirSync(path.join(fixture, "scripts"));
      mkdirSync(path.join(fixture, "__tests__/backend"), { recursive: true });
      mkdirSync(path.join(fixture, "__tests__/reports"));
      cpSync(path.join(root, "scripts/backend-test-report.mjs"), path.join(fixture, "scripts/backend-test-report.mjs"));
      for (const file of ["gate.cjs", "run-lock.cjs", "run-manifest.cjs", "environment-guard.ts", "report.ts", "database-evidence.ts", "route-manifest.ts", "action-manifest.ts", "action-evidence.ts", "action-evidence-sources.ts"]) cpSync(path.join(root, "__tests__/backend", file), path.join(fixture, "__tests__/backend", file));
      symlinkSync(path.join(root, "node_modules"), path.join(fixture, "node_modules"), "dir");
      const context = { gitSha: "abc123", dirty: false, nodeVersion: "v20.0.0", migrationsHash: "a".repeat(64), environmentHash: "b".repeat(64) };
      writeFileSync(path.join(fixture, "__tests__/backend/run-context.cjs"), `module.exports={collectRunContext:()=>(${JSON.stringify(context)})};`);
      const startedAt = new Date(Date.now() - 1000).toISOString();
      const finishedAt = new Date(Date.now() + 1000).toISOString();
      writeFileSync(path.join(fixture, "__tests__/reports/backend-run-manifest.json"), JSON.stringify({ schemaVersion: 2, runId: "backend-fixture", context, startedAt, finishedAt, phases: { unit: { artifact: "__tests__/reports/jest-backend-unit.json", startedAt, finishedAt, exitCode: 1 } } }));
      writeFileSync(path.join(fixture, "__tests__/reports/jest-backend-unit.json"), JSON.stringify({ success: false, numTotalTests: 1, testResults: [{ name: "unit/readiness.test.ts", status: "failed", assertionResults: [{ title: "RED: readiness", status: "failed", failureMessages: ["expected Readiness: READY"] }] }] }));
      const child = spawnSync(process.execPath, ["scripts/backend-test-report.mjs", "report"], { cwd: fixture, env: { PATH: process.env.PATH ?? "" }, encoding: "utf8" });
      const report = readFileSync(path.join(fixture, "__tests__/reports/backend-robustness.md"), "utf8");
      expect(report).toContain("Readiness: BLOCKED");
      expect(report).toContain("expected Readiness: READY");
      expect(child.status).toBe(1);
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });
  it("loads real action/report dependencies and never selects optional performance specs", () => {
    const root = path.resolve(__dirname, "../..");
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", 'import { importTypeScript, integrationSpecs } from "./scripts/backend-test-report.mjs"; const actions=await importTypeScript("__tests__/backend/action-manifest.ts"); const report=await importTypeScript("__tests__/backend/report.ts"); console.log(JSON.stringify({actions:actions.actionManifest.length, report:typeof report.buildBackendTestReport, performance:integrationSpecs("__tests__/integration").some(file=>file.includes("/performance/"))}));'], { cwd: root, encoding: "utf8" });
    expect(child.status).toBe(0);
    const result = JSON.parse(child.stdout.trim());
    expect(result.actions).toBeGreaterThan(0);
    expect(result.report).toBe("function");
    expect(result.performance).toBe(false);
  });
  it("reaches cleanup and report after thrown child phases", async () => {
    const visited: string[] = [];
    const result = await executePhases([
      ["environment", () => { visited.push("environment"); return 0; }],
      ["unit", () => { visited.push("unit"); throw new Error("child failed"); }],
      ["cleanup-audit", () => { visited.push("cleanup-audit"); return 0; }],
      ["report", () => { visited.push("report"); return 0; }],
    ], () => undefined, () => undefined);
    expect(visited).toEqual(["environment", "unit", "cleanup-audit", "report"]);
    expect(result).toBe(1);
  });
  it("fails closed when a child returns missing status", async () => {
    expect(await executePhases([["unit", () => undefined]], () => undefined, () => undefined)).toBe(1);
  });
});
