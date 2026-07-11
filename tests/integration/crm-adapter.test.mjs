import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { draftEmailForCustomer } from "../../src/services/crmRepository.js";

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
