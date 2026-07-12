# [P1] Security guardrail, audit không lưu raw PII và LLM allowlist

Labels: security, backend

## Summary
Thiết lập baseline bảo mật cho pilot: auth/CORS, audit không lưu raw prompt/PII mặc định, LLM chỉ gọi qua allowlist/proxy và có masking.

## Evidence
- Yêu cầu Bank A: audit log đầy đủ, không train trên dataset khách hàng, không gọi API bên thứ ba chưa được phép.
- Repo hiện có `auditLogger.js`, LLM fallback và Express API cần hardening trước pilot.

## Expected Behavior
Local demo vẫn dễ chạy, nhưng production/pilot fail-closed nếu thiếu auth/allowlist; audit đủ truy vết nhưng không phơi raw PII.

## Acceptance Criteria
- [ ] Thêm `AUTH_MODE=disabled|api-key|gateway-header|jwt`.
- [ ] Production yêu cầu auth cho mọi `/api/*` trừ `/api/health`.
- [ ] `/api/audit-logs` admin-only nếu endpoint tồn tại.
- [ ] Audit schema có `promptHash`, `responseHash`, `sources`, `latencyMs`, `status`.
- [ ] Mặc định không lưu raw prompt/response.
- [ ] Thêm `LLM_ENABLED=false` mặc định.
- [ ] Thêm `LLM_ALLOWED_HOSTS`.
- [ ] Implement `maskPII(text)` cho email, phone, CMND/CCCD, số tài khoản và dữ liệu khách hàng nhạy cảm.

## Suggested Scope
- `src/server.js`
- `src/services/auditLogger.js`
- `src/services/agentService.js`
- `src/plugins/llmFallback.js`
- `src/plugins/agents/llmAgent.js`
- `.env.example`
- `tests/security*.mjs`

## Verification
```bash
npm run lint
npm test
npm run test:crm
```
