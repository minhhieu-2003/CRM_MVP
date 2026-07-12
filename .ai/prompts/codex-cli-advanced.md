# Codex CLI Advanced Prompts

## Recommended flow
```text
/status
/permissions
/plan Analyze issue #<ID>. Do not edit yet. Return affected files, risk, plan, test plan, rollback plan.
```

After approval:
```text
Implement the approved plan with minimal changes. Only edit <ALLOWED_PATHS>. Do not edit <FORBIDDEN_PATHS>.
```

Verify:
```text
/diff
/review
/status
```

## Useful slash commands
- `/plan` planning mode
- `/goal` persistent task objective
- `/diff` inspect changes
- `/review` review working tree
- `/permissions` approval policy
- `/compact` summarize context
- `/skills` select local skill
- `/agent` or `/subagents` inspect/switch subagent threads
- `/ps` inspect background terminals
- `/stop` stop background terminals
- `/fork` branch session
- `/side` or `/btw` side conversation
- `/resume` resume saved session
- `/status` model/policy/token/writable roots

## Safety prompt
```text
Before running shell commands, classify each command as SAFE_READ, SAFE_TEST, RISKY_WRITE, or DESTRUCTIVE. Ask approval for risky/destructive commands.
```
