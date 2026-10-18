"""Mirror of packages/features/src/extract.ts.

Given a #7 corpus record (`request` + `events`), reproduce the in-browser
beacon's feature vector from the raw events, then flatten it to the shared
model feature vector. Output keys and values are identical to the TypeScript
`extract()`.
"""

from __future__ import annotations

from typing import Any

from .features import field_order_match, interval_std, pointer_path_length, pointer_straightness
from .ip import is_datacenter_ip

# Event kinds the in-browser beacon captures. A record with none of these is a
# server-only integration with no beacon telemetry.
_BEACON_EVENT_TYPES = frozenset({"keydown", "fill", "focus", "mousemove", "scroll"})

# Corpus event kinds that mark "first input" (mirrors the beacon's
# markFirstInput triggers: keydown / input / paste / pointermove / focusin).
_FIRST_INPUT_TYPES = frozenset({"keydown", "fill", "mousemove", "focus"})


def _recompute_feature_vector(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Reproduce the beacon's feature_vector from raw corpus events."""
    # DOM order = first-appearance order of distinct non-null field names.
    field_index: dict[str, int] = {}
    for e in events:
        f = e.get("field")
        if f is not None and f not in field_index:
            field_index[f] = len(field_index)

    focus_order: list[int] = []
    keystroke_times: list[float] = []
    pointer_points: list[tuple[float, float]] = []
    pointer_count = 0
    scroll_count = 0
    input_times: list[float] = []
    submit_time: float | None = None

    for e in events:
        typ = e.get("type")
        t = e.get("t_ms")
        if t is None:
            continue
        t = float(t)
        if typ == "keydown":
            input_times.append(t)
            keystroke_times.append(t)
        elif typ == "fill":
            input_times.append(t)
        elif typ == "mousemove":
            input_times.append(t)
            x, y = e.get("x"), e.get("y")
            if x is not None and y is not None:
                pointer_count += 1
                pointer_points.append((x, y))
        elif typ == "focus":
            input_times.append(t)
            f = e.get("field")
            if f is not None and f in field_index:
                focus_order.append(field_index[f])
        elif typ == "scroll":
            scroll_count += 1
        elif typ == "submit":
            submit_time = t

    first_input = min(input_times) if input_times else None
    t_first_input_to_submit = (
        submit_time - first_input if submit_time is not None and first_input is not None else None
    )

    return {
        "t_load_to_first_input": first_input,
        "t_first_input_to_submit": t_first_input_to_submit,
        "focus_order": focus_order,
        "keystroke_count": len(keystroke_times),
        "keystroke_interval_std_ms": interval_std(keystroke_times),
        "pointer_event_count": pointer_count,
        "pointer_path_length_px": pointer_path_length(pointer_points),
        "pointer_straightness": pointer_straightness(pointer_points),
        "scroll_event_count": scroll_count,
    }


def extract(record: dict[str, Any]) -> dict[str, Any]:
    """Flatten a corpus record into the shared model feature vector."""
    request = record.get("request") or {}
    headers = request.get("headers") or {}
    ip = request.get("ip") or ""

    events = record.get("events") or []
    has_beacon = any(e.get("type") in _BEACON_EVENT_TYPES for e in events)
    fv = _recompute_feature_vector(events) if has_beacon else None

    beacon_present = fv is not None
    keystroke_count = fv["keystroke_count"] if fv else 0
    pointer_count = fv["pointer_event_count"] if fv else 0

    def _num(key: str) -> float | None:
        return fv[key] if fv else None

    return {
        # request source — always present
        "has_accept_language": "accept-language" in headers,
        "has_referer": "referer" in headers,
        "user_agent_present": "user-agent" in headers,
        "is_datacenter_ip": is_datacenter_ip(ip),
        # beacon source — null when no beacon
        "beacon_present": beacon_present,
        "t_load_to_first_input_ms": _num("t_load_to_first_input"),
        "t_first_input_to_submit_ms": _num("t_first_input_to_submit"),
        "field_order_match": field_order_match(fv["focus_order"]) if fv else None,
        "keystroke_count": fv["keystroke_count"] if fv else None,
        "keystroke_interval_std_ms": (
            fv["keystroke_interval_std_ms"] if keystroke_count >= 2 else None
        )
        if fv
        else None,
        "pointer_event_count": fv["pointer_event_count"] if fv else None,
        "pointer_path_length_px": (fv["pointer_path_length_px"] if pointer_count >= 1 else None)
        if fv
        else None,
        "pointer_straightness": (fv["pointer_straightness"] if pointer_count >= 2 else None)
        if fv
        else None,
        "scroll_event_count": _num("scroll_event_count"),
    }
