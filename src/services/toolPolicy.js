import { z } from "zod";

export const TOOL_SCOPE_DENIED = "TOOL_SCOPE_DENIED";
export const TOOL_POLICY_SOURCE = "internal://tool-policy";

export const DEFAULT_LOCAL_DEMO_ENTITLEMENTS = Object.freeze([
  "customer:read",
  "opportunity:read",
  "interaction:read",
  "campaign:read",
  "communication:draft"
]);

const scopeSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$/);

export const EntitlementsSchema = z
  .array(z.union([scopeSchema, z.literal("*")]))
  .max(128)
  .transform((values) => [...new Set(values)]);

export class ToolPolicyConfigurationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ToolPolicyConfigurationError";
    this.code = "TOOL_ENTITLEMENTS_INVALID";
  }
}

export class ToolPolicyDeniedError extends Error {
  constructor(missingScopes = [], options) {
    super("The server-bound identity is not entitled to perform this operation.", options);
    this.name = "ToolPolicyDeniedError";
    this.code = TOOL_SCOPE_DENIED;
    this.statusCode = 403;
    this.source = TOOL_POLICY_SOURCE;
    this.missingScopes = Object.freeze([...missingScopes]);
  }
}

function tokenize(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseEntitlements(
  value,
  { allowWildcard = false, fallback = [], requireNonEmpty = false } = {}
) {
  const candidate = tokenize(value);
  const values = candidate.length > 0 ? candidate : tokenize(fallback);
  const parsed = EntitlementsSchema.safeParse(values);
  if (!parsed.success) {
    throw new ToolPolicyConfigurationError("Configured tool entitlements are invalid.", {
      cause: parsed.error
    });
  }
  if (parsed.data.includes("*") && (!allowWildcard || parsed.data.length !== 1)) {
    throw new ToolPolicyConfigurationError(
      "The wildcard entitlement must be explicitly configured by itself for an admin identity."
    );
  }
  if (requireNonEmpty && parsed.data.length === 0) {
    throw new ToolPolicyConfigurationError("At least one tool entitlement is required.");
  }
  return Object.freeze(parsed.data);
}

export function serializeEntitlements(entitlements) {
  return JSON.stringify(parseEntitlements(entitlements, { allowWildcard: true }));
}

export function parseSerializedEntitlements(value, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(value ?? "");
  } catch (error) {
    throw new ToolPolicyConfigurationError("Serialized tool entitlements are invalid.", {
      cause: error
    });
  }
  if (!Array.isArray(parsed)) {
    throw new ToolPolicyConfigurationError("Serialized tool entitlements must be an array.");
  }
  return parseEntitlements(parsed, options);
}

export function evaluateToolAccess({ entitlements, requiredScopes }) {
  const granted = new Set(parseEntitlements(entitlements, { allowWildcard: true }));
  const required = parseEntitlements(requiredScopes);
  const missingScopes = granted.has("*") ? [] : required.filter((scope) => !granted.has(scope));
  return Object.freeze({
    allowed: missingScopes.length === 0,
    missingScopes: Object.freeze(missingScopes),
    ...(missingScopes.length > 0 ? { errorCode: TOOL_SCOPE_DENIED } : {})
  });
}

function protectedRuntime(env) {
  const nodeEnvironment = (env.NODE_ENV || "development").trim().toLowerCase();
  return env.AUTH_ENABLED === "true" || nodeEnvironment === "pilot" || nodeEnvironment === "production";
}

function serverBoundEntitlements(identity, { env, requireExplicit }) {
  const hasExplicitEntitlements =
    identity &&
    typeof identity === "object" &&
    Object.prototype.hasOwnProperty.call(identity, "entitlements");

  if (!hasExplicitEntitlements) {
    if (requireExplicit || protectedRuntime(env)) {
      throw new ToolPolicyDeniedError();
    }
    return DEFAULT_LOCAL_DEMO_ENTITLEMENTS;
  }

  try {
    return parseEntitlements(identity.entitlements, {
      allowWildcard: identity.role === "admin",
      requireNonEmpty: true
    });
  } catch (error) {
    throw new ToolPolicyDeniedError([], { cause: error });
  }
}

/**
 * Enforces application entitlements at every non-MCP data boundary.
 * Protected runtimes never derive grants from request headers or ambient defaults.
 */
export function assertIdentityScopes({
  identity,
  requiredScopes,
  env = process.env,
  requireExplicit = false
}) {
  let required;
  try {
    required = parseEntitlements(requiredScopes, { requireNonEmpty: true });
  } catch (error) {
    throw new ToolPolicyConfigurationError("Required application scopes are invalid.", {
      cause: error
    });
  }

  const entitlements = serverBoundEntitlements(identity, { env, requireExplicit });
  const access = evaluateToolAccess({ entitlements, requiredScopes: required });
  if (!access.allowed) {
    throw new ToolPolicyDeniedError(access.missingScopes);
  }
  return entitlements;
}
