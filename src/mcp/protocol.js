import { z } from "zod";

const INTERNAL_TOOL_ERROR_SOURCES = Object.freeze([
  "internal://tool-policy",
  "internal://tool-registry",
  "internal://tool-execution"
]);

function sourcePolicy(successSources, requiredScopes, businessErrorSources = successSources) {
  return Object.freeze({
    success: Object.freeze([...successSources]),
    businessError: Object.freeze([...businessErrorSources]),
    error: Object.freeze([...new Set([...successSources, ...INTERNAL_TOOL_ERROR_SOURCES])]),
    requiredScopes: Object.freeze([...requiredScopes])
  });
}

// This client-side catalog is independent from server-advertised metadata. It prevents a
// compromised MCP server from legitimizing a fabricated source by advertising it first.
export const MCP_TRUSTED_TOOL_SOURCE_CATALOG = Object.freeze({
  crm_list_customers: sourcePolicy(["GET /customers"], ["customer:read"]),
  crm_get_customer: sourcePolicy(["GET /customers"], ["customer:read"]),
  crm_customers_due: sourcePolicy(["GET /customers"], ["customer:read"]),
  crm_list_opportunities: sourcePolicy(["GET /opportunities"], ["opportunity:read"]),
  crm_list_interactions: sourcePolicy(["GET /interactions"], ["interaction:read"]),
  crm_list_campaigns: sourcePolicy(["GET /campaigns"], ["campaign:read"]),
  crm_draft_email: sourcePolicy(
    ["GET /customers", "POST /draft-email"],
    ["customer:read", "communication:draft"],
    ["GET /customers"]
  ),
  crm_call_script: sourcePolicy(
    ["GET /customers", "POST /call-script"],
    ["customer:read", "communication:draft"],
    ["GET /customers"]
  )
});

export const McpToolErrorCodeSchema = z.enum([
  "TOOL_IDENTITY_INVALID",
  "TOOL_SCOPE_DENIED",
  "TOOL_INPUT_INVALID",
  "TOOL_BUSINESS_ERROR",
  "TOOL_OBSERVATION_TOO_LARGE",
  "TOOL_EXECUTION_FAILED"
]);

export const ToolSourceSchema = z
  .object({
    endpoint: z.string().trim().min(1).max(500)
  })
  .strict();

export const McpToolObservationSchema = z
  .object({
    status: z.enum(["success", "error"]),
    data: z.unknown(),
    sources: z.array(ToolSourceSchema).min(1),
    observedAt: z.string().datetime({ offset: true }),
    error: z.string().trim().min(1).max(500).optional(),
    errorCode: McpToolErrorCodeSchema.optional()
  })
  .strict()
  .superRefine((observation, context) => {
    if (observation.status === "error") {
      if (observation.data !== null) {
        context.addIssue({
          code: "custom",
          path: ["data"],
          message: "An error observation must use null data."
        });
      }
      if (!observation.error) {
        context.addIssue({
          code: "custom",
          path: ["error"],
          message: "An error observation must include a safe error message."
        });
      }
      if (!observation.errorCode) {
        context.addIssue({
          code: "custom",
          path: ["errorCode"],
          message: "An error observation must include a stable error code."
        });
      }
    }
    if (observation.status === "success") {
      if (observation.error) {
        context.addIssue({
          code: "custom",
          path: ["error"],
          message: "A successful observation cannot include an error."
        });
      }
      if (observation.errorCode) {
        context.addIssue({
          code: "custom",
          path: ["errorCode"],
          message: "A successful observation cannot include an error code."
        });
      }
    }
  });

export function normalizeToolSources(sources = []) {
  const unique = new Map();
  for (const source of sources) {
    const endpoint = typeof source === "string" ? source : source?.endpoint;
    if (typeof endpoint !== "string") continue;
    const normalized = endpoint.trim().slice(0, 500);
    if (normalized && !unique.has(normalized)) unique.set(normalized, { endpoint: normalized });
  }
  return [...unique.values()];
}
