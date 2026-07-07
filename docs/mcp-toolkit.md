# MCP Toolkit — BankRM CRM

Bộ **MCP server** expose dữ liệu CRM sandbox dưới dạng tool để AI Agent (Claude, Copilot, Cursor...) gọi qua Model Context Protocol.

## Chạy MCP server

```bash
npm run mcp
```

Server chạy trên **stdio** (chuẩn MCP). Không mở cổng HTTP.

## Danh sách tool

| Tool | Mô tả | Endpoint truy vết |
|------|-------|-------------------|
| `crm_list_customers` | Liệt kê toàn bộ khách hàng | `GET /customers` |
| `crm_get_customer` | Tra hồ sơ khách theo tên | `GET /customers` |
| `crm_customers_due` | Khách có tiết kiệm đến hạn N ngày tới | `GET /customers` |
| `crm_list_opportunities` | Cơ hội bán hàng (lọc theo customerId) | `GET /opportunities` |
| `crm_list_interactions` | Lịch sử tương tác (lọc theo customerId) | `GET /interactions` |
| `crm_list_campaigns` | Danh sách chiến dịch | `GET /campaigns` |
| `crm_draft_email` | Soạn email follow-up cá nhân hóa | `POST /draft-email` |
| `crm_call_script` | Tạo call script cá nhân hóa | `POST /call-script` |

## Đăng ký với MCP client

Dùng file `mcp.config.json` ở gốc repo, hoặc cấu hình trong client:

```json
{
  "mcpServers": {
    "bankrm-crm": {
      "command": "node",
      "args": ["src/mcp/server.js"],
      "cwd": "D:/CRM_MVP"
    }
  }
}
```

## Audit
Mọi lần gọi tool đều ghi audit log qua `writeAudit()` (`logs/audit.log`), kèm danh sách endpoint đã dùng để truy vết nguồn.
