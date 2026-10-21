#!/usr/bin/env python3
"""Ensure the official-source catalog never mislabels author exercises as official."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / "official_exam_sources.json").read_text(encoding="utf-8"))
registry = json.loads((ROOT / "subjects.json").read_text(encoding="utf-8"))
assert catalog.get("policy", {}).get("officialOnly") is True
assert catalog.get("primarySources", {}).get("openBank") == "https://ege.fipi.ru/bank/"
assert len(registry["subjects"]) == 15, "Expected all 15 EGE subjects in registry"
items = catalog.get("subjects", [])
assert len(items) >= 16, "Expected all subjects plus math tracks"
ids = {item["id"] for item in items}
for subject in registry["subjects"]:
    assert subject["id"] in ids, f"Missing official source entry for {subject['id']}"
    assert subject.get("bankCount", 0) == 0, f"{subject['id']} still reports an official bank count"
    for track in subject.get("tracks", []):
        assert track["id"] in ids, f"Missing official source entry for track {track['id']}"
        assert track.get("bankCount", 0) == 0, f"{track['id']} still reports an official bank count"
for item in items:
    assert item.get("localOfficialTaskCount") == 0, f"Unverified official count for {item['id']}"
    for key in ("openBank", "documents", "openVariant2026"):
        assert isinstance(item.get(key), str) and item[key].startswith("https://"), f"Missing {key} for {item['id']}"
tasks = json.loads((ROOT / "tasks_data.json").read_text(encoding="utf-8"))
author_types = {"author_original", "author_generated"}
assert any(task.get("sourceType") in author_types for task in tasks), "Expected author tasks to remain explicitly classified"
assert all(task.get("sourceType") != "official_fipi" or task.get("isVerified") is True for task in tasks), "Unverified tasks are labelled official"
print(f"Official source catalog OK: {len(items)} entries; local verified official tasks: 0")
