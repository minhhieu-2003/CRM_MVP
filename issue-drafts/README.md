# GitHub Issue Drafts

These drafts were prepared because both available publishing paths were blocked:

- GitHub connector returned `403 Resource not accessible by integration`.
- Local `gh auth status` reported an invalid token for `minhhieu-2003`.

After re-authenticating, publish with commands like:

```powershell
gh auth login -h github.com
gh issue create --repo minhhieu-2003/CRM_MVP --title "[P0] Khóa baseline và quality gate cho CRM MVP" --body-file issue-drafts/01-baseline-quality-gate.md
gh issue create --repo minhhieu-2003/CRM_MVP --title "[P0] Thiết kế DB schema và Python ETL import mock CRM" --body-file issue-drafts/02-db-schema-python-etl.md
gh issue create --repo minhhieu-2003/CRM_MVP --title "[P0] Tách CRM repository để backend JS truy vấn DB" --body-file issue-drafts/03-js-crm-repository-db-mode.md
gh issue create --repo minhhieu-2003/CRM_MVP --title "[P1] Bóc tách query, intent và context workflow cho agent" --body-file issue-drafts/04-query-decomposition-intent-context.md
gh issue create --repo minhhieu-2003/CRM_MVP --title "[P1] Chuẩn hóa MCP toolkit tools, audit latency và error contract" --body-file issue-drafts/05-mcp-toolkit-standardization.md
gh issue create --repo minhhieu-2003/CRM_MVP --title "[P1] Thêm context stack có TTL cho hội thoại CRM" --body-file issue-drafts/06-context-stack-ttl.md
gh issue create --repo minhhieu-2003/CRM_MVP --title "[P1] Security guardrail, audit không lưu raw PII và LLM allowlist" --body-file issue-drafts/07-security-audit-guardrail.md
gh issue create --repo minhhieu-2003/CRM_MVP --title "[P2] Python next-best-action scoring và materialized recommendations" --body-file issue-drafts/08-python-next-best-action-scoring.md
```
