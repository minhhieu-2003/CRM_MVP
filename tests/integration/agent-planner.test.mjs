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

  test("tokenizes raw RM PII before sending a planning request", async () => {
    const proxy = await createProxy(
      JSON.stringify({
        intent: "customer",
        steps: [{ tool: "crm_list_customers", input: {} }],
        responseGoal: "Find the matching customer."
      })
    );

    try {
      configureProxy(proxy.url);
      await planAgentTurn({
        message:
          "Tìm khách mai van binh, email an@example.com, điện thoại 0912345678, tài khoản 123456789012.",
        context: { currentModule: "customer", focusedCustomers: ["C001"] },
        identity: { userId: "rm-secret", rmId: "RM01", role: "rm", branchId: "HN" },
        availableTools: ["crm_list_customers"]
      });

      const outbound = JSON.stringify(proxy.requests[0].body.messages);
      assert.match(outbound, /BANKRM_PII_/);
      assert.doesNotMatch(
        outbound,
        /mai van binh|an@example\.com|0912345678|123456789012|C001|rm-secret|RM01/i
      );
    } finally {
      await proxy.close();
    }
  });

  test("restores a protected customer identifier only after planner output validation", async () => {
    const proxy = await createProxy((request) => {
      const token = JSON.stringify(request.body.messages).match(
        /\[\[BANKRM_PII_[a-z]+_\d+\]\]/
      )?.[0];
      assert.ok(token, "the outbound planner prompt must contain an opaque PII token");
      return JSON.stringify({
        intent: "draft-email",
        steps: [{ tool: "crm_draft_email", input: { customerId: token } }],
        responseGoal: "Draft the requested email."
      });
    });

    try {
      configureProxy(proxy.url);
      const plan = await planAgentTurn({
        message: "Soan email cho khach C001",
        context: {},
        identity: { role: "rm" },
        availableTools: ["crm_draft_email"]
      });

      assert.equal(plan.steps[0].input.customerId, "C001");
      assert.doesNotMatch(JSON.stringify(proxy.requests[0].body.messages), /C001/);
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

  test("rejects planner-owned policy fields and plans over the runtime step budget", async () => {
    const policyProxy = await createProxy(
      JSON.stringify({
        intent: "customer",
        steps: [{ tool: "crm_list_customers", input: {}, risk: "low" }],
        responseGoal: "List customers.",
        requiresApproval: false
      })
    );

    try {
      configureProxy(policyProxy.url);
      await assert.rejects(
        planAgentTurn({
          message: "Liệt kê khách hàng",
          context: {},
          identity: {},
          availableTools: ["crm_list_customers"],
          maxSteps: 1
        }),
        (error) => error.code === "PLANNER_INVALID_RESPONSE"
      );
    } finally {
      await policyProxy.close();
    }

    const budgetProxy = await createProxy(
      JSON.stringify({
        intent: "multi-step",
        steps: [
          { tool: "crm_list_customers", input: {} },
          { tool: "crm_list_campaigns", input: {} }
        ],
        responseGoal: "List customers and campaigns."
      })
    );

    try {
      configureProxy(budgetProxy.url);
      await assert.rejects(
        planAgentTurn({
          message: "Liệt kê khách hàng và chiến dịch",
          context: {},
          identity: {},
          availableTools: ["crm_list_customers", "crm_list_campaigns"],
          maxSteps: 1
        }),
        (error) => error.code === "PLANNER_STEP_BUDGET_EXCEEDED"
      );
      assert.match(JSON.stringify(budgetProxy.requests[0].body.messages), /between 1 and 1 steps/);
    } finally {
      await budgetProxy.close();
    }
  });

  test("synthesizes a reply while deriving deduplicated sources from observations", async () => {
    const proxy = await createProxy(JSON.stringify({ reply: "Da, em da tong hop ket qua CRM." }));
    const plan = {
      intent: "opportunity",
      steps: [
        { tool: "crm_get_customer", input: { name: "mai van binh" } },
        { tool: "crm_list_opportunities", input: { customerId: "C001" } }
      ],
      responseGoal: "Summarize grounded opportunities."
    };

    try {
      configureProxy(proxy.url);
      const result = await synthesizeAgentTurn({
        message: "Tu van cho truong thi lan hom nay; co hoi nao phu hop?",
        context: { focusedCustomers: ["C001"] },
        plan,
        observations: [
          {
            tool: "crm_get_customer",
            input: { name: "mai van binh" },
            data: { id: "C001", segment: "VIP" },
            sources: [{ endpoint: "GET /customers" }]
          },
          {
            tool: "crm_list_opportunities",
            input: { customerId: "C001" },
            data: [{ product: "Bao hiem", score: 0.8 }],
            sources: ["GET /opportunities", "GET /customers"]
          }
        ]
      });

      assert.deepEqual(result, {
        reply: "Da, em da tong hop ket qua CRM.",
        sources: [{ endpoint: "GET /customers" }, { endpoint: "GET /opportunities" }]
      });
      const outbound = JSON.stringify(proxy.requests[0].body.messages);
      assert.match(outbound, /BANKRM_PII_/);
      assert.doesNotMatch(outbound, /C001|mai van binh|truong thi lan/i);
    } finally {
      await proxy.close();
    }
  });

  test("grounds a customer identifier from successful tool input", async () => {
    const proxy = await createProxy(
      JSON.stringify({ reply: "Đã soạn email chăm sóc cho khách hàng C001." })
    );
    const plan = {
      intent: "draft-email",
      steps: [{ tool: "crm_draft_email", input: { customerId: "C001" } }],
      responseGoal: "Draft a grounded customer email."
    };

    try {
      configureProxy(proxy.url);
      const result = await synthesizeAgentTurn({
        message: "Soạn email chăm sóc",
        context: { focusedCustomers: ["C001"] },
        plan,
        observations: [
          {
            tool: "crm_draft_email",
            input: { customerId: "C001" },
            data: { subject: "Chăm sóc khách hàng", body: "Nội dung email" },
            sources: [{ endpoint: "POST /emails/draft" }]
          }
        ]
      });

      assert.deepEqual(result, {
        reply: "Đã soạn email chăm sóc cho khách hàng C001.",
        sources: [{ endpoint: "POST /emails/draft" }]
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

  test("rejects synthesizer-owned sources, risk, and approval fields", async () => {
    const proxy = await createProxy(
      JSON.stringify({
        reply: "Da, em da tong hop ket qua CRM.",
        sources: [{ endpoint: "LLM-controlled" }],
        risk: "low",
        requiresApproval: false
      })
    );
    const plan = {
      intent: "customer",
      steps: [{ tool: "crm_list_customers", input: {} }],
      responseGoal: "List customers."
    };

    try {
      configureProxy(proxy.url);
      await assert.rejects(
        synthesizeAgentTurn({
          message: "Liệt kê khách hàng",
          context: {},
          plan,
          observations: [
            {
              tool: "crm_list_customers",
              input: {},
              data: [{ id: "C001" }],
              sources: [{ endpoint: "GET /customers" }]
            }
          ]
        }),
        (error) => error.code === "SYNTHESIS_INVALID_RESPONSE"
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
        const responseContent = typeof content === "function" ? content(requests.at(-1)) : content;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ choices: [{ message: { content: responseContent } }] }));
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
