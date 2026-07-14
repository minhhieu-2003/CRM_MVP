# Multi-Agent Router và chuỗi dự phòng

> **Trạng thái:** Tài liệu runtime hiện hành. Xem [mục lục tài liệu](../README.md) và
> [kiến trúc tổng thể](../architecture/architecture.md) để biết vị trí của router trong hệ thống.

## Vị trí trong runtime

Multi-agent router không phải đường xử lý CRM chính. Thứ tự điều phối của `/api/chat` là:

1. Khi `AI_NATIVE_CORE=true`, `agentService.js` thử AI-native core: planner qua configured proxy,
   MCP client/server, canonical tool registry, entitlement policy và application-scoped repository.
2. Nếu AI core bị tắt, data policy chặn, proxy/MCP lỗi hoặc plan không hợp lệ, hệ thống chạy
   deterministic engine trong `mcpContextEngine.js`.
3. Chỉ khi deterministic engine trả `{ fallback: true }`, `src/plugins/router.js` mới thử các
   plugin theo `priority`.
4. Nếu không plugin nào xử lý được, câu trả lời fallback tĩnh của deterministic engine được giữ
   nguyên.

```text
message
  |
  +-- AI_NATIVE_CORE=true và policy cho phép
  |     -> configured LLM planner
  |     -> MCP tools/list + tools/call
  |     -> canonical registry -> entitlement policy -> application-scoped repository -> CRM provider
  |     -> grounded synthesis
  |          |
  |          +-- lỗi/timeout/invalid -> deterministic fallback
  |
  +-- AI core tắt hoặc fallback
        -> mcpContextEngine.js
             |
             +-- khớp intent -> trả lời CRM
             |
             +-- fallback:true -> router.dispatchFallback()
                    +-- smalltalk-agent
                    +-- capability-agent
                    +-- llm-fallback-agent (nếu đủ policy gate)
                    +-- không xử lý được -> giữ fallback tĩnh
```

Deterministic engine và LLM fallback đều yêu cầu entitlement rồi đọc dữ liệu qua
`crmRepository.js`; capability và RM/branch scope không bị bỏ qua khi chuyển đường xử lý. Cả
deterministic path và AI-native path dùng context snapshot/draft/CAS, nên response lỗi hoặc turn cũ
không ghi đè state hợp lệ.

## Agent plugin interface

Mỗi plugin là một object:

```js
{
  id: "ten-agent",
  description: "Mô tả ngắn",
  priority: 10, // số thấp được thử trước
  enabled: () => true,
  match: ({ message, normalized }) => boolean,
  run: async ({ message, normalized, identity }) => ({
    reply: "...",
    sources: [{ endpoint: "..." }],
    provider: "ten-agent"
  })
}
```

Router chuẩn hóa tiếng Việt trước khi gọi `match()`. Một plugin lỗi hoặc không trả `reply` sẽ
không chặn các plugin kế tiếp. Có thể đăng ký thêm plugin trong process bằng
`registerAgent(agent)`; danh sách hiện tại được công bố qua `GET /api/agents`.

## Các plugin hiện có

| Agent                | Priority | Điều kiện bật                                                               | Vai trò                                   |
| -------------------- | -------: | --------------------------------------------------------------------------- | ----------------------------------------- |
| `smalltalk-agent`    |       10 | Luôn bật                                                                    | Chào hỏi, cảm ơn, tạm biệt.               |
| `capability-agent`   |       20 | Luôn bật                                                                    | Giới thiệu năng lực và hướng dẫn sử dụng. |
| `llm-fallback-agent` |       90 | Configured proxy vượt gate ứng dụng, data class được phép và đủ read scopes | Trả lời dự phòng qua proxy LLM.           |

## Policy gate của LLM fallback

`llm-fallback-agent` chỉ được bật khi đồng thời thỏa mãn:

- `LLM_API_URL` và `LLM_API_KEY` đã cấu hình;
- URL dùng HTTPS, trừ loopback phục vụ test/local;
- URL không trỏ trực tiếp đến các model vendor bị chặn;
- `AI_DATA_CLASSIFICATION` là `synthetic` hoặc `anonymized`.

Đây là các gate mà ứng dụng hiện enforce. Trước proxy call, fallback token hóa PII có thể nhận diện
trong RM message và CRM context rồi chỉ hoàn nguyên output phía ứng dụng. Việc proxy có logging,
rate limit và các kiểm soát nội bộ khác, cùng DLP/NER bao phủ ngoài regex, là yêu cầu vận hành/pilot
chưa được ứng dụng tự xác minh. Không đặt
`internal`, `pii` hoặc `restricted` vào `AI_DATA_CLASSIFICATION` để cố bật LLM; các giá trị này bị
chặn.

LLM fallback lấy tối đa 20 khách hàng, 20 cơ hội và 10 chiến dịch theo mặc định. Dữ liệu được lấy
qua scoped repository trước khi cắt giới hạn. Đây là giới hạn context, chưa phải query pushdown ở
provider.

Trước khi đọc CRM hoặc gọi proxy, fallback phải có đủ `customer:read`, `opportunity:read` và
`campaign:read`; thiếu quyền dừng với `TOOL_SCOPE_DENIED` và không gọi CRM/LLM. Proxy phải trả
strict JSON `{reply}`. Sources do code gắn từ các repository call thực tế và shared typed
sensitive-claim validator từ chối ID/ngày/số tiền/tỷ lệ không grounded. Validator chưa tương đương
field-level/entity-scoped provenance hoàn hảo.

## Ranh giới identity và môi trường

- Local development có thể chạy với `AUTH_ENABLED=false` và identity mặc định để dùng dữ liệu
  mock/sandbox cục bộ.
- Khi auth được bật hoặc ở `pilot`/`production`, non-admin phải có RM/branch scope thật; sentinel
  `default` bị từ chối trước đường LLM fallback.
- HTTP token-to-scope mapping nằm ở backend. Plugin nhận identity đã được backend xác thực và
  không nhận scope từ nội dung prompt.
- Pilot/production không được dùng `CRM_MODE=mock`.

Auth hiện tại là cơ chế bearer token phục vụ demo/pilot có kiểm soát, chưa thay thế SSO/JWT,
entitlement service hay RBAC production-grade.

## Audit và nguồn

- Turn cuối cùng cố gắng ghi `llmProvider`, actor/scope, mã tương quan băm thay cho raw `conversationId`, sources, module và latency; audit local hiện là best-effort.
- Plugin nội bộ dùng provider `router:smalltalk-agent` hoặc `router:capability-agent`.
- LLM fallback dùng `router:llm-fallback:<model>` và khai báo các CRM endpoint cùng
  `POST /llm-proxy/chat`.
- Lỗi plugin tạo event riêng `agent-error:<agentId>` rồi router tiếp tục chuỗi dự phòng.
- UI chỉ hiển thị nội dung nghiệp vụ; metadata kỹ thuật không được render trong RM Chat.

Chi tiết tool execution và structured observations nằm tại [MCP Toolkit](mcp-toolkit.md).
