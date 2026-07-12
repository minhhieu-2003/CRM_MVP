const PLACEHOLDER_PROXY_URL =
  "https://your-approved-proxy.example.com/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 12_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 100_000;

const DIRECT_VENDOR_HOSTS = new Set([
  "api.anthropic.com",
  "api.cohere.com",
  "api.groq.com",
  "api.mistral.ai",
  "api.openai.com",
  "api.perplexity.ai",
  "api.together.xyz",
  "generativelanguage.googleapis.com"
]);
const DIRECT_VENDOR_SUFFIXES = [".aiplatform.googleapis.com", ".openai.azure.com"];
const ALLOWED_DATA_CLASSIFICATIONS = new Set(["synthetic", "anonymized"]);

export class LlmGatewayError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "LlmGatewayError";
    this.code = code;
  }
}

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function readTimeout(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(parsed, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

function getProxyConfig() {
  const rawUrl = process.env.LLM_API_URL?.trim();
  const apiKey = process.env.LLM_API_KEY?.trim();

  if (!rawUrl || rawUrl === PLACEHOLDER_PROXY_URL || !apiKey) {
    throw new LlmGatewayError(
      "LLM_PROXY_NOT_CONFIGURED",
      "Approved LLM proxy is not configured."
    );
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new LlmGatewayError("LLM_PROXY_INVALID_URL", "LLM proxy URL is invalid.", {
      cause: error
    });
  }

  const hostname = url.hostname.toLowerCase();
  if (
    url.username ||
    url.password ||
    DIRECT_VENDOR_HOSTS.has(hostname) ||
    DIRECT_VENDOR_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    (!isLoopback(hostname) && url.protocol !== "https:")
  ) {
    throw new LlmGatewayError(
      "LLM_PROXY_NOT_APPROVED",
      "LLM_API_URL must point to an approved HTTPS proxy, not a model vendor endpoint."
    );
  }

  return {
    apiKey,
    model: process.env.LLM_MODEL?.trim() || "bankrm-approved-model",
    timeoutMs: readTimeout(process.env.LLM_TIMEOUT_MS),
    url: url.toString()
  };
}

export function isApprovedLlmProxyConfigured() {
  try {
    getProxyConfig();
    return true;
  } catch {
    return false;
  }
}

export function isLlmDataUseAllowed() {
  const classification = process.env.AI_DATA_CLASSIFICATION?.trim().toLowerCase();
  return ALLOWED_DATA_CLASSIFICATIONS.has(classification);
}

export async function callApprovedLlm({ messages, jsonMode = false, temperature = 0 }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new LlmGatewayError("LLM_REQUEST_INVALID", "At least one LLM message is required.");
  }

  const config = getProxyConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {})
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new LlmGatewayError(
        "LLM_PROXY_HTTP_ERROR",
        `Approved LLM proxy returned HTTP ${response.status}.`
      );
    }

    const rawBody = await response.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_RESPONSE_BYTES) {
      throw new LlmGatewayError("LLM_RESPONSE_TOO_LARGE", "LLM proxy response is too large.");
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      throw new LlmGatewayError("LLM_RESPONSE_INVALID", "LLM proxy returned invalid JSON.", {
        cause: error
      });
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new LlmGatewayError("LLM_RESPONSE_EMPTY", "LLM proxy returned no content.");
    }

    return { content: content.trim(), model: config.model };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new LlmGatewayError(
        "LLM_TIMEOUT",
        `Approved LLM proxy timed out after ${config.timeoutMs} ms.`,
        { cause: error }
      );
    }
    if (error instanceof LlmGatewayError) throw error;
    throw new LlmGatewayError("LLM_PROXY_UNAVAILABLE", "Approved LLM proxy is unavailable.", {
      cause: error
    });
  } finally {
    clearTimeout(timeout);
  }
}
