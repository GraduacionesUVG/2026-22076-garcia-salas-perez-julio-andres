/* eslint-disable @typescript-eslint/no-require-imports */
export {};
const { safeEvidence } = require("../backend/safe-evidence.cjs");
const { mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const path = require("node:path");

describe("raw evidence publication boundary", () => {
  it.each([
    ["quotes and backslashes", 'synthetic-quoted-"value\\tail'],
    ["multiline diff prefixes", "synthetic-multiline-first\nsecond\nthird"],
    ["control escapes", "synthetic-controls-\b\f\v\x01\x7f\n-end"],
    ["mixed escaping and whitespace", 'synthetic-mixed-"\\\b\f\v\t\r\n\x01-end'],
    ["ANSI sequences in a value", "synthetic-ansi-\x1b[31mvalue\x1b[0m-end"],
  ])("redacts installed Jest %s diagnostics without losing evidence", (_name, secret) => {
    const env = { TEST_USER_PASSWORD: secret };
    const diagnostics: string[] = [];
    try { expect({ secret }).toEqual({ secret: "unrelated" }); }
    catch (error) { diagnostics.push((error as Error).message); }
    try { expect(secret).toBe("unrelated"); }
    catch (error) { diagnostics.push((error as Error).message); }
    expect(diagnostics).toHaveLength(2);
    const raw = {
      success: false, numFailedTests: 1, startTime: 123, duration: 17,
      config: { rootDir: "/repo", testPath: "/repo/password/route.test.ts" },
      coverageMap: { "/repo/app/api/auth/password/route.ts": { s: { "0": 1 } } },
      testResults: [{ status: "failed", startTime: 123, endTime: 140,
        assertionResults: [{ status: "failed", duration: 17, failureMessages: diagnostics }] }],
    };
    const safe = safeEvidence(raw, env);
    for (const diagnostic of safe.testResults[0].assertionResults[0].failureMessages) {
      // These unique prefixes exist only inside the synthetic credential. Checking
      // them also catches a partially recoverable escaped or ANSI-stripped value.
      expect(diagnostic).not.toContain("synthetic-");
      expect(diagnostic).toContain("[REDACTED]");
      expect(diagnostic).toContain("unrelated");
    }
    expect(safe).toMatchObject({ success: false, numFailedTests: 1, startTime: 123, duration: 17 });
    expect(safe.config).toEqual(raw.config);
    expect(safe.coverageMap).toEqual(raw.coverageMap);
    expect(safe.testResults[0]).toMatchObject({ status: "failed", startTime: 123, endTime: 140,
      assertionResults: [{ status: "failed", duration: 17 }] });
    expect(env.TEST_USER_PASSWORD).toBe(secret);
    expect(raw.testResults[0].assertionResults[0].failureMessages).toEqual(diagnostics);
  });

  it("redacts a value interrupted by ANSI diagnostic highlighting", () => {
    const secret = "synthetic-highlighted-value";
    let diagnostic = "";
    try { expect(secret).toBe("unrelated"); }
    catch (error) { diagnostic = (error as Error).message; }
    const highlighted = diagnostic.replace(secret, [...secret].join("\x1b[31m\x1b[0m"));
    const safe = safeEvidence({ failureMessages: [highlighted] }, { TEST_USER_PASSWORD: secret });
    expect(safe.failureMessages[0].replace(/\x1b\[[0-9;]*m/gu, "")).not.toContain(secret);
    expect(safe.failureMessages[0]).toContain("[REDACTED]");
  });

  it.each([
    'synthetic-jest-first-write-"\\tail',
    'synthetic-jest-first-write-first\nsecond\b\f\v\x01\x7f-end',
    'failed',
  ])("writes installed Jest nested JSON safely on its first write %#", (secret) => {
    const directory = mkdtempSync(path.join(tmpdir(), "safe-jest-json-"));
    try {
      const outputFile = path.join(directory, "result.json");
      writeFileSync(path.join(directory, "diagnostic.test.js"), `test("intentional synthetic failure", () => {
        expect(process.env.TEST_USER_PASSWORD).toBe(${JSON.stringify(secret)});
        expect({ response: JSON.stringify({ credential: process.env.TEST_USER_PASSWORD }) }).toEqual({ response: "unrelated" });
      });`);
      // Capture exactly the bytes supplied to the first output write. A later
      // sanitizer cannot repair this independent publication observation.
      writeFileSync(path.join(directory, 'first-write.cjs'), `const fs = require('node:fs');
        const original = fs.writeFileSync;
        fs.writeFileSync = function(file, data, ...args) {
          if (file === ${JSON.stringify(outputFile)} && process.env.TEST_USER_PASSWORD !== ${JSON.stringify(secret)})
            throw new Error('Reporter changed the runtime credential');
          if (file === ${JSON.stringify(outputFile)} && !fs.existsSync(file + '.first'))
            original.call(this, file + '.first', data, ...args);
          return original.call(this, file, data, ...args);
        };`);
      const config = { rootDir: directory, testMatch: ["**/*.test.js"], testEnvironment: "node",
        testResultsProcessor: path.resolve(__dirname, "../backend/safe-jest-results.cjs") };
      // Synchronous, bounded child; its handle/PID completes before cleanup. Use
      // only synthetic env values, never inherit the caller's credentials.
      const run = spawnSync(process.execPath, ['--require', path.join(directory, 'first-write.cjs'), require.resolve("jest/bin/jest"),
        "--config", JSON.stringify(config), "--runInBand", "--json", "--outputFile", outputFile],
      { env: { NODE_ENV: "test", TEST_USER_PASSWORD: secret }, encoding: "utf8", timeout: 15000 });
      expect(run.error).toBeUndefined();
      expect(run.signal).toBeNull();
      expect(run.status).toBe(1);
      expect(() => process.kill(run.pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
      console.info(`Synthetic Jest child PID ${run.pid} exited; no service started.`);
      const raw = readFileSync(outputFile, "utf8");
      expect(readFileSync(outputFile + '.first', 'utf8')).toBe(raw);
      expect(raw).not.toContain("synthetic-jest-first-write-");
      const written = JSON.parse(raw);
      expect(written.success).toBe(false);
      expect(written.numFailedTests).toBe(1);
      expect(written.testResults[0].status).toBe('failed');
      expect(written.testResults[0].name).toBe(realpathSync(path.join(directory, 'diagnostic.test.js')));
      expect(written.testResults[0].startTime).toEqual(expect.any(Number));
      expect(written.testResults[0].endTime).toEqual(expect.any(Number));
      expect(written.testResults[0].assertionResults[0]).toMatchObject({ status: "failed", duration: expect.any(Number) });
      for (const diagnostic of [written.testResults[0].message, ...written.testResults[0].assertionResults[0].failureMessages]) {
        expect(diagnostic).toContain('[REDACTED]');
        expect(diagnostic).not.toContain(secret === 'failed' ? 'failed' : 'synthetic-jest-first-write-');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(["synthetic-reporter-secret", 'synthetic-reporter-"\\\b\n-end', 'failed'])
  ("writes the installed Playwright JSON schema safely on its first write %#", async (secret) => {
    const SafeReporter = require("../backend/safe-playwright-json.cjs");
    const directory = mkdtempSync(path.join(tmpdir(), "safe-playwright-json-"));
    const original = process.env;
    const fsPromises = require('node:fs').promises;
    const write = fsPromises.writeFile;
    const publications: string[] = [];
    const writeSpy = jest.spyOn(fsPromises, 'writeFile').mockImplementation((...args: unknown[]) => {
      if (args[0] === path.join(directory, 'result.json')) publications.push(String(args[1]));
      return write(...args);
    });
    try {
      process.env = { NODE_ENV: "test", TEST_USER_PASSWORD: secret };
      const outputFile = path.join(directory, "result.json");
      const reporter = new SafeReporter({ outputFile });
      const runtimeConfig = { rootDir: directory, projects: [], webServer: { env: { TEST_USER_PASSWORD: secret } } };
      reporter.onConfigure(runtimeConfig);
      const result = { status: 'failed', duration: 17, errors: [], stdout: [], stderr: [], steps: [], attachments: [], startTime: new Date('2026-10-04T00:00:00Z'), retry: 0 };
      const test = { title: 'intentional synthetic failure', id: 'stable-id', location: { file: path.join(directory, 'fixture.spec.ts'), line: 1, column: 1 }, tags: [], annotations: [], timeout: 1000, expectedStatus: 'passed', results: [result], ok: () => false, outcome: () => 'unexpected' };
      const suite = { title: 'fixture', location: test.location, tests: [test], suites: [], allTests: () => [test] };
      reporter.onBegin({ suites: [{ project: () => ({ name: 'local' }), suites: [suite] }], allTests: () => [test] });
      reporter.onError({ message: `Worker failed with ${secret}` });
      let diagnostic = "";
      try { expect({ response: JSON.stringify({ credential: secret }) }).toEqual({ response: "unrelated" }); }
      catch (error) { diagnostic = (error as Error).message; }
      reporter.onError({ message: diagnostic });
      await reporter.onEnd({ status: "failed", startTime: new Date("2026-10-04T00:00:00Z"), duration: 5 });
      const raw = readFileSync(outputFile, "utf8");
      expect(publications).toEqual([raw]);
      expect(raw).not.toContain("synthetic-reporter-");
      const written = JSON.parse(raw);
      expect(written.errors[0]).toEqual({ message: secret === 'failed' ? "Worker [REDACTED] with [REDACTED]" : "Worker failed with [REDACTED]" });
      expect(written.errors[1].message).toContain("[REDACTED]");
      expect(written.errors[1].message).not.toContain(secret === 'failed' ? 'failed' : 'synthetic-reporter-');
      expect(written.suites[0].specs[0]).toMatchObject({ id: 'stable-id', tests: [{ status: 'unexpected', expectedStatus: 'passed', results: [{ status: 'failed', duration: 17 }] }] });
      expect(written.stats.startTime).toBe("2026-10-04T00:00:00.000Z");
      expect(written.stats.duration).toBe(5);
      expect(runtimeConfig.webServer.env.TEST_USER_PASSWORD).toBe(secret);
      expect(process.env.TEST_USER_PASSWORD).toBe(secret);
    } finally {
      writeSpy.mockRestore();
      process.env = original;
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('preserves only validated status enums at actual reporter paths', () => {
    const raw = {
      config: { status: 'failed' }, errors: [{ status: 'failed' }],
      testResults: [{ status: 'failed', assertionResults: [{ status: 'failed', failureDetails: [{ status: 'failed' }] }] }],
      suites: [{ suites: [{ specs: [{ tests: [{ status: 'unexpected', expectedStatus: 'passed', results: [{ status: 'failed', error: { status: 'failed' } }] }] }] }] }],
    };
    const safe = safeEvidence(raw, { TEST_USER_PASSWORD: 'failed', TEST_SECRET: 'unexpected', TEST_TOKEN: 'passed' });
    expect(safe.config.status).toBe('[REDACTED]');
    expect(safe.errors[0].status).toBe('[REDACTED]');
    expect(safe.testResults[0].status).toBe('failed');
    expect(safe.testResults[0].assertionResults[0]).toEqual({ status: 'failed', failureDetails: [{ status: '[REDACTED]' }] });
    expect(safe.suites[0].suites[0].specs[0].tests[0]).toEqual({ status: 'unexpected', expectedStatus: 'passed', results: [{ status: 'failed', error: { status: '[REDACTED]' } }] });
    expect(safeEvidence({ testResults: [{ status: 'not-an-enum' }] }, { TEST_TOKEN: 'not-an-enum' }).testResults[0].status).toBe('[REDACTED]');
  });
  it("preserves coverage-map JSON semantics and password route coverage", () => {
    const coverageMap = { data: {}, toJSON: () => ({ "/repo/app/api/auth/password/route.ts": { s: { "0": 1 } } }) };
    expect(safeEvidence({ coverageMap }, {})).toEqual({ coverageMap: { "/repo/app/api/auth/password/route.ts": { s: { "0": 1 } } } });
  });
  it("redacts credential keys but preserves pathname keys and benign runtime metadata", () => {
    expect(safeEvidence({
      config: { rootDir: "/repo/password", runtime: "node", env: { TEST_USER_PASSWORD: "unlisted-secret" } },
      "/repo/app/api/auth/password/route.ts": { status: "failed", duration: 12 },
    }, {})).toEqual({
      config: { rootDir: "/repo/password", runtime: "node", env: { TEST_USER_PASSWORD: "[REDACTED]" } },
      "/repo/app/api/auth/password/route.ts": { status: "failed", duration: 12 },
    });
  });
  it("redacts nested Playwright configuration and Jest diagnostics without changing failures or runtime credentials", () => {
    const env = { TEST_USER_PASSWORD: "synthetic-password-only", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon-only", TEST_OWNER_EMAIL: "qa_backend_owner@synthetic.test", NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co" };
    let diagnostic = "";
    try { expect({ env }).toEqual({ env: {} }); } catch (error) { diagnostic = (error as Error).message; }
    const raw = { config: { webServer: { env } }, success: false, numFailedTests: 1,
      testResults: [{ status: "failed", assertionResults: [{ title: "known failure", status: "failed", failureMessages: [diagnostic] }] }],
      suites: [{ specs: [{ tests: [{ status: "unexpected", results: [{ status: "failed", errors: [{ message: `request used ${env.TEST_USER_PASSWORD}` }] }] }] }] }],
    };
    const safe = safeEvidence(raw, env);
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain("synthetic-password-only");
    expect(serialized).not.toContain("synthetic-anon-only");
    expect(serialized).not.toContain("qa_backend_owner@synthetic.test");
    expect(serialized).not.toContain("https://synthetic.supabase.co");
    expect(safe.success).toBe(false);
    expect(safe.numFailedTests).toBe(1);
    expect(safe.testResults[0].assertionResults[0].status).toBe("failed");
    expect(safe.suites[0].specs[0].tests[0].results[0].status).toBe("failed");
    expect(raw.config.webServer.env.TEST_USER_PASSWORD).toBe("synthetic-password-only");
  });
});
