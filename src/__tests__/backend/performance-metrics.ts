export interface PerformanceSample { status: number; latencyMs: number }
export function summarizeLatencies(values: readonly number[]): { p50: number; p95: number; p99: number } {
  if (!values.length) throw new Error("No latency samples");
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error("Invalid latency sample");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (fraction: number) => sorted[Math.ceil(sorted.length * fraction) - 1];
  return { p50: rank(0.5), p95: rank(0.95), p99: rank(0.99) };
}
export function shouldAbortPerformanceRun(samples: readonly PerformanceSample[]): boolean {
  return samples.some(sample => sample.status === 0 || sample.status >= 500 ||
    !Number.isFinite(sample.latencyMs) || sample.latencyMs < 0 || sample.latencyMs > 10_000);
}
