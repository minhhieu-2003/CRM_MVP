import { describe, test } from "node:test";
import assert from "node:assert";
import { createServer } from "node:http";
import { generateLlmFallback, isLlmFallbackEnabled } from "../../src/plugins/llmFallback.js";
import { runAgentTurn } from "../../src/services/agentService.js";

const fallbackEntitlements = ["customer:read", "opportunity:read", "campaign:read"];

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
            choices: [
              {
                message: {
                  content: JSON.stringify({ reply: "Dạ, em đã xử lý qua LLM fallback." })
                }
              }
            ]
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
      process.env.AI_NATIVE_CORE = "false";
      setSmallContextLimits();

      assert.strictEqual(isLlmFallbackEnabled(), true);
      await assert.rejects(
        () => generateLlmFallback({ message: "Thiếu identity" }),
        /identity hợp lệ/
      );
      assert.equal(captured.body, undefined);
      const scopedIdentity = {
        userId: "fallback-rm",
        rmId: "RM01",
        role: "rm",
        branchId: "Hà Nội",
        entitlements: fallbackEntitlements
      };
      const result = await runAgentTurn({
        conversationId: "llm-fallback-scoped-chain",
        message: "Câu hỏi chưa có trong rule engine",
        identity: scopedIdentity
      });

      assert.deepStrictEqual(result, {
        auditId: result.auditId,
        reply: "Dạ, em đã xử lý qua LLM fallback.",
        sources: [
          { endpoint: "GET /customers" },
          { endpoint: "GET /opportunities" },
          { endpoint: "GET /campaigns" },
          { endpoint: "POST /llm-proxy/chat" }
        ],
        context: {
          currentModule: "general",
          focusedCustomers: [],
          lastIntent: "fallback"
        }
      });
      assert.strictEqual(captured.authorization, "Bearer test-key");
      assert.strictEqual(captured.body.model, "unit-test-model");
      assert.strictEqual(captured.body.response_format.type, "json_object");
      assert.strictEqual(
        captured.body.messages.at(-1).content,
        "Câu hỏi chưa có trong rule engine"
      );

      const context = captured.body.messages[1].content;
      assert.match(context, /Khách hàng \(hiển thị 3\/\d+\)/);
      assert.match(context, /Cơ hội bán chéo \(hiển thị 2\/\d+\)/);
      assert.match(context, /Chiến dịch \(hiển thị 1\/\d+\)/);
      assert.match(context, /\[\[BANKRM_PII_[a-z]+_\d+\]\]/);
      assert.doesNotMatch(context, /Nguyễn Văn An|Đỗ Thu Hà|Trần Thị Mai|C001/);

      await generateLlmFallback({
        message: "tu van cho mai van binh hom nay",
        identity: scopedIdentity
      });
      const protectedMessage = captured.body.messages.at(-1).content;
      assert.match(protectedMessage, /tu van cho/);
      assert.match(protectedMessage, /hom nay/);
      assert.match(protectedMessage, /\[\[BANKRM_PII_[a-z]+_\d+\]\]/);
      assert.doesNotMatch(protectedMessage, /mai van binh/i);
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

  test("từ chối thiếu scope trước khi đọc CRM hoặc gọi LLM", async () => {
    const originalEnv = snapshotLlmEnv();
    let requestCount = 0;
    const server = createServer((_req, res) => {
      requestCount += 1;
      res.statusCode = 500;
      res.end();
    });

    try {
      const baseUrl = await listen(server);
      process.env.LLM_PROVIDER = "openai-compatible";
      process.env.LLM_API_URL = `${baseUrl}/v1/chat/completions`;
      process.env.LLM_API_KEY = "test-key";
      process.env.LLM_MODEL = "unit-test-model";
      process.env.AI_DATA_CLASSIFICATION = "synthetic";
      process.env.CRM_MODE = "sandbox";
      process.env.CRM_API_BASE_URL = baseUrl;
      process.env.CRM_API_KEY = "sandbox-test-key";

      await assert.rejects(
        generateLlmFallback({
          message: "Tóm tắt dữ liệu CRM",
          identity: {
            userId: "customer-only-rm",
            rmId: "RM01",
            role: "rm",
            branchId: "Hà Nội",
            entitlements: ["customer:read"]
          }
        }),
        (error) => error.code === "TOOL_SCOPE_DENIED"
      );
      assert.equal(requestCount, 0);
    } finally {
      await close(server);
      restoreLlmEnv(originalEnv);
    }
  });

  test("rejects malformed, schema-expanded, and ungrounded fallback replies", async () => {
    const originalEnv = snapshotLlmEnv();
    const cases = [
      {
        content: "not-json",
        verify: (error) => /JSON không hợp lệ/.test(error.message)
      },
      {
        content: JSON.stringify({
          reply: "Em chưa có đủ dữ liệu.",
          sources: [{ endpoint: "LLM-controlled" }]
        }),
        verify: (error) => /không đúng schema/.test(error.message)
      },
      {
        content: JSON.stringify({ reply: "Khách C-FABRICATED cần được chăm sóc." }),
        verify: (error) =>
          error.code === "UNGROUNDED_SENSITIVE_FACT" && error.kind === "customer-id"
      },
      {
        content: JSON.stringify({ reply: "Khách hàng đáo hạn ngày 31/12/2099." }),
        verify: (error) => error.code === "UNGROUNDED_SENSITIVE_FACT" && error.kind === "date"
      },
      {
        content: JSON.stringify({ reply: "Giá trị dự kiến là 9.999.999.999 đồng." }),
        verify: (error) => error.code === "UNGROUNDED_SENSITIVE_FACT" && error.kind === "money"
      },
      {
        content: JSON.stringify({ reply: "Giá trị dự kiến là 9.999.999.999 ₫." }),
        verify: (error) => error.code === "UNGROUNDED_SENSITIVE_FACT" && error.kind === "money"
      },
      {
        content: JSON.stringify({ reply: "Xác suất thành công là 99%." }),
        verify: (error) => error.code === "UNGROUNDED_SENSITIVE_FACT" && error.kind === "percentage"
      }
    ];
    let responseIndex = 0;
    const server = createServer((req, res) => {
      collectJson(req, () => {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            choices: [{ message: { content: cases[responseIndex++].content } }]
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
      process.env.AUTH_ENABLED = "false";
      setSmallContextLimits();
      const scopedIdentity = {
        userId: "fallback-grounding-rm",
        rmId: "RM01",
        role: "rm",
        branchId: "Hà Nội",
        entitlements: fallbackEntitlements
      };

      for (const testCase of cases) {
        await assert.rejects(
          generateLlmFallback({
            message: "Tóm tắt dữ liệu CRM",
            identity: scopedIdentity
          }),
          testCase.verify
        );
      }
      assert.equal(responseIndex, cases.length);
    } finally {
      await close(server);
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
    AI_DATA_CLASSIFICATION: process.env.AI_DATA_CLASSIFICATION,
    AI_NATIVE_CORE: process.env.AI_NATIVE_CORE,
    AUTH_ENABLED: process.env.AUTH_ENABLED,
    NODE_ENV: process.env.NODE_ENV,
    CRM_MODE: process.env.CRM_MODE,
    CRM_API_BASE_URL: process.env.CRM_API_BASE_URL,
    CRM_API_KEY: process.env.CRM_API_KEY
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
