import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import {
  assertIdentityScopes,
  evaluateToolAccess,
  parseEntitlements,
  TOOL_SCOPE_DENIED
} from "../../src/services/toolPolicy.js";

const auditDirectory = mkdtempSync(path.join(tmpdir(), "bankrm-tool-policy-"));
process.env.AUDIT_LOG_DIR = auditDirectory;

after(() => {
  rmSync(auditDirectory, { recursive: true, force: true });
});

test("Tool policy requires ALL scopes and grants wildcard only when explicitly parsed", () => {
  assert.deepEqual(
    evaluateToolAccess({
      entitlements: ["customer:read"],
      requiredScopes: ["customer:read", "communication:draft"]
    }),
    {
      allowed: false,
      missingScopes: ["communication:draft"],
      errorCode: TOOL_SCOPE_DENIED
    }
  );
  assert.equal(
    evaluateToolAccess({
      entitlements: ["customer:read", "communication:draft"],
      requiredScopes: ["customer:read", "communication:draft"]
    }).allowed,
    true
  );
  assert.throws(() => parseEntitlements("*"), /wildcard entitlement/i);
  assert.deepEqual(parseEntitlements("*", { allowWildcard: true }), ["*"]);
});

test("Application policy fails closed for protected identities and accepts only explicit admin wildcard", () => {
  const protectedEnv = { NODE_ENV: "production", AUTH_ENABLED: "true" };
  assert.throws(
    () =>
      assertIdentityScopes({
        identity: { role: "rm" },
        requiredScopes: ["customer:read"],
        env: protectedEnv
      }),
    (error) => error.code === TOOL_SCOPE_DENIED
  );
  assert.throws(
    () =>
      assertIdentityScopes({
        identity: { role: "rm", entitlements: ["*"] },
        requiredScopes: ["customer:read"],
        env: protectedEnv
      }),
    (error) => error.code === TOOL_SCOPE_DENIED
  );
  assert.throws(
    () =>
      assertIdentityScopes({
        identity: { role: "rm", entitlements: ["customer:read"] },
        requiredScopes: ["customer:read", "communication:draft"],
        env: protectedEnv
      }),
    (error) =>
      error.code === TOOL_SCOPE_DENIED && error.missingScopes.includes("communication:draft")
  );
  assert.doesNotThrow(() =>
    assertIdentityScopes({
      identity: { role: "admin", entitlements: ["*"] },
      requiredScopes: ["customer:read", "communication:draft"],
      env: protectedEnv
    })
  );
});

test("Registry denies before input validation/execution and audits a stable code", async () => {
  const { executeAgentTool } = await import("../../src/services/toolRegistry.js");
  const { buildAuditConversationReference, getAuditLogs } =
    await import("../../src/services/auditLogger.js");
  const observation = await executeAgentTool({
    name: "crm_draft_email",
    input: { entitlements: ["*"], identity: { role: "admin" } },
    identity: {
      userId: "limited-rm",
      rmId: "RM01",
      role: "rm",
      branchId: "HN",
      entitlements: ["customer:read"]
    },
    conversationId: "scope-denial-before-input"
  });

  assert.deepEqual(observation.sources, [{ endpoint: "internal://tool-policy" }]);
  assert.equal(observation.status, "error");
  assert.equal(observation.data, null);
  assert.equal(observation.errorCode, TOOL_SCOPE_DENIED);
  const audit = getAuditLogs().find(
    (event) => event.conversationId === buildAuditConversationReference("scope-denial-before-input")
  );
  assert.equal(audit.decision, "deny");
  assert.equal(audit.error, TOOL_SCOPE_DENIED);

  const wildcardEscalation = await executeAgentTool({
    name: "crm_list_customers",
    identity: {
      userId: "wildcard-rm",
      rmId: "RM01",
      role: "rm",
      branchId: "HN",
      entitlements: ["*"]
    },
    conversationId: "non-admin-wildcard"
  });
  assert.equal(wildcardEscalation.status, "error");
  assert.equal(wildcardEscalation.errorCode, "TOOL_IDENTITY_INVALID");
});

test("Registry never interpolates an unknown tool name into audit data", async () => {
  const { executeAgentTool } = await import("../../src/services/toolRegistry.js");
  const { buildAuditConversationReference, getAuditLogs } =
    await import("../../src/services/auditLogger.js");
  const conversationId = "unknown-tool-audit";
  const untrustedToolName = "evil-tool token=raw-secret customer C999 an@example.com";

  await assert.rejects(
    executeAgentTool({
      name: untrustedToolName,
      identity: {
        userId: "limited-rm",
        rmId: "RM01",
        role: "rm",
        branchId: "HN",
        entitlements: ["customer:read"]
      },
      conversationId
    }),
    /Tool is not allowed\./
  );

  const audit = getAuditLogs().find(
    (event) =>
      event.conversationId === buildAuditConversationReference(conversationId) &&
      event.error === "TOOL_NOT_ALLOWED"
  );
  assert.equal(audit.prompt, "tool:rejected");
  assert.doesNotMatch(JSON.stringify(audit), /evil-tool|raw-secret|C999|an@example\.com/);
});
