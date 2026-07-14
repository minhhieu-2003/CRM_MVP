import crypto from "crypto";
import { routeConversation } from "./mcpContextEngine.js";
import { buildAuditActor, writeAudit } from "./auditLogger.js";
import { dispatchFallback } from "../plugins/router.js";
import { runAiNativeCore } from "./aiNativeCore.js";

const SAFE_CHAT_AUDIT_PROMPT = "chat-turn";

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

  try {
    if (process.env.AI_NATIVE_CORE === "true") {
      try {
        const nativeResult = await runAiNativeCore({ conversationId, message, identity });
        writeAudit({
          auditId,
          ...buildAuditActor(identity),
          conversationId,
          llmProvider: nativeResult.provider,
          prompt: SAFE_CHAT_AUDIT_PROMPT,
          sources: nativeResult.sources.map((item) => item.endpoint),
          module: nativeResult.context.currentModule,
          latencyMs: Date.now() - startedAt,
          decision: "allow"
        });
        return shapeResponse({ auditId, ...nativeResult });
      } catch (error) {
        writeAudit({
          auditId: crypto.randomUUID(),
          ...buildAuditActor(identity),
          conversationId,
          llmProvider: "ai-native-error",
          prompt: SAFE_CHAT_AUDIT_PROMPT,
          sources: ["internal://ai-native-fallback"],
          module: "general",
          latencyMs: Date.now() - startedAt,
          decision: "fallback",
          error: String(error?.code || error?.name || "AI_NATIVE_FAILED")
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
        identity,
        onAgentError: (agentId, error) => {
          writeAudit({
            auditId: crypto.randomUUID(),
            ...buildAuditActor(identity),
            conversationId,
            llmProvider: `agent-error:${agentId}`,
            prompt: SAFE_CHAT_AUDIT_PROMPT,
            sources: [`internal://router/${agentId}`],
            module: result.context.currentModule,
            latencyMs: Date.now() - startedAt,
            decision: "fallback",
            error: String(error?.code || error?.name || "FALLBACK_AGENT_FAILED")
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
      ...buildAuditActor(identity),
      conversationId,
      llmProvider,
      prompt: SAFE_CHAT_AUDIT_PROMPT,
      sources: sources.map((item) => item.endpoint),
      module: result.context.currentModule,
      latencyMs: Date.now() - startedAt,
      decision: result.errorCode ? "deny" : "allow",
      ...(result.errorCode ? { error: result.errorCode } : {})
    });

    return shapeResponse({ auditId, reply, sources, context: result.context });
  } catch (error) {
    writeAudit({
      auditId,
      ...buildAuditActor(identity),
      conversationId,
      llmProvider: "agent-turn-error",
      prompt: SAFE_CHAT_AUDIT_PROMPT,
      sources: ["internal://agent-turn-error"],
      module: "general",
      latencyMs: Date.now() - startedAt,
      decision: "deny",
      error: String(error?.code || error?.name || "AGENT_TURN_FAILED")
    });
    throw error;
  }
}
