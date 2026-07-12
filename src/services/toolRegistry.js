import crypto from "node:crypto";
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
} from "./crmRepository.js";
import { writeAudit } from "./auditLogger.js";

const identitySchema = z
  .object({
    userId: z.string().min(1),
    rmId: z.string().min(1),
    role: z.string().min(1),
    branchId: z.string().min(1)
  })
  .passthrough();

const noInputSchema = z.object({});
const customerNameSchema = z.object({
  name: z.string().describe("Tên khách hàng cần tra cứu")
});
const customersDueSchema = z.object({
  daysAhead: z.number().int().positive().default(7)
});
const optionalCustomerSchema = z.object({
  customerId: z.string().optional()
});
const draftEmailSchema = z.object({
  customerId: z.string().describe("Mã khách hàng, ví dụ C001"),
  suggestion: z.string().optional().describe("Gợi ý sản phẩm chèn vào email")
});
const callScriptSchema = z.object({
  customerId: z.string().describe("Mã khách hàng, ví dụ C001"),
  suggestion: z.string().optional()
});

function audit(tool, sources, conversationId, details = {}) {
  writeAudit({
    auditId: crypto.randomUUID(),
    conversationId,
    llmProvider: "mcp-toolkit",
    prompt: `tool:${tool}`,
    sources,
    module: "mcp",
    latencyMs: details.latencyMs ?? 0,
    decision: details.decision,
    error: details.error
  });
}

const toolDefinitions = Object.freeze([
  {
    name: "crm_list_customers",
    description: "Liệt kê toàn bộ khách hàng trong CRM sandbox.",
    inputSchema: noInputSchema,
    sources: ["GET /customers"],
    execute: async (_input, identity) => listCustomers(identity)
  },
  {
    name: "crm_get_customer",
    description: "Lấy hồ sơ khách hàng theo tên, hỗ trợ có dấu và không dấu.",
    inputSchema: customerNameSchema,
    sources: ["GET /customers"],
    execute: async ({ name }, identity) => {
      const customer = await getCustomerByName(name, identity);
      return customer ?? { error: `Không tìm thấy khách hàng "${name}".` };
    }
  },
  {
    name: "crm_customers_due",
    description: "Lấy khách hàng có tiết kiệm đến hạn trong N ngày tới.",
    inputSchema: customersDueSchema,
    sources: ["GET /customers"],
    execute: async ({ daysAhead }, identity) => getMaturityCustomers(daysAhead, identity)
  },
  {
    name: "crm_list_opportunities",
    description: "Liệt kê cơ hội bán hàng; có thể lọc theo customerId.",
    inputSchema: optionalCustomerSchema,
    sources: ["GET /opportunities"],
    execute: async ({ customerId }, identity) =>
      customerId
        ? getCustomerOpportunities(customerId, identity)
        : listOpportunities(identity)
  },
  {
    name: "crm_list_interactions",
    description: "Liệt kê lịch sử tương tác; có thể lọc theo customerId.",
    inputSchema: optionalCustomerSchema,
    sources: ["GET /interactions"],
    execute: async ({ customerId }, identity) =>
      customerId ? getCustomerInteractions(customerId, identity) : listInteractions(identity)
  },
  {
    name: "crm_list_campaigns",
    description: "Liệt kê các chiến dịch marketing/bán hàng.",
    inputSchema: noInputSchema,
    sources: ["GET /campaigns"],
    execute: async (_input, identity) => listCampaigns(identity)
  },
  {
    name: "crm_draft_email",
    description: "Soạn email follow-up cá nhân hóa cho một khách hàng.",
    inputSchema: draftEmailSchema,
    sources: ["GET /customers", "POST /draft-email"],
    execute: async ({ customerId, suggestion }, identity) => {
      const customer = await getCustomerById(customerId, identity);
      if (!customer) return { error: `Không tìm thấy khách hàng ${customerId}.` };

      const tip =
        suggestion ??
        (customer.segment === "Affluent"
          ? "Em đề xuất thêm gói bảo hiểm liên kết vay mua nhà để tối ưu bảo vệ tài chính."
          : "Em đề xuất tái tục tự động kỳ hạn linh hoạt để tối ưu dòng tiền.");
      return draftEmailForCustomer(customer, tip);
    }
  },
  {
    name: "crm_call_script",
    description: "Tạo call script cá nhân hóa cho một khách hàng.",
    inputSchema: callScriptSchema,
    sources: ["GET /customers", "POST /call-script"],
    execute: async ({ customerId, suggestion }, identity) => {
      const customer = await getCustomerById(customerId, identity);
      if (!customer) return { error: `Không tìm thấy khách hàng ${customerId}.` };

      const tip =
        suggestion ??
        "Ngoài ra, em có thể gửi đề xuất bảo hiểm/lãi suất ưu đãi ngay sau cuộc gọi.";
      return { script: await draftCallScript(customer, tip) };
    }
  }
]);

const toolAllowlist = new Map(toolDefinitions.map((tool) => [tool.name, tool]));

export function listAgentTools() {
  return toolDefinitions.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema
  }));
}

export async function executeAgentTool({ name, input = {}, identity, conversationId = "mcp" }) {
  const tool = toolAllowlist.get(name);
  const auditConversationId =
    typeof conversationId === "string" && conversationId.trim() ? conversationId : "invalid";
  if (!tool) {
    audit(name || "unknown", ["internal://tool-registry"], auditConversationId, {
      decision: "deny",
      error: "tool-not-allowed"
    });
    throw new Error(`Tool is not allowed: ${name}`);
  }

  let parsedIdentity;
  let parsedConversationId;
  let parsedInput;
  try {
    parsedIdentity = identitySchema.parse(identity);
    parsedConversationId = z.string().min(1).parse(conversationId);
    parsedInput = tool.inputSchema.parse(input);
  } catch (error) {
    audit(name, tool.sources, auditConversationId, {
      decision: "deny",
      error: "invalid-tool-request"
    });
    throw error;
  }

  const startedAt = Date.now();
  try {
    const data = await tool.execute(parsedInput, parsedIdentity);
    audit(name, tool.sources, parsedConversationId, {
      decision: "allow",
      latencyMs: Date.now() - startedAt
    });
    return { data, sources: [...tool.sources] };
  } catch (error) {
    audit(name, tool.sources, parsedConversationId, {
      decision: "deny",
      latencyMs: Date.now() - startedAt,
      error: "tool-execution-failed"
    });
    throw error;
  }
}
