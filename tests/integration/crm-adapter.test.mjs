import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { draftEmailForCustomer } from "../../src/services/crmRepository.js";
import { mapRowToCamelCase } from "../../src/services/dbClient.js";
import { listCustomers } from "../../src/services/crmService.js";
import { existsSync } from "node:fs";


describe("CRM Adapter Tests", () => {
  let originalEnv;
  let originalFetch;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it("should return mock data when CRM_MODE=mock", async () => {
    process.env.CRM_MODE = "mock";

    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({ data: {} }) };
    };

    const draft = await draftEmailForCustomer({ id: "C001", name: "Test", maturityDate: "2026-07-10", savingsAmountVnd: 1000 }, "Test suggestion");
    assert.strictEqual(fetchCalled, false, "Should not call fetch in mock mode");
    assert.ok(draft.subject, "Should return mock draft");
  });

  it("should fail-closed in sandbox mode if fetch fails", async () => {
    process.env.CRM_MODE = "sandbox";
    process.env.CRM_API_BASE_URL = "http://localhost:9999";
    process.env.CRM_API_KEY = "test-key";

    globalThis.fetch = async () => {
      return { ok: false, status: 500 };
    };

    try {
      await draftEmailForCustomer({ id: "C001" }, "Test");
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.match(err.message, /CRM API .* trả HTTP 500/);
    }
  });

  it("should throw malformed error if JSON is invalid in sandbox mode", async () => {
    process.env.CRM_MODE = "sandbox";
    process.env.CRM_API_BASE_URL = "http://localhost:9999";
    process.env.CRM_API_KEY = "test-key";

    globalThis.fetch = async () => {
      return {
        ok: true,
        json: async () => { throw new Error("Invalid JSON"); }
      };
    };

    try {
      await draftEmailForCustomer({ id: "C001" }, "Test");
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.match(err.message, /trả dữ liệu không hợp lệ \(malformed\)/);
    }
  });

  it("should handle timeout correctly", async () => {
    process.env.CRM_MODE = "production";
    process.env.CRM_API_BASE_URL = "http://localhost:9999";
    process.env.CRM_API_KEY = "test-key";
    process.env.CRM_TIMEOUT_MS = "10";

    globalThis.fetch = async (url, options) => {
      return new Promise((resolve, reject) => {
        const error = new Error("AbortError");
        error.name = "AbortError";
        setTimeout(() => reject(error), 20); // Simulating fetch taking longer than timeout

        options.signal.addEventListener("abort", () => {
          reject(error);
        });
      });
    };

    try {
      await draftEmailForCustomer({ id: "C001" }, "Test");
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.match(err.message, /timeout sau 10ms/);
    }
  });
});

describe("camelCase output contract", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("mapRowToCamelCase converts snake_case → camelCase correctly", () => {
    const input = { savings_amount_vnd: 500, maturity_date: '2026-07-10', rm_id: 'RM01', normalized_name: 'nguyen' };
    const output = mapRowToCamelCase(input);
    assert.deepStrictEqual(output, { savingsAmountVnd: 500, maturityDate: '2026-07-10', rmId: 'RM01', normalizedName: 'nguyen' });
  });

  it("mapRowToCamelCase is a no-op on already-camelCase objects", () => {
    const input = { savingsAmountVnd: 500, maturityDate: '2026-07-10' };
    const output = mapRowToCamelCase(input);
    assert.deepStrictEqual(output, input);
  });

  it("mapRowToCamelCase handles null/undefined gracefully", () => {
    assert.strictEqual(mapRowToCamelCase(null), null);
    assert.strictEqual(mapRowToCamelCase(undefined), undefined);
  });

  it("Mock data (CRM_MODE=mock) outputs camelCase customers", async () => {
    process.env.CRM_MODE = 'mock';
    const customers = await listCustomers();
    assert.ok(Array.isArray(customers));
    assert.ok(customers.length > 0);
    for (const customer of customers) {
      assert.ok('id' in customer);
      assert.ok('name' in customer);
      assert.ok('savingsAmountVnd' in customer);
      assert.ok('maturityDate' in customer);
      assert.ok(!('savings_amount_vnd' in customer));
    }
  });

  it("SQLite data (CRM_MODE=sqlite) outputs camelCase customers", async (t) => {
    if (!existsSync('db/crm.db')) {
      t.skip('db/crm.db does not exist');
      return;
    }

    process.env.CRM_MODE = 'sqlite';
    process.env.CRM_SQLITE_PATH = 'db/crm.db';
    const customers = await listCustomers();
    assert.ok(Array.isArray(customers));
    assert.ok(customers.length > 0);
    for (const customer of customers) {
      assert.ok('id' in customer);
      assert.ok('name' in customer);
      assert.ok('savingsAmountVnd' in customer);
      assert.ok('maturityDate' in customer);
      assert.ok(!('savings_amount_vnd' in customer));
    }
  });
});
