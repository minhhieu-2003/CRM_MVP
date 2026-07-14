import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUDIT_CONVERSATION_REFERENCE_PATTERN,
  buildAuditConversationReference
} from "./auditCorrelation.js";
import { createLlmPiiTokenVault } from "./llmPiiTokenVault.js";

export { buildAuditConversationReference } from "./auditCorrelation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir =
  process.env.AUDIT_LOG_DIR ||
  (process.env.VERCEL
    ? path.join("/tmp", "bankrm-logs")
    : path.join(__dirname, "..", "..", "logs"));
const logFile = path.join(logsDir, "audit.log");
const inMemoryLogs = [];
const maxPromptLength = readPositiveInteger(process.env.AUDIT_MAX_PROMPT_LENGTH, 1000);
const maxInMemoryLogs = readPositiveInteger(process.env.AUDIT_MAX_MEMORY_LOGS, 200);
const maxAuditReadBytes = Math.min(
  readPositiveInteger(process.env.AUDIT_MAX_READ_BYTES, 2 * 1024 * 1024),
  8 * 1024 * 1024
);
const redacted = "[REDACTED]";
const vaultTokenPattern = /\[\[BANKRM_PII_[a-z]+_\d+\]\]/g;
const unlabeledAddressPattern =
  /(?<![\p{L}\p{N}_])\d{1,5}\s+(?:(?:đường|duong|street|st\.?)\s+)?[\p{L}][\p{L}.'’-]{1,30}(?:\s+[\p{L}][\p{L}.'’-]{1,30}){0,5}(?:,\s*[\p{L}][\p{L}.'’-]{1,30}(?:\s+[\p{L}][\p{L}.'’-]{1,30}){0,4})?/giu;

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isSecretKey(key) {
  return /(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret)/i.test(
    key
  );
}

function isCustomerPiiKey(key, customerScope) {
  if (/^focusedCustomers$/i.test(key)) return true;
  if (
    /(?:customer|client).*(?:name|id|email|phone|mobile|address|account|card|dob|birth|cccd|cmnd)/i.test(
      key
    )
  ) {
    return true;
  }
  if (
    /^(?:email|phone|phoneNumber|mobile|address|accountNumber|cardNumber|nationalId|citizenId|cccd|cmnd|dateOfBirth|dob)$/i.test(
      key
    )
  ) {
    return true;
  }
  return (
    customerScope && /^(?:id|name|email|phone|mobile|address|accountNumber|cardNumber)$/i.test(key)
  );
}

function sanitizeText(value) {
  const structured = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:api[_ -]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED:EMAIL]")
    .replace(/(?<!\d)(?:\+?84|0)(?:[ .-]?\d){8,10}(?!\d)/g, "[REDACTED:PHONE]")
    .replace(/(?<!\d)(?:\d{9}|\d{12})(?!\d)/g, "[REDACTED:ID_CARD]")
    .replace(/(?<!\d)\d{10,13}(?!\d)/g, "[REDACTED:TAX_ID]")
    .replace(/(?<!\d)\d{8,19}(?!\d)/g, "[REDACTED:ACCOUNT]")
    .replace(/\bC(?:-[A-Z0-9_-]+|\d{3,})\b/gi, "[REDACTED:CUSTOMER_ID]")
    .replace(/\b(?:O|I|CP)(?:-[A-Z0-9_-]+|\d{3,})\b/gi, "[REDACTED:RECORD_ID]")
    .replace(
      /\b(khách(?: hàng)?|khach(?: hang)?|customer)\s+([\p{L}][\p{L}.'-]*(?:\s+[\p{L}][\p{L}.'-]*){1,5})/giu,
      "$1 [REDACTED:NAME]"
    )
    .replace(unlabeledAddressPattern, "[REDACTED:ADDRESS]");
  const vault = createLlmPiiTokenVault();
  return vault.protect(structured).replace(vaultTokenPattern, "[REDACTED:PII]");
}

function boundPrompt(value) {
  if (value.length <= maxPromptLength) return value;
  const marker = "[TRUNCATED]";
  if (maxPromptLength <= marker.length) return marker.slice(0, maxPromptLength);
  return `${value.slice(0, maxPromptLength - marker.length)}${marker}`;
}

function sanitizeValue(value, options = {}, seen = new WeakSet()) {
  if (typeof value === "string") {
    const sanitized = sanitizeText(value);
    return options.prompt ? boundPrompt(sanitized) : sanitized;
  }
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[REDACTED:CIRCULAR]";
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return "[REDACTED:BINARY]";

  seen.add(value);
  if (Array.isArray(value)) {
    const output = value.map((item) => sanitizeValue(item, options, seen));
    seen.delete(value);
    return output;
  }

  const output = {};
  const customerScope =
    options.customerScope ||
    /^(?:customers?|clients?)(?:Data|Profiles?)?$/i.test(options.key ?? "");
  for (const [key, child] of Object.entries(value)) {
    if (/^conversationId$/i.test(key)) {
      output[key] =
        options.trustedPersistedRead &&
        typeof child === "string" &&
        AUDIT_CONVERSATION_REFERENCE_PATTERN.test(child)
          ? child
          : buildAuditConversationReference(child);
      continue;
    }
    if (isSecretKey(key) || isCustomerPiiKey(key, customerScope)) {
      output[key] = redacted;
      continue;
    }
    output[key] = sanitizeValue(
      child,
      {
        key,
        prompt: key === "prompt",
        customerScope,
        trustedPersistedRead: options.trustedPersistedRead
      },
      seen
    );
  }
  seen.delete(value);
  return output;
}

function immutableSnapshot(value) {
  return structuredClone(value);
}

function boundedIdentifier(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().slice(0, 128);
}

export function sanitizePersistedAuditEntry(entry) {
  return sanitizeValue(entry, { trustedPersistedRead: true });
}

export function buildAuditActor(identity = {}) {
  return {
    actorId: boundedIdentifier(identity.userId ?? identity.actorId ?? identity.rmId, "system"),
    actorRole: boundedIdentifier(identity.role, "system"),
    ...(identity.rmId ? { rmScope: boundedIdentifier(identity.rmId, "unknown") } : {}),
    ...(identity.branchId ? { branchScope: boundedIdentifier(identity.branchId, "unknown") } : {})
  };
}

function readPersistedLogs() {
  let fileHandle;
  try {
    const { size } = fs.statSync(logFile);
    if (size === 0) return [];
    const bytesToRead = Math.min(size, maxAuditReadBytes);
    const start = size - bytesToRead;
    const buffer = Buffer.alloc(bytesToRead);
    fileHandle = fs.openSync(logFile, "r");
    fs.readSync(fileHandle, buffer, 0, bytesToRead, start);

    let content = buffer.toString("utf8");
    if (start > 0) {
      const firstNewline = content.indexOf("\n");
      if (firstNewline < 0) return [];
      content = content.slice(firstNewline + 1);
    }

    const entries = [];
    const lines = content.trim().split("\n");
    for (let index = lines.length - 1; index >= 0 && entries.length < maxInMemoryLogs; index -= 1) {
      try {
        entries.push(sanitizePersistedAuditEntry(JSON.parse(lines[index])));
      } catch {
        // Ignore a partial/corrupt NDJSON record and keep the remaining recent audit events.
      }
    }
    return entries;
  } catch {
    return [];
  } finally {
    if (fileHandle !== undefined) {
      try {
        fs.closeSync(fileHandle);
      } catch {
        // A failed audit read must not take down the diagnostics endpoint.
      }
    }
  }
}

export function writeAudit(entry) {
  const payload = sanitizeValue({
    ...entry,
    timestamp: new Date().toISOString()
  });
  inMemoryLogs.unshift(payload);
  if (inMemoryLogs.length > maxInMemoryLogs) inMemoryLogs.length = maxInMemoryLogs;

  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(logFile, `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // Audit persistence must not take down a chat turn; the bounded memory copy remains available.
  }

  return payload.auditId;
}

export function getAuditLogs() {
  const merged = new Map();
  for (const entry of [...inMemoryLogs, ...readPersistedLogs()]) {
    const key = `${entry.auditId ?? "unknown"}:${entry.timestamp ?? "unknown"}`;
    if (!merged.has(key)) merged.set(key, entry);
  }
  return immutableSnapshot(
    [...merged.values()]
      .sort((left, right) =>
        String(right.timestamp ?? "").localeCompare(String(left.timestamp ?? ""))
      )
      .slice(0, maxInMemoryLogs)
  );
}
