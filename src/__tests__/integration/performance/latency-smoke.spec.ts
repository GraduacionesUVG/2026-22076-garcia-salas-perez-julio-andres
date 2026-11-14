import { expect, test } from "@playwright/test";
import { closeQaSessions, createQaSessions, type QaSessions } from "@/__tests__/backend/sessions";
import { createQaProjectFixture, type QaProjectFixture } from "@/__tests__/backend/project-fixture";
import { summarizeLatencies, shouldAbortPerformanceRun, type PerformanceSample } from "@/__tests__/backend/performance-metrics";

export const BACKEND_ROUTE_COVERAGE = [] as const;
let sessions: QaSessions | undefined;
let fixture: QaProjectFixture | undefined;

test.describe.serial("Bounded observational backend performance", () => {
  test.skip(process.env.RUN_PERFORMANCE_TESTS !== "1" || !process.env.TEST_ALLOWED_SUPABASE_HOST,
    "Opt-in requires RUN_PERFORMANCE_TESTS=1 and TEST_ALLOWED_SUPABASE_HOST; shared-instance idle approval is required before launch.");
  test.setTimeout(600_000);
  test.beforeAll(async () => {
    sessions = await createQaSessions();
    fixture = await createQaProjectFixture(sessions);
  });
  test.afterAll(async () => {
    try { if (fixture) await fixture.cleanup(); }
    finally { if (sessions) await closeQaSessions(sessions); fixture = undefined; sessions = undefined; }
  });
  test("records five repetitions at concurrency 1, 3, and 5", async () => {
    const root = `/api/projects/${fixture!.project.id}`;
    let abort = false;
    for (const suffix of ["workflow", "analysis/dashboard", "analysis/codes?limit=100", "analysis/memos?limit=100", "analysis/overview"]) {
      const path = `${root}/${suffix}`;
      for (const concurrency of [1, 3, 5]) {
        const samples: PerformanceSample[] = [];
        let rateLimited = false;
        for (let repetition = 0; repetition < 5 && !abort && !rateLimited; repetition++) {
          // Only already in-flight siblings may finish after the first unsafe signal.
          await Promise.all(Array.from({ length: concurrency }, async () => {
            if (abort || rateLimited) return;
            const started = performance.now();
            let status = 0;
            try {
              const response = await sessions!.viewer.request.get(path, { timeout: 10_000 });
              status = response.status();
              await response.dispose();
            } catch { /* status 0 records connection/timeout failure without credential leakage */ }
            const sample = { status, latencyMs: performance.now() - started };
            samples.push(sample);
            abort ||= shouldAbortPerformanceRun([sample]);
            rateLimited ||= status === 429;
          }));
        }
        if (samples.length) console.info(`BACKEND PERFORMANCE: ${JSON.stringify({
          path, concurrency, samples: samples.length,
          ...summarizeLatencies(samples.map(sample => sample.latencyMs)),
          errors: samples.filter(sample => sample.status !== 200).length,
          timeouts: samples.filter(sample => sample.status === 0 || sample.latencyMs > 10_000).length,
          rateLimited: samples.filter(sample => sample.status === 429).length,
        })}`);
        expect(abort, "Performance aborted: unsafe response, connection failure, or >10 seconds").toBe(false);
        expect(samples.every(sample => sample.status === 200), "Non-200 response; no higher load is safe").toBe(true);
      }
    }
  });
});
