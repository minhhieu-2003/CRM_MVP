import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createContextManager } from "../../src/services/contextManager.js";

const temporaryPaths = [];
const originalAuditEnv = {
  AUDIT_LOG_DIR: process.env.AUDIT_LOG_DIR,
  AUDIT_MAX_PROMPT_LENGTH: process.env.AUDIT_MAX_PROMPT_LENGTH
};

afterEach(() => {
  restoreEnv("AUDIT_LOG_DIR", originalAuditEnv.AUDIT_LOG_DIR);
  restoreEnv("AUDIT_MAX_PROMPT_LENGTH", originalAuditEnv.AUDIT_MAX_PROMPT_LENGTH);
  while (temporaryPaths.length > 0) {
    fs.rmSync(temporaryPaths.pop(), { recursive: true, force: true });
  }
});

describe("context manager", () => {
  test("returns a complete immutable default context", () => {
    const manager = createContextManager();
    const context = manager.getConversationContext({
      conversationId: "default-context",
      identity: { userId: "user-1", rmId: "RM01" }
    });

    assert.deepEqual(context, {
      currentModule: "general",
      focusedCustomers: [],
      lastIntent: null
    });
    assert.equal(Object.isFrozen(context), true);
    assert.equal(Object.isFrozen(context.focusedCustomers), true);
    assert.throws(() => context.focusedCustomers.push("C001"), TypeError);
  });

  test("isolates the same conversation id by actor and returns detached snapshots", () => {
    const manager = createContextManager({ maxFocusedCustomers: 2 });
    const identityA = { userId: "user-a", rmId: "RM01", branchId: "DN" };
    const identityB = { userId: "user-b", rmId: "RM02", branchId: "DN" };
    const input = {
      currentModule: "opportunity",
      focusedCustomers: ["C001", "C001", "C002", "C003"],
      lastIntent: "suggest-opportunity",
      metadata: { page: 1 }
    };

    const saved = manager.saveConversationContext({
      conversationId: "shared-id",
      identity: identityA,
      context: input
    });
    input.metadata.page = 99;

    assert.deepEqual(saved.focusedCustomers, ["C001", "C002"]);
    assert.equal(saved.metadata.page, 1);
    assert.equal(
      manager.getConversationContext({ conversationId: "shared-id", identity: identityA }).metadata
        .page,
      1
    );
    assert.deepEqual(
      manager.getConversationContext({ conversationId: "shared-id", identity: identityB }),
      { currentModule: "general", focusedCustomers: [], lastIntent: null }
    );
  });

  test("expires idle contexts and evicts the least recently used conversation", () => {
    let timestamp = 0;
    const manager = createContextManager({
      ttlMs: 100,
      maxConversations: 2,
      now: () => timestamp
    });
    const identity = { userId: "user-1" };

    saveModule(manager, identity, "one", "customer-profile");
    timestamp = 10;
    saveModule(manager, identity, "two", "opportunity");
    timestamp = 20;
    manager.getConversationContext({ conversationId: "one", identity });
    timestamp = 30;
    saveModule(manager, identity, "three", "campaign");

    assert.equal(
      manager.getConversationContext({ conversationId: "two", identity }).currentModule,
      "general"
    );
    timestamp = 131;
    assert.equal(
      manager.getConversationContext({ conversationId: "three", identity }).currentModule,
      "general"
    );
  });

  test("deletes only the requested actor conversation", () => {
    const manager = createContextManager();
    const identity = { userId: "user-1" };
    saveModule(manager, identity, "delete-me", "campaign");

    assert.equal(
      manager.deleteConversationContext({ conversationId: "delete-me", identity }),
      true
    );
    assert.equal(
      manager.deleteConversationContext({ conversationId: "delete-me", identity }),
      false
    );
    assert.equal(
      manager.getConversationContext({ conversationId: "delete-me", identity }).currentModule,
      "general"
    );
  });
});

describe("audit logger", () => {
  test("recursively redacts secrets and customer PII, bounds prompts, and appends NDJSON", async () => {
    const logsDir = makeTemporaryPath("bankrm-audit-");
    process.env.AUDIT_LOG_DIR = logsDir;
    process.env.AUDIT_MAX_PROMPT_LENGTH = "80";
    const audit = await importFreshAuditLogger("redaction");
    const longPrompt =
      "Soan email cho khach hang Nguyen Van An, email an@example.com, phone 0912345678. " +
      "x".repeat(200);

    const auditId = audit.writeAudit({
      auditId: "audit-1",
      prompt: longPrompt,
      apiKey: "top-secret",
      request: { authorization: "Bearer secret-token" },
      customer: {
        id: "C001",
        name: "Nguyen Van An",
        email: "an@example.com",
        profile: { phone: "0912345678" }
      },
      focusedCustomers: ["C001", "C002"]
    });

    assert.equal(auditId, "audit-1");
    const [memoryEntry] = audit.getAuditLogs();
    assert.equal(memoryEntry.apiKey, "[REDACTED]");
    assert.equal(memoryEntry.request.authorization, "[REDACTED]");
    assert.equal(memoryEntry.customer.id, "[REDACTED]");
    assert.equal(memoryEntry.customer.name, "[REDACTED]");
    assert.equal(memoryEntry.customer.profile.phone, "[REDACTED]");
    assert.equal(memoryEntry.focusedCustomers, "[REDACTED]");
    assert.ok(memoryEntry.prompt.length <= 80);
    assert.doesNotMatch(memoryEntry.prompt, /Nguyen Van An|an@example\.com|0912345678/);

    const lines = fs.readFileSync(path.join(logsDir, "audit.log"), "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), memoryEntry);
  });

  test("keeps deterministic in-memory audit behavior when the path is unavailable", async () => {
    const parent = makeTemporaryPath("bankrm-audit-blocked-");
    const unavailablePath = path.join(parent, "not-a-directory");
    fs.writeFileSync(unavailablePath, "occupied", "utf8");
    process.env.AUDIT_LOG_DIR = unavailablePath;
    const audit = await importFreshAuditLogger("unavailable");

    assert.doesNotThrow(() =>
      audit.writeAudit({ auditId: "audit-offline", prompt: "hello", token: "secret" })
    );
    assert.deepEqual(
      audit.getAuditLogs().map((entry) => entry.auditId),
      ["audit-offline"]
    );
    assert.equal(audit.getAuditLogs()[0].token, "[REDACTED]");
  });
});

function saveModule(manager, identity, conversationId, currentModule) {
  manager.saveConversationContext({
    conversationId,
    identity,
    context: { currentModule, focusedCustomers: [], lastIntent: currentModule }
  });
}

function makeTemporaryPath(prefix) {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryPaths.push(value);
  return value;
}

async function importFreshAuditLogger(label) {
  const url = pathToFileURL(path.resolve("src/services/auditLogger.js"));
  url.searchParams.set("test", `${label}-${Date.now()}-${Math.random()}`);
  return import(url.href);
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
