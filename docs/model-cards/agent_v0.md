# Model card — agent_v0

**Status:** pipeline de-risking artifact, NOT a production p_agent model.

## What it is

A gradient-boosted decision tree (LightGBM, ≤50 trees, depth ≤4, Platt
calibration) exported to a dependency-free JSON tree format and executed by
`packages/model-runtime`. Its purpose is to prove the Sprint 1 path —
train → export → Deno runtime → numerical parity — before `p_agent` is wired
into `/v1/evaluate`.

## Data

- Corpus v0 (`ml/corpus/generate.py`, generator 0.1.0): 3,200 records
  (4 generators × 800, seed 42).
- Labels present: `raw_http` (poller + raw_http) and `playwright`
  (fill + humanlike). **No `human` records** (collection is a manual step,
  `human_collection_pending: true`); `browser_use` skipped.
- Split: 60/20/20 stratified (train / calibration / test). Calibration split
  is kept separate from test per the ML profile.

## What the model actually learns

Because corpus v0 has no human class, the only trainable binary target is:

> **server-side automation (`raw_http`) vs browser automation (`playwright`)**

This is **not** `p_agent` (automation vs human). It is a stand-in that
exercises the full machinery. The split is trivially separable — `beacon_present`
is `false` for every `raw_http` record and `true` for every `playwright`
record — so a perfect ROC-AUC here says nothing about real-world performance.

## Metrics (held-out, seed 42, n=800)

| | LightGBM | Logistic regression |
| --- | --- | --- |
| ROC-AUC | 1.000 | 1.000 |
| PR-AUC | 1.000 | 1.000 |
| FPR @ 95% recall | 0.000 | 0.000 |
| log-loss | ~0.000 | 0.0028 |
| per-generator recall | 1.000 (all four) | 1.000 (all four) |

Calibration: Platt, `a ≈ 2.03`, `b ≈ 0`.

## Known weaknesses / limitations

- **Not a `p_agent` model.** The acceptance gate — `playwright_humanlike`
  recall ≥ 0.80 at human FPR ≤ 0.02 — is **blocked**: it requires human
  records, which do not exist yet (#7). It is reported as
  `human_gate_blocked: true` in `agent_v0.metrics.json`, not fabricated.
- **Synthetic accuracy is not evidence** (ML profile). The near-perfect
  metrics reflect a leak-free but trivial distinction in the synthetic corpus,
  not real-world fraud-detection power.
- **`playwright_humanlike` is not a meaningful "hard negative" here**: it is
  labeled `playwright` and is separated from `raw_http` by `beacon_present`
  alone, so its 1.000 recall is uninformative. Its value as a hard negative
  only matters once it is compared against real human data.
- **Beacon-only features are absent** from the model vector (viewport/screen/
  webdriver, dwell, paste, visibility — see `docs/features-v0.md`); they are
  not captured by corpus v0.

## Leakage audit

Generator provenance (`playwright_fill` vs `playwright_humanlike` vs `poller`
vs `raw_http`) is used **only** to slice the held-out evaluation, never as a
model feature. The feature matrix contains only the 14 shared features from
`docs/features-v0.md`. No sensitive or demographic attributes are used.

## Artifact & runtime

- `models/agent_v0.json` (≈8.5 KB, limit 200 KB) + `agent_v0.metrics.json`.
- `packages/model-runtime`: dependency-free Deno `predict(model, features)`.
- Parity: Python reference vs Deno runtime agree to < 1e-6 on 500 held-out rows.
- Latency: median ≈ 9.7 µs per `predict` (10,000 calls).
- Reproducibility: seed 42 → byte-identical metrics and model.

## Intended use / non-use

- **Use for:** exercising the train/export/runtime/parity pipeline; Sprint 1
  integration scaffolding.
- **Do not use for:** classifying humans vs automation agents; any decision
  with real-world consequences. Do not interpret its output as a calibrated
  `p_agent`.
