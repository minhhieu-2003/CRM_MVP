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

## Quy ước
- Skill nghiệp vụ cũ dùng `skill.md`; skill Codex tái sử dụng dùng `SKILL.md`.
- Khi thêm skill mới: tạo thư mục + `skill.md`, thêm rule vào `mcpContextEngine.js`, cập nhật bảng trên.
