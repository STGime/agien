import gzip
import json
from pathlib import Path

import pytest

from corpus.generate import build_corpus

SCHEMA_PATH = Path(__file__).parent.parent / "corpus" / "schema.json"

# jsonschema is an optional dependency used only for validation; it is added to
# the dev dependency group so the corpus generator itself stays dependency-free.
jsonschema = pytest.importorskip("jsonschema")

with open(SCHEMA_PATH) as f:
    SCHEMA = json.load(f)


def _load_corpus(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def test_every_produced_record_validates(tmp_path: Path) -> None:
    corpus, _manifest, _ = build_corpus(
        seed=1,
        per_synthetic=3,
        skip_browser_use=False,
        out_dir=tmp_path,
    )
    records = _load_corpus(corpus)
    assert len(records) == 3 * 5  # 5 synthetic generators x 3
    for r in records:
        jsonschema.validate(r, SCHEMA)


def test_human_replay_record_validates(tmp_path: Path) -> None:
    recording = {
        "events": [
            {"type": "mousemove", "t_ms": 100, "x": 640, "y": 400},
            {"type": "click", "t_ms": 250, "field": "name"},
        ],
        "booking": {
            "slot_id": "00000000-0000-0000-0000-000000000001",
            "party_size": 2,
            "status": "booked",
        },
    }
    corpus, _manifest, _ = build_corpus(
        seed=1,
        per_synthetic=1,
        recorded_sessions=[recording],
        skip_browser_use=True,
        out_dir=tmp_path,
    )
    records = _load_corpus(corpus)
    human = [r for r in records if r["label"] == "human"]
    assert len(human) == 1
    jsonschema.validate(human[0], SCHEMA)


def test_invalid_record_fails() -> None:
    invalid = {
        "session_id": "not-a-uuid",
        "label": "alien",  # not in enum
        "generator_version": "0.1.0",
        "request": {"headers": {}, "ip": "203.0.113.7"},
        "events": [{"type": "click", "t_ms": 0}],
        "booking": None,
        "outcome": None,
    }
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(invalid, SCHEMA)


def test_missing_required_field_fails() -> None:
    valid = {
        "session_id": "00000000-0000-0000-0000-000000000000",
        "label": "raw_http",
        "generator_version": "0.1.0",
        "request": {"headers": {}, "ip": "203.0.113.7"},
        "events": [{"type": "http", "t_ms": 0}],
        "booking": None,
        "outcome": None,
    }
    del valid["outcome"]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(valid, SCHEMA)


def test_event_with_unknown_key_fails() -> None:
    valid = {
        "session_id": "00000000-0000-0000-0000-000000000000",
        "label": "raw_http",
        "generator_version": "0.1.0",
        "request": {"headers": {}, "ip": "203.0.113.7"},
        "events": [{"type": "click", "t_ms": 0, "unexpected": True}],
        "booking": None,
        "outcome": None,
    }
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(valid, SCHEMA)
