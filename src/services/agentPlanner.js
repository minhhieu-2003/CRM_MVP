import { z } from "zod";
import { callApprovedLlm } from "./llmGateway.js";
import { createLlmPiiTokenVault } from "./llmPiiTokenVault.js";

const MAX_PROMPT_FIELD_LENGTH = 12_000;
const MAX_AVAILABLE_TOOLS = 64;
const HARD_MAX_PLAN_STEPS = 8;

const intentSchema = z.enum([
  "customer",
  "interaction",
  "opportunity",
  "campaign",
  "draft-email",
  "call-script",
  "multi-step",
  "general"
]);

const planStepSchema = z
  .object({
    tool: z.string().min(1),
    input: z.record(z.string(), z.unknown())
  })
  .strict();

export const AgentPlanSchema = z
  .object({
    intent: intentSchema,
    steps: z.array(planStepSchema).min(1).max(8),
    responseGoal: z.string().trim().min(1).max(1_000)
  })
  .strict();

export class AgentPlannerError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "AgentPlannerError";
    this.code = code;
  }
}

function getAvailableToolMap(availableTools) {
  const tools = new Map();
  if (!Array.isArray(availableTools)) return tools;

  for (const candidate of availableTools.slice(0, MAX_AVAILABLE_TOOLS)) {
    const tool =
      typeof candidate === "string"
        ? { name: candidate, description: "", inputSchema: null }
        : candidate;
    if (!tool || !/^[a-z][a-z0-9_]{0,127}$/.test(tool.name ?? "") || tools.has(tool.name)) {
      continue;
    }
    const inputSchema =
      tool.inputSchema?.type === "object" ? structuredClone(tool.inputSchema) : null;
    tools.set(tool.name, {
      name: tool.name,
      description:
        typeof tool.description === "string" ? tool.description.trim().slice(0, 2000) : "",
      inputSchema
    });
  }
  return tools;
}

function limitedJson(value, maxLength = MAX_PROMPT_FIELD_LENGTH) {
  let serialized;
  try {
    serialized = JSON.stringify(value ?? {});
  } catch (error) {
    throw new AgentPlannerError("PLANNER_INPUT_INVALID", "Planner input is not serializable.", {
      cause: error
    });
  }
  return serialized.slice(0, maxLength);
}

function normalizeMaxSteps(maxSteps) {
  if (maxSteps === undefined) return HARD_MAX_PLAN_STEPS;
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > HARD_MAX_PLAN_STEPS) {
    throw new AgentPlannerError(
      "PLANNER_INPUT_INVALID",
      `maxSteps must be an integer between 1 and ${HARD_MAX_PLAN_STEPS}.`
    );
  }
  return maxSteps;
}

function parsePlan(content, availableTools, maxSteps, restoreValue = (value) => value) {
  let rawPlan;
  try {
    rawPlan = JSON.parse(content);
  } catch (error) {
    throw new AgentPlannerError("PLANNER_INVALID_RESPONSE", "Planner returned malformed JSON.", {
      cause: error
    });
  }

  if (Array.isArray(rawPlan?.steps) && rawPlan.steps.length > maxSteps) {
    throw new AgentPlannerError(
      "PLANNER_STEP_BUDGET_EXCEEDED",
      `Planner returned ${rawPlan.steps.length} steps; the runtime budget is ${maxSteps}.`
    );
  }

  const parsed = AgentPlanSchema.safeParse(rawPlan);
  if (!parsed.success) {
    throw new AgentPlannerError(
      "PLANNER_INVALID_RESPONSE",
      "Planner response does not match the required schema.",
      { cause: parsed.error }
    );
  }

  for (const step of parsed.data.steps) {
    const tool = availableTools.get(step.tool);
    if (!tool) {
      throw new AgentPlannerError(
        "PLANNER_TOOL_NOT_ALLOWED",
        `Planner selected unavailable tool: ${step.tool}.`
      );
    }

    step.input = restoreValue(step.input);
    if (tool.inputSchema) {
      let inputSchema;
      try {
        inputSchema = z.fromJSONSchema(tool.inputSchema);
      } catch (error) {
        throw new AgentPlannerError(
          "PLANNER_TOOL_SCHEMA_INVALID",
          `MCP advertised an unsupported input schema for ${step.tool}.`,
          { cause: error }
        );
      }
      const input = inputSchema.safeParse(step.input);
      if (!input.success) {
        throw new AgentPlannerError(
          "PLANNER_INVALID_TOOL_INPUT",
          `Planner produced invalid input for ${step.tool}.`,
          { cause: input.error }
        );
      }
      step.input = input.data;
    }
  }

  return parsed.data;
}

export async function planAgentTurn({ message, context, identity, availableTools, maxSteps }) {
  const parsedMessage = z.string().trim().min(1).max(4_000).safeParse(message);
  if (!parsedMessage.success) {
    throw new AgentPlannerError("PLANNER_INPUT_INVALID", "Message is required and too long.");
  }

  const toolMap = getAvailableToolMap(availableTools);
  if (toolMap.size === 0) {
    throw new AgentPlannerError("PLANNER_NO_TOOLS", "No supported tools are available.");
  }
  const runtimeMaxSteps = normalizeMaxSteps(maxSteps);
  const piiVault = createLlmPiiTokenVault();
  const protectedMessage = piiVault.protect(parsedMessage.data);
  const protectedContext = piiVault.protect(limitedJson(context));

  const safeIdentity = {
    role: identity?.role ?? null
  };
  const toolLines = [...toolMap.values()].map(
    (tool) =>
      `- ${tool.name}${tool.description ? `: ${tool.description}` : ""}; input schema ${limitedJson(tool.inputSchema ?? { type: "object" }, 3000)}`
  );

  const { content } = await callApprovedLlm({
    jsonMode: true,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "You are the BankRM AI planner. Return exactly one JSON object and no markdown.",
          "Plan only; never claim that a tool already ran.",
          "Use the smallest ordered tool sequence needed to answer the RM.",
          `Return between 1 and ${runtimeMaxSteps} steps. Never exceed this runtime step budget.`,
          "Preserve focused customers and module context across turns.",
          "Only select tools listed below. Never invent a tool or an input field.",
          "Supported intents: customer, interaction, opportunity, campaign, draft-email, call-script, multi-step, general.",
          'Required schema: {"intent":string,"steps":[{"tool":string,"input":object}],"responseGoal":string}.',
          "Available tools:",
          ...toolLines
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `RM message: ${protectedMessage}`,
          `Conversation context: ${protectedContext}`,
          `Authorization context: ${limitedJson(safeIdentity)}`
        ].join("\n")
      }
    ]
  });

  return parsePlan(content, toolMap, runtimeMaxSteps, piiVault.restoreValue);
}
