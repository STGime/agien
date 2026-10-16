import { describe, expect, it } from "vitest";
import { pointerPathLength, pointerStraightness, stdDev } from "./features";

describe("pointerStraightness", () => {
  it("is >= 0.99 for points along a straight line", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 40, y: 0 },
    ];
    expect(pointerStraightness(points)).toBeGreaterThanOrEqual(0.99);
  });

  it("is < 0.5 for a zigzag path", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 20, y: 0 },
      { x: 30, y: 20 },
      { x: 40, y: 0 },
    ];
    expect(pointerStraightness(points)).toBeLessThan(0.5);
  });

  it("is 1.0 for fewer than two points", () => {
    expect(pointerStraightness([])).toBe(1);
    expect(pointerStraightness([{ x: 1, y: 2 }])).toBe(1);
  });

  it("is 0 when the path returns to its origin", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(pointerStraightness(points)).toBeLessThan(0.01);
  });
});

describe("pointerPathLength", () => {
  it("sums euclidean segment lengths", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 6, y: 4 },
    ];
    expect(pointerPathLength(points)).toBeCloseTo(8);
  });

  it("is 0 for zero or one point", () => {
    expect(pointerPathLength([])).toBe(0);
    expect(pointerPathLength([{ x: 1, y: 1 }])).toBe(0);
  });
});

describe("stdDev", () => {
  it("computes sample standard deviation", () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });

  it("is 0 for fewer than two values", () => {
    expect(stdDev([])).toBe(0);
    expect(stdDev([5])).toBe(0);
  });

  it("is 0 for identical values", () => {
    expect(stdDev([7, 7, 7, 7])).toBe(0);
  });
});
