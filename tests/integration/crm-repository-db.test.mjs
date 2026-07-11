import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import Database from "better-sqlite3";
import { getCrmConfig } from "../../src/services/dbClient.js";
import {
  draftEmailForCustomer,
  getCustomerById,
  listCustomers,
  listInteractions,
  listOpportunities
} from "../../src/services/crmRepository.js";

describe("CRM repository database providers", () => {
  let originalEnv;
  let originalFetch;
  let tempDirectory;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalFetch = globalThis.fetch;
    tempDirectory = mkdtempSync(path.join(tmpdir(), "crm-repository-"));
    process.env.NODE_ENV = "test";
    delete process.env.CRM_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  function createSqliteDatabase() {
    const databasePath = path.join(tempDirectory, "crm.db");
    const database = new Database(databasePath);
    database.exec(`
      PRAGMA user_version = 1;
      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        savings_product TEXT,
        savings_amount_vnd REAL,
        maturity_date TEXT,
        location TEXT,
        rm_id TEXT
      );
      CREATE TABLE opportunities (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        estimated_value_vnd REAL
      );
      CREATE TABLE interactions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );
    `);
    database
      .prepare("INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("DB001", "Nguyễn An", "nguyen an", "Tiết kiệm 12T", 500000000, "2026-07-15", "Hà Nội", "RM01");
    database
      .prepare("INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("DB002", "Trần Mai", "tran mai", "Tiết kiệm 6T", 300000000, "2026-07-20", "TP.HCM", "RM02");
    database.prepare("INSERT INTO opportunities VALUES (?, ?, ?)").run("OP001", "DB001", 75000000);
    database.prepare("INSERT INTO interactions VALUES (?, ?, ?)").run("IN001", "DB001", "2026-07-10T09:00:00+07:00");
    database.close();
    return databasePath;
  }

  it("giữ hành vi mock và không gọi HTTP", async () => {
    process.env.CRM_MODE = "mock";
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("Không được gọi fetch");
    };

    const customers = await listCustomers({ role: "admin" });

    assert.ok(customers.length > 0);
    assert.equal(fetchCalled, false);
    assert.ok(customers[0].normalizedName);
  });

  it("đọc SQLite, map snake_case và bảo toàn identity scope", async () => {
    process.env.CRM_MODE = "sqlite";
    process.env.CRM_SQLITE_PATH = createSqliteDatabase();

    const scopedCustomers = await listCustomers({ role: "rm", branchId: "Hà Nội", rmId: "RM01" });
    const opportunity = (await listOpportunities({ role: "admin" }))[0];
    const interaction = (await listInteractions({ role: "admin" }))[0];

    assert.deepEqual(scopedCustomers.map((customer) => customer.id), ["DB001"]);
    assert.equal(scopedCustomers[0].savingsProduct, "Tiết kiệm 12T");
    assert.equal(scopedCustomers[0].savingsAmountVnd, 500000000);
    assert.equal(scopedCustomers[0].rmId, "RM01");
    assert.equal(opportunity.customerId, "DB001");
    assert.equal(opportunity.estimatedValueVnd, 75000000);
    assert.equal(interaction.customerId, "DB001");
    assert.equal(interaction.timestamp, "2026-07-10T09:00:00+07:00");
    assert.equal((await getCustomerById("DB002", { role: "rm", branchId: "Hà Nội", rmId: "RM01" })), null);
  });

  it("fail-closed khi SQLite lỗi thay vì dùng mock", async () => {
    process.env.CRM_MODE = "sqlite";
    process.env.CRM_SQLITE_PATH = path.join(tempDirectory, "missing.db");

    await assert.rejects(() => listCustomers({ role: "admin" }), /Không thể đọc dữ liệu CRM từ SQLite/);
    await assert.rejects(
      () =>
        draftEmailForCustomer(
          {
            id: "C001",
            name: "Khách hàng",
            maturityDate: "2026-07-15",
            savingsAmountVnd: 1000000,
            savingsProduct: "Tiết kiệm"
          },
          "Tư vấn tái tục"
        ),
      /Không thể đọc dữ liệu CRM từ SQLite/
    );
  });

  it("fail-closed khi SQLite dùng schema version cũ", async () => {
    const databasePath = path.join(tempDirectory, "legacy.db");
    const database = new Database(databasePath);
    database.exec("CREATE TABLE customers (id TEXT PRIMARY KEY)");
    database.close();
    process.env.CRM_MODE = "sqlite";
    process.env.CRM_SQLITE_PATH = databasePath;

    await assert.rejects(() => listCustomers({ role: "admin" }), /Schema SQLite/);
  });

  it("fail-closed khi Sandbox trả collection không phải mảng", async () => {
    process.env.CRM_MODE = "sandbox";
    process.env.CRM_API_BASE_URL = "https://crm-sandbox.example.test";
    process.env.CRM_API_KEY = "test-key";
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: { id: "C001" } }) });

    await assert.rejects(() => listCustomers({ role: "admin" }), /không hợp lệ: cần một mảng/);
  });

  it("trả lỗi tiếng Việt an toàn khi không kết nối được Sandbox", async () => {
    process.env.CRM_MODE = "sandbox";
    process.env.CRM_API_BASE_URL = "https://crm-offline.example.test";
    process.env.CRM_API_KEY = "test-key";
    globalThis.fetch = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    };

    await assert.rejects(
      () => listCustomers({ role: "admin" }),
      (error) => error.message === "Không thể kết nối CRM Sandbox."
    );
  });

  it("từ chối mock ở pilot và production", async () => {
    process.env.CRM_MODE = "mock";
    process.env.NODE_ENV = "pilot";
    await assert.rejects(() => listCustomers({ role: "admin" }), /Không được dùng CRM_MODE=mock/);

    process.env.NODE_ENV = "production";
    await assert.rejects(() => listCustomers({ role: "admin" }), /Không được dùng CRM_MODE=mock/);
  });

  it("validate mode, timeout và cấu hình PostgreSQL", async () => {
    process.env.CRM_MODE = "invalid-provider";
    await assert.rejects(() => listCustomers({ role: "admin" }), /CRM_MODE không hợp lệ/);

    process.env.CRM_MODE = "sandbox";
    process.env.CRM_TIMEOUT_MS = "0";
    await assert.rejects(() => listCustomers({ role: "admin" }), /CRM_TIMEOUT_MS/);

    process.env.CRM_MODE = "postgres";
    delete process.env.CRM_TIMEOUT_MS;
    delete process.env.CRM_POSTGRES_URL;
    delete process.env.DATABASE_URL;
    await assert.rejects(() => listCustomers({ role: "admin" }), /CRM_POSTGRES_URL/);
  });

  it("không đưa config hoặc secret vào cache key khi dùng production alias", () => {
    const apiUrl = "https://user:password@crm.example.test";
    const apiKey = "top-secret-api-key";
    const config = getCrmConfig({
      NODE_ENV: "production",
      CRM_MODE: "production",
      CRM_API_BASE_URL: apiUrl,
      CRM_API_KEY: apiKey
    });

    assert.equal(config.mode, "sandbox");
    assert.equal(config.cacheKey.startsWith("sandbox:"), true);
    assert.equal(config.cacheKey.includes(apiUrl), false);
    assert.equal(config.cacheKey.includes("password"), false);
    assert.equal(config.cacheKey.includes(apiKey), false);
  });
});
