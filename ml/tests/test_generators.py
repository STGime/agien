import json
from pathlib import Path

from corpus.generate import (
    GENERATOR_LABEL,
    GENERATORS,
    build_corpus,
    run_generator,
    write_corpus,
    write_manifest,
)

SYNTHETIC = list(GENERATORS.keys())


def test_each_generator_produces_n_records_with_correct_label_and_events() -> None:
    for name in SYNTHETIC:
        records = run_generator(name, n=3, seed=1)
        assert len(records) == 3, name
        for r in records:
            assert r["label"] == GENERATOR_LABEL[name], name
            assert isinstance(r["events"], list) and len(r["events"]) > 0, name


def test_playwright_fill_is_deterministic() -> None:
    a = run_generator("playwright_fill", n=3, seed=42)
    b = run_generator("playwright_fill", n=3, seed=42)
    assert [json.dumps(r["events"], sort_keys=True) for r in a] == [
        json.dumps(r["events"], sort_keys=True) for r in b
    ]


def test_raw_http_is_deterministic() -> None:
    a = run_generator("raw_http", n=3, seed=7)
    b = run_generator("raw_http", n=3, seed=7)
    assert [json.dumps(r["events"], sort_keys=True) for r in a] == [
        json.dumps(r["events"], sort_keys=True) for r in b
    ]


def test_privacy_no_form_values_in_corpus(tmp_path: Path) -> None:
    canary = {
        "name": "CANARY_NAME_7f3a",
        "email": "canary_7f3a@example.com",
        "phone": "CANARY_PHONE_7f3a",
        "notes": "CANARY_NOTES_7f3a",
    }
    records: list[dict] = []
    for name in SYNTHETIC:
        records.extend(run_generator(name, n=5, seed=1, contact=canary))
    path = tmp_path / "corpus.jsonl.gz"
    write_corpus(records, path)
    blob = path.read_bytes()
    for value in canary.values():
        assert value.encode() not in blob, f"leaked form value: {value}"


def test_manifest_counts_match_and_meet_minimums(tmp_path: Path) -> None:
    per = 3
    _corpus, manifest_path, manifest = build_corpus(
        seed=1,
        per_synthetic=per,
        skip_browser_use=False,
        out_dir=tmp_path,
    )
    counts = manifest["counts"]
    # each synthetic label appears per*generators_for_label times
    assert counts["playwright"] == per * 2  # fill + humanlike
    assert counts["raw_http"] == per * 2  # raw_http + poller
    assert counts["browser_use"] == per
    assert manifest["total"] == per * 5
    # manifest file on disk matches
    on_disk = json.loads(manifest_path.read_text())
    assert on_disk["counts"] == counts


def test_manifest_minimums_large_build(tmp_path: Path) -> None:
    # small but representative: assert the minimums logic against a real build
    per = 200
    _corpus, _path, manifest = build_corpus(
        seed=3,
        per_synthetic=per,
        skip_browser_use=False,
        out_dir=tmp_path,
    )
    counts = manifest["counts"]
    assert counts["playwright"] >= 200
    assert counts["raw_http"] >= 200
    assert counts["browser_use"] >= 200
    assert manifest["total"] >= 200 * 5


def test_browser_use_skip_marks_manifest(tmp_path: Path) -> None:
    _corpus, _path, manifest = build_corpus(
        seed=1,
        per_synthetic=2,
        skip_browser_use=True,
        out_dir=tmp_path,
    )
    assert "browser_use" in manifest["skipped_generators"]
    assert "browser_use" not in manifest["counts"]


def test_write_manifest_roundtrip(tmp_path: Path) -> None:
    records = run_generator("raw_http", n=2, seed=1)
    write_manifest(records, tmp_path / "manifest.json")
    on_disk = json.loads((tmp_path / "manifest.json").read_text())
    assert on_disk["counts"]["raw_http"] == 2
    assert on_disk["total"] == 2
