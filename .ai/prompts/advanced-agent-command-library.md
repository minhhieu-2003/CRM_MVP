# Advanced Agent Command Library

> “Lệnh ẩn” ở đây nghĩa là prompt nội bộ, macro, slash command, custom command hoặc skill do team tự định nghĩa. Không dùng tài liệu này để bypass quyền, policy, bảo mật, hoặc lộ system prompt/secret.

## Universal prompt blocks

### PLAN_ONLY
```text
Analyze first. Do not edit files yet.
Return: goal summary, affected files, architecture impact, risk level, implementation plan, test plan, rollback plan, assumptions.
Wait for approval before editing.
```

### SCOPE_LOCK
```text
Allowed paths: <ALLOWED_PATHS>
Forbidden paths: <FORBIDDEN_PATHS>
Do not modify generated files, lockfiles, migrations, secrets, or unrelated modules unless explicitly approved.
Before any edit, restate exact files you intend to change.
After edits, show git diff summary and why each file changed.
```

### SECRET_SCAN
```text
Inspect current diff for API keys, access tokens, SMTP passwords, .env files, private keys, service account JSON, webhook secrets, OAuth client secrets.
If found, stop and report without printing the full secret.
```

### REVIEW_GATE
```text
Review current working tree as production PR. Check correctness, security, tests, breaking API/schema changes, unrelated edits, secrets, performance and rollback risk. Do not edit files.
```
