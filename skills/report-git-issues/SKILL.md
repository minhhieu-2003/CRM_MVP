---
name: report-git-issues
description: Turn code review findings, failed checklist items, regression risks, or implementation follow-ups into GitHub Issues or local issue drafts. Use when the user asks to report issues to git/GitHub, file review findings, create issue tickets from agent reports, convert checklist failures into trackable GitHub Issues, or prepare issue drafts when GitHub CLI access is unavailable.
---

# Report Git Issues

## Workflow

1. Confirm the repository target:
   - Prefer the current git remote `origin`.
   - If there is no GitHub remote, create local issue drafts and tell the user.
2. Convert each actionable finding into one issue unless several findings share the same root cause.
3. Keep issues specific and verifiable:
   - title: concise, imperative or bug-style
   - body: context, evidence, expected behavior, acceptance criteria, suggested files, tests
   - labels: use existing labels when known; otherwise use conservative labels such as `bug`, `quality`, `security`, `backend`, `frontend`, `tests`, `docs`
4. Do not publish duplicate issues without checking existing open issues when `gh` is available:
   - `gh issue list --search "<short key phrase>" --state open`
5. If `gh` is unavailable, unauthenticated, or the user has not approved publishing, create Markdown drafts instead of failing.

## Issue Body Template

Use this structure:

```markdown
## Summary
One paragraph explaining the issue.

## Evidence
- File/line references or command output.
- Reproduction prompt/request if relevant.

## Expected Behavior
What should happen.

## Acceptance Criteria
- [ ] Concrete condition 1
- [ ] Concrete condition 2
- [ ] Required tests pass

## Suggested Scope
- Files/modules likely involved.

## Verification
Commands or manual checks to run after fixing.
```

Avoid raw secrets, tokens, full customer datasets, or PII. Redact customer-specific data unless the repo already contains the same mock data and the issue needs exact evidence.

## Publishing

Use `scripts/create_github_issue.mjs` for deterministic issue creation.

Draft only:

```bash
node skills/report-git-issues/scripts/create_github_issue.mjs \
  --title "Fix named-customer email fallback" \
  --body-file issue-body.md \
  --labels "bug,backend" \
  --dry-run
```

Publish with GitHub CLI:

```bash
node skills/report-git-issues/scripts/create_github_issue.mjs \
  --title "Fix named-customer email fallback" \
  --body-file issue-body.md \
  --labels "bug,backend" \
  --publish
```

The script writes drafts to `issue-drafts/` when dry-running or when publishing is not possible.

## Review Checklist Before Filing

- The issue is actionable by one worker.
- The title can be understood from a GitHub Issues list.
- The body includes evidence and acceptance criteria.
- The issue does not expose secrets, tokens, or real PII.
- The issue references local files with paths and line numbers when available.
- The issue includes verification commands such as `npm run check`, `npm run test:crm`, or a targeted smoke command.
