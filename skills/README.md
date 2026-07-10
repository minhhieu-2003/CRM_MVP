# Skills — BankRM Copilot

Thư mục này định nghĩa các **skill** (năng lực) của AI Agent CRM. Mỗi skill mô tả:
- Mục tiêu nghiệp vụ.
- Câu lệnh/intent kích hoạt (có dấu + không dấu).
- Endpoint CRM sử dụng (truy vết nguồn).
- Ánh xạ tới code trong `src/services/mcpContextEngine.js`.

## Danh sách skill

| Skill | Mô tả | Endpoint |
|-------|-------|----------|
| `customer-reminder` | Nhắc khách hàng có tiết kiệm đến hạn | `GET /customers` |
| `email-drafter` | Soạn email follow-up cá nhân hóa | `GET /customers`, `POST /draft-email` |
| `opportunity-advisor` | Gợi ý cơ hội bán chéo theo khách hàng | `GET /customers`, `GET /opportunities`, `GET /interactions` |
| `campaign-viewer` | Liệt kê chiến dịch đang chạy | `GET /campaigns` |
| `report-git-issues` | Chuyển findings/review checklist thành GitHub Issues hoặc draft Markdown | GitHub CLI `gh` / local draft |
| `system-architecture-designer` | Thiết kế/điều chỉnh chi tiết kiến trúc hệ thống, component, DB/entity và sơ đồ Draw.io | `docs/architecture/*`, `scripts/docs/generate-if-else-workflow.mjs` |

## Quy ước
- Tất cả các skill đều dùng file `SKILL.md`.
- Khi thêm skill nghiệp vụ mới: tạo thư mục + `SKILL.md`, thêm rule vào `mcpContextEngine.js`, cập nhật bảng trên.
- Với skill tài liệu/ops/kiến trúc: cập nhật artifact liên quan trong `docs/`, `scripts/` hoặc tooling tương ứng.
