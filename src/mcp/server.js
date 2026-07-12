import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getCrmConfig } from "../services/dbClient.js";
import { executeAgentTool, listAgentTools } from "../services/toolRegistry.js";

const env = process.env.NODE_ENV || "development";
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

function getIdentity() {
  return {
    userId: process.env.USER_ID || "mcp-user",
    rmId: process.env.RM_ID || "default",
    role: process.env.ROLE || "rm",
    branchId: process.env.BRANCH_ID || "default"
  };
}

function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

const server = new McpServer({
  name: "bankrm-crm-toolkit",
  version: "1.0.0"
});

for (const tool of listAgentTools()) {
  server.tool(tool.name, tool.description, tool.inputSchema.shape, async (input) => {
    const result = await executeAgentTool({
      name: tool.name,
      input,
      identity: getIdentity(),
      conversationId: "mcp"
    });
    return ok(result.data);
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("BankRM CRM MCP toolkit đang chạy trên stdio.");
