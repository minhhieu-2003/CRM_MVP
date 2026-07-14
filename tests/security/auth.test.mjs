import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import Database from "better-sqlite3";
import { createMcpClientSession } from "../../src/mcp/client.js";
import { buildAuditConversationReference } from "../../src/services/auditCorrelation.js";

const demoToken = "test-shared-demo-token";
const adminToken = "test-admin-token";
const auditCorrelationKey = "test-only-auth-audit-correlation-key-material";
let baseUrl;
let originalEnv;
let server;
let tempDirectory;

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

  const insertOpportunity = database.prepare("INSERT INTO opportunities VALUES (?, ?, ?)");
  insertOpportunity.run("O-RM01", "C-RM01", "Product One");
  insertOpportunity.run("O-RM02", "C-RM02", "Product Two");
  insertOpportunity.run("O-HCM", "C-HCM", "Product Three");

  const insertInteraction = database.prepare("INSERT INTO interactions VALUES (?, ?, ?)");
  insertInteraction.run("I-RM01", "C-RM01", "2026-07-12T09:00:00+07:00");
  insertInteraction.run("I-RM02", "C-RM02", "2026-07-12T10:00:00+07:00");
  insertInteraction.run("I-HCM", "C-HCM", "2026-07-12T11:00:00+07:00");

  const insertCampaign = database.prepare("INSERT INTO campaigns VALUES (?, ?, ?, ?)");
  insertCampaign.run("CP-AFF", "Affluent Campaign", "Affluent", "Active");
  insertCampaign.run("CP-VIP", "VIP Campaign", "VIP", "Active");
  insertCampaign.run("CP-MASS", "Mass Campaign", "Mass", "Active");
  database.close();
}

function authenticatedHeaders(overrides = {}) {
  return {
    Authorization: `Bearer ${demoToken}`,
    "X-User-Id": "user-rm01",
    "X-RM-Id": "RM01",
    "X-Role": "rm",
    "X-Branch-Id": "HN",
    ...overrides
  };
}

async function reservePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

async function waitForHealth(url, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Restricted entitlement test server exited.");
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Restricted entitlement test server did not become ready.");
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 2_000).unref();
  });
}

before(async () => {
  originalEnv = { ...process.env };
  tempDirectory = mkdtempSync(path.join(os.tmpdir(), "crm-auth-test-"));
  const databasePath = path.join(tempDirectory, "crm.db");
  createScopedDatabase(databasePath);

  process.env.NODE_ENV = "test";
  process.env.AUTH_ENABLED = "true";
  process.env.AUTH_DEMO_TOKEN = demoToken;
  process.env.AUTH_DEMO_USER_ID = "user-rm01";
  process.env.AUTH_DEMO_RM_ID = "RM01";
  process.env.AUTH_DEMO_BRANCH_ID = "HN";
  process.env.AUTH_DEMO_ENTITLEMENTS =
    "customer:read,opportunity:read,interaction:read,campaign:read,communication:draft";
  process.env.AUTH_ADMIN_TOKEN = adminToken;
  process.env.AUTH_ADMIN_USER_ID = "admin-user";
  process.env.AUTH_ADMIN_ENTITLEMENTS = "*";
  process.env.CRM_MODE = "sqlite";
  process.env.CRM_SQLITE_PATH = databasePath;
  process.env.AUDIT_LOG_DIR = path.join(tempDirectory, "audit");
  process.env.AUDIT_CORRELATION_KEY = auditCorrelationKey;

  const { app } = await import("../../src/server.js");
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  process.env = originalEnv;
  if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
});

test("Security: health remains public when authentication is enabled", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
});

test("Security: protected API rejects a missing token", async () => {
  const response = await fetch(`${baseUrl}/api/crm/customers`, {
    headers: {
      "X-User-Id": "forged-admin",
      "X-Role": "admin"
    }
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("Security: arbitrary admin headers cannot bypass an invalid token", async () => {
  const response = await fetch(`${baseUrl}/api/audit-logs`, {
    headers: {
      Authorization: "Bearer wrong-token",
      "X-User-Id": "forged-admin",
      "X-Role": "admin"
    }
  });
  assert.equal(response.status, 401);
});

test("Security: RM token cannot escalate with an admin role header", async () => {
  const response = await fetch(`${baseUrl}/api/audit-logs`, {
    headers: authenticatedHeaders({ "X-Role": "admin" })
  });
  assert.equal(response.status, 403);
});

test("Security: authenticated RM cannot override server-bound scope headers", async () => {
  const response = await fetch(`${baseUrl}/api/crm/customers`, {
    headers: authenticatedHeaders({
      "X-User-Id": "forged-rm02",
      "X-RM-Id": "RM02",
      "X-Branch-Id": "HN",
      "X-Entitlements": "*"
    })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(
    (await response.json()).data.map((customer) => customer.id),
    ["C-RM01"]
  );
});

test("Security: authenticated non-admin cannot read audit logs", async () => {
  const response = await fetch(`${baseUrl}/api/audit-logs`, {
    headers: authenticatedHeaders()
  });
  assert.equal(response.status, 403);
});

test("Security: authenticated admin can read audit logs", async () => {
  const response = await fetch(`${baseUrl}/api/audit-logs`, {
    headers: authenticatedHeaders({
      Authorization: `Bearer ${adminToken}`,
      "X-User-Id": "admin-user",
      "X-Role": "admin",
      "X-RM-Id": "",
      "X-Branch-Id": ""
    })
  });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray((await response.json()).data));
});

test("Security: audit API sanitizes legacy NDJSON before returning it", async () => {
  mkdirSync(process.env.AUDIT_LOG_DIR, { recursive: true });
  appendFileSync(
    path.join(process.env.AUDIT_LOG_DIR, "audit.log"),
    `${JSON.stringify({
      auditId: "legacy-api-unsafe",
      conversationId: "legacy-api-raw-C777-an@example.com",
      prompt: "khach hang Nguyen Van An C777 an@example.com 0912345678 token=legacy-api-secret",
      apiKey: "legacy-api-key",
      customer: {
        id: "C777",
        name: "Nguyen Van An",
        accountNumber: "123456789012"
      },
      timestamp: new Date(Date.now() + 5_000).toISOString()
    })}\n`,
    "utf8"
  );

  const response = await fetch(`${baseUrl}/api/audit-logs`, {
    headers: authenticatedHeaders({
      Authorization: `Bearer ${adminToken}`,
      "X-User-Id": "admin-user",
      "X-Role": "admin",
      "X-RM-Id": "",
      "X-Branch-Id": ""
    })
  });
  assert.equal(response.status, 200);
  const event = (await response.json()).data.find((entry) => entry.auditId === "legacy-api-unsafe");
  assert.equal(
    event.conversationId,
    buildAuditConversationReference("legacy-api-raw-C777-an@example.com")
  );
  assert.equal(event.apiKey, "[REDACTED]");
  assert.equal(event.customer.id, "[REDACTED]");
  assert.equal(event.customer.name, "[REDACTED]");
  assert.equal(event.customer.accountNumber, "[REDACTED]");
  assert.doesNotMatch(
    JSON.stringify(event),
    /legacy-api-raw|Nguyen Van An|C777|an@example\.com|0912345678|legacy-api-secret|legacy-api-key|123456789012/
  );
});

test("Security: audit API includes actor-scoped MCP child events", async () => {
  const session = await createMcpClientSession({
    identity: {
      userId: "audit-rm",
      rmId: "RM01",
      role: "rm",
      branchId: "HN",
      entitlements: process.env.AUTH_DEMO_ENTITLEMENTS.split(",")
    },
    conversationId: "audit-child-session",
    sourceEnv: process.env
  });
  try {
    await session.callTool({ name: "crm_list_customers", input: { limit: 1, offset: 0 } });
  } finally {
    await session.close();
  }

  const response = await fetch(`${baseUrl}/api/audit-logs`, {
    headers: authenticatedHeaders({
      Authorization: `Bearer ${adminToken}`,
      "X-User-Id": "admin-user",
      "X-Role": "admin",
      "X-RM-Id": "",
      "X-Branch-Id": ""
    })
  });
  assert.equal(response.status, 200);
  const event = (await response.json()).data.find(
    (entry) =>
      entry.conversationId === buildAuditConversationReference("audit-child-session") &&
      entry.prompt === "tool:crm_list_customers"
  );
  assert.equal(event.actorId, "audit-rm");
  assert.equal(event.rmScope, "RM01");
  assert.equal(event.branchScope, "HN");
});

test("Security: RM and branch scope propagates to linked CRM entities and campaigns", async () => {
  const headers = authenticatedHeaders();
  const endpoints = ["customers", "opportunities", "interactions", "campaigns"];
  const results = {};

  for (const endpoint of endpoints) {
    const response = await fetch(`${baseUrl}/api/crm/${endpoint}`, { headers });
    assert.equal(response.status, 200);
    results[endpoint] = (await response.json()).data;
  }

  assert.deepEqual(
    results.customers.map((item) => item.id),
    ["C-RM01"]
  );
  assert.deepEqual(
    results.opportunities.map((item) => item.id),
    ["O-RM01"]
  );
  assert.deepEqual(
    results.interactions.map((item) => item.id),
    ["I-RM01"]
  );
  assert.deepEqual(
    results.campaigns.map((item) => item.id),
    ["CP-AFF"]
  );
});

test("Security: cross-scope customer cannot be used for drafting", async () => {
  const response = await fetch(`${baseUrl}/api/draft-email`, {
    method: "POST",
    headers: {
      ...authenticatedHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ customerId: "C-RM02" })
  });
  assert.equal(response.status, 404);
});

test("Security: HTTP and deterministic fallback enforce server-bound entitlements", async () => {
  const restrictedToken = "customer-only-test-token";
  const restrictedAdminToken = "restricted-admin-test-token";
  const port = await reservePort();
  const restrictedBaseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      AUTH_ENABLED: "true",
      AUTH_DEMO_TOKEN: restrictedToken,
      AUTH_DEMO_USER_ID: "customer-only-user",
      AUTH_DEMO_RM_ID: "RM01",
      AUTH_DEMO_BRANCH_ID: "Hà Nội",
      AUTH_DEMO_ENTITLEMENTS: "customer:read",
      AUTH_ADMIN_TOKEN: restrictedAdminToken,
      AUTH_ADMIN_USER_ID: "restricted-admin",
      AUTH_ADMIN_ENTITLEMENTS: "*",
      CRM_MODE: "mock",
      AI_NATIVE_CORE: "false",
      LLM_API_URL: "",
      LLM_API_KEY: ""
    },
    stdio: "ignore"
  });

  try {
    await waitForHealth(restrictedBaseUrl, child);
    const limitedHeaders = {
      Authorization: `Bearer ${restrictedToken}`,
      "X-Entitlements": "*"
    };
    const customers = await fetch(`${restrictedBaseUrl}/api/crm/customers`, {
      headers: limitedHeaders
    });
    assert.equal(customers.status, 200);
    assert.ok(Array.isArray((await customers.json()).data));

    for (const endpoint of ["opportunities", "interactions", "campaigns"]) {
      const response = await fetch(`${restrictedBaseUrl}/api/crm/${endpoint}`, {
        headers: limitedHeaders
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: "Forbidden",
        code: "TOOL_SCOPE_DENIED"
      });
    }

    for (const endpoint of ["draft-email", "call-script"]) {
      const draft = await fetch(`${restrictedBaseUrl}/api/${endpoint}`, {
        method: "POST",
        headers: { ...limitedHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: "C001" })
      });
      assert.equal(draft.status, 403);
      assert.deepEqual(await draft.json(), {
        error: "Forbidden",
        code: "TOOL_SCOPE_DENIED"
      });
    }

    const campaignChat = await fetch(`${restrictedBaseUrl}/api/chat`, {
      method: "POST",
      headers: { ...limitedHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "restricted-campaign", message: "4" })
    });
    assert.equal(campaignChat.status, 200);
    const chatPayload = await campaignChat.json();
    assert.deepEqual(chatPayload.sources, [{ endpoint: "internal://tool-policy" }]);
    assert.doesNotMatch(chatPayload.reply, /Affluent Campaign|VIP Campaign|Mass Campaign/);

    const adminCampaigns = await fetch(`${restrictedBaseUrl}/api/crm/campaigns`, {
      headers: { Authorization: `Bearer ${restrictedAdminToken}` }
    });
    assert.equal(adminCampaigns.status, 200);
    assert.ok((await adminCampaigns.json()).data.length > 0);

    const adminDraft = await fetch(`${restrictedBaseUrl}/api/draft-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${restrictedAdminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ customerId: "C001" })
    });
    assert.equal(adminDraft.status, 200);
    assert.ok((await adminDraft.json()).data.subject);
  } finally {
    await stopChild(child);
  }
});

test("Security: fail closed in pilot/production without AUTH_ENABLED", () => {
  assert.throws(
    () =>
      execSync("node src/server.js", {
        cwd: path.resolve("."),
        env: { ...process.env, NODE_ENV: "production", AUTH_ENABLED: "false" }
      }),
    /FATAL:/
  );
});

test("Security: fail closed in production without AUTH_DEMO_TOKEN", () => {
  const env = { ...process.env, NODE_ENV: "production", AUTH_ENABLED: "true", CORS_ORIGIN: "https://banka.vn" };
  delete env.AUTH_DEMO_TOKEN;
  assert.throws(
    () => execSync("node src/server.js", { cwd: path.resolve("."), env }),
    /FATAL: AUTH_DEMO_TOKEN/
  );
});

test("Security: fail closed in protected auth without explicit entitlements", () => {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    AUTH_ENABLED: "true",
    CORS_ORIGIN: "https://banka.vn",
    AUTH_DEMO_TOKEN: demoToken
  };
  delete env.AUTH_DEMO_ENTITLEMENTS;
  assert.throws(
    () => execSync("node src/server.js", { cwd: path.resolve("."), env }),
    /FATAL: Protected authentication requires valid server-side/
  );
});

test("Security: HTTP protected runtime fails closed without an audit correlation key", () => {
  const env = { ...process.env, NODE_ENV: "production", AUTH_ENABLED: "true", CORS_ORIGIN: "https://banka.vn" };
  delete env.AUDIT_CORRELATION_KEY;

  assert.throws(
    () => execSync("node src/server.js", { cwd: path.resolve("."), env }),
    /FATAL: AUDIT_CORRELATION_KEY/
  );
});

test("Security: fail closed when server-bound RM identity uses a default sentinel", () => {
  const invalidScopes = [
    { AUTH_DEMO_RM_ID: " DEFAULT ", AUTH_DEMO_BRANCH_ID: "HN" },
    { AUTH_DEMO_RM_ID: "RM01", AUTH_DEMO_BRANCH_ID: "Default" }
  ];
  for (const scope of invalidScopes) {
    const env = {
      ...process.env,
      NODE_ENV: "production",
      AUTH_ENABLED: "true",
      CORS_ORIGIN: "https://banka.vn",
      AUTH_DEMO_TOKEN: demoToken,
      AUTH_DEMO_USER_ID: "invalid-demo-rm",
      ...scope
    };
    assert.throws(
      () => execSync("node src/server.js", { cwd: path.resolve("."), env }),
      /FATAL: AUTH_DEMO_USER_ID/
    );
  }
});

test("Security: MCP fail closed in pilot/production without AUTH_ENABLED", () => {
  assert.throws(
    () =>
      execSync("node src/mcp/server.js", {
        cwd: path.resolve("."),
        env: { ...process.env, NODE_ENV: "pilot", AUTH_ENABLED: "false" }
      }),
    /FATAL:/
  );
});

test("Security: normalized production environment still fails closed for HTTP and MCP", () => {
  assert.throws(
    () =>
      execSync("node src/server.js", {
        cwd: path.resolve("."),
        env: { ...process.env, NODE_ENV: " Production ", AUTH_ENABLED: "false" }
      }),
    /FATAL:/
  );
  assert.throws(
    () =>
      execSync("node src/mcp/server.js", {
        cwd: path.resolve("."),
        env: { ...process.env, NODE_ENV: " Production ", AUTH_ENABLED: "false" }
      }),
    /FATAL:/
  );
});

test("Security: authenticated MCP requires a dedicated session in every environment", () => {
  const env = { ...process.env, NODE_ENV: "test", AUTH_ENABLED: "true" };
  delete env.BANKRM_MCP_SESSION;
  delete env.BANKRM_MCP_USER_ID;
  delete env.BANKRM_MCP_RM_ID;
  delete env.BANKRM_MCP_ROLE;
  delete env.BANKRM_MCP_BRANCH_ID;
  delete env.BANKRM_MCP_CONVERSATION_ID;

  assert.throws(
    () => execSync("node src/mcp/server.js", { cwd: path.resolve("."), env }),
    /FATAL: MCP protected runtime/
  );
});

test("Security: MCP fail closed in pilot/production without a dedicated identity session", () => {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    AUTH_ENABLED: "true"
  };
  delete env.BANKRM_MCP_SESSION;
  delete env.BANKRM_MCP_USER_ID;
  delete env.BANKRM_MCP_RM_ID;
  delete env.BANKRM_MCP_ROLE;
  delete env.BANKRM_MCP_BRANCH_ID;
  delete env.BANKRM_MCP_CONVERSATION_ID;

  assert.throws(
    () => execSync("node src/mcp/server.js", { cwd: path.resolve("."), env }),
    /FATAL: MCP protected runtime/
  );
});

test("Security: authenticated MCP rejects default scope sentinels", () => {
  const invalidScopes = [
    { BANKRM_MCP_RM_ID: " DEFAULT ", BANKRM_MCP_BRANCH_ID: "HN" },
    { BANKRM_MCP_RM_ID: "RM01", BANKRM_MCP_BRANCH_ID: "Default" }
  ];
  for (const scope of invalidScopes) {
    const env = {
      ...process.env,
      NODE_ENV: "test",
      AUTH_ENABLED: "true",
      BANKRM_MCP_SESSION: "true",
      BANKRM_MCP_USER_ID: "mcp-user",
      BANKRM_MCP_ROLE: "rm",
      BANKRM_MCP_CONVERSATION_ID: "mcp-default-scope",
      BANKRM_MCP_ENTITLEMENTS: '["customer:read"]',
      ...scope
    };

    assert.throws(
      () => execSync("node src/mcp/server.js", { cwd: path.resolve("."), env }),
      /FATAL: MCP session/
    );
  }
});

test("Security: MCP protected runtime fails closed without an audit correlation key", () => {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    AUTH_ENABLED: "true",
    BANKRM_MCP_SESSION: "true",
    BANKRM_MCP_USER_ID: "mcp-user",
    BANKRM_MCP_RM_ID: "RM01",
    BANKRM_MCP_ROLE: "rm",
    BANKRM_MCP_BRANCH_ID: "HN",
    BANKRM_MCP_CONVERSATION_ID: "mcp-missing-audit-correlation-key",
    BANKRM_MCP_ENTITLEMENTS: '["customer:read"]'
  };
  delete env.AUDIT_CORRELATION_KEY;

  assert.throws(
    () => execSync("node src/mcp/server.js", { cwd: path.resolve("."), env }),
    /FATAL: AUDIT_CORRELATION_KEY/
  );
});
