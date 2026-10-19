"""Train the baseline classifier on corpus v0, export the GBDT model, and write
metrics.

What this model IS and ISN'T is documented in docs/model-cards/agent_v0.md.
Short version: corpus v0 contains only automation (raw_http/poller vs
playwright fill/humanlike) — no human records — so the trainable binary target
is *server-side automation vs browser automation*. This de-risks the full
train→export→runtime→parity pipeline but is NOT a p_agent (agent-vs-human)
model; that is blocked on #7's pending human collection.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, log_loss, roc_auc_score, roc_curve
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from agien_features import FEATURE_ORDER
from agien_features.extract import extract
from corpus import generate
from export import build_model, write_json

# Generators in the corpus, with the binary target each maps to:
#   playwright (browser automation) -> 1 ; raw_http (server automation) -> 0.
GENERATORS = ("raw_http", "poller", "playwright_fill", "playwright_humanlike")

N_ESTIMATORS = 50
MAX_DEPTH = 4
LEARNING_RATE = 0.1


def _label_to_target(label: str) -> int:
    return 1 if label == "playwright" else 0


def _sigmoid(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, -500.0, 500.0)
    return 1.0 / (1.0 + np.exp(-x))


def _feature_row(vec: dict) -> list[float]:
    row: list[float] = []
    for name in FEATURE_ORDER:
        v = vec[name]
        if v is None:
            row.append(float("nan"))
        elif isinstance(v, bool):
            row.append(1.0 if v else 0.0)
        else:
            row.append(float(v))
    return row


def _features_matrix(records: list[dict]) -> np.ndarray:
    return np.array([_feature_row(extract(r)) for r in records], dtype=np.float64)


def _generate(seed: int, n: int) -> tuple[list[dict], list[str]]:
    """Generate the corpus deterministically, tracking generator per record for
    per-generator evaluation slicing only (never a model feature)."""
    records: list[dict] = []
    gens: list[str] = []
    for name in GENERATORS:
        for rec in generate.run_generator(name, n, seed):
            records.append(rec)
            gens.append(name)
    return records, gens


def _platt(margins: np.ndarray, y: np.ndarray) -> dict[str, float]:
    cal = LogisticRegression(C=1e6, max_iter=1000)
    cal.fit(margins.reshape(-1, 1), y)
    return {"a": float(cal.coef_[0][0]), "b": float(cal.intercept_[0])}


def _fpr_at_recall(probs: np.ndarray, y: np.ndarray, target: float = 0.95) -> float:
    fpr, tpr, _ = roc_curve(y, probs)
    idx = int(np.searchsorted(tpr, target))
    idx = min(idx, len(fpr) - 1)
    return float(fpr[idx])


def _per_generator_recall(probs: np.ndarray, y: np.ndarray, gens: list[str]) -> dict[str, float]:
    pred = (probs >= 0.5).astype(int)
    out: dict[str, float] = {}
    for g in sorted(set(gens)):
        mask = np.array([gi == g for gi in gens])
        out[g] = float((y[mask] == pred[mask]).mean())
    return out


def _evaluate(probs: np.ndarray, y: np.ndarray, gens: list[str]) -> dict:
    return {
        "roc_auc": round(float(roc_auc_score(y, probs)), 6),
        "pr_auc": round(float(average_precision_score(y, probs)), 6),
        "fpr_at_95_recall": round(_fpr_at_recall(probs, y), 6),
        "log_loss": round(float(log_loss(y, probs)), 6),
        "per_generator_recall": {
            g: round(v, 6) for g, v in _per_generator_recall(probs, y, gens).items()
        },
    }


@dataclass
class RunResult:
    metrics: dict
    model: dict
    gbm: Any
    calibration: dict[str, float]
    X_test: np.ndarray
    y_test: np.ndarray
    gens_test: list[str]
    feature_order: list[str] = field(default_factory=lambda: list(FEATURE_ORDER))


def run(
    *,
    seed: int,
    n: int,
    model_out: str | Path | None = None,
    metrics_out: str | Path | None = None,
) -> RunResult:
    records, gens = _generate(seed, n)
    X = _features_matrix(records)
    y = np.array([_label_to_target(r["label"]) for r in records])

    # Stratified 60/20/20 (train / calibration / test). The calibration split
    # is required by the ML profile so Platt params are never fit on test.
    X_rest, X_test, y_rest, y_test, _g_rest, g_test = train_test_split(
        X, y, gens, test_size=0.2, random_state=seed, stratify=y
    )
    X_train, X_calib, y_train, y_calib = train_test_split(
        X_rest, y_rest, test_size=0.25, random_state=seed, stratify=y_rest
    )

    # Logistic-regression baseline (impute NaN, since LR cannot handle it).
    lr = make_pipeline(
        SimpleImputer(strategy="median"),
        StandardScaler(),
        LogisticRegression(max_iter=1000),
    )
    lr.fit(X_train, y_train)

    # LightGBM (native NaN handling).
    gbm = lgb.LGBMClassifier(
        n_estimators=N_ESTIMATORS,
        max_depth=MAX_DEPTH,
        learning_rate=LEARNING_RATE,
        objective="binary",
        boost_from_average=False,
        deterministic=True,
        n_jobs=1,
        random_state=seed,
        verbose=-1,
    )
    gbm.fit(X_train, y_train)

    calibration = _platt(gbm.predict(X_calib, raw_score=True), y_calib)

    def calibrated_probs(Xm: np.ndarray) -> np.ndarray:
        m = gbm.predict(Xm, raw_score=True)
        return _sigmoid(calibration["a"] * m + calibration["b"])

    p_gbm = calibrated_probs(X_test)
    p_lr = lr.predict_proba(X_test)[:, 1]

    metrics = {
        "seed": seed,
        "n_per_generator": n,
        "total": len(records),
        "split": {"train": len(y_train), "calib": len(y_calib), "test": len(y_test)},
        "class_balance": {
            "test_playwright": int(y_test.sum()),
            "test_raw_http": int((1 - y_test).sum()),
        },
        "lightgbm": _evaluate(p_gbm, y_test, g_test),
        "logistic_regression": _evaluate(p_lr, y_test, g_test),
        "calibration": {
            "method": "platt",
            "a": round(calibration["a"], 6),
            "b": round(calibration["b"], 6),
        },
        "human_gate_blocked": True,
        "human_gate_reason": (
            "corpus v0 has no human records (#7 human_collection_pending); "
            "the p_agent quality gate (playwright_humanlike recall @ human FPR<=0.02) "
            "is deferred until human data is collected."
        ),
    }

    model = build_model(gbm.booster_, FEATURE_ORDER, calibration)
    if model_out is not None:
        write_json(model, model_out)
    if metrics_out is not None:
        write_json(metrics, metrics_out)

    return RunResult(
        metrics=metrics,
        model=model,
        gbm=gbm,
        calibration=calibration,
        X_test=X_test,
        y_test=y_test,
        gens_test=g_test,
    )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Train the Agien baseline classifier.")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--n", type=int, default=800, help="records per generator")
    p.add_argument("--model-out", type=str, default="models/agent_v0.json")
    p.add_argument("--metrics-out", type=str, default="models/agent_v0.metrics.json")
    args = p.parse_args(argv)

    result = run(
        seed=args.seed,
        n=args.n,
        model_out=args.model_out,
        metrics_out=args.metrics_out,
    )
    print(json.dumps(result.metrics, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
