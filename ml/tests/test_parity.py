"""Parity test: run the TypeScript and Python extractors over the same golden
fixtures and assert they agree (floats within 1e-9, ints/bools exact).

Two layers:

1. `test_python_matches_golden` — always runs; Python extract must equal the
   committed expected output (the oracle is hand-derived from docs).
2. `test_ts_matches_python_and_golden` — runs the Deno runner as a subprocess
   and cross-checks TS vs Python vs expected. Skipped when `deno` is not on
   PATH (the CI `ml` job installs it).
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from agien_features.extract import extract

ROOT = Path(__file__).resolve().parents[2]
GOLDEN_DIR = ROOT / "packages" / "features" / "golden"
FEATURES_DIR = ROOT / "packages" / "features"

FLOAT_KEYS = {
    "field_order_match",
    "keystroke_interval_std_ms",
    "pointer_path_length_px",
    "pointer_straightness",
}


def _load_fixtures() -> list[dict]:
    fixtures = []
    for p in sorted(GOLDEN_DIR.glob("*.json")):
        fixtures.append(json.loads(p.read_text(encoding="utf-8")))
    return fixtures


def _assert_equal(actual: dict, expected: dict, ctx: str) -> None:
    assert set(actual) == set(expected), f"{ctx}: key sets differ"
    for key, want in expected.items():
        got = actual[key]
        if key in FLOAT_KEYS:
            if want is None:
                assert got is None, f"{ctx}.{key}: expected None, got {got}"
            else:
                assert abs(got - want) < 1e-9, f"{ctx}.{key}: {got} != {want}"
        else:
            assert got == want, f"{ctx}.{key}: {got} != {want}"


def _run_ts() -> dict[str, dict]:
    result = subprocess.run(
        ["deno", "run", "--allow-read", "run_fixtures.ts"],
        cwd=FEATURES_DIR,
        capture_output=True,
        text=True,
        check=True,
    )
    return {item["id"]: item["vector"] for item in json.loads(result.stdout)}


def test_python_matches_golden():
    for fixture in _load_fixtures():
        vector = extract({"request": fixture["request"], "events": fixture["events"]})
        _assert_equal(vector, fixture["expected"], fixture["id"])


@pytest.mark.skipif(shutil.which("deno") is None, reason="deno not on PATH")
def test_ts_matches_python_and_golden():
    ts_vectors = _run_ts()
    for fixture in _load_fixtures():
        fid = fixture["id"]
        _assert_equal(ts_vectors[fid], fixture["expected"], f"TS {fid}")
        python = extract({"request": fixture["request"], "events": fixture["events"]})
        _assert_equal(ts_vectors[fid], python, f"TS==Python {fid}")
