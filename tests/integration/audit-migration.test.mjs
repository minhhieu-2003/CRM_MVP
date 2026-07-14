import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const migrationScript = path.resolve("scripts/audit/sanitize-legacy-audit.mjs");
const testCorrelationKey = "test-only-migration-audit-correlation-key-material";

test("legacy audit migration is dry-run by default and writes only a new sanitized file", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bankrm-audit-migration-"));
  const inputPath = path.join(directory, "legacy.log");
  const outputPath = path.join(directory, "sanitized.log");
  const legacyEntry = {
    auditId: "legacy-migration",
    conversationId: "legacy-conversation-C888-an@example.com",
    prompt: "khach hang Nguyen Van An C888 an@example.com 0912345678 token=raw-secret",
    apiKey: "raw-api-key",
    customer: {
      id: "C888",
      name: "Nguyen Van An",
      accountNumber: "123456789012"
    },
    timestamp: "2026-07-13T00:00:00.000Z"
  };
  const originalContent = `${JSON.stringify(legacyEntry)}\n`;
  fs.writeFileSync(inputPath, originalContent, "utf8");

  try {
    const dryRun = runMigration(["--input", inputPath]);
    assert.equal(dryRun.status, 0);
    assert.equal(fs.existsSync(outputPath), false);
    assert.equal(fs.readFileSync(inputPath, "utf8"), originalContent);
    assert.doesNotMatch(`${dryRun.stdout}${dryRun.stderr}`, /Nguyen Van An|raw-secret/);

    const applied = runMigration(["--input", inputPath, "--apply", "--output", outputPath]);
    assert.equal(applied.status, 0);
    assert.equal(fs.readFileSync(inputPath, "utf8"), originalContent);
    const [sanitized] = fs
      .readFileSync(outputPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.match(sanitized.conversationId, /^conv_[a-f0-9]{24}$/);
    assert.equal(sanitized.apiKey, "[REDACTED]");
    assert.equal(sanitized.customer.id, "[REDACTED]");
    assert.equal(sanitized.customer.name, "[REDACTED]");
    assert.equal(sanitized.customer.accountNumber, "[REDACTED]");
    assert.doesNotMatch(
      JSON.stringify(sanitized),
      /legacy-conversation|Nguyen Van An|C888|an@example\.com|0912345678|raw-secret|raw-api-key|123456789012/
    );

    const overwriteAttempt = runMigration([
      "--input",
      inputPath,
      "--apply",
      "--output",
      outputPath
    ]);
    assert.notEqual(overwriteAttempt.status, 0);
    assert.equal(fs.readFileSync(inputPath, "utf8"), originalContent);
    assert.equal(fs.readFileSync(outputPath, "utf8"), `${JSON.stringify(sanitized)}\n`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function runMigration(arguments_) {
  return spawnSync(process.execPath, [migrationScript, ...arguments_], {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      AUTH_ENABLED: "false",
      AUDIT_CORRELATION_KEY: testCorrelationKey
    }
  });
}
