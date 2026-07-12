import { planAgentTurn } from "./agentPlanner.js";
import { synthesizeAgentTurn } from "./agentSynthesizer.js";
import { getConversationContext, saveConversationContext } from "./contextManager.js";
import { isLlmDataUseAllowed } from "./llmGateway.js";
import { executeAgentTool, listAgentTools } from "./toolRegistry.js";

const DEFAULT_MAX_STEPS = 6;
const HARD_MAX_STEPS = 8;

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

function normalizeSources(sources = []) {
  const unique = new Map();
  for (const source of sources) {
    const endpoint = typeof source === "string" ? source : source?.endpoint;
    if (endpoint && !unique.has(endpoint)) unique.set(endpoint, { endpoint });
  }
  return [...unique.values()];
}

function collectFocusedCustomers(observations, previous = []) {
  const ids = new Set(previous);
  for (const observation of observations) {
    const inputId = observation.input?.customerId;
    if (typeof inputId === "string" && inputId) ids.add(inputId);

    const records = Array.isArray(observation.data) ? observation.data : [observation.data];
    for (const record of records) {
      if (!record || typeof record !== "object") continue;
      const customerId = record.customerId || (record.id && observation.tool.includes("customer") ? record.id : null);
      if (typeof customerId === "string" && customerId) ids.add(customerId);
    }
  }
  return [...ids];
}

export async function runAiNativeCore({ conversationId, message, identity }) {
  if (!isLlmDataUseAllowed()) {
    throw new Error("AI_DATA_POLICY_BLOCKED");
  }
  const context = getConversationContext({ conversationId, identity });
  const availableTools = listAgentTools();
  const plan = await planAgentTurn({ message, context, identity, availableTools });
  const steps = Array.isArray(plan?.steps) ? plan.steps.slice(0, readMaxSteps()) : [];
  if (steps.length === 0) throw new Error("AI planner did not produce executable tool steps.");

  const observations = [];
  for (const step of steps) {
    const observation = await executeAgentTool({
      name: step.tool,
      input: step.input ?? {},
      identity,
      conversationId
    });
    observations.push({
      tool: step.tool,
      input: step.input ?? {},
      data: observation.data,
      sources: normalizeSources(observation.sources)
    });
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
  const savedContext = saveConversationContext({ conversationId, identity, context: nextContext });
  const synthesized = await synthesizeAgentTurn({
    message,
    context: savedContext,
    plan,
    observations
  });

  if (!synthesized?.reply || typeof synthesized.reply !== "string") {
    throw new Error("AI synthesizer returned an invalid response.");
  }

  const observedSources = observations.flatMap((observation) => observation.sources);
  const sources = normalizeSources(
    Array.isArray(synthesized.sources) && synthesized.sources.length > 0
      ? synthesized.sources
      : observedSources
  );
  if (sources.length === 0) throw new Error("AI response has no traceable sources.");

  return {
    reply: synthesized.reply,
    sources,
    context: savedContext,
    provider: "ai-native-planner"
  };
}
