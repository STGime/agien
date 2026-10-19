"""Export a trained LightGBM binary classifier to the dependency-free JSON tree
format consumed by packages/model-runtime."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _convert_node(node: dict[str, Any]) -> list:
    """LightGBM `tree_structure` → nested-array node.

    Leaf  → `[value]`
    Split → `[feature_index, threshold, default_left(0/1), left, right]`
    """
    if "leaf_value" in node:
        return [float(node["leaf_value"])]
    return [
        int(node["split_feature"]),
        float(node["threshold"]),
        1 if node.get("default_left") else 0,
        _convert_node(node["left_child"]),
        _convert_node(node["right_child"]),
    ]


def build_model(booster: Any, feature_order: list[str], calibration: dict[str, float]) -> dict:
    dump = booster.dump_model()
    # All features are numeric/bool, so LightGBM uses "<=" for every split.
    for tree in dump["tree_info"]:
        _assert_decision_type(tree["tree_structure"])

    trees = [_convert_node(t["tree_structure"]) for t in dump["tree_info"]]
    return {
        "format": "agent_v0",
        "model_type": "lightgbm",
        "objective": "binary",
        "feature_order": list(feature_order),
        "decision_type": "<=",
        "base_score": 0.0,
        "n_estimators": len(trees),
        "trees": trees,
        "calibration": {
            "method": "platt",
            "a": float(calibration["a"]),
            "b": float(calibration["b"]),
        },
    }


def _assert_decision_type(node: dict[str, Any]) -> None:
    if "leaf_value" in node:
        return
    if node.get("decision_type") != "<=":
        raise ValueError(
            f"unexpected decision_type {node.get('decision_type')!r}; "
            "the runtime only implements '<=' splits"
        )
    _assert_decision_type(node["left_child"])
    _assert_decision_type(node["right_child"])


def write_json(obj: dict, out_path: str | Path) -> None:
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(obj, sort_keys=True, separators=(",", ":")) + "\n")
