#!/usr/bin/env bash
set -euo pipefail
mkdir -p data/prompts-chat
curl -L https://raw.githubusercontent.com/f/prompts.chat/main/prompts.csv   -o data/prompts-chat/prompts.raw.csv
python scripts/normalize_prompts_chat.py   --input data/prompts-chat/prompts.raw.csv   --output data/prompts-chat/prompts.normalized.jsonl
