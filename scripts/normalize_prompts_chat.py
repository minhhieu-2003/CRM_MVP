#!/usr/bin/env python3
"""Normalize prompts.chat CSV into JSONL.

Expected input schema:
act,prompt,for_devs,type,contributor
"""
import argparse
import csv
import json
import re
from pathlib import Path

VAR_PATTERNS = [
    (re.compile(r"\{\{\s*([A-Za-z0-9_ -]+)\s*\}\}"), r"${\1}"),
    (re.compile(r"\[\[\s*([A-Za-z0-9_ -]+)\s*\]\]"), r"${\1}"),
]

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "prompt"

def normalize_vars(text: str) -> str:
    out = text or ""
    for pattern, repl in VAR_PATTERNS:
        out = pattern.sub(repl, out)
    return out

def boolish(value: str) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes", "y"}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--dev-only", action="store_true")
    args = ap.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with input_path.open("r", encoding="utf-8", newline="") as f, output_path.open("w", encoding="utf-8") as out:
        reader = csv.DictReader(f)
        for row in reader:
            for_devs = boolish(row.get("for_devs", ""))
            if args.dev_only and not for_devs:
                continue
            title = row.get("act", "").strip()
            record = {
                "id": slugify(title),
                "title": title,
                "source": "prompts.chat",
                "source_license": "CC0-1.0",
                "for_devs": for_devs,
                "type": row.get("type", "TEXT").strip() or "TEXT",
                "contributor": row.get("contributor", "").strip(),
                "category": "coding" if for_devs else "unclassified",
                "risk_level": "medium",
                "prompt": normalize_vars(row.get("prompt", "")),
            }
            out.write(json.dumps(record, ensure_ascii=False) + "\n")

if __name__ == "__main__":
    main()
