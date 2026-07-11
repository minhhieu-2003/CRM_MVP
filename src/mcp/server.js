import crypto from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getCrmConfig } from "../services/dbClient.js";
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
} from "../services/crmRepository.js";
import { writeAudit } from "../services/auditLogger.js";

const env = process.env.NODE_ENV || "development";
if ((env === "pilot" || env === "production") && process.env.AUTH_ENABLED !== "true") {
  console.error("FATAL: Khởi động thất bại. Hệ thống bắt buộc phải bật xác thực (AUTH_ENABLED=true) trên môi trường pilot/production.");
  process.exit(1);
}

try {
  getCrmConfig();
} catch (error) {
  console.error(`FATAL: Khởi động CRM thất bại. ${error.message}`);
  process.exit(1);
}

function getIdentity() {
  return {
    userId: process.env.USER_ID || "mcp-user",
    rmId: process.env.RM_ID || "default",
    role: process.env.ROLE || "rm",
    branchId: process.env.BRANCH_ID || "default"
  };
}

function checkToolAuth(toolName) {
  if (process.env.AUTH_ENABLED !== "true") return null;
  const identity = getIdentity();
  if (toolName === "crm_list_campaigns" && identity.role !== "admin") {
    return "Lỗi: Tool này yêu cầu quyền admin.";
  }
  return null;
}

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
    const authError = checkToolAuth("crm_list_customers");
    if (authError) return ok({ error: authError });
    const identity = getIdentity();

    audit("crm_list_customers", ["GET /customers"]);
    return ok(await listCustomers(identity));
  }
);

server.tool(
  "crm_get_customer",
  "Lấy hồ sơ khách hàng theo tên, hỗ trợ có dấu và không dấu.",
  { name: z.string().describe("Tên khách hàng cần tra cứu") },
  async ({ name }) => {
    const authError = checkToolAuth("crm_get_customer");
    if (authError) return ok({ error: authError });
    const identity = getIdentity();

    audit("crm_get_customer", ["GET /customers"]);
    const customer = await getCustomerByName(name, identity);
    if (!customer) return ok({ error: `Không tìm thấy khách hàng "${name}".` });
    return ok(customer);
  }
);

server.tool(
  "crm_customers_due",
  "Lấy khách hàng có tiết kiệm đến hạn trong N ngày tới.",
  { daysAhead: z.number().int().positive().default(7) },
  async ({ daysAhead }) => {
    const authError = checkToolAuth("crm_customers_due");
    if (authError) return ok({ error: authError });
    const identity = getIdentity();

    audit("crm_customers_due", ["GET /customers"]);
    return ok(await getMaturityCustomers(daysAhead, identity));
  }
);

server.tool(
  "crm_list_opportunities",
  "Liệt kê cơ hội bán hàng; có thể lọc theo customerId.",
  { customerId: z.string().optional() },
  async ({ customerId }) => {
    const authError = checkToolAuth("crm_list_opportunities");
    if (authError) return ok({ error: authError });
    const identity = getIdentity();

    audit("crm_list_opportunities", ["GET /opportunities"]);
    return ok(customerId ? await getCustomerOpportunities(customerId, identity) : await listOpportunities(identity));
  }
);

server.tool(
  "crm_list_interactions",
  "Liệt kê lịch sử tương tác; có thể lọc theo customerId.",
  { customerId: z.string().optional() },
  async ({ customerId }) => {
    const authError = checkToolAuth("crm_list_interactions");
    if (authError) return ok({ error: authError });
    const identity = getIdentity();

    audit("crm_list_interactions", ["GET /interactions"]);
    return ok(customerId ? await getCustomerInteractions(customerId, identity) : await listInteractions(identity));
  }
);

server.tool(
  "crm_list_campaigns",
  "Liệt kê các chiến dịch marketing/bán hàng.",
  {},
  async () => {
    const authError = checkToolAuth("crm_list_campaigns");
    if (authError) return ok({ error: authError });
    const identity = getIdentity();

    audit("crm_list_campaigns", ["GET /campaigns"]);
    return ok(await listCampaigns(identity));
  }
);

server.tool(
  "crm_draft_email",
  "Soạn email follow-up cá nhân hóa cho một khách hàng.",
  {
    customerId: z.string().describe("Mã khách hàng, ví dụ C001"),
    suggestion: z.string().optional().describe("Gợi ý sản phẩm chèn vào email")
  },
  async ({ customerId, suggestion }) => {
    const authError = checkToolAuth("crm_draft_email");
    if (authError) return ok({ error: authError });
    const identity = getIdentity();

    audit("crm_draft_email", ["GET /customers", "POST /draft-email"]);
    const customer = await getCustomerById(customerId, identity);
    if (!customer) return ok({ error: `Không tìm thấy khách hàng ${customerId}.` });
    const tip =
      suggestion ??
      (customer.segment === "Affluent"
        ? "Em đề xuất thêm gói bảo hiểm liên kết vay mua nhà để tối ưu bảo vệ tài chính."
        : "Em đề xuất tái tục tự động kỳ hạn linh hoạt để tối ưu dòng tiền.");
    return ok(await draftEmailForCustomer(customer, tip));
  }
);

server.tool(
  "crm_call_script",
  "Tạo call script cá nhân hóa cho một khách hàng.",
  {
    customerId: z.string().describe("Mã khách hàng, ví dụ C001"),
    suggestion: z.string().optional()
  },
  async ({ customerId, suggestion }) => {
    const authError = checkToolAuth("crm_call_script");
    if (authError) return ok({ error: authError });
    const identity = getIdentity();

    audit("crm_call_script", ["GET /customers", "POST /call-script"]);
    const customer = await getCustomerById(customerId, identity);
    if (!customer) return ok({ error: `Không tìm thấy khách hàng ${customerId}.` });
    const tip =
      suggestion ??
      "Ngoài ra, em có thể gửi đề xuất bảo hiểm/lãi suất ưu đãi ngay sau cuộc gọi.";
    return ok({ script: await draftCallScript(customer, tip) });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("BankRM CRM MCP toolkit đang chạy trên stdio.");
