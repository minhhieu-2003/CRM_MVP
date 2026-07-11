import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import os from "node:os";
import path from "node:path";

describe("HTTP API Tests", () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.AUDIT_LOG_DIR = path.join(os.tmpdir(), "crm_audit_test");
    const { app } = await import("../../src/server.js");

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) {
      server.close();
    }
  });

  test("GET /api/health trả ok true", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ok, true);
  });

  test('POST /api/chat với message "1"', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "1" })
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.ok(typeof json.reply === "string");
    assert.ok(Array.isArray(json.sources));
    assert.ok(typeof json.context === "object");
  });

  test('POST /api/chat với message "xin chào em" không trả đồng thời clarification và smalltalk', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "xin chào em" })
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    const endpoints = json.sources.map((s) => s.endpoint);
    assert.ok(endpoints.includes("internal://smalltalk"));
    assert.ok(!endpoints.includes("internal://clarification"));
  });

  test('POST /api/chat với message "bạn làm được gì" không giữ clarification nếu capability-agent xử lý', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "bạn làm được gì" })
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    const endpoints = json.sources.map((s) => s.endpoint);
    assert.ok(endpoints.includes("internal://capability"));
    assert.ok(!endpoints.includes("internal://clarification"));
  });

  test('POST /api/chat với typo "caho bạn" vẫn xử lý smalltalk', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "caho bạn" })
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    const endpoints = json.sources.map((s) => s.endpoint);
    assert.ok(endpoints.includes("internal://smalltalk"));
    assert.ok(!endpoints.includes("internal://clarification"));
  });

  test('POST /api/chat với "có bao nhiêu sản phẩm tiếp cận khách hàng" trả summary CRM', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "có bao nhiêu sản phẩm tiếp cận khách hàng" })
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    const endpoints = json.sources.map((s) => s.endpoint);
    assert.ok(endpoints.includes("GET /opportunities"));
    assert.ok(endpoints.includes("GET /campaigns"));
    assert.match(json.reply, /sản phẩm\/cơ hội/);
  });

  test('POST /api/chat với "khoản tiết kiệm lớn hơn 2 tỉ" trả số lượng khách hàng', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "co bao nhieu nguoi co khoan tiet kiem lon hon 2 ti" })
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    const endpoints = json.sources.map((s) => s.endpoint);
    assert.ok(endpoints.includes("GET /customers"));
    assert.match(json.reply, /khách hàng có khoản tiết kiệm lớn hơn/);
    assert.match(json.reply, /2\.000\.000\.000/);
  });

  test('POST /api/chat với sequence "hôm nay..." rồi "soạn mail" dùng context khách hàng', async () => {
    const conversationId = "email-mail-sequence";
    await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        message: "hôm nay tiếp khách có bao nhiêu người liệt kê"
      })
    });

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, message: "soạn mail" })
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    const endpoints = json.sources.map((s) => s.endpoint);
    assert.ok(endpoints.includes("GET /customers"));
    assert.ok(endpoints.includes("POST /draft-email"));
    assert.match(json.reply, /Email 1/);
  });

  test("POST /api/chat thiếu message trả 400", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 400);
  });

  test("GET crm endpoints trả data array", async () => {
    const endpoints = [
      "/api/crm/customers",
      "/api/crm/opportunities",
      "/api/crm/interactions",
      "/api/crm/campaigns",
      "/api/agents"
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${baseUrl}${ep}`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.data));
    }
  });
});
