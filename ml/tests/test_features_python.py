"""Python unit tests for the feature extraction mirror, with hand-computed
expected values matching packages/features/src/extract_test.ts."""

from agien_features.extract import extract
from agien_features.features import (
    field_order_match,
    interval_std,
    pointer_path_length,
    pointer_straightness,
    stddev,
)


def test_field_order_match():
    assert field_order_match([0, 1, 2, 3]) == 1.0
    assert field_order_match([3, 2, 1, 0]) == 0.0
    assert field_order_match([0]) == 1.0
    assert field_order_match([]) is None


def test_extract_rich_beacon_hand_computed():
    record = {
        "request": {
            "headers": {
                "accept-language": "en",
                "referer": "https://venue.example/book",
                "user-agent": "Mozilla/5.0",
            },
            "ip": "34.100.50.10",
        },
        "events": [
            {"type": "mousemove", "t_ms": 100, "field": None, "x": 0, "y": 0},
            {"type": "mousemove", "t_ms": 200, "field": None, "x": 3, "y": 4},
            {"type": "mousemove", "t_ms": 300, "field": None, "x": 6, "y": 8},
            {"type": "focus", "t_ms": 500, "field": "f0", "x": None, "y": None},
            {"type": "keydown", "t_ms": 1000, "field": "f0", "x": None, "y": None},
            {"type": "keydown", "t_ms": 1010, "field": "f0", "x": None, "y": None},
            {"type": "keydown", "t_ms": 1030, "field": "f0", "x": None, "y": None},
            {"type": "keydown", "t_ms": 1060, "field": "f0", "x": None, "y": None},
            {"type": "focus", "t_ms": 1100, "field": "f1", "x": None, "y": None},
            {"type": "focus", "t_ms": 1200, "field": "f2", "x": None, "y": None},
            {"type": "submit", "t_ms": 1500, "field": None, "x": None, "y": None},
        ],
    }
    v = extract(record)
    assert v["has_accept_language"] is True
    assert v["has_referer"] is True
    assert v["user_agent_present"] is True
    assert v["is_datacenter_ip"] is True

    assert v["beacon_present"] is True
    assert v["t_load_to_first_input_ms"] == 100
    assert v["t_first_input_to_submit_ms"] == 1400
    assert v["field_order_match"] == 1.0
    assert v["keystroke_count"] == 4
    assert v["keystroke_interval_std_ms"] == 10.0
    assert v["pointer_event_count"] == 3
    assert v["pointer_path_length_px"] == 10.0
    assert v["pointer_straightness"] == 1.0
    assert v["scroll_event_count"] == 0


def test_extract_beaconless_yields_null_beacon_features():
    record = {
        "request": {"headers": {}, "ip": "203.0.113.7"},
        "events": [{"type": "http", "t_ms": 0, "field": None, "x": None, "y": None}],
    }
    v = extract(record)
    assert v["beacon_present"] is False
    assert v["has_accept_language"] is False
    assert v["has_referer"] is False
    assert v["user_agent_present"] is False
    assert v["is_datacenter_ip"] is False
    for key in (
        "t_load_to_first_input_ms",
        "t_first_input_to_submit_ms",
        "field_order_match",
        "keystroke_count",
        "keystroke_interval_std_ms",
        "pointer_event_count",
        "pointer_path_length_px",
        "pointer_straightness",
        "scroll_event_count",
    ):
        assert v[key] is None, key


def test_insufficient_data_gated_to_null():
    v = extract(
        {
            "request": {"headers": {}, "ip": "203.0.113.7"},
            "events": [{"type": "keydown", "t_ms": 100, "field": "f0", "x": None, "y": None}],
        }
    )
    assert v["beacon_present"] is True
    assert v["keystroke_count"] == 1
    assert v["keystroke_interval_std_ms"] is None
    assert v["pointer_event_count"] == 0
    assert v["pointer_path_length_px"] is None
    assert v["pointer_straightness"] is None


def test_math_helpers_mirror_ts():
    assert pointer_path_length([(0, 0), (3, 4)]) == 5.0
    assert pointer_straightness([(0, 0), (3, 4)]) == 1.0
    assert pointer_straightness([(0, 0), (3, 4), (0, 0)]) == 0.0
    assert stddev([1, 2, 3]) == 1.0
    assert interval_std([0, 10, 20, 30]) == 0.0
    assert stddev([1]) == 0.0
