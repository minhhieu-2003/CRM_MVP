import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  listCustomers,
  listOpportunities,
  listInteractions,
  listCampaigns,
  getCustomerByName,
  getCustomerById,
  getCustomerOpportunities,
  getCustomerInteractions,
  getMaturityCustomers,
  draftEmailForCustomer,
  draftCallScript
} from "../services/crmService.js";
import { writeAudit } from "../services/auditLogger.js";

const server = new McpServer({
  name: "bankrm-crm-toolkit",
  version: "1.0.0"
});

function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function audit(tool, sources) {
  writeAudit({
    auditId: crypto.randomUUID(),
    conversationId: "mcp",
    llmProvider: "mcp-toolkit",
    prompt: `tool:${tool}`,
    sources,
    module: "mcp",
    latencyMs: 0
  });
}

server.tool(
  "crm_list_customers",
  "Liệt kê toàn bộ khách hàng trong CRM sandbox.",
  {},
  async () => {
    audit("crm_list_customers", ["GET /customers"]);
    return ok(listCustomers());
  }
);

server.tool(
  "crm_get_customer",
  "Lấy hồ sơ khách hàng theo tên (khớp một phần, không phân biệt hoa thường).",
  { name: z.string().describe("Tên khách hàng cần tra cứu") },
  async ({ name }) => {
    audit("crm_get_customer", ["GET /customers"]);
    const customer = getCustomerByName(name);
    if (!customer) return ok({ error: `Không tìm thấy khách hàng "${name}".` });
    return ok(customer);
  }
);

server.tool(
  "crm_customers_due",
  "Lấy khách hàng có tiết kiệm đến hạn trong N ngày tới (mặc định 7).",
  { daysAhead: z.number().int().positive().default(7) },
  async ({ daysAhead }) => {
    audit("crm_customers_due", ["GET /customers"]);
    return ok(getMaturityCustomers(daysAhead));
  }
);

server.tool(
  "crm_list_opportunities",
  "Liệt kê cơ hội bán hàng; có thể lọc theo customerId.",
  { customerId: z.string().optional() },
  async ({ customerId }) => {
    audit("crm_list_opportunities", ["GET /opportunities"]);
    return ok(customerId ? getCustomerOpportunities(customerId) : listOpportunities());
  }
);

server.tool(
  "crm_list_interactions",
  "Liệt kê lịch sử tương tác; có thể lọc theo customerId.",
  { customerId: z.string().optional() },
  async ({ customerId }) => {
    audit("crm_list_interactions", ["GET /interactions"]);
    return ok(customerId ? getCustomerInteractions(customerId) : listInteractions());
  }
);

server.tool(
  "crm_list_campaigns",
  "Liệt kê các chiến dịch marketing/bán hàng.",
  {},
  async () => {
    audit("crm_list_campaigns", ["GET /campaigns"]);
    return ok(listCampaigns());
  }
);

server.tool(
  "crm_draft_email",
  "Soạn email follow-up cá nhân hóa cho một khách hàng (theo id).",
  {
    customerId: z.string().describe("Mã khách hàng, ví dụ C001"),
    suggestion: z.string().optional().describe("Gợi ý sản phẩm chèn vào email")
  },
  async ({ customerId, suggestion }) => {
    audit("crm_draft_email", ["GET /customers", "POST /draft-email"]);
    const customer = getCustomerById(customerId);
    if (!customer) return ok({ error: `Không tìm thấy khách hàng ${customerId}.` });
    const tip =
      suggestion ??
      (customer.segment === "Affluent"
        ? "Em đề xuất thêm gói bảo hiểm liên kết vay mua nhà để tối ưu bảo vệ tài chính."
        : "Em đề xuất tái tục tự động kỳ hạn linh hoạt để tối ưu dòng tiền.");
    return ok(draftEmailForCustomer(customer, tip));
  }
);

server.tool(
  "crm_call_script",
  "Tạo call script cá nhân hóa cho một khách hàng (theo id).",
  {
    customerId: z.string().describe("Mã khách hàng, ví dụ C001"),
    suggestion: z.string().optional()
  },
  async ({ customerId, suggestion }) => {
    audit("crm_call_script", ["GET /customers", "POST /call-script"]);
    const customer = getCustomerById(customerId);
    if (!customer) return ok({ error: `Không tìm thấy khách hàng ${customerId}.` });
    const tip =
      suggestion ??
      "Ngoài ra, em có thể gửi đề xuất bảo hiểm/lãi suất ưu đãi ngay sau cuộc gọi.";
    return ok({ script: draftCallScript(customer, tip) });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("BankRM CRM MCP toolkit đang chạy trên stdio.");
