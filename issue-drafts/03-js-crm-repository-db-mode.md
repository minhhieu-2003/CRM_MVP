# [P0] Tách CRM repository để backend JS truy vấn DB

Labels: backend, db

## Summary
Tách lớp truy vấn CRM thành repository để backend có thể chuyển giữa mock JSON, SQLite/PostgreSQL và CRM Sandbox API mà không phá contract hiện tại.

## Evidence
- `src/services/crmService.js` hiện đang vừa đọc dữ liệu, vừa xử lý fallback, vừa format draft.
- Cần giữ API hiện tại cho `mcpContextEngine.js` và `src/mcp/server.js`.

## Expected Behavior
`crmService.js` vẫn là facade tương thích cũ, nhưng dữ liệu được lấy qua provider/repository theo `CRM_MODE`.

## Acceptance Criteria
- [ ] Thêm `src/services/dbClient.js`.
- [ ] Thêm `src/services/crmRepository.js`.
- [ ] Hỗ trợ `CRM_MODE=mock|sqlite|postgres|sandbox`.
- [ ] `CRM_MODE=mock` giữ hành vi hiện tại.
- [ ] `CRM_MODE=sqlite` đọc từ DB local đã import.
- [ ] Không đổi contract của các hàm đang được `mcpContextEngine.js` và MCP server dùng.
- [ ] Khi DB lỗi, trả lỗi rõ ràng, không âm thầm dùng mock ở pilot/production.

## Suggested Scope
- `src/services/crmService.js`
- `src/services/crmRepository.js`
- `src/services/dbClient.js`
- `.env.example`
- `tests/`

## Verification
```bash
CRM_MODE=mock npm run test:crm
CRM_MODE=sqlite npm run test:crm
```
