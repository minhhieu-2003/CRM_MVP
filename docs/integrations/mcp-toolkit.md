# MCP Toolkit — BankRM CRM

MCP server là đường thực thi CRM nội bộ của `/api/chat` khi `AI_NATIVE_CORE=true`. Server chạy qua stdio, công bố catalog từ registry duy nhất và hỗ trợ các CRM provider `mock`, `sqlite`, `postgres` và `sandbox`.

> **Trạng thái:** Tài liệu runtime hiện hành. Xem [mục lục tài liệu](../README.md),
> [kiến trúc tổng thể](../architecture/architecture.md) và
> [AI-native core](../architecture/ai-native-core.md).

## Luồng runtime

```text
AI-native core
  -> MCP client: initialize, tools/list, tools/call
  -> MCP stdio server
  -> canonical tool registry
  -> server-bound policy / entitlement engine
  -> application-scoped CRM repository
  -> configured CRM provider
```

Identity, entitlement và `conversationId` do backend đưa vào environment riêng của MCP child; chúng không nằm trong tool arguments nên planner không thể tự thay đổi quyền. Khi `AUTH_ENABLED=true`, hoặc ở `pilot`/`production`, server bắt buộc có dedicated session hợp lệ và không chấp nhận scope sentinel `default` cho non-admin. Wildcard `*` chỉ hợp lệ cho admin khi server cấu hình tường minh đúng một wildcard.

Nếu AI/MCP path lỗi, `agentService.js` ghi quyết định fallback rồi chạy deterministic engine. Chỉ
khi deterministic engine vẫn không xử lý intent, [multi-agent router](multi-agent-router.md) mới
được gọi.

## Chạy local

```bash
npm run mcp
npm run smoke:mcp
```

Standalone local development được phép khi `AUTH_ENABLED=false`. Server chỉ dùng stdio, không mở cổng HTTP.

Pilot/production không được khởi động MCP session bằng identity mặc định và không được dùng
`CRM_MODE=mock`. MCP client nội bộ truyền sang child một allowlist cấu hình CRM/audit/identity/entitlement,
trong đó có dedicated `AUDIT_CORRELATION_KEY` để parent/child tạo cùng mã HMAC. Khóa này không được tái sử dụng
từ HTTP/CRM/LLM credential; LLM key, HTTP bearer token và raw prompt không nằm trong child environment.

## Provider và data boundary

| Provider   | Boundary                                               |
| ---------- | ------------------------------------------------------ |
| `mock`     | Chỉ local/test; bị từ chối trong `pilot`/`production`. |
| `sqlite`   | Database read-only, kiểm tra schema version.           |
| `postgres` | Pool tập trung; adapter chuẩn hóa row về camelCase.    |
| `sandbox`  | CRM API qua API key hoặc bearer, có request timeout.   |

Provider lỗi sẽ fail closed; runtime không tự chuyển sang mock. Trước provider, `toolPolicy.js` yêu
cầu capability và `crmRepository.js` kiểm tra lại entitlement + RM/branch application scope.
Provider-side predicate/RLS/query pushdown chưa được triển khai đầy đủ trong Phase 1.

## Tool catalog

| Tool                     | Mô tả                                                     | Nhãn nguồn                            |
| ------------------------ | --------------------------------------------------------- | ------------------------------------- |
| `crm_list_customers`     | Khách hàng trong RM/branch scope, có phân trang           | `GET /customers`                      |
| `crm_get_customer`       | Tra hồ sơ khách hàng theo tên                             | `GET /customers`                      |
| `crm_customers_due`      | Tiết kiệm đến hạn trong N ngày, có phân trang             | `GET /customers`                      |
| `crm_list_opportunities` | Cơ hội bán hàng, tùy chọn lọc khách hàng, có phân trang   | `GET /opportunities`                  |
| `crm_list_interactions`  | Lịch sử tương tác, tùy chọn lọc khách hàng, có phân trang | `GET /interactions`                   |
| `crm_list_campaigns`     | Chiến dịch phù hợp RM/branch scope, có phân trang         | `GET /campaigns`                      |
| `crm_draft_email`        | Tạo nội dung nháp; không gửi và không ghi CRM             | `GET /customers`, `POST /draft-email` |
| `crm_call_script`        | Tạo nội dung call script; không gọi và không ghi CRM      | `GET /customers`, `POST /call-script` |

`tools/list` trả input/output JSON Schema, required scopes, risk level, access mode và source metadata **sau khi** lọc theo entitlement server-bound. Actor phải có đủ tất cả `requiredScopes`; thiếu một scope thì tool không được công bố. Collection input dùng `limit` mặc định 25, tối đa 50, cùng `offset`. Ở MVP, paging giới hạn output/stdio/synthesis; provider vẫn có thể tải collection rồi application mới scope/cắt trang, nên query pushdown là hạng mục production hardening.

### Policy và metadata

- `inputSchema` được planner và registry validate; input ngoài schema bị từ chối.
- `outputSchema` được MCP client validate; text-only hoặc observation sai contract bị từ chối.
- `access` và `riskLevel` mô tả đặc tính tool cho discovery/governance; `riskLevel` không tự quyết định authorization.
- `requiredScopes` là metadata **được enforce** theo logic ALL tại `tools/list`, registry pre-execution, repository và các fallback/direct routes.
- Thiếu quyền trả structured `TOOL_SCOPE_DENIED`; policy chạy trước input validation/executor nên request bị deny không chạm CRM.
- Entitlement đến từ map cấu hình server-side. Header, prompt, tool argument hoặc ambient child env không thể tự cấp quyền trong auth-enabled/protected runtime.

Tất cả tool hiện tại có `access: read`. Hai tool draft có risk `medium` vì tạo nội dung giao tiếp,
nhưng không gửi email, thực hiện cuộc gọi hoặc ghi CRM.

## Observation contract

Mọi `tools/call` hợp lệ trả structured observation:

```json
{
  "status": "success",
  "data": {},
  "sources": [{ "endpoint": "GET /customers" }],
  "observedAt": "2026-07-13T00:00:00.000Z"
}
```

Business error dùng `status: "error"`, `data: null` và thêm `error` + `errorCode`. Collection data có envelope:

```json
{
  "items": [],
  "totalCount": 0,
  "returnedCount": 0,
  "offset": 0,
  "hasMore": false
}
```

Error observation bắt buộc có `errorCode` thuộc mapping đã biết (`TOOL_IDENTITY_INVALID`,
`TOOL_SCOPE_DENIED`, `TOOL_INPUT_INVALID`, `TOOL_BUSINESS_ERROR`,
`TOOL_OBSERVATION_TOO_LARGE`, `TOOL_EXECUTION_FAILED`). Success cấm `error/errorCode`.

Client từ chối text-only result, schema sai, tool ngoài allowlist hoặc error status không nhất quán.
Nó đối chiếu source **chính xác** với catalog tin cậy local độc lập với metadata do MCP server quảng
cáo, đồng thời kiểm tra `observedAt` không quá cũ/quá xa trong tương lai. Entitlement/scope không
được thêm vào observation đưa cho planner/synthesizer.

Collection page chỉ giới hạn payload sau khi repository đã đọc và scope collection. Vì vậy
`limit`/`offset` hiện bảo vệ stdio và synthesis, không cam kết giảm I/O tại database/CRM API. Query
pushdown và cursor ổn định là yêu cầu trước production scale.

## Cấu hình client ngoài cho local development

Internal AI core tự tạo và đóng session theo từng chat turn. Client MCP ngoài chỉ nên dùng cho local development:

```json
{
  "mcpServers": {
    "bankrm-crm": {
      "command": "node",
      "args": ["src/mcp/server.js"],
      "cwd": "<REPO_ROOT>",
      "env": {
        "AUTH_ENABLED": "false",
        "CRM_MODE": "mock"
      }
    }
  }
}
```

Không đưa LLM key, HTTP bearer token hoặc raw prompt vào MCP child environment. Pilot/production phải để ứng dụng backend tạo dedicated session thay vì cấu hình identity thủ công ở client ngoài.

## Serverless và deployment

MCP client hiện tạo Node child process theo từng AI turn. Guard runtime chỉ tự nhận diện biến
`VERCEL` và mặc định chặn stdio tại đó, trừ khi `MCP_ALLOW_STDIO_ON_SERVERLESS=true`; khi bị chặn,
AI path fail closed về deterministic fallback. Các serverless runtime khác phải có deployment
policy tương đương vì code chưa tự nhận diện chúng. Không bật cờ override nếu runtime không bảo đảm
child-process lifecycle và capacity.

Hai hướng production hợp lệ cần được đánh giá riêng:

1. chạy Express + MCP stdio trên VM/container có process supervision, capacity metrics và
   backpressure; hoặc
2. bổ sung remote MCP transport được xác thực bằng service identity/mTLS và giữ nguyên registry,
   observation contract cùng audit policy.

Remote transport chưa thuộc phạm vi MVP hiện tại.

## Audit và timeout

- Mọi tool call và request bị từ chối đều cố gắng ghi NDJSON với actor scope, conversation, decision và source; call đã bắt đầu execution có thêm latency.
- AI core ghi parent-side mirror cho từng observation/exception; `/api/audit-logs` đồng thời hợp nhất recent parent memory với recent NDJSON do MCP child ghi.
- Request timeout giới hạn từng MCP request; session budget tự đóng child và nhả capacity. Planner/synthesizer vẫn có timeout riêng ở LLM gateway.
- Tool call không tự retry. Chỉ connect/discovery được retry tối đa một lần.

## Checklist pilot

- Thay demo auth/map cấu hình bằng SSO/OIDC + entitlement service có provisioning/revocation và access review.
- Thêm query pushdown/cursor cho PostgreSQL và CRM sandbox.
- Xác minh configured LLM proxy có approved-host/mTLS, redaction/DLP, logging, rate limit và egress policy; các thuộc
  tính này không được ứng dụng tự kiểm chứng.
- Đưa context/audit sang store tập trung có mã hóa, retention và alerting.
- Chọn stdio container runtime hoặc thiết kế remote MCP transport cho môi trường triển khai.
- Chạy test cross-scope, malformed observation, timeout/capacity, source coverage và fallback.

Lộ trình đầy đủ nằm tại [đề xuất tích hợp Bank A CRM](integration-proposal.md).
