import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { MCP_TRUSTED_TOOL_SOURCE_CATALOG, McpToolObservationSchema } from "./protocol.js";
import {
  DEFAULT_LOCAL_DEMO_ENTITLEMENTS,
  EntitlementsSchema,
  evaluateToolAccess,
  parseEntitlements,
  serializeEntitlements
} from "../services/toolPolicy.js";
import { resolveAuditCorrelationKey } from "../services/auditCorrelation.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DEFAULT_SERVER_PATH = fileURLToPath(new URL("./server.js", import.meta.url));
const MAX_TOOL_PAGES = 10;
const MAX_TOOLS = 64;

const CRM_ENV_KEYS = Object.freeze([
  "NODE_ENV",
  "AUTH_ENABLED",
  "CRM_MODE",
  "CRM_TIMEOUT_MS",
  "CRM_SQLITE_PATH",
  "CRM_POSTGRES_URL",
  "DATABASE_URL",
  "CRM_API_BASE_URL",
  "CRM_API_KEY",
  "CRM_API_AUTH_SCHEME",
  "CRM_API_KEY_HEADER",
  "CRM_BUSINESS_DATE",
  "AUDIT_LOG_DIR",
  "AUDIT_CORRELATION_KEY",
  "AUDIT_MAX_PROMPT_LENGTH",
  "AUDIT_MAX_MEMORY_LOGS"
]);

const identitySchema = z
  .object({
    userId: z.string().trim().min(1).max(128),
    rmId: z.string().trim().min(1).max(128).optional(),
    role: z.enum(["admin", "rm", "user"]),
    branchId: z.string().trim().min(1).max(128).optional(),
    entitlements: EntitlementsSchema
  })
  .passthrough()
  .superRefine((identity, context) => {
    if (identity.role !== "admin" && (!identity.rmId || !identity.branchId)) {
      context.addIssue({
        code: "custom",
        message: "RM and branch identity are required for non-admin MCP sessions."
      });
    }
    if (identity.entitlements.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["entitlements"],
        message: "At least one server-bound entitlement is required."
      });
    }
    if (identity.role !== "admin" && identity.entitlements.includes("*")) {
      context.addIssue({
        code: "custom",
        path: ["entitlements"],
        message: "Only an explicitly configured admin identity may use wildcard access."
      });
    }
  });

const conversationIdSchema = z.string().trim().min(1).max(128);
const toolDescriptorSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-z][a-z0-9_]*$/),
    description: z.string().trim().min(1).max(2000),
    inputSchema: z
      .object({
        type: z.literal("object")
      })
      .passthrough(),
    outputSchema: z
      .object({
        type: z.literal("object")
      })
      .passthrough(),
    annotations: z
      .object({
        readOnlyHint: z.boolean(),
        destructiveHint: z.boolean(),
        idempotentHint: z.boolean(),
        openWorldHint: z.boolean()
      })
      .passthrough(),
    _meta: z
      .object({
        "bankrm/access": z.enum(["read", "write"]),
        "bankrm/riskLevel": z.enum(["low", "medium", "high"]),
        "bankrm/requiredScopes": z.array(z.string().trim().min(1).max(128)).min(1),
        "bankrm/sources": z
          .array(z.object({ endpoint: z.string().trim().min(1).max(500) }).strict())
          .min(1),
        "bankrm/errorSources": z
          .array(z.object({ endpoint: z.string().trim().min(1).max(500) }).strict())
          .min(1)
      })
      .passthrough()
  })
  .passthrough();

let activeSessions = 0;

function readInteger(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function runtimeConfig(options = {}) {
  return {
    connectTimeoutMs: readInteger(
      options.connectTimeoutMs ?? process.env.MCP_CONNECT_TIMEOUT_MS,
      3000,
      { min: 100, max: 10_000 }
    ),
    requestTimeoutMs: readInteger(
      options.requestTimeoutMs ?? process.env.MCP_REQUEST_TIMEOUT_MS,
      7000,
      { min: 100, max: 15_000 }
    ),
    turnTimeoutMs: readInteger(options.turnTimeoutMs ?? process.env.MCP_TURN_TIMEOUT_MS, 15_000, {
      min: 500,
      max: 30_000
    }),
    retryLimit: readInteger(options.retryLimit ?? process.env.MCP_RETRY_LIMIT, 1, {
      min: 0,
      max: 1
    }),
    maxConcurrentSessions: readInteger(
      options.maxConcurrentSessions ?? process.env.MCP_MAX_CONCURRENT_SESSIONS,
      8,
      { min: 1, max: 32 }
    ),
    observationMaxAgeMs: readInteger(
      options.observationMaxAgeMs ?? process.env.MCP_OBSERVATION_MAX_AGE_MS,
      60_000,
      { min: 100, max: 300_000 }
    )
  };
}

function buildServerEnvironment(
  identity,
  conversationId,
  sourceEnv = process.env,
  auditCorrelationKey = resolveAuditCorrelationKey(sourceEnv)
) {
  const environment = getDefaultEnvironment();
  for (const key of CRM_ENV_KEYS) {
    if (typeof sourceEnv[key] === "string") environment[key] = sourceEnv[key];
  }

  return {
    ...environment,
    BANKRM_MCP_SESSION: "true",
    BANKRM_MCP_USER_ID: identity.userId,
    BANKRM_MCP_ROLE: identity.role,
    BANKRM_MCP_CONVERSATION_ID: conversationId,
    BANKRM_MCP_ENTITLEMENTS: serializeEntitlements(identity.entitlements),
    AUDIT_CORRELATION_KEY: auditCorrelationKey,
    ...(identity.rmId ? { BANKRM_MCP_RM_ID: identity.rmId } : {}),
    ...(identity.branchId ? { BANKRM_MCP_BRANCH_ID: identity.branchId } : {})
  };
}

function isTimeoutError(error) {
  return (
    error?.name === "AbortError" ||
    (error instanceof McpError && error.code === ErrorCode.RequestTimeout)
  );
}

function asClientError(code, message, cause) {
  if (cause instanceof McpClientError) return cause;
  return new McpClientError(isTimeoutError(cause) ? "MCP_TIMEOUT" : code, message, {
    cause
  });
}

async function closeQuietly(client, transport) {
  try {
    await client?.close();
  } catch {
    try {
      await transport?.close();
    } catch {
      // The caller is already handling the primary MCP failure.
    }
  }
}

async function retryBounded(operation, retryLimit) {
  let lastError;
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export class McpClientError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "McpClientError";
    this.code = code;
  }
}

function endpointSet(sources) {
  return new Set(sources.map((source) => source.endpoint));
}

function sameEndpoints(advertised, trusted) {
  const actual = endpointSet(advertised);
  return actual.size === trusted.length && trusted.every((endpoint) => actual.has(endpoint));
}

function sameStrings(advertised, trusted) {
  const actual = new Set(advertised);
  return (
    actual.size === advertised.length &&
    actual.size === trusted.length &&
    trusted.every((value) => actual.has(value))
  );
}

function expectedErrorSources(errorCode, trusted) {
  if (errorCode === "TOOL_SCOPE_DENIED") return ["internal://tool-policy"];
  if (errorCode === "TOOL_IDENTITY_INVALID" || errorCode === "TOOL_INPUT_INVALID") {
    return ["internal://tool-registry"];
  }
  if (errorCode === "TOOL_EXECUTION_FAILED") return ["internal://tool-execution"];
  if (errorCode === "TOOL_BUSINESS_ERROR") return trusted.businessError;
  if (errorCode === "TOOL_OBSERVATION_TOO_LARGE") return trusted.success;
  return [];
}

export function assertTrustedToolDescriptor(tool) {
  const trusted = MCP_TRUSTED_TOOL_SOURCE_CATALOG[tool.name];
  if (
    !trusted ||
    !sameEndpoints(tool._meta["bankrm/sources"], trusted.success) ||
    !sameEndpoints(tool._meta["bankrm/errorSources"], trusted.error) ||
    !sameStrings(tool._meta["bankrm/requiredScopes"], trusted.requiredScopes)
  ) {
    throw new McpClientError(
      "MCP_TOOL_LIST_INVALID",
      `MCP server advertised an untrusted tool or source catalog: ${tool.name}`
    );
  }
}

export function validateMcpToolResult({
  tool,
  result,
  now = Date.now(),
  maxAgeMs = 60_000,
  maxFutureSkewMs = 5_000
}) {
  if (!("structuredContent" in result)) {
    throw new McpClientError(
      "MCP_TOOL_RESULT_INVALID",
      `MCP tool returned no structured observation: ${tool.name}`
    );
  }
  const parsed = McpToolObservationSchema.safeParse(result.structuredContent);
  if (!parsed.success) {
    throw new McpClientError(
      "MCP_TOOL_RESULT_INVALID",
      `MCP tool returned an invalid observation: ${tool.name}`,
      { cause: parsed.error }
    );
  }
  if ((parsed.data.status === "error") !== (result.isError === true)) {
    throw new McpClientError(
      "MCP_TOOL_RESULT_INVALID",
      `MCP tool returned inconsistent error status: ${tool.name}`
    );
  }

  const observedAt = Date.parse(parsed.data.observedAt);
  if (now - observedAt > maxAgeMs || observedAt - now > maxFutureSkewMs) {
    throw new McpClientError(
      "MCP_TOOL_RESULT_INVALID",
      `MCP tool returned a stale or future-dated observation: ${tool.name}`
    );
  }

  const trusted = MCP_TRUSTED_TOOL_SOURCE_CATALOG[tool.name];
  const trustedSources = new Set(
    parsed.data.status === "success" ? trusted?.success : trusted?.error
  );
  const advertisedSources = endpointSet(
    parsed.data.status === "success"
      ? tool._meta["bankrm/sources"]
      : tool._meta["bankrm/errorSources"]
  );
  if (
    !trusted ||
    (parsed.data.status === "success" && !sameEndpoints(parsed.data.sources, trusted.success)) ||
    (parsed.data.status === "error" &&
      !sameEndpoints(parsed.data.sources, expectedErrorSources(parsed.data.errorCode, trusted))) ||
    parsed.data.sources.some(
      ({ endpoint }) => !trustedSources.has(endpoint) || !advertisedSources.has(endpoint)
    )
  ) {
    throw new McpClientError(
      "MCP_TOOL_RESULT_INVALID",
      `MCP tool returned an untrusted observation source: ${tool.name}`
    );
  }
  return parsed.data;
}

class McpClientSession {
  constructor({ client, transport, config, abortController, release, identity }) {
    this.client = client;
    this.transport = transport;
    this.config = config;
    this.abortController = abortController;
    this.release = release;
    this.identity = identity;
    this.closed = false;
    this.closePromise = null;
    this.tools = null;
    this.turnTimer = setTimeout(() => {
      void this.close();
    }, config.turnTimeoutMs);
    this.turnTimer.unref?.();
  }

  requestOptions() {
    return {
      timeout: this.config.requestTimeoutMs,
      maxTotalTimeout: this.config.requestTimeoutMs,
      signal: this.abortController.signal
    };
  }

  assertOpen() {
    if (this.closed) throw new McpClientError("MCP_SESSION_CLOSED", "MCP session is closed.");
  }

  async listTools() {
    this.assertOpen();
    if (this.tools) return structuredClone(this.tools);

    try {
      const discovered = await retryBounded(async () => {
        const tools = [];
        let cursor;
        for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
          const response = await this.client.listTools(
            cursor ? { cursor } : undefined,
            this.requestOptions()
          );
          tools.push(...response.tools);
          if (tools.length > MAX_TOOLS) {
            throw new McpClientError(
              "MCP_TOOL_LIST_INVALID",
              "MCP server advertised too many tools."
            );
          }
          cursor = response.nextCursor;
          if (!cursor) return tools;
        }
        throw new McpClientError(
          "MCP_TOOL_LIST_INVALID",
          "MCP tool discovery exceeded the page limit."
        );
      }, this.config.retryLimit);

      const parsed = z.array(toolDescriptorSchema).max(MAX_TOOLS).safeParse(discovered);
      if (!parsed.success) {
        throw new McpClientError(
          "MCP_TOOL_LIST_INVALID",
          "MCP server returned invalid tool metadata.",
          { cause: parsed.error }
        );
      }
      const names = new Set();
      for (const tool of parsed.data) {
        if (names.has(tool.name)) {
          throw new McpClientError(
            "MCP_TOOL_LIST_INVALID",
            `MCP server advertised a duplicate tool: ${tool.name}`
          );
        }
        names.add(tool.name);
        assertTrustedToolDescriptor(tool);
      }
      this.tools = parsed.data.filter(
        (tool) =>
          evaluateToolAccess({
            entitlements: this.identity.entitlements,
            requiredScopes: MCP_TRUSTED_TOOL_SOURCE_CATALOG[tool.name].requiredScopes
          }).allowed
      );
      return structuredClone(this.tools);
    } catch (error) {
      throw asClientError("MCP_TOOL_LIST_FAILED", "Unable to discover MCP tools.", error);
    }
  }

  async callTool({ name, input = {} }) {
    this.assertOpen();
    if (!this.tools) await this.listTools();
    if (!this.tools.some((tool) => tool.name === name)) {
      throw new McpClientError("MCP_TOOL_NOT_ALLOWED", `MCP tool is not allowlisted: ${name}`);
    }

    let result;
    try {
      result = await this.client.callTool(
        { name, arguments: input },
        CallToolResultSchema,
        this.requestOptions()
      );
    } catch (error) {
      throw asClientError("MCP_TOOL_CALL_FAILED", `MCP tool call failed: ${name}`, error);
    }

    return validateMcpToolResult({
      tool: this.tools.find((tool) => tool.name === name),
      result,
      maxAgeMs: this.config.observationMaxAgeMs
    });
  }

  async close() {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    clearTimeout(this.turnTimer);
    this.abortController.abort();
    this.closePromise = (async () => {
      try {
        await closeQuietly(this.client, this.transport);
      } finally {
        this.release();
      }
    })();
    return this.closePromise;
  }
}

export async function createMcpClientSession({
  identity,
  conversationId,
  serverPath = DEFAULT_SERVER_PATH,
  sourceEnv = process.env,
  ...options
}) {
  if (process.env.VERCEL && process.env.MCP_ALLOW_STDIO_ON_SERVERLESS !== "true") {
    throw new McpClientError(
      "MCP_RUNTIME_UNSUPPORTED",
      "MCP stdio execution is unavailable in this serverless runtime."
    );
  }

  const nodeEnvironment = (sourceEnv.NODE_ENV || "development").trim().toLowerCase();
  const protectedRuntime =
    sourceEnv.AUTH_ENABLED === "true" ||
    nodeEnvironment === "pilot" ||
    nodeEnvironment === "production";
  let serverBoundEntitlements;
  try {
    serverBoundEntitlements = protectedRuntime
      ? identity?.entitlements
      : parseEntitlements(process.env.AUTH_LOCAL_DEMO_ENTITLEMENTS, {
          fallback: DEFAULT_LOCAL_DEMO_ENTITLEMENTS,
          requireNonEmpty: true
        });
  } catch {
    throw new McpClientError("MCP_SESSION_INVALID", "MCP session entitlements are invalid.");
  }
  const parsedIdentity = identitySchema.safeParse({
    ...identity,
    entitlements: serverBoundEntitlements
  });
  const parsedConversationId = conversationIdSchema.safeParse(conversationId);
  if (!parsedIdentity.success || !parsedConversationId.success) {
    throw new McpClientError("MCP_SESSION_INVALID", "MCP session identity is invalid.");
  }
  let auditCorrelationKey;
  try {
    auditCorrelationKey = resolveAuditCorrelationKey(sourceEnv);
  } catch {
    throw new McpClientError(
      "MCP_SESSION_INVALID",
      "MCP audit correlation configuration is invalid."
    );
  }
  const sessionIdentity = Object.freeze({
    ...parsedIdentity.data,
    entitlements: Object.freeze([...parsedIdentity.data.entitlements])
  });
  if (
    protectedRuntime &&
    sessionIdentity.role !== "admin" &&
    (sessionIdentity.rmId?.toLowerCase() === "default" ||
      sessionIdentity.branchId?.toLowerCase() === "default")
  ) {
    throw new McpClientError(
      "MCP_SESSION_INVALID",
      "Default RM or branch scope is not allowed in an authenticated MCP session."
    );
  }

  const config = runtimeConfig(options);
  if (activeSessions >= config.maxConcurrentSessions) {
    throw new McpClientError("MCP_CAPACITY_EXCEEDED", "MCP session capacity was exceeded.");
  }
  activeSessions += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeSessions -= 1;
  };

  const abortController = new AbortController();
  let lastError;

  for (let attempt = 0; attempt <= config.retryLimit; attempt += 1) {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      cwd: PROJECT_ROOT,
      env: buildServerEnvironment(
        sessionIdentity,
        parsedConversationId.data,
        sourceEnv,
        auditCorrelationKey
      ),
      stderr: "pipe"
    });
    transport.stderr?.on("data", () => {
      // Drain child diagnostics without copying them into chat responses or audit payloads.
    });
    const client = new Client(
      { name: "bankrm-ai-core", version: "1.0.0" },
      { capabilities: {}, enforceStrictCapabilities: true }
    );

    try {
      await client.connect(transport, {
        timeout: config.connectTimeoutMs,
        maxTotalTimeout: config.connectTimeoutMs,
        signal: abortController.signal
      });
      return new McpClientSession({
        client,
        transport,
        config,
        abortController,
        release,
        identity: sessionIdentity
      });
    } catch (error) {
      lastError = error;
      await closeQuietly(client, transport);
    }
  }

  abortController.abort();
  release();
  throw asClientError("MCP_CONNECT_FAILED", "Unable to initialize MCP session.", lastError);
}

export const MCP_SAFE_CHILD_ENV_KEYS = CRM_ENV_KEYS;
