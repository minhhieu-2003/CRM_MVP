# AGENTS.md — BankRM Copilot (CRM AI Agent)

Tài liệu hướng dẫn cho AI coding agent làm việc trong repo này.

## 1. Tổng quan dự án

BankRM Copilot là **AI Agent cho CRM** hỗ trợ Relationship Manager (RM) của Bank A:
- Giao diện chat tiếng Việt cho RM.
- MCP-style context engine chuyển context giữa các module CRM.
- Soạn email follow-up / call script cá nhân hóa.
- Gợi ý next-best-action dựa trên lịch sử tương tác.
- Audit log cho mọi lượt chat.

## 2. Ngăn xếp công nghệ

- Runtime: Node.js (ESM, `"type": "module"`).
- Backend: Express.
- Frontend: HTML/CSS/JS thuần trong `public/`.
- Không dùng TypeScript, không có bước build.

## 3. Cấu trúc thư mục

```text
CRM_MVP/
  api/                   # Vercel adapter, giữ ở root
  public/                # Chat UI (index.html, app.js, styles.css)
  src/
    server.js            # Express API + static hosting
    services/
      mcpContextEngine.js  # Routing IF/ELSE + context switching
      crmService.js        # Truy vấn dữ liệu CRM + draft email/script
      crmData.js           # Mock data sandbox
      agentService.js      # Orchestrate 1 lượt chat + audit
      auditLogger.js       # Ghi audit log
      textUtils.js         # Chuẩn hóa tiếng Việt (bỏ dấu)
    plugins/             # Router/fallback agents
    mcp/                 # MCP stdio server
    data/mock/           # Mock/synthetic CRM data
  tests/                 # Integration tests
  scripts/               # Scripts cho data, qa, docs
  docs/                  # Kiến trúc + đề xuất tích hợp
  skills/                # Định nghĩa skill cho agent
  logs/                  # audit.log (tự sinh)
```

## 4. Lệnh thường dùng

```bash
npm install     # cài dependency
npm start       # chạy server tại http://localhost:3000
npm run dev     # chạy với watch mode
npm run check   # chạy lint, test, test:crm
npm test        # chạy test suite
npm run lint    # kiểm tra lỗi code style
```

## 5. Quy ước code

- Dùng ESM `import/export`, không dùng `require`.
- Toàn bộ nội dung hiển thị cho RM phải là **tiếng Việt có dấu (UTF-8)**.
- Intent matching phải chuẩn hóa qua `normalizeVietnamese()` để hỗ trợ **chat không dấu** và phím tắt số (`1`, `2`, `4`).
- Mỗi phản hồi agent phải kèm `sources` (endpoint CRM) để truy vết nguồn.
- Không hiển thị metadata kỹ thuật (auditId, module, latency) trên frontend.

## 6. Nguyên tắc bảo mật (theo đề bài Bank A)

- Ghi audit log đầy đủ cho mọi LLM/agent call.
- Không train model trên dataset khách hàng.
- Không gọi API bên thứ 3 chưa được cho phép; mọi LLM call phải qua proxy có logging.
- Tuân thủ Luật An ninh mạng 2018 và Nghị định 13/2023.

## 7. Khi thêm tính năng mới

1. Thêm/điều chỉnh rule trong `mcpContextEngine.js`.
2. Thêm hàm truy vấn dữ liệu tương ứng trong `crmService.js`.
3. Luôn trả về `{ reply, sources, context }`.
4. Cập nhật `skills/` nếu bổ sung năng lực mới cho agent.
5. Kiểm thử bằng `POST /api/chat` trước khi kết luận hoàn tất.
