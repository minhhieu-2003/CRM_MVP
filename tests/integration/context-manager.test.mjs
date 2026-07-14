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
  AUDIT_MAX_PROMPT_LENGTH: process.env.AUDIT_MAX_PROMPT_LENGTH,
  AUDIT_CORRELATION_KEY: process.env.AUDIT_CORRELATION_KEY
};

afterEach(() => {
  restoreEnv("AUDIT_LOG_DIR", originalAuditEnv.AUDIT_LOG_DIR);
  restoreEnv("AUDIT_MAX_PROMPT_LENGTH", originalAuditEnv.AUDIT_MAX_PROMPT_LENGTH);
  restoreEnv("AUDIT_CORRELATION_KEY", originalAuditEnv.AUDIT_CORRELATION_KEY);
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

  test("commits a context draft with versioned compare-and-swap and rejects stale writers", () => {
    const manager = createContextManager();
    const identity = { userId: "concurrent-user", rmId: "RM01", branchId: "DN" };
    const key = { conversationId: "cas-context", identity };
    const firstReader = manager.getConversationContextSnapshot(key);
    const staleReader = manager.getConversationContextSnapshot(key);

    assert.equal(Number.isSafeInteger(firstReader.version), true);
    assert.ok(firstReader.version > 0);
    assert.deepEqual(firstReader.context, {
      currentModule: "general",
      focusedCustomers: [],
      lastIntent: null
    });

    const committed = manager.compareAndSwapConversationContext({
      ...key,
      expectedVersion: firstReader.version,
      context: {
        currentModule: "opportunity",
        focusedCustomers: ["C001"],
        lastIntent: "opportunity"
      }
    });
    assert.deepEqual(committed, {
      currentModule: "opportunity",
      focusedCustomers: ["C001"],
      lastIntent: "opportunity"
    });

    assert.throws(
      () =>
        manager.compareAndSwapConversationContext({
          ...key,
          expectedVersion: staleReader.version,
          context: {
            currentModule: "campaign",
            focusedCustomers: [],
            lastIntent: "campaign"
          }
        }),
      (error) =>
        error.code === "CONTEXT_VERSION_CONFLICT" &&
        error.expectedVersion === firstReader.version &&
        error.actualVersion > firstReader.version
    );
    assert.equal(manager.getConversationContext(key).currentModule, "opportunity");
  });

  test("rejects a CAS commit after its snapshot expires", () => {
    let currentTime = 0;
    const manager = createContextManager({ ttlMs: 100, now: () => currentTime });
    const identity = { userId: "expired-writer", rmId: "RM01", branchId: "HN" };
    const key = { conversationId: "expired-cas", identity };
    const snapshot = manager.getConversationContextSnapshot(key);

    currentTime = 101;
    assert.throws(
      () =>
        manager.compareAndSwapConversationContext({
          ...key,
          expectedVersion: snapshot.version,
          context: {
            currentModule: "campaign",
            focusedCustomers: ["C001"],
            lastIntent: "campaign"
          }
        }),
      (error) =>
        error.code === "CONTEXT_VERSION_CONFLICT" &&
        error.expectedVersion === snapshot.version &&
        error.actualVersion === -1
    );

    assert.deepEqual(manager.getConversationContext(key), {
      currentModule: "general",
      focusedCustomers: [],
      lastIntent: null
    });
  });

  test("rejects a stale CAS after delete and recreate", () => {
    const manager = createContextManager();
    const identity = { userId: "delete-aba", rmId: "RM01", branchId: "HN" };
    const key = { conversationId: "delete-recreate", identity };
    saveModule(manager, identity, key.conversationId, "customer-profile");
    const stale = manager.getConversationContextSnapshot(key);

    assert.equal(manager.deleteConversationContext(key), true);
    saveModule(manager, identity, key.conversationId, "campaign");

    assertStaleCasRejected(manager, key, stale.version);
    assert.equal(manager.getConversationContext(key).currentModule, "campaign");
  });

  test("rejects a stale CAS after TTL expiry and recreate", () => {
    let currentTime = 0;
    const manager = createContextManager({ ttlMs: 100, now: () => currentTime });
    const identity = { userId: "ttl-aba", rmId: "RM01", branchId: "HN" };
    const key = { conversationId: "ttl-recreate", identity };
    saveModule(manager, identity, key.conversationId, "customer-profile");
    const stale = manager.getConversationContextSnapshot(key);

    currentTime = 101;
    saveModule(manager, identity, key.conversationId, "campaign");

    assertStaleCasRejected(manager, key, stale.version);
    assert.equal(manager.getConversationContext(key).currentModule, "campaign");
  });

  test("rejects a stale CAS after LRU eviction and recreate", () => {
    const manager = createContextManager({ maxConversations: 1 });
    const identity = { userId: "lru-aba", rmId: "RM01", branchId: "HN" };
    const key = { conversationId: "lru-recreate", identity };
    saveModule(manager, identity, key.conversationId, "customer-profile");
    const stale = manager.getConversationContextSnapshot(key);

    saveModule(manager, identity, "evicting-conversation", "opportunity");
    saveModule(manager, identity, key.conversationId, "campaign");

    assertStaleCasRejected(manager, key, stale.version);
    assert.equal(manager.getConversationContext(key).currentModule, "campaign");
  });
});

describe("audit logger", () => {
  test("recursively redacts secrets and customer PII, bounds prompts, and appends NDJSON", async () => {
    const logsDir = makeTemporaryPath("bankrm-audit-");
    process.env.AUDIT_LOG_DIR = logsDir;
    process.env.AUDIT_MAX_PROMPT_LENGTH = "80";
    const audit = await importFreshAuditLogger("redaction");
    const longPrompt =
      "Soan email cho khach hang Nguyen Van An (C001), co hoi O001, email an@example.com, phone 0912345678. " +
      "x".repeat(200);

    const auditId = audit.writeAudit({
      auditId: "audit-1",
      conversationId: "Nguyen Van An C001",
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
    assert.match(memoryEntry.conversationId, /^conv_[a-f0-9]{24}$/);
    assert.equal(
      memoryEntry.conversationId,
      audit.buildAuditConversationReference("Nguyen Van An C001")
    );
    assert.ok(memoryEntry.prompt.length <= 80);
    assert.doesNotMatch(memoryEntry.prompt, /Nguyen Van An|C001|O001|an@example\.com|0912345678/);

    const lines = fs.readFileSync(path.join(logsDir, "audit.log"), "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.doesNotMatch(lines[0], /Nguyen Van An|C001/);
    assert.deepEqual(JSON.parse(lines[0]), memoryEntry);

    const childEntry = {
      auditId: "audit-child",
      actorId: "rm-child",
      prompt: "tool:crm_list_customers",
      timestamp: new Date(Date.now() + 1000).toISOString()
    };
    fs.appendFileSync(path.join(logsDir, "audit.log"), `${JSON.stringify(childEntry)}\n`, "utf8");
    assert.deepEqual(
      audit.getAuditLogs().map((entry) => entry.auditId),
      ["audit-child", "audit-1"]
    );
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

  test("sanitizes legacy NDJSON on read and preserves only persisted correlation references", async () => {
    const logsDir = makeTemporaryPath("bankrm-audit-legacy-");
    process.env.AUDIT_LOG_DIR = logsDir;
    process.env.AUDIT_CORRELATION_KEY = "test-only-context-audit-correlation-key-material";
    const audit = await importFreshAuditLogger("legacy-read-redaction");
    const safeReference = `conv_${"a".repeat(24)}`;
    const rawConversationId = "legacy-raw-conversation-C999-an@example.com";
    const legacyEntries = [
      {
        auditId: "legacy-unsafe",
        conversationId: rawConversationId,
        prompt:
          "Soan email cho khach hang Nguyen Van An C999, an@example.com, 0912345678, token=legacy-secret",
        details: "Nguyen Van B; mai van binh; 12 Nguyen Trai, Ha Noi",
        apiKey: "legacy-api-secret",
        customer: {
          id: "C999",
          name: "Nguyen Van An",
          accountNumber: "123456789012"
        },
        timestamp: "2026-07-13T01:00:00.000Z"
      },
      {
        auditId: "legacy-safe-reference",
        conversationId: safeReference,
        prompt: "tool:crm_list_customers",
        timestamp: "2026-07-13T02:00:00.000Z"
      }
    ];
    fs.writeFileSync(
      path.join(logsDir, "audit.log"),
      `${legacyEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8"
    );

    const apiFacingLogs = audit.getAuditLogs();
    const unsafe = apiFacingLogs.find((entry) => entry.auditId === "legacy-unsafe");
    const alreadySafe = apiFacingLogs.find((entry) => entry.auditId === "legacy-safe-reference");
    assert.equal(unsafe.conversationId, audit.buildAuditConversationReference(rawConversationId));
    assert.equal(unsafe.apiKey, "[REDACTED]");
    assert.equal(unsafe.customer.id, "[REDACTED]");
    assert.equal(unsafe.customer.name, "[REDACTED]");
    assert.equal(unsafe.customer.accountNumber, "[REDACTED]");
    assert.equal(alreadySafe.conversationId, safeReference);
    assert.doesNotMatch(
      JSON.stringify(apiFacingLogs),
      /legacy-raw-conversation|Nguyen Van An|Nguyen Van B|mai van binh|12 Nguyen Trai|Ha Noi|C999|an@example\.com|0912345678|legacy-secret|legacy-api-secret|123456789012/
    );

    audit.writeAudit({
      auditId: "new-write-safe-shaped-input",
      conversationId: safeReference,
      prompt: "chat-turn"
    });
    const newWrite = audit
      .getAuditLogs()
      .find((entry) => entry.auditId === "new-write-safe-shaped-input");
    assert.equal(newWrite.conversationId, audit.buildAuditConversationReference(safeReference));
    assert.notEqual(newWrite.conversationId, safeReference);
  });

  test("uses a keyed HMAC correlation and rejects missing protected configuration", async () => {
    const audit = await importFreshAuditLogger("keyed-correlation");
    const firstEnv = {
      NODE_ENV: "production",
      AUTH_ENABLED: "true",
      AUDIT_CORRELATION_KEY: "test-only-first-audit-correlation-key-material"
    };
    const secondEnv = {
      ...firstEnv,
      AUDIT_CORRELATION_KEY: "test-only-second-audit-correlation-key-material"
    };
    const firstReference = audit.buildAuditConversationReference("same-conversation", firstEnv);

    assert.equal(
      firstReference,
      audit.buildAuditConversationReference("same-conversation", firstEnv)
    );
    assert.notEqual(
      firstReference,
      audit.buildAuditConversationReference("same-conversation", secondEnv)
    );
    assert.throws(
      () =>
        audit.buildAuditConversationReference("same-conversation", {
          NODE_ENV: "production",
          AUTH_ENABLED: "true"
        }),
      (error) => error.code === "AUDIT_CORRELATION_CONFIG_INVALID"
    );
  });
});

function saveModule(manager, identity, conversationId, currentModule) {
  manager.saveConversationContext({
    conversationId,
    identity,
    context: { currentModule, focusedCustomers: [], lastIntent: currentModule }
  });
}

function assertStaleCasRejected(manager, key, expectedVersion) {
  assert.throws(
    () =>
      manager.compareAndSwapConversationContext({
        ...key,
        expectedVersion,
        context: {
          currentModule: "interaction",
          focusedCustomers: ["C999"],
          lastIntent: "stale-write"
        }
      }),
    (error) =>
      error.code === "CONTEXT_VERSION_CONFLICT" &&
      error.expectedVersion === expectedVersion &&
      error.actualVersion > expectedVersion
  );
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
