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
import { buildAuditActor, writeAudit } from "./auditLogger.js";
import { McpToolObservationSchema, normalizeToolSources } from "../mcp/protocol.js";
import {
  EntitlementsSchema,
  evaluateToolAccess,
  TOOL_POLICY_SOURCE,
  TOOL_SCOPE_DENIED
} from "./toolPolicy.js";

const MAX_TOOL_OBSERVATION_BYTES = 40_000;
const TOOL_REGISTRY_SOURCE = "internal://tool-registry";
const TOOL_EXECUTION_SOURCE = "internal://tool-execution";
const SAFE_REJECTED_TOOL_AUDIT_PROMPT = "tool:rejected";
const identitySchema = z
  .object({
    userId: z.string().trim().min(1).max(128),
    rmId: z.string().trim().min(1).max(128).optional(),
    role: z.enum(["admin", "rm", "user"]),
    branchId: z.string().trim().min(1).max(128).optional(),
    entitlements: EntitlementsSchema
  })
  .passthrough()
  .superRefine((identity, context) => {
    if (identity.role !== "admin" && (!identity.rmId || !identity.branchId)) {
      context.addIssue({
        code: "custom",
        message: "RM and branch identity are required for non-admin tool calls."
      });
    }
    if (identity.entitlements.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["entitlements"],
        message: "At least one server-bound entitlement is required."
      });
    }
    if (identity.role !== "admin" && identity.entitlements.includes("*")) {
      context.addIssue({
        code: "custom",
        path: ["entitlements"],
        message: "Wildcard access is restricted to an explicitly configured admin identity."
      });
    }
  });

const pageFields = {
  limit: z.number().int().min(1).max(50).default(25),
  offset: z.number().int().min(0).max(100_000).default(0)
};
const collectionPageSchema = z.object(pageFields).strict();
const customerNameSchema = z
  .object({
    name: z.string().trim().min(1).max(200).describe("Tên khách hàng cần tra cứu")
  })
  .strict();
const customersDueSchema = z
  .object({
    daysAhead: z.number().int().min(1).max(365).default(7),
    ...pageFields
  })
  .strict();
const optionalCustomerSchema = z
  .object({
    customerId: z.string().trim().min(1).max(100).optional(),
    ...pageFields
  })
  .strict();
const draftEmailSchema = z
  .object({
    customerId: z.string().trim().min(1).max(100).describe("Mã khách hàng, ví dụ C001"),
    suggestion: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .optional()
      .describe("Gợi ý sản phẩm chèn vào email")
  })
  .strict();
const callScriptSchema = z
  .object({
    customerId: z.string().trim().min(1).max(100).describe("Mã khách hàng, ví dụ C001"),
    suggestion: z.string().trim().min(1).max(1000).optional()
  })
  .strict();

function audit(tool, sources, conversationId, identity, details = {}) {
  writeAudit({
    auditId: crypto.randomUUID(),
    ...buildAuditActor(identity),
    conversationId,
    llmProvider: "mcp-toolkit",
    prompt: details.prompt ?? `tool:${tool}`,
    sources,
    module: "mcp",
    latencyMs: details.latencyMs ?? 0,
    decision: details.decision,
    error: details.error
  });
}

function pageCollection(items, { limit, offset }) {
  const page = items.slice(offset, offset + limit);
  return {
    items: page,
    totalCount: items.length,
    returnedCount: page.length,
    offset,
    hasMore: offset + page.length < items.length
  };
}

function errorObservation({ errorCode, error, sources }) {
  return McpToolObservationSchema.parse({
    status: "error",
    data: null,
    sources: normalizeToolSources(sources),
    observedAt: new Date().toISOString(),
    error,
    errorCode
  });
}

function advertisedErrorSources(sources = [], businessErrorSources = []) {
  return normalizeToolSources([
    ...sources,
    ...businessErrorSources,
    TOOL_POLICY_SOURCE,
    TOOL_REGISTRY_SOURCE,
    TOOL_EXECUTION_SOURCE
  ]);
}

const toolDefinitions = Object.freeze([
  {
    name: "crm_list_customers",
    description: "Liệt kê toàn bộ khách hàng trong phạm vi CRM được cấp quyền.",
    inputSchema: collectionPageSchema,
    outputSchema: McpToolObservationSchema,
    requiredScopes: ["customer:read"],
    riskLevel: "low",
    access: "read",
    sources: ["GET /customers"],
    execute: async (input, identity) => pageCollection(await listCustomers(identity), input)
  },
  {
    name: "crm_get_customer",
    description: "Lấy hồ sơ khách hàng theo tên, hỗ trợ có dấu và không dấu.",
    inputSchema: customerNameSchema,
    outputSchema: McpToolObservationSchema,
    requiredScopes: ["customer:read"],
    riskLevel: "low",
    access: "read",
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
    outputSchema: McpToolObservationSchema,
    requiredScopes: ["customer:read"],
    riskLevel: "low",
    access: "read",
    sources: ["GET /customers"],
    execute: async ({ daysAhead, limit, offset }, identity) =>
      pageCollection(await getMaturityCustomers(daysAhead, identity), { limit, offset })
  },
  {
    name: "crm_list_opportunities",
    description: "Liệt kê cơ hội bán hàng; có thể lọc theo customerId.",
    inputSchema: optionalCustomerSchema,
    outputSchema: McpToolObservationSchema,
    requiredScopes: ["opportunity:read"],
    riskLevel: "low",
    access: "read",
    sources: ["GET /opportunities"],
    execute: async ({ customerId, limit, offset }, identity) =>
      pageCollection(
        await (customerId
          ? getCustomerOpportunities(customerId, identity)
          : listOpportunities(identity)),
        { limit, offset }
      )
  },
  {
    name: "crm_list_interactions",
    description: "Liệt kê lịch sử tương tác; có thể lọc theo customerId.",
    inputSchema: optionalCustomerSchema,
    outputSchema: McpToolObservationSchema,
    requiredScopes: ["interaction:read"],
    riskLevel: "low",
    access: "read",
    sources: ["GET /interactions"],
    execute: async ({ customerId, limit, offset }, identity) =>
      pageCollection(
        await (customerId
          ? getCustomerInteractions(customerId, identity)
          : listInteractions(identity)),
        { limit, offset }
      )
  },
  {
    name: "crm_list_campaigns",
    description: "Liệt kê các chiến dịch marketing/bán hàng trong phạm vi được cấp quyền.",
    inputSchema: collectionPageSchema,
    outputSchema: McpToolObservationSchema,
    requiredScopes: ["campaign:read"],
    riskLevel: "low",
    access: "read",
    sources: ["GET /campaigns"],
    execute: async (input, identity) => pageCollection(await listCampaigns(identity), input)
  },
  {
    name: "crm_draft_email",
    description: "Soạn bản nháp email follow-up; không gửi email và không ghi CRM.",
    inputSchema: draftEmailSchema,
    outputSchema: McpToolObservationSchema,
    requiredScopes: ["customer:read", "communication:draft"],
    riskLevel: "medium",
    access: "read",
    sources: ["GET /customers", "POST /draft-email"],
    businessErrorSources: ["GET /customers"],
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
    description: "Tạo bản nháp call script; không thực hiện cuộc gọi và không ghi CRM.",
    inputSchema: callScriptSchema,
    outputSchema: McpToolObservationSchema,
    requiredScopes: ["customer:read", "communication:draft"],
    riskLevel: "medium",
    access: "read",
    sources: ["GET /customers", "POST /call-script"],
    businessErrorSources: ["GET /customers"],
    execute: async ({ customerId, suggestion }, identity) => {
      const customer = await getCustomerById(customerId, identity);
      if (!customer) return { error: `Không tìm thấy khách hàng ${customerId}.` };

      const tip =
        suggestion ?? "Ngoài ra, em có thể gửi đề xuất bảo hiểm/lãi suất ưu đãi ngay sau cuộc gọi.";
      return { script: await draftCallScript(customer, tip) };
    }
  }
]);

const toolAllowlist = new Map(toolDefinitions.map((tool) => [tool.name, tool]));

export function listAgentTools({ entitlements = [] } = {}) {
  return toolDefinitions
    .filter(
      (tool) => evaluateToolAccess({ entitlements, requiredScopes: tool.requiredScopes }).allowed
    )
    .map(
      ({
        name,
        description,
        inputSchema,
        outputSchema,
        requiredScopes,
        riskLevel,
        access,
        sources,
        businessErrorSources
      }) => ({
        name,
        description,
        inputSchema,
        outputSchema,
        requiredScopes: [...requiredScopes],
        riskLevel,
        access,
        sources: normalizeToolSources(sources),
        errorSources: advertisedErrorSources(sources, businessErrorSources)
      })
    );
}

export async function executeAgentTool({ name, input = {}, identity, conversationId = "mcp" }) {
  const tool = toolAllowlist.get(name);
  const auditConversationId =
    typeof conversationId === "string" && conversationId.trim() ? conversationId : "invalid";
  if (!tool) {
    audit(name || "unknown", [TOOL_REGISTRY_SOURCE], auditConversationId, identity, {
      decision: "deny",
      error: "TOOL_NOT_ALLOWED",
      prompt: SAFE_REJECTED_TOOL_AUDIT_PROMPT
    });
    throw new Error("Tool is not allowed.");
  }

  let parsedIdentity;
  let parsedConversationId;
  try {
    parsedIdentity = identitySchema.parse(identity);
    parsedConversationId = z.string().min(1).parse(conversationId);
  } catch {
    audit(name, [TOOL_REGISTRY_SOURCE], auditConversationId, identity, {
      decision: "deny",
      error: "TOOL_IDENTITY_INVALID"
    });
    return errorObservation({
      errorCode: "TOOL_IDENTITY_INVALID",
      error: "MCP tool identity is invalid.",
      sources: [TOOL_REGISTRY_SOURCE]
    });
  }

  const access = evaluateToolAccess({
    entitlements: parsedIdentity.entitlements,
    requiredScopes: tool.requiredScopes
  });
  if (!access.allowed) {
    audit(name, [TOOL_POLICY_SOURCE], parsedConversationId, parsedIdentity, {
      decision: "deny",
      error: TOOL_SCOPE_DENIED
    });
    return errorObservation({
      errorCode: TOOL_SCOPE_DENIED,
      error: "Identity is not entitled to execute this MCP tool.",
      sources: [TOOL_POLICY_SOURCE]
    });
  }

  let parsedInput;
  try {
    parsedInput = tool.inputSchema.parse(input);
  } catch {
    audit(name, [TOOL_REGISTRY_SOURCE], parsedConversationId, parsedIdentity, {
      decision: "deny",
      error: "TOOL_INPUT_INVALID"
    });
    return errorObservation({
      errorCode: "TOOL_INPUT_INVALID",
      error: "MCP tool input is invalid.",
      sources: [TOOL_REGISTRY_SOURCE]
    });
  }

  const startedAt = Date.now();
  try {
    const data = await tool.execute(parsedInput, parsedIdentity);
    const businessError =
      data && !Array.isArray(data) && typeof data === "object" && typeof data.error === "string"
        ? data.error.trim().slice(0, 500)
        : null;
    const observedSources = businessError
      ? (tool.businessErrorSources ?? tool.sources)
      : tool.sources;
    let observation = McpToolObservationSchema.parse({
      status: businessError ? "error" : "success",
      data: businessError ? null : data,
      sources: normalizeToolSources(observedSources),
      observedAt: new Date().toISOString(),
      ...(businessError ? { error: businessError, errorCode: "TOOL_BUSINESS_ERROR" } : {})
    });
    const oversized =
      Buffer.byteLength(JSON.stringify(observation), "utf8") > MAX_TOOL_OBSERVATION_BYTES;
    if (oversized) {
      observation = McpToolObservationSchema.parse({
        status: "error",
        data: null,
        sources: normalizeToolSources(observedSources),
        observedAt: new Date().toISOString(),
        error: "Kết quả CRM vượt giới hạn observation an toàn. Vui lòng thu hẹp truy vấn.",
        errorCode: "TOOL_OBSERVATION_TOO_LARGE"
      });
    }
    audit(name, observedSources, parsedConversationId, parsedIdentity, {
      decision: businessError || oversized ? "deny" : "allow",
      latencyMs: Date.now() - startedAt,
      ...(oversized ? { error: "TOOL_OBSERVATION_TOO_LARGE" } : {})
    });
    return observation;
  } catch {
    audit(name, [TOOL_EXECUTION_SOURCE], parsedConversationId, parsedIdentity, {
      decision: "deny",
      latencyMs: Date.now() - startedAt,
      error: "TOOL_EXECUTION_FAILED"
    });
    return errorObservation({
      errorCode: "TOOL_EXECUTION_FAILED",
      error: "MCP tool execution failed.",
      sources: [TOOL_EXECUTION_SOURCE]
    });
  }
}
