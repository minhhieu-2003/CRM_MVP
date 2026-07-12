# prompts.chat Integration Guide

Source repository: `f/prompts.chat`.

## What to import

Use prompts.chat as a prompt discovery and corpus source, not as an automatic production prompt source.

Source schema from `prompts.csv`:

```csv
act,prompt,for_devs,type,contributor
```

Internal normalized schema:

```yaml
id: <slug>
title: <act>
source: prompts.chat
source_license: CC0-1.0
category: <coding|security|writing|ops|product|education|creative|other>
for_devs: <true|false>
type: <TEXT|IMAGE|VIDEO|AUDIO>
owner: <TEAM_OR_PERSON>
risk_level: <low|medium|high>
variables: []
allowed_context: []
forbidden_context: []
acceptance_criteria: []
test_cases: []
prompt: |
  <normalized prompt>
```

## CLI usage

```bash
npx prompts.chat
```

Interactive keys:

- `↑/↓` or `j/k`: navigate
- `/`: search prompts
- `c`: copy prompt with variable filling
- `C`: copy raw prompt
- `o`: open in browser
- `q`: quit

## Claude Code plugin

```text
/plugin marketplace add f/prompts.chat
/plugin install prompts.chat@prompts.chat
/prompts.chat:prompts code review
/prompts.chat:skills testing automation
```

## MCP

Remote:

```json
{
  "mcpServers": {
    "prompts.chat": {
      "url": "https://prompts.chat/api/mcp"
    }
  }
}
```

Local:

```json
{
  "mcpServers": {
    "prompts.chat": {
      "command": "npx",
      "args": ["-y", "prompts.chat", "mcp"]
    }
  }
}
```

## Production policy

- Do not directly run community prompts against production repositories.
- Require Prompt Review Gate before adding to internal prompt library.
- Do not commit raw large corpus unless explicitly approved.
- Always track source, license, version, owner and risk level.
