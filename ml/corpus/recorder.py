"""
Recorder for human_replay sessions.

Run against the local demo site (make demo-up) while a team member completes a
booking naturally. Every interaction is captured as an anonymised event stream:
event type, timestamp offset, target field NAME, and pointer coordinates only.
Form VALUES (name, email, phone, notes) are never recorded.

    cd ml
    uv run python -m corpus.recorder --base-url http://localhost:8000 --out data/human_recordings/rec_001.jsonl

Then stop with Ctrl-C; the current session is flushed to --out. Each line is one
JSON event. Multiple files in a directory are replayed by generate.py as
distinct sessions.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# A minimal browser-driving shim. The real capture is done by the recorder page
# (apps/demo-site/recorder.html) injecting events over a WebSocket or fetch; this
# script is the server-side collector that normalises them into the corpus event
# schema and writes one .jsonl per session. It intentionally does not record
# form values — only field names and coordinates.


def normalise(raw_event: dict) -> dict:
    """Reduce a raw DOM event to the corpus schema, dropping any value payload."""
    kind = raw_event.get("type", "unknown")
    out: dict = {"type": kind, "t_ms": float(raw_event.get("t_ms", 0))}
    field = raw_event.get("field")
    out["field"] = field if field else None
    if kind == "mousemove" or kind == "click":
        out["x"] = raw_event.get("x")
        out["y"] = raw_event.get("y")
    else:
        out["x"] = None
        out["y"] = None
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Record a human demo session as corpus events.")
    p.add_argument("--out", required=True, help="output .jsonl path")
    p.add_argument("--stdin", action="store_true", help="read newline-delimited events from stdin")
    args = p.parse_args(argv)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    written = 0

    with out_path.open("w", encoding="utf-8") as f:
        if args.stdin:
            for line in sys.stdin:
                line = line.strip()
                if not line:
                    continue
                try:
                    raw = json.loads(line)
                except json.JSONDecodeError:
                    continue
                # strip any accidental value field — privacy guard
                raw.pop("value", None)
                ev = normalise(raw)
                f.write(json.dumps(ev, sort_keys=True) + "\n")
                written += 1
        else:
            print(
                "reading events from stdin until EOF… (pipe the recorder page's events here)",
                file=sys.stderr,
            )
            for line in sys.stdin:
                line = line.strip()
                if not line:
                    continue
                try:
                    raw = json.loads(line)
                except json.JSONDecodeError:
                    continue
                raw.pop("value", None)
                f.write(json.dumps(normalise(raw), sort_keys=True) + "\n")
                written += 1

    elapsed = time.monotonic() - started
    print(f"wrote {written} events to {out_path} in {elapsed:.1f}s", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
