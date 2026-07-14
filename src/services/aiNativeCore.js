import crypto from "node:crypto";
import { planAgentTurn } from "./agentPlanner.js";
import { synthesizeAgentTurn } from "./agentSynthesizer.js";
import {
  compareAndSwapConversationContext,
  getConversationContextSnapshot
} from "./contextManager.js";
import { isLlmDataUseAllowed } from "./llmGateway.js";
import { buildAuditActor, writeAudit } from "./auditLogger.js";
import { createMcpClientSession } from "../mcp/client.js";
import { normalizeToolSources } from "../mcp/protocol.js";

const DEFAULT_MAX_STEPS = 6;
const HARD_MAX_STEPS = 8;

export class AiToolObservationError extends Error {
  constructor(tool, observationCode, options) {
    super("An MCP tool did not return a successful observation.", options);
    this.name = "AiToolObservationError";
    this.code = "AI_TOOL_OBSERVATION_FAILED";
    this.tool = tool;
    this.observationCode = observationCode ?? "MCP_TOOL_CALL_FAILED";
  }
}

function readMaxSteps() {
  const configured = Number.parseInt(process.env.AI_AGENT_MAX_STEPS ?? "", 10);
  if (!Number.isSafeInteger(configured) || configured < 1) return DEFAULT_MAX_STEPS;
  return Math.min(configured, HARD_MAX_STEPS);
}

function moduleForTool(toolName, currentModule) {
  if (toolName.includes("campaign")) return "campaign";
  if (toolName.includes("opportunit")) return "opportunity";
  if (toolName.includes("interaction") || toolName.includes("draft") || toolName.includes("call")) {
    return "interaction";
  }
  if (toolName.includes("customer")) return "customer-profile";
  return currentModule;
}

function collectFocusedCustomers(observations, previous = []) {
  const ids = new Set(previous);
  for (const observation of observations) {
    const inputId = observation.input?.customerId;
    if (typeof inputId === "string" && inputId) ids.add(inputId);

    const stack = [observation.data];
    const seen = new WeakSet();
    while (stack.length > 0) {
      const record = stack.pop();
      if (!record || typeof record !== "object" || seen.has(record)) continue;
      seen.add(record);
      if (Array.isArray(record)) {
        stack.push(...record);
        continue;
      }
      const customerId =
        record.customerId ||
        (record.id && observation.tool.includes("customer") ? record.id : null);
      if (typeof customerId === "string" && customerId) ids.add(customerId);
      for (const value of Object.values(record)) {
        if (value && typeof value === "object") stack.push(value);
      }
    }
  }
  return [...ids];
}

export async function runAiNativeCore({
  conversationId,
  message,
  identity,
  mcpSessionFactory = createMcpClientSession
}) {
  if (!isLlmDataUseAllowed()) {
    throw new Error("AI_DATA_POLICY_BLOCKED");
  }
  const contextSnapshot = getConversationContextSnapshot({ conversationId, identity });
  const context = contextSnapshot.context;
  const mcpSession = await mcpSessionFactory({ identity, conversationId });
  try {
    const planningStartedAt = Date.now();
    const availableTools = await mcpSession.listTools();
    const maxSteps = readMaxSteps();
    const plan = await planAgentTurn({
      message,
      context,
      identity,
      availableTools,
      maxSteps
    });
    const steps = Array.isArray(plan?.steps) ? plan.steps : [];
    if (steps.length === 0) throw new Error("AI planner did not produce executable tool steps.");
    if (steps.length > maxSteps) {
      throw new Error("AI planner exceeded the runtime tool-step budget.");
    }
    writeAudit({
      auditId: crypto.randomUUID(),
      ...buildAuditActor(identity),
      conversationId,
      llmProvider: "ai-native-planner",
      prompt: `plan:${plan.intent};tools:${steps.map((step) => step.tool).join(",")}`,
      sources: ["internal://mcp/tools-list"],
      module: context.currentModule,
      latencyMs: Date.now() - planningStartedAt,
      decision: "allow"
    });

    const observations = [];
    for (const step of steps) {
      const toolStartedAt = Date.now();
      let observation;
      try {
        observation = await mcpSession.callTool({
          name: step.tool,
          input: step.input ?? {}
        });
        const observationSucceeded =
          observation.status === "success" && observation.ok !== false;
        writeAudit({
          auditId: crypto.randomUUID(),
          ...buildAuditActor(identity),
          conversationId,
          llmProvider: "mcp-client-observation",
          prompt: `tool-mirror:${step.tool}`,
          sources: observation.sources.map((source) => source.endpoint),
          module: moduleForTool(step.tool, context.currentModule),
          latencyMs: Date.now() - toolStartedAt,
          decision: observationSucceeded ? "allow" : "deny"
        });
      } catch (error) {
        writeAudit({
          auditId: crypto.randomUUID(),
          ...buildAuditActor(identity),
          conversationId,
          llmProvider: "mcp-client-observation",
          prompt: `tool-mirror:${step.tool}`,
          sources: ["internal://mcp/tool-call"],
          module: moduleForTool(step.tool, context.currentModule),
          latencyMs: Date.now() - toolStartedAt,
          decision: "deny",
          error: String(error?.code || "mcp-tool-call-failed")
        });
        throw new AiToolObservationError(
          step.tool,
          error?.code ?? "MCP_TOOL_CALL_FAILED",
          { cause: error }
        );
      }
      const normalizedObservation = {
        tool: step.tool,
        input: step.input ?? {},
        ok: observation.status === "success" && observation.ok !== false,
        status: observation.status,
        data: observation.data,
        error: observation.error,
        errorCode: observation.errorCode,
        observedAt: observation.observedAt,
        sources: normalizeToolSources(observation.sources)
      };
      observations.push(normalizedObservation);
      if (normalizedObservation.status !== "success" || normalizedObservation.ok !== true) {
        throw new AiToolObservationError(step.tool, normalizedObservation.errorCode);
      }
    }

    const nextContext = {
      ...context,
      currentModule: steps.reduce(
        (module, step) => moduleForTool(step.tool, module),
        context.currentModule
      ),
      focusedCustomers: collectFocusedCustomers(observations, context.focusedCustomers),
      lastIntent: plan.intent
    };
    const synthesized = await synthesizeAgentTurn({
      message,
      context: nextContext,
      plan,
      observations
    });

    if (!synthesized?.reply || typeof synthesized.reply !== "string") {
      throw new Error("AI synthesizer returned an invalid response.");
    }

    const sources = normalizeToolSources(
      observations.flatMap((observation) => observation.sources)
    );
    if (sources.length === 0) throw new Error("AI response has no traceable sources.");

    const savedContext = compareAndSwapConversationContext({
      conversationId,
      identity,
      context: nextContext,
      expectedVersion: contextSnapshot.version
    });

    return {
      reply: synthesized.reply,
      sources,
      context: savedContext,
      provider: "ai-native-mcp"
    };
  } finally {
    await mcpSession.close();
  }
}
