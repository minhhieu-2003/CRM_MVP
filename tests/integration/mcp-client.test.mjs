import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import Database from "better-sqlite3";
import {
  assertTrustedToolDescriptor,
  createMcpClientSession,
  MCP_SAFE_CHILD_ENV_KEYS,
  validateMcpToolResult
} from "../../src/mcp/client.js";
import { buildAuditConversationReference } from "../../src/services/auditCorrelation.js";

const allEntitlements = [
  "customer:read",
  "opportunity:read",
  "interaction:read",
  "campaign:read",
  "communication:draft"
];

const originalEnv = { ...process.env };
const testAuditCorrelationKey = "test-only-mcp-audit-correlation-key-material";
const defaultIdentity = {
  userId: "mcp-client-test",
  rmId: "default",
  role: "user",
  branchId: "default"
};
const tempDirectories = [];

const trustedCustomerTool = {
  name: "crm_list_customers",
  _meta: {
    "bankrm/sources": [{ endpoint: "GET /customers" }],
    "bankrm/errorSources": [
      { endpoint: "GET /customers" },
      { endpoint: "internal://tool-policy" },
      { endpoint: "internal://tool-registry" },
      { endpoint: "internal://tool-execution" }
    ]
  }
};

const trustedDraftTool = {
  name: "crm_draft_email",
  _meta: {
    "bankrm/requiredScopes": ["customer:read", "communication:draft"],
    "bankrm/sources": [{ endpoint: "GET /customers" }, { endpoint: "POST /draft-email" }],
    "bankrm/errorSources": [
      { endpoint: "GET /customers" },
      { endpoint: "POST /draft-email" },
      { endpoint: "internal://tool-policy" },
      { endpoint: "internal://tool-registry" },
      { endpoint: "internal://tool-execution" }
    ]
  }
};

beforeEach(() => {
  process.env.AUDIT_CORRELATION_KEY = testAuditCorrelationKey;
});

afterEach(() => {
  process.env = { ...originalEnv };
  while (tempDirectories.length > 0) {
    rmSync(tempDirectories.pop(), { recursive: true, force: true });
  }
});

describe("MCP stdio client", () => {
  test("rejects scope downgrades and incomplete success provenance", () => {
    assert.doesNotThrow(() => assertTrustedToolDescriptor(trustedDraftTool));
    assert.throws(
      () =>
        assertTrustedToolDescriptor({
          ...trustedDraftTool,
          _meta: {
            ...trustedDraftTool._meta,
            "bankrm/requiredScopes": ["customer:read"]
          }
        }),
      (error) => error.code === "MCP_TOOL_LIST_INVALID"
    );

    assert.throws(
      () =>
        validateMcpToolResult({
          tool: trustedDraftTool,
          result: {
            structuredContent: {
              status: "success",
              data: { draft: "bounded" },
              sources: [{ endpoint: "GET /customers" }],
              observedAt: new Date().toISOString()
            }
          }
        }),
      (error) => error.code === "MCP_TOOL_RESULT_INVALID"
    );
  });

  test("rejects fabricated, stale, future-dated, and inconsistent observations", () => {
    const now = Date.now();
    const validResult = {
      structuredContent: {
        status: "success",
        data: { items: [] },
        sources: [{ endpoint: "GET /customers" }],
        observedAt: new Date(now).toISOString()
      }
    };
    assert.equal(
      validateMcpToolResult({ tool: trustedCustomerTool, result: validResult, now }).status,
      "success"
    );

    const invalidResults = [
      {
        ...validResult,
        structuredContent: {
          ...validResult.structuredContent,
          sources: [{ endpoint: "GET /fabricated" }]
        }
      },
      {
        ...validResult,
        structuredContent: {
          ...validResult.structuredContent,
          observedAt: new Date(now - 60_001).toISOString()
        }
      },
      {
        ...validResult,
        structuredContent: {
          ...validResult.structuredContent,
          observedAt: new Date(now + 5_001).toISOString()
        }
      },
      {
        ...validResult,
        structuredContent: {
          ...validResult.structuredContent,
          errorCode: "TOOL_FAKE_ERROR"
        }
      },
      {
        isError: true,
        structuredContent: {
          status: "error",
          data: { leaked: true },
          sources: [{ endpoint: "internal://tool-policy" }],
          observedAt: new Date(now).toISOString(),
          error: "Denied.",
          errorCode: "TOOL_SCOPE_DENIED"
        }
      },
      {
        isError: true,
        structuredContent: {
          status: "error",
          data: null,
          sources: [{ endpoint: "internal://tool-policy" }],
          observedAt: new Date(now).toISOString(),
          error: "Denied.",
          errorCode: "FAKE_CODE"
        }
      },
      {
        isError: true,
        structuredContent: {
          status: "error",
          data: null,
          sources: [{ endpoint: "GET /customers" }],
          observedAt: new Date(now).toISOString(),
          error: "Denied.",
          errorCode: "TOOL_SCOPE_DENIED"
        }
      },
      { ...validResult, isError: true }
    ];
    for (const result of invalidResults) {
      assert.throws(
        () => validateMcpToolResult({ tool: trustedCustomerTool, result, now }),
        (error) => error.code === "MCP_TOOL_RESULT_INVALID"
      );
    }
  });

  test("rejects default RM scope in protected runtimes before spawning a child", async () => {
    const invalidScopes = [
      { rmId: " DEFAULT ", branchId: "HN" },
      { rmId: "RM01", branchId: "Default" }
    ];
    for (const identity of invalidScopes) {
      await assert.rejects(
        createMcpClientSession({
          identity: { ...defaultIdentity, ...identity, entitlements: allEntitlements },
          conversationId: "mcp-protected-default-scope",
          sourceEnv: {
            ...mockEnvironment(),
            NODE_ENV: "test",
            AUTH_ENABLED: "true"
          }
        }),
        (error) => error.code === "MCP_SESSION_INVALID"
      );
    }
  });

  test("allows an authenticated admin session without RM or branch scope", async () => {
    const session = await createMcpClientSession({
      identity: { userId: "mcp-admin", role: "admin", entitlements: ["*"] },
      conversationId: "mcp-admin-session",
      sourceEnv: { ...mockEnvironment(), AUTH_ENABLED: "true" }
    });
    try {
      const tools = await session.listTools();
      assert.equal(tools.length, 8);
    } finally {
      await session.close();
    }
  });

  test("denies a protected admin session without explicit entitlements", async () => {
    await assert.rejects(
      createMcpClientSession({
        identity: { userId: "mcp-admin", role: "admin" },
        conversationId: "mcp-admin-no-entitlements",
        sourceEnv: { ...mockEnvironment(), AUTH_ENABLED: "true" }
      }),
      (error) => error.code === "MCP_SESSION_INVALID"
    );
  });

  test("filters discovery by ALL required scopes and ignores ambient scope overrides", async () => {
    const session = await createMcpClientSession({
      identity: {
        userId: "limited-rm",
        rmId: "RM01",
        role: "rm",
        branchId: "HN",
        entitlements: ["customer:read"]
      },
      conversationId: "mcp-limited-entitlements",
      sourceEnv: {
        ...mockEnvironment(),
        AUTH_ENABLED: "true",
        SCOPES: "*",
        BANKRM_MCP_ENTITLEMENTS: '["*"]'
      }
    });
    try {
      assert.deepEqual(
        (await session.listTools()).map((tool) => tool.name),
        ["crm_list_customers", "crm_get_customer", "crm_customers_due"]
      );
      await assert.rejects(
        session.callTool({ name: "crm_draft_email", input: { customerId: "C001" } }),
        (error) => error.code === "MCP_TOOL_NOT_ALLOWED"
      );
    } finally {
      await session.close();
    }

    await assert.rejects(
      createMcpClientSession({
        identity: {
          userId: "wildcard-rm",
          rmId: "RM01",
          role: "rm",
          branchId: "HN",
          entitlements: ["*"]
        },
        conversationId: "mcp-non-admin-wildcard",
        sourceEnv: { ...mockEnvironment(), AUTH_ENABLED: "true" }
      }),
      (error) => error.code === "MCP_SESSION_INVALID"
    );
  });

  test("initializes, discovers the canonical registry, and returns bounded observations", async () => {
    const sourceEnv = mockEnvironment();
    sourceEnv.CRM_BUSINESS_DATE = "2026-07-07";
    sourceEnv.LLM_API_KEY = "must-not-reach-mcp-child";
    sourceEnv.AUTH_DEMO_TOKEN = "must-not-reach-mcp-child";

    const session = await createMcpClientSession({
      identity: defaultIdentity,
      conversationId: "mcp-contract",
      sourceEnv
    });
    try {
      const tools = await session.listTools();
      assert.equal(tools.length, 8);
      assert.deepEqual(
        tools.map((tool) => tool.name),
        [
          "crm_list_customers",
          "crm_get_customer",
          "crm_customers_due",
          "crm_list_opportunities",
          "crm_list_interactions",
          "crm_list_campaigns",
          "crm_draft_email",
          "crm_call_script"
        ]
      );
      for (const tool of tools) {
        assert.equal(tool.inputSchema.type, "object");
        assert.equal(tool.outputSchema.type, "object");
        assert.equal(tool.annotations.openWorldHint, false);
        assert.ok(tool._meta["bankrm/requiredScopes"].length > 0);
        assert.ok(tool._meta["bankrm/sources"].length > 0);
        assert.equal(tool.inputSchema.properties?.identity, undefined);
        assert.equal(tool.inputSchema.properties?.conversationId, undefined);
      }

      const observation = await session.callTool({
        name: "crm_customers_due",
        input: { daysAhead: 7 }
      });
      assert.equal(observation.status, "success");
      assert.ok(observation.data.totalCount > observation.data.items.length);
      assert.equal(observation.data.items.length, 25);
      assert.equal(observation.data.hasMore, true);
      assert.deepEqual(observation.sources, [{ endpoint: "GET /customers" }]);
      assert.equal(Number.isNaN(Date.parse(observation.observedAt)), false);
      assert.ok(JSON.stringify(observation).length < 40_000);
    } finally {
      await session.close();
    }

    assert.equal(MCP_SAFE_CHILD_ENV_KEYS.includes("LLM_API_KEY"), false);
    assert.equal(MCP_SAFE_CHILD_ENV_KEYS.includes("AUTH_DEMO_TOKEN"), false);
    assert.equal(MCP_SAFE_CHILD_ENV_KEYS.includes("AUTH_ADMIN_TOKEN"), false);
    assert.equal(MCP_SAFE_CHILD_ENV_KEYS.includes("AUDIT_CORRELATION_KEY"), true);
  });

  test("rejects a protected MCP session without a dedicated audit correlation key", async () => {
    const sourceEnv = { ...mockEnvironment(), AUTH_ENABLED: "true" };
    delete sourceEnv.AUDIT_CORRELATION_KEY;

    await assert.rejects(
      createMcpClientSession({
        identity: {
          userId: "protected-rm",
          rmId: "RM01",
          role: "rm",
          branchId: "HN",
          entitlements: allEntitlements
        },
        conversationId: "missing-audit-correlation-key",
        sourceEnv
      }),
      (error) => error.code === "MCP_SESSION_INVALID"
    );
  });

  test("maps business errors to structured observations and rejects invalid tool input", async () => {
    const sourceEnv = mockEnvironment();
    const session = await createMcpClientSession({
      identity: defaultIdentity,
      conversationId: "mcp-errors",
      sourceEnv
    });
    try {
      const observation = await session.callTool({
        name: "crm_draft_email",
        input: { customerId: "C-NOT-FOUND" }
      });
      assert.equal(observation.status, "error");
      assert.equal(observation.data, null);
      assert.equal(observation.errorCode, "TOOL_BUSINESS_ERROR");
      assert.match(observation.error, /Không tìm thấy khách hàng/);
      assert.deepEqual(observation.sources, [{ endpoint: "GET /customers" }]);

      const invalidInput = await session.callTool({
        name: "crm_get_customer",
        input: { identity: { role: "admin" }, name: "Nguyễn Văn An" }
      });
      assert.equal(invalidInput.status, "error");
      assert.equal(invalidInput.errorCode, "TOOL_INPUT_INVALID");
    } finally {
      await session.close();
    }

    const events = readFileSync(path.join(sourceEnv.AUDIT_LOG_DIR, "audit.log"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const deniedCalls = events.filter(
      (event) =>
        event.conversationId === buildAuditConversationReference("mcp-errors") &&
        event.decision === "deny"
    );
    assert.equal(deniedCalls.length, 2);
    assert.ok(deniedCalls.every((event) => event.prompt.startsWith("tool:")));
  });

  test("isolates concurrent RM sessions and records the same hashed audit correlation", async () => {
    const tempDirectory = createTempDirectory("mcp-scope-");
    const databasePath = path.join(tempDirectory, "crm.db");
    createScopedDatabase(databasePath);
    const auditDirectory = path.join(tempDirectory, "audit");
    const sourceEnv = {
      ...mockEnvironment(),
      AUTH_ENABLED: "true",
      CRM_MODE: "sqlite",
      CRM_SQLITE_PATH: databasePath,
      AUDIT_LOG_DIR: auditDirectory
    };

    const [rmOne, rmTwo] = await Promise.all([
      createMcpClientSession({
        identity: {
          userId: "user-1",
          rmId: "RM01",
          role: "rm",
          branchId: "HN",
          entitlements: allEntitlements
        },
        conversationId: "shared-conversation",
        sourceEnv
      }),
      createMcpClientSession({
        identity: {
          userId: "user-2",
          rmId: "RM02",
          role: "rm",
          branchId: "HN",
          entitlements: allEntitlements
        },
        conversationId: "shared-conversation",
        sourceEnv
      })
    ]);

    try {
      const [first, second] = await Promise.all([
        rmOne.callTool({ name: "crm_list_customers", input: {} }),
        rmTwo.callTool({ name: "crm_list_customers", input: {} })
      ]);
      assert.deepEqual(
        first.data.items.map((customer) => customer.id),
        ["C-RM01"]
      );
      assert.deepEqual(
        second.data.items.map((customer) => customer.id),
        ["C-RM02"]
      );
    } finally {
      await Promise.all([rmOne.close(), rmTwo.close()]);
    }

    const admin = await createMcpClientSession({
      identity: { userId: "admin", role: "admin", entitlements: ["*"] },
      conversationId: "campaign-pagination",
      sourceEnv
    });
    try {
      const campaigns = await admin.callTool({
        name: "crm_list_campaigns",
        input: { limit: 50, offset: 0 }
      });
      assert.equal(campaigns.status, "success");
      assert.equal(campaigns.data.items.length, 50);
      assert.equal(campaigns.data.totalCount, 60);
      assert.equal(campaigns.data.hasMore, true);
      assert.ok(JSON.stringify(campaigns).length < 40_000);

      const remainingCampaigns = await admin.callTool({
        name: "crm_list_campaigns",
        input: { limit: 50, offset: 50 }
      });
      assert.equal(remainingCampaigns.data.items.length, 10);
      assert.equal(remainingCampaigns.data.returnedCount, 10);
      assert.equal(remainingCampaigns.data.totalCount, 60);
      assert.equal(remainingCampaigns.data.hasMore, false);
      assert.equal(
        campaigns.data.items.some((first) =>
          remainingCampaigns.data.items.some((second) => second.id === first.id)
        ),
        false
      );
      const invalidPage = await admin.callTool({
        name: "crm_list_campaigns",
        input: { limit: 51, offset: 0 }
      });
      assert.equal(invalidPage.status, "error");
      assert.equal(invalidPage.errorCode, "TOOL_INPUT_INVALID");
    } finally {
      await admin.close();
    }

    const events = readFileSync(path.join(auditDirectory, "audit.log"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const toolEvents = events.filter((event) => event.prompt === "tool:crm_list_customers");
    assert.equal(toolEvents.length, 2);
    assert.ok(
      toolEvents.every(
        (event) => event.conversationId === buildAuditConversationReference("shared-conversation")
      )
    );
    assert.ok(toolEvents.every((event) => event.decision === "allow"));
    assert.deepEqual(
      new Set(toolEvents.map((event) => event.actorId)),
      new Set(["user-1", "user-2"])
    );
  });

  test("times out a tool call, closes the child, and releases session capacity", async () => {
    const sandbox = createServer((_request, response) => {
      setTimeout(() => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ data: [] }));
      }, 1500);
    });
    await new Promise((resolve) => sandbox.listen(0, "127.0.0.1", resolve));
    const sandboxUrl = `http://127.0.0.1:${sandbox.address().port}`;

    const session = await createMcpClientSession({
      identity: defaultIdentity,
      conversationId: "mcp-timeout",
      sourceEnv: {
        ...mockEnvironment(),
        CRM_MODE: "sandbox",
        CRM_API_BASE_URL: sandboxUrl,
        CRM_API_KEY: "sandbox-test-key",
        CRM_TIMEOUT_MS: "2000"
      },
      requestTimeoutMs: 2000,
      turnTimeoutMs: 500,
      maxConcurrentSessions: 1,
      retryLimit: 0
    });

    await assert.rejects(
      session.callTool({ name: "crm_list_customers", input: {} }),
      (error) => error.code === "MCP_TIMEOUT" || error.code === "MCP_TOOL_CALL_FAILED"
    );
    await assert.rejects(session.listTools(), (error) => error.code === "MCP_SESSION_CLOSED");
    await session.close();
    await new Promise((resolve) => sandbox.close(resolve));

    const replacement = await createMcpClientSession({
      identity: defaultIdentity,
      conversationId: "mcp-after-timeout",
      sourceEnv: mockEnvironment(),
      maxConcurrentSessions: 1,
      retryLimit: 0
    });
    await replacement.close();
  });

  test("converts an oversized CRM payload into a bounded structured error", async () => {
    const sandbox = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      const data = request.url.startsWith("/campaigns")
        ? [{ id: "CP-HUGE", name: "x".repeat(50_000), status: "Active" }]
        : [];
      response.end(JSON.stringify({ data }));
    });
    await new Promise((resolve) => sandbox.listen(0, "127.0.0.1", resolve));
    const session = await createMcpClientSession({
      identity: { userId: "oversize-admin", role: "admin" },
      conversationId: "mcp-oversized-observation",
      sourceEnv: {
        ...mockEnvironment(),
        CRM_MODE: "sandbox",
        CRM_API_BASE_URL: `http://127.0.0.1:${sandbox.address().port}`,
        CRM_API_KEY: "sandbox-test-key"
      },
      retryLimit: 0
    });

    try {
      const observation = await session.callTool({
        name: "crm_list_campaigns",
        input: { limit: 1, offset: 0 }
      });
      assert.equal(observation.status, "error");
      assert.equal(observation.data, null);
      assert.match(observation.error, /vượt giới hạn observation an toàn/);
      assert.ok(JSON.stringify(observation).length < 1000);
    } finally {
      await session.close();
      await new Promise((resolve) => sandbox.close(resolve));
    }
  });
});

function mockEnvironment() {
  const tempDirectory = createTempDirectory("mcp-audit-");
  return {
    ...process.env,
    NODE_ENV: "test",
    AUTH_ENABLED: "false",
    CRM_MODE: "mock",
    AUDIT_LOG_DIR: path.join(tempDirectory, "audit")
  };
}

function createTempDirectory(prefix) {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

function createScopedDatabase(databasePath) {
  const database = new Database(databasePath);
  database.exec(`
    PRAGMA user_version = 2;
    CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      segment TEXT,
      location TEXT,
      rm_id TEXT
    );
    CREATE TABLE opportunities (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      product TEXT
    );
    CREATE TABLE interactions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
    CREATE TABLE campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target_segment TEXT,
      status TEXT
    );
  `);
  const insertCustomer = database.prepare("INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?)");
  insertCustomer.run("C-RM01", "Customer One", "customer one", "Affluent", "HN", "RM01");
  insertCustomer.run("C-RM02", "Customer Two", "customer two", "VIP", "HN", "RM02");
  insertCustomer.run("C-HCM", "Customer Three", "customer three", "Mass", "HCM", "RM01");
  const insertCampaign = database.prepare("INSERT INTO campaigns VALUES (?, ?, ?, ?)");
  for (let index = 1; index <= 60; index += 1) {
    insertCampaign.run(`CP-${index}`, `Campaign ${index}`, null, "Active");
  }
  database.close();
}
