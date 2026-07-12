---
name: secret-scan
description: Command secret-scan
---

Inspect current diff and staged changes for secrets.

Check for:
- API keys
- access tokens
- SMTP passwords
- private keys
- .env files
- service account JSON
- webhook secrets
- OAuth client secrets

If found, stop and report the file/path without printing the full secret.
Do not edit files unless explicitly asked.
