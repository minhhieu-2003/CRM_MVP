import crypto from "crypto";
import { routeConversation } from "./mcpContextEngine.js";
import { writeAudit } from "./auditLogger.js";
import { dispatchFallback } from "../plugins/router.js";

export async function runAgentTurn({ conversationId, message }) {
  const auditId = crypto.randomUUID();
  const startedAt = Date.now();
  const result = routeConversation({ conversationId, message });

  let reply = result.reply;
  let sources = result.sources;
  let llmProvider = "rule-based-mcp-engine";

  if (result.fallback) {
    const dispatched = await dispatchFallback({
      message,
      onAgentError: (agentId, error) => {
        writeAudit({
          auditId: crypto.randomUUID(),
          conversationId,
          llmProvider: `agent-error:${agentId}`,
          prompt: message,
          sources: [`internal://router/${agentId}`],
          module: result.context.currentModule,
          latencyMs: Date.now() - startedAt,
          error: String(error?.message || error)
        });
      }
    });

    if (dispatched) {
      reply = dispatched.reply;
      sources = [...result.sources, ...dispatched.sources];
      llmProvider = `router:${dispatched.provider}`;
    }
  }

  writeAudit({
    auditId,
    conversationId,
    llmProvider,
    prompt: message,
    sources: sources.map((item) => item.endpoint),
    module: result.context.currentModule,
    latencyMs: Date.now() - startedAt
  });

  return {
    auditId,
    reply,
    sources,
    context: {
      currentModule: result.context.currentModule,
      focusedCustomers: result.context.focusedCustomers,
      lastIntent: result.context.lastIntent
    }
  };
}
