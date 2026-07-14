import crypto from "node:crypto";

const MIN_CORRELATION_KEY_BYTES = 32;
const MAX_CORRELATION_KEY_BYTES = 4096;
const localDemoCorrelationKey = crypto.randomBytes(32).toString("base64url");

export const AUDIT_CONVERSATION_REFERENCE_PATTERN = /^conv_[a-f0-9]{24}$/;

export class AuditCorrelationConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuditCorrelationConfigError";
    this.code = "AUDIT_CORRELATION_CONFIG_INVALID";
  }
}

function isProtectedRuntime(env) {
  const nodeEnvironment = (env.NODE_ENV || "development").trim().toLowerCase();
  return (
    env.AUTH_ENABLED === "true" || nodeEnvironment === "pilot" || nodeEnvironment === "production"
  );
}

export function resolveAuditCorrelationKey(env = process.env) {
  const configuredKey = env.AUDIT_CORRELATION_KEY?.trim();
  if (configuredKey) {
    const byteLength = Buffer.byteLength(configuredKey, "utf8");
    if (byteLength < MIN_CORRELATION_KEY_BYTES || byteLength > MAX_CORRELATION_KEY_BYTES) {
      throw new AuditCorrelationConfigError(
        `AUDIT_CORRELATION_KEY must contain between ${MIN_CORRELATION_KEY_BYTES} and ${MAX_CORRELATION_KEY_BYTES} UTF-8 bytes.`
      );
    }
    return configuredKey;
  }

  if (isProtectedRuntime(env)) {
    throw new AuditCorrelationConfigError(
      "AUDIT_CORRELATION_KEY is required in authenticated, pilot, and production runtimes."
    );
  }

  return localDemoCorrelationKey;
}

export function assertAuditCorrelationConfigured(env = process.env) {
  resolveAuditCorrelationKey(env);
}

export function buildAuditConversationReference(value, env = process.env) {
  const normalized = typeof value === "string" && value.trim() ? value.trim() : "invalid";
  const digest = crypto
    .createHmac("sha256", resolveAuditCorrelationKey(env))
    .update("bankrm-audit-conversation-v2\0", "utf8")
    .update(normalized, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `conv_${digest}`;
}
