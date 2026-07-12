# prompts.chat Extraction Manifest

This pack integrates the public `f/prompts.chat` repository into a generic CTO multi-agent playbook.

## Extracted source metadata

- Repository: `f/prompts.chat`
- Default branch: `main`
- License model: MIT for source/site-authored content, CC0 1.0 Universal for prompt content/data
- Prompt CSV schema: `act,prompt,for_devs,type,contributor`
- Relevant integration files:
  - `README.md`
  - `LICENSE`
  - `LICENSE-CC0`
  - `prompts.csv`
  - `packages/prompts.chat/README.md`
  - `packages/prompts.chat/API.md`
  - `CLAUDE-PLUGIN.md`
  - `src/lib/ai/quality-check.prompt.yml`
  - `AGENTS.md`

## Full corpus extraction

Run on a machine with internet access:

```bash
bash scripts/extract_prompts_chat.sh
```

Outputs:

```text
data/prompts-chat/prompts.raw.csv
data/prompts-chat/prompts.normalized.jsonl
```

Do not commit `prompts.raw.csv` unless explicitly approved.
