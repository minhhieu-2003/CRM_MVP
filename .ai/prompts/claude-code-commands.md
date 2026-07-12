# Claude Code Custom Commands and Skills

## Custom command: scope lock
File: `.claude/commands/scope-lock.md`

```md
You are in scope-lock mode.
Task: $ARGUMENTS
Rules:
- Analyze first; do not edit until the plan is accepted.
- Never modify .env, secrets, lockfiles, generated files, migrations, or deployment scripts without approval.
- After editing, show changed files, diff summary, tests run, and risks.
```

## Custom command: review PR
File: `.claude/commands/review-pr.md`

```md
Review the current branch or PR.
Check correctness, security, backward compatibility, tests, error handling, unrelated edits, secret leaks, performance risk.
Do not edit files. Return findings as BLOCKER / MAJOR / MINOR.
```

## Skill skeleton
File: `.claude/skills/agent-cto-review/SKILL.md`

```md
---
name: agent-cto-review
description: CTO-level review workflow for AI-generated changes, issues, PRs, and release readiness.
---

Perform a CTO review: scope, architecture boundaries, git diff, tests, security, rollback, release recommendation.
```
