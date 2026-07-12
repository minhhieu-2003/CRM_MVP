---
name: review-pr
description: Review the current diff or PR
---

Review the current diff against $ARGUMENTS.

Check:
1. Logic bugs
2. Security vulnerabilities
3. Breaking changes
4. Missing tests
5. Performance regressions
6. Files changed outside scope
7. Secrets accidentally committed

Do not edit files. Return findings by severity.
