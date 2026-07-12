# BankRM Copilot

BankRM Copilot là AI Agent CRM hỗ trợ Relationship Manager của Bank A làm việc bằng tiếng Việt: tìm khách hàng cần chăm sóc, tổng hợp lịch sử tương tác, gợi ý cơ hội, xem chiến dịch và soạn nội dung follow-up.

## Điểm chính

- AI-native core: LLM lập kế hoạch, chọn chuỗi tool, quan sát kết quả và tổng hợp câu trả lời có nguồn.
- MCP thực: 8 CRM tools dùng chung giữa chat orchestration và MCP stdio server.
- Context đa lượt: giữ module hiện tại, khách hàng đang focus và intent gần nhất theo người dùng + hội thoại.
- CRM đa nguồn: mock, SQLite, PostgreSQL hoặc CRM Sandbox API.
- An toàn khi demo: planner lỗi hoặc proxy timeout sẽ quay về rule engine deterministic.
- Traceability: mỗi lượt chat, LLM flow và tool call đều có audit NDJSON.

## Kiến trúc runtime

```text
RM Chat
  -> POST /api/chat
  -> AI Planner qua approved LLM proxy
  -> Allowlisted Tool Registry
  -> CRM Repository / MCP-compatible tools
  -> Tool Observations + Context Update
  -> Grounded Vietnamese Response + Sources

Nếu AI core không khả dụng:
  -> Rule Engine
  -> Multi-agent fallback nội bộ
```

LLM không được gọi CRM trực tiếp. Mọi dữ liệu nghiệp vụ phải đi qua tool registry và repository có data scope.

## Cài đặt

Yêu cầu Node.js 20 đến 24.

```bash
npm install
copy .env.example .env
npm start
```

Mở `http://localhost:3000`.

## Bật AI-native core

Cấu hình một LLM proxy tương thích OpenAI Chat Completions đã được phê duyệt:

```env
AI_NATIVE_CORE=true
AI_DATA_CLASSIFICATION=synthetic
LLM_API_URL=https://your-approved-proxy.example.com/v1/chat/completions
LLM_API_KEY=...
LLM_MODEL=...
```

`AI_DATA_CLASSIFICATION` chỉ chấp nhận `synthetic` hoặc `anonymized`. Endpoint model vendor trực tiếp bị từ chối. Khi chưa có proxy hợp lệ, giữ `AI_NATIVE_CORE=false` để chạy rule engine local.

## CRM modes

```env
CRM_MODE=mock
```

Các mode hỗ trợ:

- `mock`: dữ liệu giả lập local.
- `sqlite`: đọc `db/crm.db`.
- `postgres`: dùng `CRM_POSTGRES_URL`.
- `sandbox`: dùng `CRM_API_BASE_URL` và `CRM_API_KEY`.

Pilot/production từ chối `CRM_MODE=mock`.

## MCP server

```bash
npm run mcp
npm run smoke:mcp
```

Tool catalog gồm customer list/search/due, opportunities, interactions, campaigns, draft email và call script.

## Kịch bản demo trọng tâm

1. “Nhắc tôi khách hàng có tiết kiệm đến hạn trong tuần.”
2. “Có, soạn email cho nhóm này.”
3. “Khách Nguyễn Văn An có cơ hội nào phù hợp?”
4. “Chiến dịch nào phù hợp với khách này?”

Kịch bản phải giữ context xuyên customer profile, interaction, opportunity và campaign; phản hồi phải có nguồn CRM.

## Kiểm thử

```bash
npm run check
npm run smoke:mcp
npm run format:check
```

`npm run check` chạy ESLint, toàn bộ Node tests và bộ CRM scenario. Mục tiêu bắt buộc là accuracy tối thiểu 85%, không thiếu sources, truy vấn đơn giản dưới 5 giây và tổng hợp phức tạp dưới 15 giây.

## Bảo mật MVP

- Auth-enabled mode dùng token RM và admin tách biệt.
- Opportunity, interaction và campaign được scope theo tập khách hàng của RM/chi nhánh.
- Prompt audit được giới hạn và mask secret/PII.
- LLM chỉ được bật với dữ liệu synthetic/anonymized và approved proxy.
- UI không hiển thị audit ID, latency, module hoặc raw endpoint.

Đây là kiến trúc MVP/hackathon. Pilot thật cần thay demo token bằng SSO/JWT của Bank A, token hóa PII trước LLM, audit store bất biến và context store dùng Redis/database.
