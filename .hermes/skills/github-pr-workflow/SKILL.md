---
name: github-pr-workflow
description: Move approved BankRM Copilot work from a GitHub issue to a review-ready pull request with branch checks, focused implementation, validation, evidence, and security review. Use when preparing or executing issue-to-PR work without merging it.
---

# GitHub PR Workflow

## Preconditions

1. Read `AGENTS.md`, the issue, and directly relevant repository files.
2. Confirm the issue acceptance criteria and identify allowed and forbidden paths.
3. Inspect the worktree and preserve unrelated user changes.
4. Verify that the current branch is not the default branch; create or switch to an issue branch only with approval.

## Workflow

1. Analyze the issue before editing and identify affected files and risk level.
2. Present implementation, test, and rollback plans.
3. Wait for human approval before writing code.
4. Implement one focused logical change while preserving stable APIs and BankRM architecture rules.
5. Run targeted tests, then run `npm run check` when the change scope warrants the full suite.
6. Run `npm run format:check` before committing when available.
7. Review the diff for correctness, regressions, secrets, PII exposure, and unrelated edits.
8. Add an evidence record under `evidence/` when the issue is tracked in `issue-drafts/`.
9. Prepare a review-ready PR title and body; do not merge the PR.

## PR Handoff

Include:

- Issue reference and concise problem statement.
- Changed behavior and affected files.
- Test commands and exact outcomes.
- Security and privacy considerations.
- Residual risks, known limitations, and rollback steps.
- Evidence path when applicable.

## Safety Boundaries

- Never push directly to the default branch.
- Never merge, force-push, rewrite history, or run destructive Git commands without explicit approval.
- Never commit secrets, `.env` files, generated prompt-corpus data excluded by policy, or real customer data.
- Never include unrelated worktree changes in the commit or PR.
