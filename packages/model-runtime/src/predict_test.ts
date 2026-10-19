import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { type AgentModel, predict, rawScore } from "./predict.ts";

/** Hand-built 2-tree model with known leaf values. */
const model: AgentModel = {
  format: "agent_v0",
  feature_order: ["a", "b"],
  decision_type: "<=",
  base_score: 0.0,
  trees: [
    // split on feature 0 (a) at 0.5; missing goes RIGHT (default_left=0)
    [0, 0.5, 0, [1.0], [2.0]],
    // split on feature 1 (b) at 10.0; missing goes LEFT (default_left=1)
    [1, 10.0, 1, [3.0], [4.0]],
  ],
  calibration: { method: "platt", a: 1.0, b: 0.0 },
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

Deno.test("raw margin sums leaf values with <= splits", () => {
  assertEquals(rawScore(model, { a: 0.0, b: 0.0 }), 4.0); // left+left = 1+3
  assertEquals(rawScore(model, { a: 1.0, b: 20.0 }), 6.0); // right+right = 2+4
});

Deno.test("predict applies Platt calibration sigmoid", () => {
  assertAlmostEquals(predict(model, { a: 0.0, b: 0.0 }), sigmoid(4.0), 1e-9);
  assertAlmostEquals(predict(model, { a: 1.0, b: 20.0 }), sigmoid(6.0), 1e-9);
});

Deno.test("missing (null) follows the stored default direction", () => {
  // a null -> right (2.0); b null -> left (3.0) => margin 5.0
  assertEquals(rawScore(model, { a: null, b: null }), 5.0);
  assertAlmostEquals(predict(model, { a: null, b: null }), sigmoid(5.0), 1e-9);
});

Deno.test("booleans are coerced to 1/0", () => {
  assertEquals(rawScore(model, { a: false, b: true }), 4.0); // 0<=0.5 left, 1<=10 left
  assertEquals(rawScore(model, { a: true, b: true }), 5.0); // 1>0.5 right, 1<=10 left
});

Deno.test("unknown feature keys are treated as missing, no throw", () => {
  assertEquals(rawScore(model, {}), 5.0); // both missing -> default directions
});
