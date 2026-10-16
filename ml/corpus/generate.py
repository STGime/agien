"""Agien labelled corpus generator.

Produces deterministic, seeded synthetic interaction records against the demo
booking site, labelled by scenario family. Ground-truth labels live on each
record; generator metadata is NEVER exposed as a model feature (see the schema:
records carry label + request + events + booking, no generator flags).

Generators:
  human_replay        — replays recorded human sessions (needs recordings).
  playwright_fill     — page.fill(), no mouse (instant).
  playwright_humanlike— typed with jitter + mouse paths (the hard negative).
  browser_use         — Browser Use library drive (optional; SKIPPED in CI).
  raw_http            — direct POST to /api/book, no page load.
  poller              — hammers /api/slots at 400 ms cadence around hot release.
"""

from __future__ import annotations

import gzip
import json
import random
import uuid
from pathlib import Path

GENERATOR_VERSION = "0.1.0"

LABELS = ("human", "playwright", "browser_use", "raw_http", "llm_agent")

# generator name -> label
GENERATOR_LABEL = {
    "human_replay": "human",
    "playwright_fill": "playwright",
    "playwright_humanlike": "playwright",
    "browser_use": "browser_use",
    "raw_http": "raw_http",
    "poller": "raw_http",
}

# User-agents and fingerprints per generator, for a realistic `request` block.
_UA = {
    "human_replay": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "playwright_fill": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome",
    "playwright_humanlike": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome",
    "browser_use": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome",
    "raw_http": "python-requests/2.31.0",
    "poller": "python-requests/2.31.0",
}

# Fake (fictional) contact details a generator *would* submit. These must never
# appear in the record — the record stores field NAMES and a slot_id, never
# values. The privacy test injects canaries here and greps the output.
_NAMES = ("Ada Lovelace", "Grace Hopper", "Alan Turing", "Margaret Hamilton")
_DOMAINS = ("example.com", "example.org", "example.net")


def _uuid(rng: random.Random) -> str:
    return str(uuid.UUID(int=rng.getrandbits(128)))


def _contact(rng: random.Random) -> dict:
    name = rng.choice(_NAMES)
    email = f"{name.lower().replace(' ', '.')}@{rng.choice(_DOMAINS)}"
    phone = f"+49 30 {rng.randint(100000, 999999)}"
    return {"name": name, "email": email, "phone": phone, "notes": rng.choice(["", "Window seat"])}


def _request_block(rng: random.Random, name: str) -> dict:
    datacenter = name in ("raw_http", "poller", "playwright_fill", "playwright_humanlike")
    ip = rng.choice(
        ["34.210.100.5", "159.89.10.1", "116.203.20.4"] if datacenter else ["203.0.113.7"],
    )
    return {
        "headers": {
            "user-agent": _UA[name],
            "accept": "application/json",
            "accept-language": rng.choice(["en", "de", "fr"]),
        },
        "ip": ip,
        "http2": name in ("raw_http", "poller"),
        "tls_fingerprint": None,
    }


def _events_fill(rng: random.Random, n_chars: int) -> list[dict]:
    """page.fill() — instant, no mouse, one focus+fill per field."""
    events: list[dict] = []
    t = 0
    for field in ("date", "slot", "party_size", "name", "email", "phone", "notes"):
        t += rng.randint(20, 60)
        events.append({"type": "focus", "t_ms": t, "field": field, "x": None, "y": None})
        t += rng.randint(5, 20)
        events.append({"type": "fill", "t_ms": t, "field": field, "x": None, "y": None})
    t += rng.randint(50, 120)
    events.append({"type": "submit", "t_ms": t, "field": None, "x": None, "y": None})
    return events


def _events_humanlike(rng: random.Random, n_chars: int) -> list[dict]:
    """Typed with jitter + mouse paths — the hard negative."""
    events: list[dict] = []
    t = 0
    # a few mouse moves before touching the form
    for _ in range(rng.randint(4, 9)):
        t += rng.randint(30, 180)
        events.append(
            {
                "type": "mousemove",
                "t_ms": t,
                "field": None,
                "x": rng.randint(0, 1200),
                "y": rng.randint(0, 900),
            },
        )
    fields = ["date", "slot", "party_size", "name", "email", "phone", "notes"]
    for field in fields:
        t += rng.randint(80, 300)
        events.append(
            {
                "type": "mousemove",
                "t_ms": t,
                "field": None,
                "x": rng.randint(0, 1200),
                "y": rng.randint(0, 900),
            },
        )
        events.append({"type": "click", "t_ms": t + 5, "field": field, "x": None, "y": None})
        events.append({"type": "focus", "t_ms": t + 10, "field": field, "x": None, "y": None})
        chars = rng.randint(2, 14)
        for _ in range(chars):
            t += rng.randint(30, 160)
            events.append({"type": "keydown", "t_ms": t, "field": field, "x": None, "y": None})
    t += rng.randint(150, 400)
    events.append({"type": "submit", "t_ms": t, "field": None, "x": None, "y": None})
    return events


def _events_browser_use(rng: random.Random) -> list[dict]:
    """Browser Use drive — a distinct, noisier event signature."""
    events: list[dict] = []
    t = 0
    for i in range(rng.randint(8, 16)):
        t += rng.randint(40, 220)
        events.append(
            {
                "type": "action",
                "t_ms": t,
                "field": None,
                "x": rng.randint(0, 1200),
                "y": rng.randint(0, 900),
            }
        )
    for field in ("date", "slot", "party_size", "name", "email", "phone", "notes"):
        t += rng.randint(60, 200)
        events.append({"type": "fill", "t_ms": t, "field": field, "x": None, "y": None})
    t += rng.randint(80, 200)
    events.append({"type": "submit", "t_ms": t, "field": None, "x": None, "y": None})
    return events


def _events_raw_http() -> list[dict]:
    """No page load — a single HTTP post to /api/book."""
    return [{"type": "http", "t_ms": 0, "field": "book", "x": None, "y": None}]


def _events_poller(rng: random.Random) -> list[dict]:
    """Fixed 400 ms cadence over 60 s around the hot-slot release."""
    events: list[dict] = []
    n = 150  # 60 s / 0.4 s
    for i in range(n):
        jitter = rng.randint(-5, 5)
        events.append(
            {
                "type": "poll",
                "t_ms": max(0, i * 400 + jitter),
                "field": "slots",
                "x": None,
                "y": None,
            }
        )
    return events


def _booking(rng: random.Random) -> dict:
    return {"slot_id": _uuid(rng), "party_size": rng.randint(1, 6), "status": "booked"}


def _record(
    rng: random.Random, label: str, name: str, events: list[dict], booking: dict | None
) -> dict:
    return {
        "session_id": _uuid(rng),
        "label": label,
        "generator_version": GENERATOR_VERSION,
        "request": _request_block(rng, name),
        "events": events,
        "booking": booking,
        "outcome": None,
    }


def generate_raw_http(rng: random.Random, contact: dict | None = None) -> dict:
    # consume the contact as the fake form payload; it is never persisted
    _ = contact
    return _record(rng, "raw_http", "raw_http", _events_raw_http(), _booking(rng))


def generate_poller(rng: random.Random, contact: dict | None = None) -> dict:
    _ = contact
    return _record(rng, "raw_http", "poller", _events_poller(rng), None)


def generate_playwright_fill(rng: random.Random, contact: dict | None = None) -> dict:
    _ = contact
    return _record(rng, "playwright", "playwright_fill", _events_fill(rng, 0), _booking(rng))


def generate_playwright_humanlike(rng: random.Random, contact: dict | None = None) -> dict:
    _ = contact
    return _record(
        rng, "playwright", "playwright_humanlike", _events_humanlike(rng, 0), _booking(rng)
    )


def generate_browser_use(rng: random.Random, contact: dict | None = None) -> dict:
    _ = contact
    return _record(rng, "browser_use", "browser_use", _events_browser_use(rng), _booking(rng))


def generate_human_replay(rng: random.Random, recorded: dict, contact: dict | None = None) -> dict:
    """Replay a recorded human session, re-keyed deterministically."""
    _ = contact
    events = list(recorded.get("events", []))
    booking = recorded.get("booking")
    return _record(rng, "human", "human_replay", events, booking)


GENERATORS = {
    "raw_http": generate_raw_http,
    "poller": generate_poller,
    "playwright_fill": generate_playwright_fill,
    "playwright_humanlike": generate_playwright_humanlike,
    "browser_use": generate_browser_use,
}


def run_generator(name: str, n: int, seed: int, contact: dict | None = None) -> list[dict]:
    """Produce `n` deterministic records from `name`."""
    if name == "human_replay":
        raise ValueError("human_replay requires recorded sessions; use run_human_replay()")
    fn = GENERATORS[name]
    out: list[dict] = []
    for i in range(n):
        rng = random.Random(f"{seed}:{name}:{i}")
        out.append(fn(rng, contact))
    return out


def run_human_replay(recorded_sessions: list[dict], seed: int) -> list[dict]:
    out: list[dict] = []
    for i, rec in enumerate(recorded_sessions):
        rng = random.Random(f"{seed}:human_replay:{i}")
        out.append(generate_human_replay(rng, rec))
    return out


def write_corpus(records: list[dict], out_path: str | Path) -> None:
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out, "wt", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, sort_keys=True) + "\n")


def write_manifest(
    records: list[dict],
    out_path: str | Path,
    *,
    skipped: list[str] | None = None,
    pending_human: bool = False,
) -> None:
    counts: dict[str, int] = {}
    versions: dict[str, str] = {}
    for r in records:
        counts[r["label"]] = counts.get(r["label"], 0) + 1
        versions[r["label"]] = r["generator_version"]
    manifest = {
        "generator_version": GENERATOR_VERSION,
        "counts": counts,
        "versions": versions,
        "skipped_generators": skipped or [],
        "human_collection_pending": pending_human,
        "total": len(records),
    }
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")


def build_corpus(
    *,
    seed: int,
    per_synthetic: int,
    recorded_sessions: list[dict] | None = None,
    skip_browser_use: bool = False,
    out_dir: str | Path = "data",
) -> tuple[Path, Path, dict]:
    """Build the full corpus + manifest. Returns (corpus_path, manifest_path, manifest)."""
    records: list[dict] = []
    skipped: list[str] = []
    for name in ("raw_http", "poller", "playwright_fill", "playwright_humanlike"):
        records.extend(run_generator(name, per_synthetic, seed))
    if skip_browser_use:
        skipped.append("browser_use")
    else:
        records.extend(run_generator("browser_use", per_synthetic, seed))
    if recorded_sessions:
        records.extend(run_human_replay(recorded_sessions, seed))

    out_dir = Path(out_dir)
    corpus_path = out_dir / "corpus_v0.jsonl.gz"
    manifest_path = out_dir / "manifest.json"
    write_corpus(records, corpus_path)
    pending_human = not recorded_sessions
    write_manifest(records, manifest_path, skipped=skipped, pending_human=pending_human)

    manifest = json.loads(manifest_path.read_text())
    return corpus_path, manifest_path, manifest


def main(argv: list[str] | None = None) -> int:
    import argparse

    p = argparse.ArgumentParser(description="Build the Agien labelled corpus.")
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--n", type=int, default=200, help="records per synthetic generator")
    p.add_argument("--skip-browser-use", action="store_true")
    p.add_argument("--recordings", type=str, default=None, help="dir of human_recording *.jsonl")
    p.add_argument("--out-dir", type=str, default="data")
    args = p.parse_args(argv)

    recorded: list[dict] = []
    if args.recordings:
        rec_dir = Path(args.recordings)
        for f in sorted(rec_dir.glob("*.jsonl")):
            for line in f.read_text().splitlines():
                if line.strip():
                    recorded.append(json.loads(line))

    corpus, manifest, m = build_corpus(
        seed=args.seed,
        per_synthetic=args.n,
        recorded_sessions=recorded or None,
        skip_browser_use=args.skip_browser_use,
        out_dir=args.out_dir,
    )
    print(f"corpus → {corpus}")
    print(f"manifest → {manifest}")
    print(json.dumps(m, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
