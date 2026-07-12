import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, describe, test } from "node:test";
import { planAgentTurn } from "../../src/services/agentPlanner.js";
import { synthesizeAgentTurn } from "../../src/services/agentSynthesizer.js";
import { callApprovedLlm } from "../../src/services/llmGateway.js";

const originalEnv = {
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_API_URL: process.env.LLM_API_URL,
  LLM_MODEL: process.env.LLM_MODEL,
  LLM_TIMEOUT_MS: process.env.LLM_TIMEOUT_MS
};

afterEach(() => restoreEnv(originalEnv));

describe("AI-native planning slice", () => {
  test("plans the six-domain vertical slice using only available tools", async () => {
    const response = {
      intent: "multi-step",
      steps: [
        { tool: "crm_get_customer", input: { name: "Nguyen Van A" } },
        { tool: "crm_list_interactions", input: { customerId: "C001" } },
        { tool: "crm_list_opportunities", input: { customerId: "C001" } },
        { tool: "crm_list_campaigns", input: {} },
        { tool: "crm_draft_email", input: { customerId: "C001" } },
        { tool: "crm_call_script", input: { customerId: "C001" } }
      ],
      responseGoal: "Prepare a grounded customer follow-up package."
    };
    const proxy = await createProxy(JSON.stringify(response));

    try {
      configureProxy(proxy.url);
      const plan = await planAgentTurn({
        message: "Hay tong hop va soan noi dung cham soc khach hang",
        context: { currentModule: "customer", focusedCustomers: ["C001"] },
        identity: { userId: "secret-user", rmId: "RM01", role: "rm", branchId: "DN" },
        availableTools: response.steps.map((step) => ({ name: step.tool }))
      });

      assert.deepEqual(plan, response);
      assert.equal(proxy.requests.length, 1);
      assert.equal(proxy.requests[0].headers.authorization, "Bearer test-proxy-key");
      assert.equal(proxy.requests[0].body.response_format.type, "json_object");
      assert.doesNotMatch(JSON.stringify(proxy.requests[0].body), /secret-user/);
    } finally {
      await proxy.close();
    }
  });

  test("rejects a model-selected tool outside the caller allowlist", async () => {
    const proxy = await createProxy(
      JSON.stringify({
        intent: "campaign",
        steps: [{ tool: "crm_list_campaigns", input: {} }],
        responseGoal: "List campaigns."
      })
    );

    try {
      configureProxy(proxy.url);
      await assert.rejects(
        planAgentTurn({
          message: "Xem chien dich",
          context: {},
          identity: {},
          availableTools: ["crm_list_customers"]
        }),
        (error) => error.code === "PLANNER_TOOL_NOT_ALLOWED"
      );
    } finally {
      await proxy.close();
    }
  });

  test("fails deterministically when planner JSON is malformed", async () => {
    const proxy = await createProxy("```json\n{}\n```");

    try {
      configureProxy(proxy.url);
      await assert.rejects(
        planAgentTurn({
          message: "Tim khach hang",
          context: {},
          identity: {},
          availableTools: ["crm_list_customers"]
        }),
        (error) => error.code === "PLANNER_INVALID_RESPONSE"
      );
    } finally {
      await proxy.close();
    }
  });

  test("synthesizes a reply while deriving deduplicated sources from observations", async () => {
    const proxy = await createProxy(JSON.stringify({ reply: "Da, em da tong hop ket qua CRM." }));
    const plan = {
      intent: "opportunity",
      steps: [
        { tool: "crm_get_customer", input: { name: "Nguyen Van A" } },
        { tool: "crm_list_opportunities", input: { customerId: "C001" } }
      ],
      responseGoal: "Summarize grounded opportunities."
    };

    try {
      configureProxy(proxy.url);
      const result = await synthesizeAgentTurn({
        message: "Co hoi nao phu hop?",
        context: { focusedCustomers: ["C001"] },
        plan,
        observations: [
          {
            tool: "crm_get_customer",
            data: { id: "C001", segment: "VIP" },
            sources: [{ endpoint: "GET /customers" }]
          },
          {
            tool: "crm_list_opportunities",
            data: [{ product: "Bao hiem", score: 0.8 }],
            sources: ["GET /opportunities", "GET /customers"]
          }
        ]
      });

      assert.deepEqual(result, {
        reply: "Da, em da tong hop ket qua CRM.",
        sources: [{ endpoint: "GET /customers" }, { endpoint: "GET /opportunities" }]
      });
    } finally {
      await proxy.close();
    }
  });

  test("returns a stable timeout error so callers can fall back", async () => {
    const proxy = await createProxy(JSON.stringify({ reply: "too late" }), 250);

    try {
      configureProxy(proxy.url);
      process.env.LLM_TIMEOUT_MS = "100";
      await assert.rejects(
        callApprovedLlm({ messages: [{ role: "user", content: "hello" }] }),
        (error) => error.code === "LLM_TIMEOUT"
      );
    } finally {
      await proxy.close();
    }
  });

  test("rejects direct model vendor endpoints before making a request", async () => {
    process.env.LLM_API_URL = "https://api.openai.com/v1/chat/completions";
    process.env.LLM_API_KEY = "must-not-be-sent";

    await assert.rejects(
      callApprovedLlm({ messages: [{ role: "user", content: "hello" }] }),
      (error) => error.code === "LLM_PROXY_NOT_APPROVED"
    );
  });
});

function configureProxy(url) {
  process.env.LLM_API_URL = `${url}/v1/chat/completions`;
  process.env.LLM_API_KEY = "test-proxy-key";
  process.env.LLM_MODEL = "test-approved-model";
  process.env.LLM_TIMEOUT_MS = "2000";
}

async function createProxy(content, delayMs = 0) {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        headers: request.headers,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
      });
      setTimeout(() => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ choices: [{ message: { content } }] }));
      }, delayMs);
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

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
