import { summarizeLatencies, shouldAbortPerformanceRun } from "@/__tests__/backend/performance-metrics";

describe("bounded performance metrics", () => {
  it("uses nearest-rank percentiles without mutating input", () => {
    const values = [50, 10, 40, 20, 30];
    expect(summarizeLatencies(values)).toEqual({ p50: 30, p95: 50, p99: 50 });
    expect(values).toEqual([50, 10, 40, 20, 30]);
  });
  it("does not invent evidence from empty samples", () => {
    expect(() => summarizeLatencies([])).toThrow("No latency samples");
    expect(shouldAbortPerformanceRun([])).toBe(false);
  });
  it("summarizes a single sample", () => {
    expect(summarizeLatencies([7])).toEqual({ p50: 7, p95: 7, p99: 7 });
  });
  it.each([500, 503, 599, 0])("aborts unsafe status %i", status => {
    expect(shouldAbortPerformanceRun([{ status, latencyMs: 20 }])).toBe(true);
  });
  it("aborts above ten seconds but not at the boundary or on 429 alone", () => {
    expect(shouldAbortPerformanceRun([{ status: 200, latencyMs: 10_001 }])).toBe(true);
    expect(shouldAbortPerformanceRun([{ status: 429, latencyMs: 10_000 }])).toBe(false);
    expect(shouldAbortPerformanceRun([{ status: 429, latencyMs: 1 }, { status: 500, latencyMs: 2 }])).toBe(true);
  });
  it.each([NaN, Infinity, -1])("rejects invalid latency %s", latencyMs => {
    expect(() => summarizeLatencies([latencyMs])).toThrow();
    expect(shouldAbortPerformanceRun([{ status: 200, latencyMs }])).toBe(true);
  });
});
