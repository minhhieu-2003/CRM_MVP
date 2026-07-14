import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, test } from "node:test";

const environmentBeforeTestFile = { ...process.env };
const auditDirectory = mkdtempSync(path.join(os.tmpdir(), "bankrm-ai-native-audit-"));
process.env.AUDIT_LOG_DIR = auditDirectory;

const [
  { runAgentTurn },
  { runAiNativeCore },
  { buildAuditConversationReference, getAuditLogs },
  contextManager,
  synthesizer
] = await Promise.all([
  import("../../src/services/agentService.js"),
  import("../../src/services/aiNativeCore.js"),
  import("../../src/services/auditLogger.js"),
  import("../../src/services/contextManager.js"),
  import("../../src/services/agentSynthesizer.js")
]);
const { getConversationContext, getConversationContextSnapshot, saveConversationContext } =
  contextManager;
const { synthesizeAgentTurn } = synthesizer;

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

after(() => {
  process.env = { ...environmentBeforeTestFile };
  rmSync(auditDirectory, { recursive: true, force: true });
});

describe("AI-native core integration", () => {
  test("plans, executes CRM tools, synthesizes grounded output, and preserves context", async () => {
    const conversationId = "ai-native-grounded-review";
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
        conversationId,
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
      const turnEvent = getAuditLogs().find((event) => event.auditId === result.auditId);
      assert.equal(turnEvent.prompt, "chat-turn");
      assert.doesNotMatch(JSON.stringify(turnEvent), /Nguyễn Văn An/);
      const mirrorEvents = getAuditLogs().filter(
        (event) =>
          event.conversationId === buildAuditConversationReference(conversationId) &&
          event.llmProvider === "mcp-client-observation"
      );
      assert.equal(mirrorEvents.length, 4);
      assert.ok(mirrorEvents.every((event) => event.actorId === identity.userId));
    } finally {
      await proxy.close();
    }
  });

  test("runs the maturity reminder flow through a bounded MCP observation", async () => {
    const proxy = await createProxy([
      {
        intent: "customer",
        steps: [{ tool: "crm_customers_due", input: { daysAhead: 7 } }],
        responseGoal: "Tóm tắt khách hàng có tiết kiệm sắp đến hạn."
      },
      { reply: "Em đã tổng hợp danh sách khách hàng có tiết kiệm sắp đến hạn." }
    ]);

    try {
      configureAiCore(proxy.url);
      process.env.CRM_BUSINESS_DATE = "2026-07-07";
      const result = await runAgentTurn({
        conversationId: "ai-native-maturity",
        message: "Nhắc tiết kiệm đến hạn trong 7 ngày tới",
        identity
      });

      assert.equal(proxy.requests.length, 2);
      assert.deepEqual(result.sources, [{ endpoint: "GET /customers" }]);
      assert.equal(result.context.lastIntent, "customer");
      const synthesisRequest = JSON.stringify(proxy.requests[1]);
      assert.match(synthesisRequest, /totalCount/);
      assert.match(synthesisRequest, /hasMore/);
      assert.ok(synthesisRequest.length < 40_000);
    } finally {
      await proxy.close();
    }
  });

  test("runs opportunity advice through MCP customer and opportunity tools", async () => {
    const proxy = await createProxy([
      {
        intent: "opportunity",
        steps: [
          { tool: "crm_get_customer", input: { name: "Nguyễn Văn An" } },
          { tool: "crm_list_opportunities", input: { customerId: "C001" } }
        ],
        responseGoal: "Đề xuất cơ hội phù hợp dựa trên dữ liệu CRM."
      },
      { reply: "Em đã đối chiếu hồ sơ và các cơ hội hiện có của khách hàng." }
    ]);

    try {
      configureAiCore(proxy.url);
      const result = await runAgentTurn({
        conversationId: "ai-native-opportunity",
        message: "Khách Nguyễn Văn An có cơ hội nào phù hợp?",
        identity
      });

      assert.equal(proxy.requests.length, 2);
      assert.deepEqual(result.sources, [
        { endpoint: "GET /customers" },
        { endpoint: "GET /opportunities" }
      ]);
      assert.equal(result.context.currentModule, "opportunity");
      assert.equal(result.context.lastIntent, "opportunity");
      assert.ok(result.context.focusedCustomers.includes("C001"));
    } finally {
      await proxy.close();
    }
  });

  test("runs draft email through MCP without performing an external send", async () => {
    const proxy = await createProxy([
      {
        intent: "draft-email",
        steps: [{ tool: "crm_draft_email", input: { customerId: "C001" } }],
        responseGoal: "Soạn bản nháp email chăm sóc khách hàng."
      },
      { reply: "Em đã soạn bản nháp email để anh/chị xem lại trước khi sử dụng." }
    ]);

    try {
      configureAiCore(proxy.url);
      const result = await runAgentTurn({
        conversationId: "ai-native-draft-email",
        message: "Soạn email cho khách C001",
        identity
      });

      assert.equal(proxy.requests.length, 2);
      assert.deepEqual(result.sources, [
        { endpoint: "GET /customers" },
        { endpoint: "POST /draft-email" }
      ]);
      assert.equal(result.context.currentModule, "interaction");
      assert.equal(result.context.lastIntent, "draft-email");
      assert.match(JSON.stringify(proxy.requests[1]), /subject/);
    } finally {
      await proxy.close();
    }
  });

  test("short-circuits synthesis when MCP returns an error so fabricated data is ignored", async () => {
    const fabricated = "Khách C-FABRICATED có 9.999.999.999 đồng.";
    const proxy = await createProxy([
      {
        intent: "draft-email",
        steps: [{ tool: "crm_draft_email", input: { customerId: "C-NOT-FOUND" } }],
        responseGoal: "Soạn email cho khách hàng."
      },
      { reply: fabricated }
    ]);

    try {
      configureAiCore(proxy.url);
      const result = await runAgentTurn({
        conversationId: "ai-native-no-hallucination",
        message: "Soạn email cho khách không tồn tại",
        identity
      });

      assert.equal(proxy.requests.length, 1);
      assert.doesNotMatch(result.reply, /C-FABRICATED|9\.999\.999\.999/);
      assert.ok(result.reply.trim().length > 0);
      assert.deepEqual(result.sources, [{ endpoint: "GET /customers" }]);
    } finally {
      await proxy.close();
    }
  });

  test("rejects sensitive facts invented by the synthesizer after successful tools", async () => {
    const proxy = await createProxy([
      {
        intent: "opportunity",
        steps: [
          { tool: "crm_get_customer", input: { name: "Nguyễn Văn An" } },
          { tool: "crm_list_opportunities", input: { customerId: "C001" } }
        ],
        responseGoal: "Đề xuất cơ hội dựa trên dữ liệu CRM."
      },
      {
        reply: "Khách C-FABRICATED có 9.999.999.999 đồng, đáo hạn 31/12/2099 và xác suất 99%."
      }
    ]);

    try {
      configureAiCore(proxy.url);
      const result = await runAgentTurn({
        conversationId: "ai-native-sensitive-grounding",
        message: "Khách Nguyễn Văn An có cơ hội nào phù hợp?",
        identity
      });

      assert.equal(proxy.requests.length, 2);
      assert.doesNotMatch(result.reply, /C-FABRICATED|9\.999\.999\.999|31\/12\/2099/);
      assert.ok(result.sources.some((source) => source.endpoint === "GET /opportunities"));
      assert.equal(result.context.lastIntent, "suggest_opportunity");
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

  test("audits a deterministic turn even when the CRM provider fails", async () => {
    const conversationId = "deterministic-audit-provider-failure";
    process.env.AI_NATIVE_CORE = "false";
    process.env.CRM_MODE = "sandbox";
    process.env.CRM_API_BASE_URL = "http://127.0.0.1:1";
    process.env.CRM_FALLBACK_TO_MOCK = "false";
    process.env.CRM_TIMEOUT_MS = "100";

    await assert.rejects(
      runAgentTurn({
        conversationId,
        message: "Nhắc khách hàng có tiết kiệm đến hạn",
        identity
      })
    );

    const event = getAuditLogs().find(
      (entry) =>
        entry.conversationId === buildAuditConversationReference(conversationId) &&
        entry.llmProvider === "agent-turn-error"
    );
    assert.equal(event.prompt, "chat-turn");
    assert.equal(event.decision, "deny");
    assert.equal(event.error, "Error");
  });

  test("rejects an over-budget plan without executing a partial plan or synthesis", async () => {
    const conversationId = `ai-native-step-budget-${crypto.randomUUID()}`;
    const proxy = await createProxy([
      {
        intent: "multi-step",
        steps: [
          { tool: "crm_list_customers", input: {} },
          { tool: "crm_list_campaigns", input: {} }
        ],
        responseGoal: "List customers and campaigns."
      },
      { reply: "This synthesis must never run." }
    ]);

    try {
      configureAiCore(proxy.url);
      process.env.AI_AGENT_MAX_STEPS = "1";
      await assert.rejects(
        runAiNativeCore({
          conversationId,
          message: "Tổng hợp khách hàng và chiến dịch",
          identity
        }),
        (error) => error.code === "PLANNER_STEP_BUDGET_EXCEEDED"
      );

      assert.equal(proxy.requests.length, 1);
      assert.match(JSON.stringify(proxy.requests[0]), /between 1 and 1 steps/);
      assert.equal(
        getAuditLogs().filter(
          (event) =>
            event.conversationId === buildAuditConversationReference(conversationId) &&
            event.llmProvider === "mcp-client-observation"
        ).length,
        0
      );
      assert.deepEqual(getConversationContext({ conversationId, identity }), {
        currentModule: "general",
        focusedCustomers: [],
        lastIntent: null
      });
    } finally {
      await proxy.close();
    }
  });

  test("keeps context and its version unchanged when synthesis validation fails", async () => {
    const conversationId = `ai-native-synthesis-failure-${crypto.randomUUID()}`;
    const seededContext = {
      currentModule: "customer-profile",
      focusedCustomers: ["C001"],
      lastIntent: "seed-intent"
    };
    saveConversationContext({ conversationId, identity, context: seededContext });
    const before = getConversationContextSnapshot({ conversationId, identity });
    const proxy = await createProxy([
      {
        intent: "campaign",
        steps: [{ tool: "crm_list_campaigns", input: {} }],
        responseGoal: "List campaigns."
      },
      { reply: "Khách C-FABRICATED có 9.999.999.999 đồng ngày 31/12/2099, tỷ lệ 99%." }
    ]);

    try {
      configureAiCore(proxy.url);
      await assert.rejects(
        runAiNativeCore({
          conversationId,
          message: "Xem chiến dịch phù hợp",
          identity
        }),
        (error) => error.code === "SYNTHESIS_UNGROUNDED_RESPONSE"
      );

      const after = getConversationContextSnapshot({ conversationId, identity });
      assert.deepEqual(after, before);
    } finally {
      await proxy.close();
    }
  });

  for (const failure of [
    { label: "business error", errorCode: "TOOL_BUSINESS_ERROR" },
    { label: "execution error", errorCode: "TOOL_EXECUTION_FAILED" },
    { label: "scope denial", errorCode: "TOOL_SCOPE_DENIED" }
  ]) {
    test(`does not synthesize or commit context after a tool ${failure.label}`, async () => {
      const conversationId = `ai-native-observation-${failure.errorCode}-${crypto.randomUUID()}`;
      const seededContext = {
        currentModule: "customer-profile",
        focusedCustomers: ["C001"],
        lastIntent: "seed-intent"
      };
      saveConversationContext({ conversationId, identity, context: seededContext });
      const before = getConversationContextSnapshot({ conversationId, identity });
      const proxy = await createProxy([
        {
          intent: "campaign",
          steps: [{ tool: "crm_list_campaigns", input: {} }],
          responseGoal: "List campaigns."
        },
        { reply: "This synthesis must never run." }
      ]);
      const session = createObservationFailureSession(failure.errorCode);

      try {
        configureAiCore(proxy.url);
        await assert.rejects(
          runAiNativeCore({
            conversationId,
            message: "Xem chiến dịch phù hợp",
            identity,
            mcpSessionFactory: async () => session
          }),
          (error) =>
            error.code === "AI_TOOL_OBSERVATION_FAILED" &&
            error.observationCode === failure.errorCode
        );

        assert.equal(proxy.requests.length, 1);
        assert.equal(session.callCount, 1);
        assert.equal(session.closed, true);
        const after = getConversationContextSnapshot({ conversationId, identity });
        assert.deepEqual(after, before);
      } finally {
        await proxy.close();
      }
    });
  }

  test("correlates duplicate planned tools to observations by count, order, and input", async () => {
    const plan = {
      intent: "multi-step",
      steps: [
        { tool: "crm_get_customer", input: { name: "Khách A" } },
        { tool: "crm_get_customer", input: { name: "Khách B" } }
      ],
      responseGoal: "Compare two customers."
    };

    await assert.rejects(
      synthesizeAgentTurn({
        message: "So sánh hai khách hàng",
        context: {},
        plan,
        observations: [
          {
            tool: "crm_get_customer",
            input: { name: "Khách B" },
            data: { id: "C002" },
            sources: [{ endpoint: "GET /customers" }]
          },
          {
            tool: "crm_get_customer",
            input: { name: "Khách A" },
            data: { id: "C001" },
            sources: [{ endpoint: "GET /customers" }]
          }
        ]
      }),
      (error) => error.code === "SYNTHESIS_OBSERVATION_MISMATCH"
    );
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

function createObservationFailureSession(errorCode) {
  return {
    callCount: 0,
    closed: false,
    async listTools() {
      return [
        {
          name: "crm_list_campaigns",
          description: "List campaigns.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false }
        }
      ];
    },
    async callTool() {
      this.callCount += 1;
      return {
        status: "error",
        data: null,
        sources: [{ endpoint: "internal://tool-policy" }],
        observedAt: new Date().toISOString(),
        error: "The MCP tool could not complete safely.",
        errorCode
      };
    },
    async close() {
      this.closed = true;
    }
  };
}
