"""Model parity test: the Deno runtime must reproduce LightGBM's calibrated
probabilities on held-out rows within 1e-6."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from agien_features import FEATURE_ORDER
from train import _sigmoid, run

ROOT = Path(__file__).resolve().parents[2]
MODEL_RUNTIME = ROOT / "packages" / "model-runtime"

PARITY_ROWS = 500


def _rows_to_json(X: np.ndarray) -> list[dict]:
    rows = []
    for i in range(len(X)):
        row = {}
        for j, name in enumerate(FEATURE_ORDER):
            v = X[i][j]
            row[name] = None if np.isnan(v) else float(v)
        rows.append(row)
    return rows


def _python_probs(res) -> np.ndarray:
    margin = res.gbm.predict(res.X_test, raw_score=True)
    return _sigmoid(res.calibration["a"] * margin + res.calibration["b"])


def _ts_probs(model_path: Path, feat_path: Path) -> np.ndarray:
    result = subprocess.run(
        [
            "deno",
            "run",
            "--allow-read",
            str(MODEL_RUNTIME / "score_cli.ts"),
            str(model_path),
            str(feat_path),
        ],
        cwd=MODEL_RUNTIME,
        capture_output=True,
        text=True,
        check=True,
    )
    return np.array(json.loads(result.stdout))


@pytest.mark.skipif(shutil.which("deno") is None, reason="deno not on PATH")
def test_runtime_parity_on_held_out_rows(tmp_path: Path):
    res = run(seed=42, n=800, model_out=tmp_path / "agent_v0.json")
    assert len(res.X_test) >= PARITY_ROWS, "need >=500 held-out rows"

    p_py = _python_probs(res)[:PARITY_ROWS]
    feat_path = tmp_path / "features.json"
    feat_path.write_text(json.dumps(_rows_to_json(res.X_test[:PARITY_ROWS])))
    p_ts = _ts_probs(tmp_path / "agent_v0.json", feat_path)

    assert len(p_ts) == PARITY_ROWS
    assert np.max(np.abs(p_py - p_ts)) < 1e-6
