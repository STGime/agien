"""Agien feature extraction — Python mirror of packages/features (TypeScript)."""

from __future__ import annotations

# Canonical feature order for the model feature matrix. Must match the keys
# produced by `extract()` in this package and `packages/features` (TS). The
# model export stores this list so the Deno runtime can resolve split-node
# indices back to feature names.
FEATURE_ORDER = [
    "has_accept_language",
    "has_referer",
    "user_agent_present",
    "is_datacenter_ip",
    "beacon_present",
    "t_load_to_first_input_ms",
    "t_first_input_to_submit_ms",
    "field_order_match",
    "keystroke_count",
    "keystroke_interval_std_ms",
    "pointer_event_count",
    "pointer_path_length_px",
    "pointer_straightness",
    "scroll_event_count",
]
