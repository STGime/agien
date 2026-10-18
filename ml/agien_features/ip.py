"""IPv4 CIDR matching against the shared datacenter allowlist.

The CIDR list is a single source of truth shared with the TypeScript package:
`packages/features/datacenter-cidrs.json`. Python reads that same file so the
two languages never drift.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_SHARED_CIDRS = (
    Path(__file__).resolve().parents[2] / "packages" / "features" / "datacenter-cidrs.json"
)


@lru_cache(maxsize=1)
def _load_cidrs() -> tuple[str, ...]:
    with open(_SHARED_CIDRS, encoding="utf-8") as f:
        return tuple(json.load(f)["cidrs"])


def _ipv4_to_int(ip: str) -> int | None:
    parts = ip.split(".")
    if len(parts) != 4:
        return None
    n = 0
    for p in parts:
        if not (p.isdigit() and len(p) <= 3):
            return None
        v = int(p)
        if v > 255:
            return None
        n = (n * 256 + v) & 0xFFFFFFFF
    return n


def ip_in_cidr(ip: str, cidr: str) -> bool:
    if "/" in cidr:
        net, prefix_s = cidr.rsplit("/", 1)
        prefix = int(prefix_s)
    else:
        net, prefix = cidr, 32
    ip_int = _ipv4_to_int(ip)
    net_int = _ipv4_to_int(net)
    if ip_int is None or net_int is None:
        return False
    mask = 0 if prefix == 0 else ((0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF)
    return (ip_int & mask) == (net_int & mask)


def is_datacenter_ip(ip: str) -> bool:
    return any(ip_in_cidr(ip, c) for c in _load_cidrs())
