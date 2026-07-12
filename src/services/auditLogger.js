import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir =
  process.env.AUDIT_LOG_DIR ||
  (process.env.VERCEL ? path.join("/tmp", "bankrm-logs") : path.join(__dirname, "..", "..", "logs"));
const logFile = path.join(logsDir, "audit.log");
const inMemoryLogs = [];
const maxPromptLength = readPositiveInteger(process.env.AUDIT_MAX_PROMPT_LENGTH, 1000);
const maxInMemoryLogs = readPositiveInteger(process.env.AUDIT_MAX_MEMORY_LOGS, 200);
const redacted = "[REDACTED]";

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
  if (/^(?:email|phone|phoneNumber|mobile|address|accountNumber|cardNumber|nationalId|citizenId|cccd|cmnd|dateOfBirth|dob)$/i.test(key)) {
    return true;
  }
  return customerScope && /^(?:id|name|email|phone|mobile|address|accountNumber|cardNumber)$/i.test(key);
}

function sanitizeText(value) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:api[_ -]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED:EMAIL]")
    .replace(/(?<!\d)(?:\+?84|0)(?:[ .-]?\d){8,10}(?!\d)/g, "[REDACTED:PHONE]")
    .replace(/(?<!\d)\d{8,19}(?!\d)/g, "[REDACTED:ACCOUNT]")
    .replace(
      /\b(khách(?: hàng)?|khach(?: hang)?|customer)\s+([\p{L}][\p{L}.'-]*(?:\s+[\p{L}][\p{L}.'-]*){1,5})/giu,
      "$1 [REDACTED:NAME]"
    );
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
    if (isSecretKey(key) || isCustomerPiiKey(key, customerScope)) {
      output[key] = redacted;
      continue;
    }
    output[key] = sanitizeValue(
      child,
      { key, prompt: key === "prompt", customerScope },
      seen
    );
  }
  seen.delete(value);
  return output;
}

function immutableSnapshot(value) {
  return structuredClone(value);
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
  return immutableSnapshot(inMemoryLogs);
}
