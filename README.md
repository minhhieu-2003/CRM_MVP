# BankRM Copilot

BankRM Copilot là AI Agent CRM hỗ trợ Relationship Manager của Bank A làm việc bằng tiếng Việt: tìm khách hàng cần chăm sóc, tổng hợp lịch sử tương tác, gợi ý cơ hội, xem chiến dịch và soạn nội dung follow-up.

## Điểm chính

- AI-native core: LLM lập kế hoạch, chọn chuỗi tool, quan sát kết quả và tổng hợp câu trả lời có nguồn.
- MCP-native execution: AI core dùng MCP client thật để initialize, khám phá và gọi 8 CRM tools trên MCP stdio server.
- Context đa lượt: giữ module hiện tại, khách hàng đang focus và intent gần nhất theo người dùng + hội thoại.
- CRM đa nguồn: mock, SQLite, PostgreSQL hoặc CRM Sandbox API.
- An toàn khi demo: planner lỗi hoặc proxy timeout sẽ quay về rule engine deterministic.
- Traceability: mỗi lượt chat, quyết định planning/fallback và mọi MCP tool call đều có audit NDJSON.

## Kiến trúc runtime

```text
RM Chat
  -> POST /api/chat
  -> AI Planner qua configured LLM proxy
  -> MCP Client (initialize, tools/list, tools/call)
  -> MCP Stdio Server
  -> Allowlisted Tool Registry
  -> Server-bound Policy / Entitlement Engine
  -> Application-scoped CRM Repository
  -> DB/API Adapter
  -> Tool Observations + Context Update
  -> Grounded Vietnamese Response + Sources

Nếu AI core không khả dụng:
  -> Rule Engine
  -> Multi-agent fallback nội bộ
```

LLM không được gọi CRM trực tiếp. Identity của phiên MCP do backend thiết lập ngoài tool arguments; planner không thể tự nâng quyền. Trong AI-native path, mọi tool step đi qua MCP registry; deterministic/plugin fallback và API CRM trực tiếp vẫn bắt buộc đi qua scoped repository.

## Cài đặt

Yêu cầu Node.js 20 đến 24.

```bash
npm install
copy .env.example .env
npm start
```

Mở `http://localhost:3000`.

## Bật AI-native core

Cấu hình một LLM proxy tương thích OpenAI Chat Completions. Việc phê duyệt host/mTLS là bước vận hành riêng trước pilot:

```env
AI_NATIVE_CORE=true
AI_DATA_CLASSIFICATION=synthetic
LLM_API_URL=https://your-configured-proxy.example.com/v1/chat/completions
LLM_API_KEY=...
LLM_MODEL=...
```

`AI_DATA_CLASSIFICATION` chỉ chấp nhận `synthetic` hoặc `anonymized`. Endpoint model vendor trực tiếp bị từ chối. Đây là gate cấu hình, không phải bằng chứng proxy đã được Bank A phê duyệt; approved-host allowlist/mTLS vẫn là hạng mục vận hành trước pilot. Khi chưa có proxy hợp lệ, giữ `AI_NATIVE_CORE=false` để chạy rule engine local.

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

Khi `AI_NATIVE_CORE=true`, mỗi lượt chat mở một MCP stdio session cô lập, dùng cùng session cho toàn bộ tool steps rồi đóng trong `finally`. Child process chỉ nhận cấu hình CRM/audit, identity và entitlement do backend ánh xạ; khóa LLM và token HTTP không được truyền sang MCP server. `tools/list` chỉ công bố tool mà actor có đủ **tất cả** `requiredScopes`, và registry kiểm tra lại ngay trước execution; thiếu scope trả `TOOL_SCOPE_DENIED`. Wildcard `*` chỉ hợp lệ cho admin khi được cấu hình tường minh phía server. Cùng policy boundary cũng bảo vệ repository, direct CRM/draft HTTP routes, deterministic fallback và LLM fallback. Collection tools trả page tối đa 50 bản ghi cùng `totalCount` và `hasMore`; provider query pushdown/cursor vẫn là hạng mục hardening tiếp theo.

MCP stdio yêu cầu Node runtime có quyền tạo child process. Trên serverless như Vercel, AI path mặc định fail closed về deterministic fallback; remote MCP transport chưa thuộc phạm vi MVP này.

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

- Auth-enabled mode dùng token RM/admin tách biệt và ánh xạ token sang user/RM/branch phía server; scope header từ client không được tin cậy.
- Opportunity, interaction và campaign được scope theo tập khách hàng của RM/chi nhánh.
- Prompt audit được giới hạn, mask secret/PII và chỉ lưu mã tương quan HMAC có khóa thay cho `conversationId` do client cung cấp. `AUDIT_CORRELATION_KEY` là secret riêng, bắt buộc khi bật auth/pilot/production; local demo dùng khóa ngẫu nhiên theo process.
- LLM chỉ được bật với dữ liệu synthetic/anonymized và proxy đã cấu hình; approved-host/mTLS cần được xác minh độc lập trước pilot.
- Trước mỗi planner/synthesis/fallback call, ứng dụng token hóa PII có thể nhận diện trong RM message, context và observation; token chỉ được hoàn nguyên phía ứng dụng. Pilot vẫn cần DLP/NER policy để bao phủ PII ngoài regex.
- AI synthesizer và LLM fallback dùng strict JSON, sources do code sở hữu và entity-scoped sensitive-claim validation; output có customer/record ID, tên, điện thoại, tài khoản, ngày, số tiền hoặc tỷ lệ (kể cả dạng rút gọn/thập phân bằng chữ tiếng Việt) không grounded bị từ chối.
- Context process-local dùng snapshot + monotonic revision + compare-and-swap. Chỉ commit sau khi synthesis, grounding, sources và policy đều hợp lệ; Redis/distributed CAS vẫn là target.
- UI không hiển thị audit ID, latency, module hoặc raw endpoint.

Legacy audit được sanitize tại read path trước khi `getAuditLogs()` hoặc admin API trả dữ liệu. Repo không tự động
viết lại `logs/audit.log`. Sau khi có phê duyệt riêng cho migration, operator có thể dry-run rồi tạo **file mới**;
command từ chối overwrite và không hỗ trợ in-place migration. Trước khi chạy, phải cấu hình
`AUDIT_CORRELATION_KEY` đã được phê duyệt để mã tương quan trong file mới ổn định:

```bash
npm run audit:sanitize-legacy -- --input logs/audit.log
npm run audit:sanitize-legacy -- --input logs/audit.log --apply --output logs/audit.sanitized.log
```

Đây là kiến trúc MVP/hackathon. Pilot thật cần thay demo token bằng SSO/JWT của Bank A, nâng token vault regex thành DLP/NER được kiểm định, dùng audit store bất biến và context store Redis/database.
