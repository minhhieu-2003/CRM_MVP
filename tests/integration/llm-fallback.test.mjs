import { describe, test } from "node:test";
import assert from "node:assert";
import { createServer } from "node:http";
import { generateLlmFallback, isLlmFallbackEnabled } from "../../src/plugins/llmFallback.js";

describe("LLM fallback", () => {
  test("không bật khi thiếu key hoặc còn dùng URL placeholder", () => {
    const originalEnv = snapshotLlmEnv();
    try {
      process.env.LLM_PROVIDER = "openai-compatible";
      delete process.env.LLM_API_KEY;
      process.env.LLM_API_URL = "https://your-approved-proxy.example.com/v1/chat/completions";
      assert.strictEqual(isLlmFallbackEnabled(), false);

      process.env.LLM_API_KEY = "test-key";
      assert.strictEqual(isLlmFallbackEnabled(), false);
    } finally {
      restoreLlmEnv(originalEnv);
    }
  });

  test("gọi OpenAI-compatible proxy với CRM context được giới hạn", async () => {
    const originalEnv = snapshotLlmEnv();
    const captured = {};
    const server = createServer((req, res) => {
      collectJson(req, (body) => {
        captured.authorization = req.headers.authorization;
        captured.body = body;

        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            choices: [{ message: { content: "Dạ, em đã xử lý qua LLM fallback." } }]
          })
        );
      });
    });

    try {
      const baseUrl = await listen(server);
      process.env.LLM_PROVIDER = "openai-compatible";
      process.env.LLM_API_URL = `${baseUrl}/v1/chat/completions`;
      process.env.LLM_API_KEY = "test-key";
      process.env.LLM_MODEL = "unit-test-model";
      setSmallContextLimits();

      assert.strictEqual(isLlmFallbackEnabled(), true);
      const result = await generateLlmFallback({ message: "Câu hỏi chưa có trong rule engine" });

      assert.deepStrictEqual(result, {
        reply: "Dạ, em đã xử lý qua LLM fallback.",
        model: "unit-test-model",
        ok: true
      });
      assert.strictEqual(captured.authorization, "Bearer test-key");
      assert.strictEqual(captured.body.model, "unit-test-model");
      assert.strictEqual(
        captured.body.messages.at(-1).content,
        "Câu hỏi chưa có trong rule engine"
      );

      const context = captured.body.messages[1].content;
      assert.match(context, /Khách hàng \(hiển thị 3\/\d+\)/);
      assert.match(context, /Cơ hội bán chéo \(hiển thị 2\/\d+\)/);
      assert.match(context, /Chiến dịch \(hiển thị 1\/\d+\)/);
    } finally {
      await close(server);
      restoreLlmEnv(originalEnv);
    }
  });

  test("từ chối endpoint model vendor trực tiếp", async () => {
    const originalEnv = snapshotLlmEnv();
    try {
      process.env.LLM_PROVIDER = "gemini";
      process.env.LLM_API_URL =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent";
      process.env.LLM_API_KEY = "gemini-test-key";
      process.env.LLM_MODEL = "gemini-test";
      assert.strictEqual(isLlmFallbackEnabled(), false);
      await assert.rejects(
        () => generateLlmFallback({ message: "Hỏi ngoài rule engine" }),
        /chưa được cấu hình/
      );
    } finally {
      restoreLlmEnv(originalEnv);
    }
  });
});

function snapshotLlmEnv() {
  return {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_API_URL: process.env.LLM_API_URL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
    LLM_GOOGLE_PROJECT: process.env.LLM_GOOGLE_PROJECT,
    LLM_VERTEX_LOCATION: process.env.LLM_VERTEX_LOCATION,
    LLM_CONTEXT_CUSTOMER_LIMIT: process.env.LLM_CONTEXT_CUSTOMER_LIMIT,
    LLM_CONTEXT_OPPORTUNITY_LIMIT: process.env.LLM_CONTEXT_OPPORTUNITY_LIMIT,
    LLM_CONTEXT_CAMPAIGN_LIMIT: process.env.LLM_CONTEXT_CAMPAIGN_LIMIT,
    AI_DATA_CLASSIFICATION: process.env.AI_DATA_CLASSIFICATION
  };
}

function restoreLlmEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function setSmallContextLimits() {
  process.env.AI_DATA_CLASSIFICATION = "synthetic";
  process.env.LLM_CONTEXT_CUSTOMER_LIMIT = "3";
  process.env.LLM_CONTEXT_OPPORTUNITY_LIMIT = "2";
  process.env.LLM_CONTEXT_CAMPAIGN_LIMIT = "1";
}

function collectJson(req, callback) {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => callback(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
