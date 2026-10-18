"""Pure feature math mirroring packages/features/src/features.ts.

Every function here must produce bit-identical results to its TypeScript
counterpart, because the parity test asserts equality to within 1e-9.
"""

from __future__ import annotations

from collections.abc import Sequence


def clamp01(n: float) -> float:
    return min(1.0, max(0.0, n))


def stddev(values: Sequence[float]) -> float:
    """Sample standard deviation; 0.0 for fewer than two values."""
    if len(values) < 2:
        return 0.0
    m = sum(values) / len(values)
    variance = sum((v - m) ** 2 for v in values) / (len(values) - 1)
    return variance**0.5


def interval_std(timestamps: Sequence[float]) -> float:
    """Standard deviation of consecutive intervals (e.g. keystroke timing)."""
    gaps = [timestamps[i] - timestamps[i - 1] for i in range(1, len(timestamps))]
    return stddev(gaps)


def distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5


def pointer_path_length(points: Sequence[tuple[float, float]]) -> float:
    total = 0.0
    for i in range(1, len(points)):
        total += distance(points[i - 1], points[i])
    return total


def pointer_straightness(points: Sequence[tuple[float, float]]) -> float:
    """1.0 straight; a path looping back to its origin is ~0."""
    if len(points) < 2:
        return 1.0
    path = pointer_path_length(points)
    if path == 0.0:
        return 1.0
    net = distance(points[0], points[-1])
    return clamp01(net / path)


def field_order_match(focus_order: Sequence[int]) -> float | None:
    """1.0 identical to DOM order, 0.0 reversed, None when no field focused."""
    n = len(focus_order)
    if n == 0:
        return None
    if n == 1:
        return 1.0
    s = sum(abs(focus_order[i] - i) for i in range(n))
    mx = (n * n) // 2
    return clamp01(1.0 - s / mx)
