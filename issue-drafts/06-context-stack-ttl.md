# [P1] Thêm context stack có TTL cho hội thoại CRM

Labels: backend, db, mcp

## Summary
Thay context `Map` in-memory bằng context stack có TTL, trước mắt có thể dùng SQLite/in-memory TTL cho local và Redis cho pilot.

## Evidence
- LLD yêu cầu Redis key `session:{session_id}:context_stack` với TTL 30 phút.
- `mcpContextEngine.js` hiện dùng `Map`, chưa có TTL và chưa phù hợp multi-instance.

## Expected Behavior
Agent nhớ đúng customer/group/opportunity gần nhất trong cùng conversation, tự hết hạn sau 30 phút không hoạt động và không trộn context giữa RM/conversation.

## Acceptance Criteria
- [ ] Có API `pushContext(conversationId, type, id, metadata)`.
- [ ] Có API `resolveContext(conversationId, type)`.
- [ ] Có TTL mặc định 30 phút.
- [ ] Có mode local không cần Redis để demo vẫn chạy.
- [ ] Có mode Redis khi `REDIS_URL` được cấu hình.
- [ ] Nếu context thiếu hoặc mơ hồ, agent hỏi lại RM.
- [ ] Có test sequence: hỏi khách cụ thể -> hỏi “cơ hội”/“soạn tiếp” dùng đúng context.

## Suggested Scope
- `src/services/contextStore.js`
- `src/services/mcpContextEngine.js`
- `.env.example`
- `tests/integration/`

## Verification
```bash
npm test
npm run test:crm
```
