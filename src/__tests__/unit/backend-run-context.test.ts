/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash } = require("node:crypto");
const { spawnSync, execFileSync } = require("node:child_process");
const { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const {
  collectRunContext,
  hashMigrationEntries,
} = require("../backend/run-context.cjs");

const appRoot = path.resolve(__dirname, "../..");

describe("backend run context", () => {
  it("keeps real generated gate outputs clean but rejects a tracked source edit", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "backend-output-context-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
    try {
      cpSync(path.join(appRoot, ".gitignore"), path.join(root, ".gitignore"));
      cpSync(path.join(appRoot, "tsconfig.json"), path.join(root, "tsconfig.json"));
      writeFileSync(path.join(root, "source.ts"), "export const value = 1;\n");
      git("init", "-q"); git("add", ".");
      git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture");
      const options = { migrationEntries: [], supabaseHost: "approved.example.test" };
      const before = collectRunContext(root, options);
      expect(before.dirty).toBe(false);
      for (const file of ["__tests__/reports/coverage/coverage-final.json", "__tests__/reports/playwright-output/backend/.last-run.json", ".next-backend-test/dev/types/routes.d.ts", ".next-backend-no-ai/cache/build.json"]) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), "generated\n");
      }
      writeFileSync(path.join(root, ".tsconfig.backend-test.json"), JSON.stringify({ extends: "./tsconfig.json" }));
      const { writeConfigurationDefaults } = require("next/dist/lib/typescript/writeConfigurationDefaults");
      const { writeAppTypeDeclarations } = require("next/dist/lib/typescript/writeAppTypeDeclarations");
      await writeConfigurationDefaults(require("typescript").version, path.join(root, ".tsconfig.backend-test.json"), false, true, ".next-backend-test", false, false);
      await writeAppTypeDeclarations({ baseDir: root, distDir: ".next-backend-test/dev", imageImportsEnabled: true, hasAppDir: true, hasPagesDir: false });
      expect(readFileSync(path.join(root, "tsconfig.json"), "utf8")).toBe(readFileSync(path.join(appRoot, "tsconfig.json"), "utf8"));
      expect(collectRunContext(root, options)).toEqual(before);
      writeFileSync(path.join(root, "source.ts"), "export const value = 2;\n");
      expect(collectRunContext(root, options).dirty).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("ignores only transient run locks without masking real changes", () => {
    const context = (status: string) => collectRunContext(appRoot, { command: (_: string, args: string[]) => args[0] === "status" ? status : "abc123", migrationEntries: [] });
    expect(context("?? src/.backend-mutating-run.lock\n?? src/.backend-mutating-run.lock.guard/\n").dirty).toBe(false);
    expect(context("?? src/.backend-mutating-run.lock\n M src/app.ts\n").dirty).toBe(true);
    expect(context(" M src/.backend-mutating-run.lock\n").dirty).toBe(true);
  });
  it("hashes migration entries in filename order", () => {
    const unordered = hashMigrationEntries([
      { path: "002.sql", content: "select 2;" },
      { path: "001.sql", content: "select 1;" },
    ]);

    expect(unordered).toBe(
      hashMigrationEntries([
        { path: "001.sql", content: "select 1;" },
        { path: "002.sql", content: "select 2;" },
      ])
    );
  });

  it("changes the migration hash for changed contents or filenames", () => {
    const baseline = hashMigrationEntries([{ path: "001.sql", content: "select 1;" }]);

    expect(hashMigrationEntries([{ path: "001.sql", content: "select 2;" }])).not.toBe(baseline);
    expect(hashMigrationEntries([{ path: "002.sql", content: "select 1;" }])).not.toBe(baseline);
  });

  it("uses the SHA-256 empty-input digest when there are no migration files", () => {
    expect(hashMigrationEntries([])).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("collects Git, Node, migration, and redacted environment identity", () => {
    const context = collectRunContext("/workspace/backend", {
      command(command: string, args: string[]) {
        if (command === "git" && args.join(" ") === "rev-parse HEAD") return "abc123\n";
        if (command === "git" && args.join(" ") === "status --porcelain") return " M file.ts\n";
        throw new Error("unexpected command");
      },
      migrationEntries: [{ path: "001.sql", content: "select 1;" }],
      nodeVersion: "v22.0.0",
      supabaseHost: "qa-ref.supabase.co",
    });

    expect(context).toEqual({
      gitSha: "abc123",
      dirty: true,
      nodeVersion: "v22.0.0",
      migrationsHash: hashMigrationEntries([{ path: "001.sql", content: "select 1;" }]),
      environmentHash: createHash("sha256").update("qa-ref.supabase.co").digest("hex"),
    });
    expect(JSON.stringify(context)).not.toContain("qa-ref.supabase.co");
  });

  it("uses a literal sentinel only when no approved host is supplied", () => {
    const context = collectRunContext("/workspace/backend", {
      command: () => "abc123\n",
      migrationEntries: [],
      nodeVersion: "v22.0.0",
    });

    expect(context.environmentHash).toBe("not-configured");
  });

  it("does not delete previous reports when the full gate lacks approved configuration", () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), "backend-report-preflight-"));
    const reportsDir = path.join(fixtureRoot, "__tests__", "reports");
    const reportPath = path.join(reportsDir, "backend-robustness.md");
    const lockPath = path.join(fixtureRoot, ".backend-mutating-run.lock");

    try {
      mkdirSync(path.join(fixtureRoot, "scripts"), { recursive: true });
      mkdirSync(path.join(fixtureRoot, "__tests__", "backend"), { recursive: true });
      mkdirSync(reportsDir, { recursive: true });
      cpSync(
        path.join(appRoot, "scripts", "backend-test-report.mjs"),
        path.join(fixtureRoot, "scripts", "backend-test-report.mjs")
      );
      for (const file of ["run-context.cjs", "run-lock.cjs", "run-manifest.cjs", "gate.cjs"]) {
        cpSync(
          path.join(appRoot, "__tests__", "backend", file),
          path.join(fixtureRoot, "__tests__", "backend", file)
        );
      }
      symlinkSync(path.join(appRoot, "node_modules"), path.join(fixtureRoot, "node_modules"), "dir");
      writeFileSync(
        path.join(fixtureRoot, "__tests__", "backend", "environment-guard.ts"),
        'export function assertSafeBackendEnvironment() { throw new Error("fixture host is not approved"); }\n',
        "utf8"
      );
      writeFileSync(reportPath, "previous local evidence\n", "utf8");

      const result = spawnSync(process.execPath, ["scripts/backend-test-report.mjs", "run-integration"], {
        cwd: fixtureRoot,
        env: { PATH: process.env.PATH ?? "" },
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "Backend report gate requires an approved Supabase host."
      );
      expect(readFileSync(reportPath, "utf8")).toBe("previous local evidence\n");
      expect(existsSync(lockPath)).toBe(false);
      expect(existsSync(`${lockPath}.guard`)).toBe(false);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
