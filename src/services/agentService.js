import crypto from "crypto";
import { routeConversation } from "./mcpContextEngine.js";
import { writeAudit } from "./auditLogger.js";
import { dispatchFallback } from "../plugins/router.js";
import { runAiNativeCore } from "./aiNativeCore.js";

function shapeResponse({ auditId, reply, sources, context }) {
  return {
    auditId,
    reply,
    sources,
    context: {
      currentModule: context.currentModule,
      focusedCustomers: context.focusedCustomers,
      lastIntent: context.lastIntent
    }
  };
}

export async function runAgentTurn({ conversationId, message, identity }) {
  const auditId = crypto.randomUUID();
  const startedAt = Date.now();

  if (process.env.AI_NATIVE_CORE === "true") {
    try {
      const nativeResult = await runAiNativeCore({ conversationId, message, identity });
      writeAudit({
        auditId,
        conversationId,
        llmProvider: nativeResult.provider,
        prompt: message,
        sources: nativeResult.sources.map((item) => item.endpoint),
        module: nativeResult.context.currentModule,
        latencyMs: Date.now() - startedAt,
        decision: "allow"
      });
      return shapeResponse({ auditId, ...nativeResult });
    } catch (error) {
      writeAudit({
        auditId: crypto.randomUUID(),
        conversationId,
        llmProvider: "ai-native-error",
        prompt: message,
        sources: ["internal://ai-native-fallback"],
        module: "general",
        latencyMs: Date.now() - startedAt,
        decision: "fallback",
        error: String(error?.message || error)
      });
    }
  }

  const result = await routeConversation({ conversationId, message, identity });

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
      sources = dispatched.sources;
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

  return shapeResponse({ auditId, reply, sources, context: result.context });
}
