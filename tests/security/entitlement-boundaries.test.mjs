import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import {
  deleteConversationContext,
  getConversationContext
} from "../../src/services/contextManager.js";
import { listCampaigns } from "../../src/services/crmRepository.js";
import { routeConversation } from "../../src/services/mcpContextEngine.js";

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  AUTH_ENABLED: process.env.AUTH_ENABLED,
  CRM_MODE: process.env.CRM_MODE,
  AI_NATIVE_CORE: process.env.AI_NATIVE_CORE
};

before(() => {
  process.env.NODE_ENV = "test";
  process.env.AUTH_ENABLED = "true";
  process.env.CRM_MODE = "mock";
  process.env.AI_NATIVE_CORE = "false";
});

after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("repository and deterministic engine deny before returning campaign data", async () => {
  const identity = {
    userId: "customer-only-policy-test",
    rmId: "RM01",
    role: "rm",
    branchId: "Hà Nội",
    entitlements: ["customer:read"]
  };
  const conversationId = "customer-only-campaign-shortcut";

  await assert.rejects(listCampaigns(identity), (error) => error.code === "TOOL_SCOPE_DENIED");
  const result = await routeConversation({ conversationId, message: "4", identity });
  assert.deepEqual(result.sources, [{ endpoint: "internal://tool-policy" }]);
  assert.equal(result.context.currentModule, "general");
  assert.doesNotMatch(result.reply, /Private Banking|SME|chiến dịch đang chạy/i);
  deleteConversationContext({ conversationId, identity });
});

test("concurrent deterministic turns use CAS and never overwrite the winning context", async () => {
  const identity = {
    userId: "deterministic-cas-test",
    rmId: "RM01",
    role: "rm",
    branchId: "Hà Nội",
    entitlements: ["customer:read", "campaign:read"]
  };
  const conversationId = "deterministic-cas-race";
  deleteConversationContext({ conversationId, identity });

  const results = await Promise.all([
    routeConversation({ conversationId, message: "1", identity }),
    routeConversation({ conversationId, message: "4", identity })
  ]);
  const conflict = results.find((result) =>
    result.sources.some((source) => source.endpoint === "internal://context-conflict")
  );
  const winner = results.find((result) => result !== conflict);

  assert.ok(conflict, "one stale writer must be rejected");
  assert.ok(winner, "one writer must commit");
  assert.deepEqual(
    getConversationContext({ conversationId, identity }),
    winner.context,
    "the stale writer must not replace the committed context"
  );
  deleteConversationContext({ conversationId, identity });
});
