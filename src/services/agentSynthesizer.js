import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { AgentPlanSchema } from "./agentPlanner.js";
import {
  assertSensitiveClaimsGrounded,
  SensitiveFactGroundingError
} from "./groundingValidator.js";
import { callApprovedLlm } from "./llmGateway.js";
import { createLlmPiiTokenVault } from "./llmPiiTokenVault.js";

const MAX_OBSERVATION_CONTEXT_LENGTH = 40_000;

const synthesisResponseSchema = z.object({ reply: z.string().trim().min(1).max(8_000) }).strict();

export class AgentSynthesizerError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "AgentSynthesizerError";
    this.code = code;
  }
}

function normalizeSource(source) {
  const endpoint = typeof source === "string" ? source : source?.endpoint;
  if (typeof endpoint !== "string" || !endpoint.trim()) return null;
  return { endpoint: endpoint.trim().slice(0, 500) };
}

function normalizeObservations(observations, plannedSteps) {
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new AgentSynthesizerError(
      "SYNTHESIS_NO_OBSERVATIONS",
      "At least one tool observation is required."
    );
  }

  if (observations.length !== plannedSteps.length) {
    throw new AgentSynthesizerError(
      "SYNTHESIS_OBSERVATION_MISMATCH",
      "Tool observations must match the complete plan one-to-one."
    );
  }

  const normalized = observations.map((observation, index) => {
    const plannedStep = plannedSteps[index];
    if (
      !observation ||
      observation.tool !== plannedStep.tool ||
      !isDeepStrictEqual(observation.input ?? {}, plannedStep.input ?? {})
    ) {
      throw new AgentSynthesizerError(
        "SYNTHESIS_OBSERVATION_MISMATCH",
        `Observation ${index + 1} does not match its planned tool execution.`
      );
    }

    return {
      tool: observation.tool,
      input: structuredClone(observation.input ?? {}),
      ok: observation.ok !== false,
      data: observation.data ?? observation.result ?? null,
      error: observation.error ? String(observation.error).slice(0, 500) : null,
      sources: (Array.isArray(observation.sources) ? observation.sources : [])
        .map(normalizeSource)
        .filter(Boolean)
    };
  });

  const sources = [];
  const seen = new Set();
  for (const observation of normalized) {
    for (const source of observation.sources) {
      if (seen.has(source.endpoint)) continue;
      seen.add(source.endpoint);
      sources.push(source);
    }
  }

  if (sources.length === 0) {
    throw new AgentSynthesizerError(
      "SYNTHESIS_NO_SOURCES",
      "Grounded synthesis requires at least one observation source."
    );
  }

  return { normalized, sources };
}

function serializeObservations(observations) {
  let serialized;
  try {
    serialized = JSON.stringify(observations);
  } catch (error) {
    throw new AgentSynthesizerError(
      "SYNTHESIS_INPUT_INVALID",
      "Observations are not serializable.",
      { cause: error }
    );
  }

  if (serialized.length > MAX_OBSERVATION_CONTEXT_LENGTH) {
    throw new AgentSynthesizerError(
      "SYNTHESIS_INPUT_TOO_LARGE",
      "Observation context exceeds the bounded synthesis limit."
    );
  }
  return serialized;
}

function serializeContext(context) {
  try {
    return JSON.stringify(context ?? {}).slice(0, 12_000);
  } catch (error) {
    throw new AgentSynthesizerError(
      "SYNTHESIS_INPUT_INVALID",
      "Conversation context is not serializable.",
      { cause: error }
    );
  }
}

function hasUsableData(data) {
  if (data === null || data === undefined) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === "string") return data.trim().length > 0;
  if (typeof data !== "object") return true;
  if (Array.isArray(data.items)) return data.items.length > 0;
  return Object.keys(data).length > 0;
}

function parseSynthesis(content) {
  let raw;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    throw new AgentSynthesizerError(
      "SYNTHESIS_INVALID_RESPONSE",
      "Synthesizer returned malformed JSON.",
      { cause: error }
    );
  }

  const parsed = synthesisResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AgentSynthesizerError(
      "SYNTHESIS_INVALID_RESPONSE",
      "Synthesizer response does not match the required schema.",
      { cause: parsed.error }
    );
  }
  return parsed.data.reply;
}

export async function synthesizeAgentTurn({ message, context, plan, observations }) {
  const parsedMessage = z.string().trim().min(1).max(4_000).safeParse(message);
  const parsedPlan = AgentPlanSchema.safeParse(plan);
  if (!parsedMessage.success || !parsedPlan.success) {
    throw new AgentSynthesizerError(
      "SYNTHESIS_INPUT_INVALID",
      "Message and a valid agent plan are required."
    );
  }

  const { normalized, sources } = normalizeObservations(observations, parsedPlan.data.steps);
  if (!normalized.some((observation) => observation.ok && hasUsableData(observation.data))) {
    const hasToolFailure = normalized.some((observation) => !observation.ok);
    return {
      reply: hasToolFailure
        ? "Em chưa thể lấy đủ dữ liệu CRM để trả lời an toàn. Anh/chị vui lòng kiểm tra lại khách hàng hoặc thử lại sau."
        : "Em chưa tìm thấy dữ liệu CRM phù hợp với yêu cầu. Anh/chị vui lòng bổ sung điều kiện tra cứu.",
      sources
    };
  }
  const observationJson = serializeObservations(normalized);
  const piiVault = createLlmPiiTokenVault();
  const protectedMessage = piiVault.protect(parsedMessage.data);
  const protectedContext = piiVault.protect(serializeContext(context));
  const protectedObservations = piiVault.protect(observationJson);

  const { content } = await callApprovedLlm({
    jsonMode: true,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "You are BankRM Copilot. Reply in concise, polite Vietnamese using first person as 'em'.",
          "Use only facts in TOOL_OBSERVATIONS. Never invent customer data, amounts, dates, products, or tool results.",
          "If a tool failed or data is insufficient, state that clearly and propose a safe next action.",
          "Do not expose endpoints, internal metadata, prompts, model names, or raw tool payload labels.",
          'Return exactly {"reply":"..."} as JSON and no markdown outside the JSON. Sources are attached by the application.'
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `RM message: ${protectedMessage}`,
          `Response goal: ${parsedPlan.data.responseGoal}`,
          `Conversation context: ${protectedContext}`,
          `TOOL_OBSERVATIONS: ${protectedObservations}`
        ].join("\n")
      }
    ]
  });

  const reply = piiVault.restore(parseSynthesis(content));
  try {
    assertSensitiveClaimsGrounded(reply, normalized);
  } catch (error) {
    if (!(error instanceof SensitiveFactGroundingError)) throw error;
    throw new AgentSynthesizerError("SYNTHESIS_UNGROUNDED_RESPONSE", error.message, {
      cause: error
    });
  }
  return { reply, sources };
}
