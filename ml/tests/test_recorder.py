from corpus.recorder import normalise


def test_normalise_drops_value_payload() -> None:
    out = normalise(
        {"type": "keydown", "t_ms": 100, "field": "name", "value": "SECRET_NAME"},
    )
    assert "value" not in out
    assert out["field"] == "name"
    assert out["x"] is None and out["y"] is None


def test_normalise_keeps_pointer_coords() -> None:
    out = normalise({"type": "mousemove", "t_ms": 50, "x": 640, "y": 400})
    assert out["x"] == 640 and out["y"] == 400
    assert out["field"] is None


def test_normalise_keydown_has_no_coords() -> None:
    out = normalise({"type": "keydown", "t_ms": 50, "field": "email"})
    assert out["x"] is None and out["y"] is None
