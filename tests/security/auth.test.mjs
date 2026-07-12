import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import Database from "better-sqlite3";

const demoToken = "test-shared-demo-token";
const adminToken = "test-admin-token";
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

before(async () => {
  originalEnv = { ...process.env };
  tempDirectory = mkdtempSync(path.join(os.tmpdir(), "crm-auth-test-"));
  const databasePath = path.join(tempDirectory, "crm.db");
  createScopedDatabase(databasePath);

  process.env.NODE_ENV = "test";
  process.env.AUTH_ENABLED = "true";
  process.env.AUTH_DEMO_TOKEN = demoToken;
  process.env.AUTH_ADMIN_TOKEN = adminToken;
  process.env.CRM_MODE = "sqlite";
  process.env.CRM_SQLITE_PATH = databasePath;
  process.env.AUDIT_LOG_DIR = path.join(tempDirectory, "audit");

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
  const env = { ...process.env, NODE_ENV: "production", AUTH_ENABLED: "true" };
  delete env.AUTH_DEMO_TOKEN;
  assert.throws(
    () => execSync("node src/server.js", { cwd: path.resolve("."), env }),
    /FATAL: AUTH_DEMO_TOKEN/
  );
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
