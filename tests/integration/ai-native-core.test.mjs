import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, describe, test } from "node:test";
import { runAgentTurn } from "../../src/services/agentService.js";

const originalEnv = { ...process.env };
const identity = {
  userId: "ai-native-test",
  rmId: "default",
  role: "user",
  branchId: "default"
};

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("AI-native core integration", () => {
  test("plans, executes CRM tools, synthesizes grounded output, and preserves context", async () => {
    const proxy = await createProxy([
      {
        intent: "multi-step",
        steps: [
          { tool: "crm_get_customer", input: { name: "Nguyễn Văn An" } },
          { tool: "crm_list_interactions", input: { customerId: "C001" } },
          { tool: "crm_list_opportunities", input: { customerId: "C001" } },
          { tool: "crm_list_campaigns", input: {} }
        ],
        responseGoal: "Tổng hợp hồ sơ, tương tác, cơ hội và chiến dịch phù hợp."
      },
      {
        reply:
          "Em đã tổng hợp hồ sơ, lịch sử tương tác, cơ hội và chiến dịch phù hợp cho khách hàng."
      }
    ]);

    try {
      configureAiCore(proxy.url);
      const result = await runAgentTurn({
        conversationId: "ai-native-grounded",
        message: "Tổng hợp khách Nguyễn Văn An và chiến dịch phù hợp",
        identity
      });

      assert.equal(proxy.requests.length, 2);
      assert.match(result.reply, /đã tổng hợp/);
      assert.deepEqual(
        result.sources.map((source) => source.endpoint),
        ["GET /customers", "GET /interactions", "GET /opportunities", "GET /campaigns"]
      );
      assert.equal(result.context.currentModule, "campaign");
      assert.equal(result.context.lastIntent, "multi-step");
      assert.ok(result.context.focusedCustomers.includes("C001"));
    } finally {
      await proxy.close();
    }
  });

  test("falls back to the deterministic rule engine when the planner response is invalid", async () => {
    const proxy = await createRawProxy("not-json");
    try {
      configureAiCore(proxy.url);
      const result = await runAgentTurn({
        conversationId: "ai-native-fallback",
        message: "1",
        identity
      });

      assert.equal(proxy.requests.length, 1);
      assert.ok(result.sources.some((source) => source.endpoint === "GET /customers"));
      assert.equal(result.context.lastIntent, "maturity-reminder");
    } finally {
      await proxy.close();
    }
  });

  test("blocks LLM data use unless CRM data is explicitly synthetic or anonymized", async () => {
    const proxy = await createRawProxy("not-used");
    try {
      configureAiCore(proxy.url);
      process.env.AI_DATA_CLASSIFICATION = "restricted";
      const result = await runAgentTurn({
        conversationId: "ai-native-data-policy",
        message: "1",
        identity
      });

      assert.equal(proxy.requests.length, 0);
      assert.equal(result.context.lastIntent, "maturity-reminder");
    } finally {
      await proxy.close();
    }
  });
});

function configureAiCore(url) {
  process.env.AI_NATIVE_CORE = "true";
  process.env.AI_DATA_CLASSIFICATION = "synthetic";
  process.env.AUTH_ENABLED = "false";
  process.env.CRM_MODE = "mock";
  process.env.LLM_API_URL = `${url}/v1/chat/completions`;
  process.env.LLM_API_KEY = "test-proxy-key";
  process.env.LLM_MODEL = "test-approved-model";
  process.env.LLM_TIMEOUT_MS = "2000";
}

async function createProxy(responses) {
  let index = 0;
  return createRawProxy(() => JSON.stringify(responses[index++]));
}

async function createRawProxy(content) {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const nextContent = typeof content === "function" ? content() : content;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: nextContent } }] }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    requests,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
