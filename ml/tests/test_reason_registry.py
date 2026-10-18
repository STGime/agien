"""Reason-code registry enforcement.

Grep `apps/edge` and `packages/beacon` source (excluding tests) for reason-code
emissions and fail if any code is missing from docs/reasons-v0.md. The four
emission patterns are the only places a reason code can be introduced:

- `code: "…"`            (rules engine `reasons.push`)
- `reason_code: "…"`     (Web Bot Auth outcome)
- `fail("…")`            (Web Bot Auth early return)
- `reason_codes: […]`    (identity verification outcome)
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_DIRS = [ROOT / "apps" / "edge", ROOT / "packages" / "beacon"]
REGISTRY_DOC = ROOT / "docs" / "reasons-v0.md"

_EMITTERS = [
    re.compile(r'\bcode:\s*"([a-z_]+)"'),
    re.compile(r'\breason_code:\s*"([a-z_]+)"'),
    re.compile(r'fail\("([a-z_]+)"\)'),
    re.compile(r"reason_codes:\s*\[([^\]]*)\]"),
]


def _is_source_file(path: Path) -> bool:
    name = path.name
    return name.endswith(".ts") and not name.endswith((".test.ts", "_test.ts"))


def _extracted_codes() -> set[str]:
    codes: set[str] = set()
    for src_dir in SRC_DIRS:
        for path in src_dir.rglob("*.ts"):
            if not _is_source_file(path):
                continue
            text = path.read_text(encoding="utf-8")
            for pattern in _EMITTERS:
                for m in pattern.finditer(text):
                    if pattern is _EMITTERS[3]:
                        # reason_codes array: pull every quoted code literal inside.
                        codes.update(re.findall(r'"([a-z_]+)"', m.group(1)))
                    else:
                        codes.add(m.group(1))
    return codes


def _registry_codes() -> set[str]:
    text = REGISTRY_DOC.read_text(encoding="utf-8")
    section = text.split("## Registry", 1)[1].split("## Not reason codes", 1)[0]
    return set(re.findall(r"^\|\s*`([a-z_]+)`\s*\|", section, flags=re.MULTILINE))


def test_every_reason_code_is_registered():
    registry = _registry_codes()
    assert registry, "registry parse found no codes — check docs/reasons-v0.md table"
    extracted = _extracted_codes()
    assert extracted, "no reason codes found in source — emitter regexes may be wrong"

    unregistered = extracted - registry
    assert not unregistered, (
        f"unregistered reason code(s): {sorted(unregistered)}. "
        "Add them to docs/reasons-v0.md before using them in code."
    )
