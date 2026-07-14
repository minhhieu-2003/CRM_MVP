import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import os from "node:os";
import path from "node:path";

describe("HTTP API Tests", () => {
  let server;
  let baseUrl;
  let originalAuthEnabled;
  let originalCrmMode;

  before(async () => {
    originalAuthEnabled = process.env.AUTH_ENABLED;
    originalCrmMode = process.env.CRM_MODE;
    process.env.AUTH_ENABLED = "false";
    process.env.CRM_MODE = "mock";
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
    if (originalAuthEnabled === undefined) delete process.env.AUTH_ENABLED;
    else process.env.AUTH_ENABLED = originalAuthEnabled;
    if (originalCrmMode === undefined) delete process.env.CRM_MODE;
    else process.env.CRM_MODE = originalCrmMode;
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

  test('POST /api/chat hiểu "15 khách tiếp" là xem tiếp danh sách đang lọc', async () => {
    const conversationId = "maturity-next-page-sequence";
    const first = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, message: "1" })
    });
    assert.strictEqual(first.status, 200);
    const firstJson = await first.json();
    assert.match(firstJson.reply, /hiển thị 15 khách hàng/);

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, message: "15 khách tiếp" })
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.doesNotMatch(json.reply, /khách hàng "tiep"/i);
    assert.match(json.reply, /16\./);
    assert.match(json.reply, /16-30\//);
    assert.equal(json.context.lastIntent, "maturity-reminder");
    assert.deepEqual(
      json.sources.map((s) => s.endpoint),
      ["GET /customers"]
    );
  });

  test('POST /api/chat không coi "15 khách tiếp" là tên khách khi chưa có danh sách', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "next-page-without-list",
        message: "15 khách tiếp"
      })
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.doesNotMatch(json.reply, /khách hàng "tiep"/i);
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

  test("POST /api/chat giữ customer context khi chuyển sang campaign", async () => {
    const conversationId = "customer-campaign-sequence";
    await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        message: "Khách Nguyễn Văn An có cơ hội nào phù hợp?"
      })
    });

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        message: "Chiến dịch nào phù hợp với khách này?"
      })
    });
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.context.currentModule, "campaign");
    assert.deepEqual(json.context.focusedCustomers, ["C001"]);
    assert.match(json.reply, /Bảo hiểm liên kết vay mua nhà/);
    assert.doesNotMatch(json.reply, /Gia hạn tiết kiệm quý 3/);
    assert.deepEqual(
      json.sources.map((source) => source.endpoint).sort(),
      ["GET /campaigns", "GET /customers"].sort()
    );
  });

  test("POST /api/chat thiếu message trả 400", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 400);
  });

  test("POST /api/chat validates blank and oversized messages", async () => {
    for (const message of ["   ", "x".repeat(4001)]) {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      assert.strictEqual(res.status, 400);
      assert.deepEqual(await res.json(), { error: "Du lieu yeu cau khong hop le." });
    }
  });

  test("draft endpoints validate customerId", async () => {
    for (const endpoint of ["/api/draft-email", "/api/call-script"]) {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion: "test" })
      });
      assert.strictEqual(res.status, 400);
    }
  });

  test("malformed JSON and internal failures return safe client errors", async () => {
    const malformed = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{"
    });
    assert.strictEqual(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: "Du lieu yeu cau khong hop le." });

    process.env.CRM_MODE = "invalid-provider";
    try {
      const failed = await fetch(`${baseUrl}/api/crm/customers`);
      assert.strictEqual(failed.status, 500);
      const payload = await failed.json();
      assert.deepEqual(Object.keys(payload), ["error"]);
      assert.ok(!JSON.stringify(payload).includes("CRM_MODE"));
    } finally {
      process.env.CRM_MODE = "mock";
    }
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
