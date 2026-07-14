import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getCrmConfig } from "../services/dbClient.js";
import { executeAgentTool, listAgentTools } from "../services/toolRegistry.js";
import { assertAuditCorrelationConfigured } from "../services/auditCorrelation.js";
import {
  DEFAULT_LOCAL_DEMO_ENTITLEMENTS,
  EntitlementsSchema,
  parseEntitlements,
  parseSerializedEntitlements
} from "../services/toolPolicy.js";

const env = (process.env.NODE_ENV || "development").trim().toLowerCase();
const protectedRuntime =
  process.env.AUTH_ENABLED === "true" || env === "pilot" || env === "production";
if ((env === "pilot" || env === "production") && process.env.AUTH_ENABLED !== "true") {
  console.error(
    "FATAL: Khởi động thất bại. Hệ thống bắt buộc phải bật xác thực (AUTH_ENABLED=true) trên môi trường pilot/production."
  );
  process.exit(1);
}

try {
  getCrmConfig();
} catch (error) {
  console.error(`FATAL: Khởi động CRM thất bại. ${error.message}`);
  process.exit(1);
}

const sessionIdentitySchema = z
  .object({
    userId: z.string().trim().min(1).max(128),
    rmId: z.string().trim().min(1).max(128).optional(),
    role: z.enum(["admin", "rm", "user"]),
    branchId: z.string().trim().min(1).max(128).optional(),
    conversationId: z.string().trim().min(1).max(128),
    entitlements: EntitlementsSchema
  })
  .strict()
  .superRefine((session, context) => {
    if (session.role !== "admin" && (!session.rmId || !session.branchId)) {
      context.addIssue({
        code: "custom",
        message: "RM and branch identity are required for non-admin MCP sessions."
      });
    }
  });

let dedicatedSession = null;
if (process.env.BANKRM_MCP_SESSION === "true") {
  let entitlements;
  try {
    entitlements = parseSerializedEntitlements(process.env.BANKRM_MCP_ENTITLEMENTS, {
      allowWildcard: process.env.BANKRM_MCP_ROLE === "admin",
      requireNonEmpty: true
    });
  } catch {
    console.error("FATAL: Cấu hình MCP session không hợp lệ.");
    process.exit(1);
  }
  const parsedSession = sessionIdentitySchema.safeParse({
    userId: process.env.BANKRM_MCP_USER_ID,
    rmId: process.env.BANKRM_MCP_RM_ID || undefined,
    role: process.env.BANKRM_MCP_ROLE,
    branchId: process.env.BANKRM_MCP_BRANCH_ID || undefined,
    conversationId: process.env.BANKRM_MCP_CONVERSATION_ID,
    entitlements
  });
  if (!parsedSession.success) {
    console.error("FATAL: Cấu hình MCP session không hợp lệ.");
    process.exit(1);
  }
  if (
    protectedRuntime &&
    parsedSession.data.role !== "admin" &&
    (parsedSession.data.rmId?.toLowerCase() === "default" ||
      parsedSession.data.branchId?.toLowerCase() === "default")
  ) {
    console.error("FATAL: MCP session đã xác thực không được dùng RM/branch scope mặc định.");
    process.exit(1);
  }
  dedicatedSession = Object.freeze({
    ...parsedSession.data,
    entitlements: Object.freeze([...parsedSession.data.entitlements])
  });
}
if (protectedRuntime && !dedicatedSession) {
  console.error(
    "FATAL: MCP protected runtime yêu cầu BANKRM_MCP_SESSION=true và identity session hợp lệ."
  );
  process.exit(1);
}
try {
  assertAuditCorrelationConfigured(process.env);
} catch {
  console.error(
    "FATAL: AUDIT_CORRELATION_KEY must be a dedicated value of at least 32 UTF-8 bytes in protected runtimes."
  );
  process.exit(1);
}

function getIdentity() {
  if (dedicatedSession) {
    return Object.freeze({
      userId: dedicatedSession.userId,
      role: dedicatedSession.role,
      entitlements: dedicatedSession.entitlements,
      ...(dedicatedSession.rmId ? { rmId: dedicatedSession.rmId } : {}),
      ...(dedicatedSession.branchId ? { branchId: dedicatedSession.branchId } : {})
    });
  }
  return {
    userId: process.env.BANKRM_MCP_USER_ID || process.env.USER_ID || "mcp-user",
    rmId: process.env.BANKRM_MCP_RM_ID || process.env.RM_ID || "default",
    role: process.env.BANKRM_MCP_ROLE || process.env.ROLE || "rm",
    branchId: process.env.BANKRM_MCP_BRANCH_ID || process.env.BRANCH_ID || "default",
    entitlements: parseEntitlements(process.env.AUTH_LOCAL_DEMO_ENTITLEMENTS, {
      fallback: DEFAULT_LOCAL_DEMO_ENTITLEMENTS,
      requireNonEmpty: true
    }),
    authMode: "disabled-local-demo"
  };
}

function getConversationId() {
  return dedicatedSession?.conversationId || "mcp";
}

function toMcpResult(observation) {
  return {
    structuredContent: observation,
    content: [{ type: "text", text: JSON.stringify(observation) }],
    ...(observation.status === "error" ? { isError: true } : {})
  };
}

const tools = listAgentTools({ entitlements: getIdentity().entitlements });
const server = new Server(
  {
    name: "bankrm-crm-toolkit",
    version: "1.0.0"
  },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.inputSchema),
    outputSchema: z.toJSONSchema(tool.outputSchema),
    annotations: {
      readOnlyHint: tool.access === "read",
      destructiveHint: tool.access === "write",
      idempotentHint: tool.access === "read",
      openWorldHint: false
    },
    _meta: {
      "bankrm/access": tool.access,
      "bankrm/riskLevel": tool.riskLevel,
      "bankrm/requiredScopes": tool.requiredScopes,
      "bankrm/sources": tool.sources,
      "bankrm/errorSources": tool.errorSources
    }
  }))
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: input = {} } = request.params;
  try {
    const observation = await executeAgentTool({
      name,
      input,
      identity: getIdentity(),
      conversationId: getConversationId()
    });
    return toMcpResult(observation);
  } catch {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "MCP_TOOL_REQUEST_REJECTED" })
        }
      ]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("BankRM CRM MCP toolkit đang chạy trên stdio.");
