## Issue 13 - Security Hardening (P0.1/P0.2)

Completed on: 2026-07-14

### Checklist
- [x] Thêm AUTH_ENABLED chặn mọi request không xác thực trên pilot/production.
- [x] Production yêu cầu auth cho mọi /api/* trừ /api/health.
- [x] /api/audit-logs admin-only.
- [x] Audit schema có latencyMs, status, decision, sources (không lưu raw prompt/PII).
- [x] Mặc định không lưu raw prompt/response (Chỉ lưu chat-turn).
- [x] LLM có allowlist/API url check.
- [x] Implement token vault / mask PII cho thông tin nhạy cảm.
- [x] Xử lý fail-closed an toàn cho MCP và Tool scope denial (resolved ai-native-core test failures).
- [x] Test plan thành công (100% passed npm run check với 151 tests và 24 CRM test cases).

### Summary
Đã hoàn thiện tất cả lỗi fail-closed, fix các unit test bị gãy do environment của tests (auth.test.mjs bị rò rỉ AI_NATIVE_CORE làm thay đổi behaviour của aiNativeCore.js fail đóng sang fall-back). Toàn bộ pass 100% test pipeline. Code đã được merged lên main.
