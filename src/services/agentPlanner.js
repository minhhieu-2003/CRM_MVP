import { z } from "zod";
import { callApprovedLlm } from "./llmGateway.js";

const MAX_PROMPT_FIELD_LENGTH = 12_000;
const TOOL_NAMES = [
  "crm_list_customers",
  "crm_get_customer",
  "crm_customers_due",
  "crm_list_interactions",
  "crm_list_opportunities",
  "crm_list_campaigns",
  "crm_draft_email",
  "crm_call_script"
];

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

const toolInputSchemas = {
  crm_list_customers: z.object({}).strict(),
  crm_get_customer: z.object({ name: z.string().trim().min(1).max(200) }).strict(),
  crm_customers_due: z
    .object({ daysAhead: z.number().int().min(1).max(365).optional() })
    .strict(),
  crm_list_interactions: z
    .object({ customerId: z.string().trim().min(1).max(100).optional() })
    .strict(),
  crm_list_opportunities: z
    .object({ customerId: z.string().trim().min(1).max(100).optional() })
    .strict(),
  crm_list_campaigns: z.object({}).strict(),
  crm_draft_email: z
    .object({
      customerId: z.string().trim().min(1).max(100),
      suggestion: z.string().trim().min(1).max(1_000).optional()
    })
    .strict(),
  crm_call_script: z
    .object({
      customerId: z.string().trim().min(1).max(100),
      suggestion: z.string().trim().min(1).max(1_000).optional()
    })
    .strict()
};

const toolInputDescriptions = {
  crm_list_customers: "{}",
  crm_get_customer: '{"name":"string"}',
  crm_customers_due: '{"daysAhead":"optional integer 1..365"}',
  crm_list_interactions: '{"customerId":"optional string"}',
  crm_list_opportunities: '{"customerId":"optional string"}',
  crm_list_campaigns: "{}",
  crm_draft_email: '{"customerId":"string","suggestion":"optional string"}',
  crm_call_script: '{"customerId":"string","suggestion":"optional string"}'
};

export class AgentPlannerError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "AgentPlannerError";
    this.code = code;
  }
}

function getAvailableToolNames(availableTools) {
  if (!Array.isArray(availableTools)) return [];

  return [
    ...new Set(
      availableTools
        .map((tool) => (typeof tool === "string" ? tool : tool?.name))
        .filter((name) => TOOL_NAMES.includes(name))
    )
  ];
}

function limitedJson(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value ?? {});
  } catch (error) {
    throw new AgentPlannerError("PLANNER_INPUT_INVALID", "Planner input is not serializable.", {
      cause: error
    });
  }
  return serialized.slice(0, MAX_PROMPT_FIELD_LENGTH);
}

function parsePlan(content, allowedTools) {
  let rawPlan;
  try {
    rawPlan = JSON.parse(content);
  } catch (error) {
    throw new AgentPlannerError(
      "PLANNER_INVALID_RESPONSE",
      "Planner returned malformed JSON.",
      { cause: error }
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
    if (!allowedTools.has(step.tool)) {
      throw new AgentPlannerError(
        "PLANNER_TOOL_NOT_ALLOWED",
        `Planner selected unavailable tool: ${step.tool}.`
      );
    }

    const input = toolInputSchemas[step.tool].safeParse(step.input);
    if (!input.success) {
      throw new AgentPlannerError(
        "PLANNER_INVALID_TOOL_INPUT",
        `Planner produced invalid input for ${step.tool}.`,
        { cause: input.error }
      );
    }
    step.input = input.data;
  }

  return parsed.data;
}

export async function planAgentTurn({ message, context, identity, availableTools }) {
  const parsedMessage = z.string().trim().min(1).max(4_000).safeParse(message);
  if (!parsedMessage.success) {
    throw new AgentPlannerError("PLANNER_INPUT_INVALID", "Message is required and too long.");
  }

  const toolNames = getAvailableToolNames(availableTools);
  if (toolNames.length === 0) {
    throw new AgentPlannerError("PLANNER_NO_TOOLS", "No supported tools are available.");
  }

  const safeIdentity = {
    role: identity?.role ?? null,
    rmId: identity?.rmId ?? null,
    branchId: identity?.branchId ?? null
  };
  const toolLines = toolNames.map((name) => `- ${name}: input ${toolInputDescriptions[name]}`);

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
          "Preserve focused customers and module context across turns.",
          "Only select tools listed below. Never invent a tool or an input field.",
          "Supported intents: customer, interaction, opportunity, campaign, draft-email, call-script, multi-step, general.",
          "Required schema: {\"intent\":string,\"steps\":[{\"tool\":string,\"input\":object}],\"responseGoal\":string}.",
          "Available tools:",
          ...toolLines
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `RM message: ${parsedMessage.data}`,
          `Conversation context: ${limitedJson(context)}`,
          `Authorization context: ${limitedJson(safeIdentity)}`
        ].join("\n")
      }
    ]
  });

  return parsePlan(content, new Set(toolNames));
}
