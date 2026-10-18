/** Pure feature math shared by the TS extraction layer. Mirrors
 * packages/beacon/src/features.ts so both languages compute identically. */

export interface Point {
  x: number;
  y: number;
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Sample standard deviation; 0 for fewer than two values. */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
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

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointerPathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

/** 1.0 straight; a path looping back to its origin is ~0. */
export function pointerStraightness(points: Point[]): number {
  if (points.length < 2) return 1;
  const path = pointerPathLength(points);
  if (path === 0) return 1;
  const net = distance(points[0], points[points.length - 1]);
  return clamp01(net / path);
}

/**
 * Normalized agreement between the focus order and DOM order `[0,1,…,n-1]`.
 * 1.0 = identical, 0.0 = reversed, null = no field was focused.
 */
export function fieldOrderMatch(focusOrder: number[]): number | null {
  const n = focusOrder.length;
  if (n === 0) return null;
  if (n === 1) return 1;
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += Math.abs(focusOrder[i] - i);
  }
  const max = Math.floor((n * n) / 2);
  return clamp01(1 - s / max);
}
