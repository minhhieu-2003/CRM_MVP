# [P0] Khóa baseline và quality gate cho CRM MVP

Labels: quality, tests

## Summary
Khóa trạng thái chạy được hiện tại của BankRM Copilot trước khi mở rộng DB, MCP và backend. Việc này giúp các task sau có regression gate rõ ràng, không làm vỡ demo hiện có.

## Evidence
- Repo hiện có scripts `npm run lint`, `npm test`, `npm run test:crm`, `npm run mcp` trong `package.json`.
- Contract bắt buộc của agent là `{ reply, sources, context }`.
- Cần ghi lại baseline trước khi sửa lớn phần DB/MCP/backend.

## Expected Behavior
Mọi thay đổi backend/MCP/DB sau này phải qua được quality gate tối thiểu và giữ nguyên contract API.

## Acceptance Criteria
- [ ] Chạy và lưu kết quả `npm run lint`.
- [ ] Chạy và lưu kết quả `npm test`.
- [ ] Chạy và lưu kết quả `npm run test:crm`.
- [ ] Chạy smoke `POST /api/chat` với prompt `1` và xác nhận response có `reply`, `sources`, `context`.
- [ ] Chạy smoke `npm run mcp` hoặc kiểm tra server MCP khởi động được.
- [ ] Không thay đổi business logic trong phase này ngoài evidence/docs nếu cần.

## Suggested Scope
- `package.json`
- `tests/`
- `scripts/qa/`
- `evidence/` nếu cần lưu log

## Verification
```bash
npm run lint
npm test
npm run test:crm
npm run mcp
```
