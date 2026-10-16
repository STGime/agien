/** Pure feature math — no DOM, no runtime deps, unit-testable in isolation. */

export interface Point {
  x: number;
  y: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Sum of euclidean segment lengths along a pointer path. */
export function pointerPathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Ratio of straight-line displacement to actual path length, in [0, 1].
 * 1.0 = perfectly straight; a path that loops back to its origin is ~0.
 */
export function pointerStraightness(points: Point[]): number {
  if (points.length < 2) return 1;
  const path = pointerPathLength(points);
  if (path === 0) return 1;
  const net = distance(points[0], points[points.length - 1]);
  return Math.min(1, Math.max(0, net / path));
}

/** Sample standard deviation; 0 for fewer than two values. */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Standard deviation of consecutive intervals (e.g. keystroke timing). */
export function intervalStd(timestamps: number[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    gaps.push(timestamps[i] - timestamps[i - 1]);
  }
  return stdDev(gaps);
}
