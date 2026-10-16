/**
 * Latency statistics for the load-test harness. Pure functions, no runtime
 * imports, so they are unit-testable under plain `deno test`.
 */

export interface LatencySummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

/** Nearest-rank percentile over an already-sorted array (mutates nothing). */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new Error("percentile of empty sample");
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const idx = Math.max(0, Math.min(sorted.length - 1, rank));
  return sorted[idx];
}

/** Aggregate a raw latency sample into the summary the report prints. */
export function summarize(values: number[]): LatencySummary {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, n) => acc + n, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}
