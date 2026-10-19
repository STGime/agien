/**
 * Dependency-free Deno runtime for the exported Agien GBDT model.
 *
 * The model format (`agent_v0`) is produced by ml/export.py:
 *
 *   - `feature_order`: canonical feature names; a split node's first element
 *     is an index into this list.
 *   - `trees`: array of trees. A tree node is a JSON array:
 *       - leaf   → `[value]` (length 1)
 *       - split  → `[feature_index, threshold, default_left, left, right]`
 *                  (length 5; `default_left` is 0/1 — missing/NaN follows the
 *                  left child when 1)
 *   - `decision_type` is `"<="` globally: value <= threshold goes LEFT.
 *   - `calibration`: Platt scaling `{ a, b }` — `p = sigmoid(a*margin + b)`.
 *
 * `predict` is pure and total: it never throws on missing features (missing is
 * routed by each node's stored default direction, mirroring LightGBM's NaN
 * handling).
 */

/** Feature values: numeric, boolean (coerced to 1/0), or null for missing. */
export type FeatureValues = Record<string, number | boolean | null>;

/** A tree node: leaf `[value]` or split `[feature, threshold, default_left, left, right]`. */
export type LeafNode = [number];
export type SplitNode = [number, number, number, TreeNode, TreeNode];
export type TreeNode = LeafNode | SplitNode;

export interface Calibration {
  method: "platt";
  a: number;
  b: number;
}

export interface AgentModel {
  format: "agent_v0";
  feature_order: string[];
  decision_type: string;
  base_score?: number;
  trees: TreeNode[];
  calibration: Calibration;
}

function sigmoid(x: number): number {
  // Numerically stable: avoid overflow of Math.exp for large |x|.
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

function walk(node: TreeNode, values: FeatureValues, featureOrder: string[]): number {
  if (node.length === 1) return node[0];

  const [featureIdx, threshold, defaultLeft, left, right] = node as SplitNode;
  const name = featureOrder[featureIdx];
  const raw = values[name];
  const v = typeof raw === "boolean"
    ? (raw ? 1 : 0)
    : raw === null || raw === undefined
    ? NaN
    : Number(raw);

  let child: TreeNode;
  if (Number.isNaN(v)) {
    child = defaultLeft === 1 ? left : right;
  } else {
    child = v <= threshold ? left : right; // decision_type "<="
  }
  return walk(child, values, featureOrder);
}

/** Raw margin (sum of tree leaf values + base_score), before calibration. */
export function rawScore(model: AgentModel, values: FeatureValues): number {
  const base = model.base_score ?? 0;
  let margin = base;
  for (const tree of model.trees) {
    margin += walk(tree, values, model.feature_order);
  }
  return margin;
}

/** Calibrated probability in [0, 1]. */
export function predict(model: AgentModel, values: FeatureValues): number {
  const margin = rawScore(model, values);
  return sigmoid(model.calibration.a * margin + model.calibration.b);
}
