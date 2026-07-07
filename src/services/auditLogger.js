import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, "..", "..", "logs");
const logFile = path.join(logsDir, "audit.log");
const inMemoryLogs = [];

function ensureLogFile() {
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, "", "utf8");
}

export function writeAudit(entry) {
  ensureLogFile();
  const payload = {
    ...entry,
    timestamp: new Date().toISOString()
  };
  inMemoryLogs.unshift(payload);
  if (inMemoryLogs.length > 200) inMemoryLogs.length = 200;
  fs.appendFileSync(logFile, `${JSON.stringify(payload)}\n`, "utf8");
  return payload.auditId;
}

export function getAuditLogs() {
  return inMemoryLogs;
}
