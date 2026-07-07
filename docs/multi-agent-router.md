# Multi-Agent Router & Cơ chế dự phòng

## Tổng quan

Hệ thống có 2 lớp điều hướng:

1. **Rule engine (MCP context engine)** — `src/services/mcpContextEngine.js`
   - Lớp chính, IF/ELSE, xử lý các intent CRM cốt lõi: nhắc đến hạn, soạn email,
     call script, gợi ý cơ hội, xem chiến dịch.
   - Khi không khớp intent → trả `{ fallback: true }`.

2. **Multi-agent router (plugin)** — `src/plugins/router.js`
   - Chỉ kích hoạt khi rule engine trả `fallback: true`.
   - Có nhiều **agent plugin "chờ sẵn"** trong registry, được thử lần lượt theo
     `priority` (thấp = ưu tiên trước) và điều kiện `match()`.
   - **Dự phòng theo chuỗi**: một agent lỗi hoặc không trả kết quả → tự động
     chuyển sang agent kế tiếp. Nếu không agent nào xử lý được → dùng fallback
     tĩnh của rule engine.

```
message
  │
  ▼
rule engine (IF/ELSE)  ──khớp intent──▶  trả lời CRM
  │ không khớp (fallback:true)
  ▼
router.dispatchFallback()
  ├─ smalltalk-agent   (priority 10, nội bộ)
  ├─ capability-agent  (priority 20, nội bộ)
  └─ llm-fallback-agent(priority 90, gọi LLM proxy — chỉ khi đã cấu hình)
  │ không agent nào xử lý được / tất cả lỗi
  ▼
fallback tĩnh (rule engine)
```

## Agent plugin interface

Mỗi agent là một object:

```js
{
  id: "ten-agent",
  description: "Mô tả ngắn",
  priority: 10,                       // thấp = thử trước
  enabled: () => true,               // bật/tắt runtime (vd theo env)
  match: ({ message, normalized }) => boolean,
  run: async ({ message, normalized }) => ({
    reply: "...",                    // bắt buộc
    sources: [{ endpoint: "..." }],  // truy vết nguồn
    provider: "ten-agent"
  })
}
```

Đăng ký thêm agent lúc chạy: `registerAgent(agent)` trong `src/plugins/router.js`.

## Các agent hiện có

| Agent | Priority | Enabled | Vai trò |
|-------|----------|---------|---------|
| `smalltalk-agent` | 10 | luôn bật | Chào hỏi, cảm ơn, tạm biệt |
| `capability-agent` | 20 | luôn bật | Giới thiệu năng lực, hướng dẫn |
| `llm-fallback-agent` | 90 | khi cấu hình LLM | Dự phòng cuối bằng LLM qua proxy |

Kiểm tra registry qua API: `GET /api/agents`.

## Cấu hình LLM agent (tùy chọn)

Sao chép `.env.example` → `.env` và điền:

```
LLM_API_URL=https://your-approved-proxy.example.com/v1/chat/completions
LLM_API_KEY=...
LLM_MODEL=gpt-4o-mini
```

- Nếu **không** cấu hình, `llm-fallback-agent` ở trạng thái `enabled:false` (chờ sẵn
  nhưng không chạy) → hệ thống chỉ dùng agent nội bộ + fallback tĩnh, **không gọi
  API bên ngoài**.
- Endpoint phải là proxy **đã được phê duyệt và có logging** (theo `RULES.md`).
- `npm start` / `npm run dev` tự nạp `.env` qua `--env-file-if-exists`.

## Audit & bảo mật

- Mọi lượt xử lý được ghi audit (`llmProvider`, `sources`, `module`, `latencyMs`).
  - Agent nội bộ: `router:smalltalk-agent`, `router:capability-agent`.
  - LLM: `router:llm-fallback:<model>`.
  - Lỗi agent: bản ghi riêng `agent-error:<agentId>` kèm thông báo lỗi.
- Không rò rỉ metadata kỹ thuật ra UI (frontend chỉ hiển thị `reply`).
