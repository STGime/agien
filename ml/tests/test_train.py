"""Training tests: reproducibility, the available metric gate, the reported
human-data blocker, and the model-file size budget."""

from __future__ import annotations

import json
from pathlib import Path

from train import run

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "models" / "agent_v0.json"


def test_training_reproducible_same_seed():
    r1 = run(seed=42, n=200)
    r2 = run(seed=42, n=200)
    assert json.dumps(r1.metrics, sort_keys=True) == json.dumps(r2.metrics, sort_keys=True)


def test_different_seed_changes_output():
    r1 = run(seed=42, n=200)
    r3 = run(seed=43, n=200)
    assert json.dumps(r1.metrics, sort_keys=True) != json.dumps(r3.metrics, sort_keys=True)


def test_metric_gate_on_available_task():
    """On the distinction corpus v0 actually supports (server vs browser
    automation), the held-out ROC-AUC must clear 0.90."""
    r = run(seed=42, n=200)
    assert r.metrics["lightgbm"]["roc_auc"] >= 0.90


def test_human_gate_blocked_is_reported():
    """The p_agent quality gate (human FPR) cannot be evaluated until #7 human
    data is collected; the metrics must say so rather than fabricate a number."""
    r = run(seed=42, n=200)
    assert r.metrics["human_gate_blocked"] is True
    assert "human" in r.metrics["human_gate_reason"].lower()


def test_model_file_within_size_budget():
    assert MODEL_PATH.exists(), f"run `make train` to generate {MODEL_PATH}"
    size_kb = MODEL_PATH.stat().st_size / 1024
    assert size_kb <= 200, f"agent_v0.json is {size_kb:.1f} KB (limit 200 KB)"
