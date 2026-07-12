---
name: scope-lock
description: Command scope-lock
---

You are in scope-lock mode.

Task: $ARGUMENTS

Rules:
- Analyze first; do not edit until the plan is accepted.
- Only modify files explicitly named by the user or discovered as necessary for the task.
- Never modify .env, secrets, lockfiles, generated files, migrations, or deployment scripts without approval.
- After editing, show changed files, diff summary, tests run, and remaining risks.
