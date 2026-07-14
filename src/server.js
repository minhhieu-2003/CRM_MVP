import { timingSafeEqual } from "node:crypto";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { getCrmConfig } from "./services/dbClient.js";
import { runAgentTurn } from "./services/agentService.js";
import { getAuditLogs } from "./services/auditLogger.js";
import { assertAuditCorrelationConfigured } from "./services/auditCorrelation.js";
import { listAgents } from "./plugins/router.js";
import {
  DEFAULT_LOCAL_DEMO_ENTITLEMENTS,
  EntitlementsSchema,
  TOOL_SCOPE_DENIED,
  ToolPolicyDeniedError,
  assertIdentityScopes,
  parseEntitlements
} from "./services/toolPolicy.js";
import {
  draftCallScript,
  draftEmailForCustomer,
  getCustomerById,
  listCustomers,
  listOpportunities,
  listInteractions,
  listCampaigns
} from "./services/crmRepository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
let authenticatedDemoIdentity = null;
let authenticatedAdminIdentity = null;
let localDemoEntitlements = DEFAULT_LOCAL_DEMO_ENTITLEMENTS;

const identityValueSchema = z.string().trim().min(1).max(128);
const authenticatedIdentitySchema = z
  .object({
    userId: identityValueSchema,
    rmId: identityValueSchema.optional(),
    role: z.enum(["admin", "rm", "user"]),
    branchId: identityValueSchema.optional(),
    entitlements: EntitlementsSchema
  })
  .superRefine((identity, context) => {
    if (identity.role !== "admin" && (!identity.rmId || !identity.branchId)) {
      context.addIssue({
        code: "custom",
        message: "RM and branch identity are required for non-admin users."
      });
    }
    if (
      identity.role !== "admin" &&
      (identity.rmId?.toLowerCase() === "default" || identity.branchId?.toLowerCase() === "default")
    ) {
      context.addIssue({
        code: "custom",
        message: "Default RM or branch scope is not allowed for authenticated users."
      });
    }
  });
const chatRequestSchema = z.object({
  conversationId: z.string().trim().min(1).max(128).default("default"),
  message: z.string().trim().min(1).max(4000)
});
const draftRequestSchema = z.object({
  customerId: z.string().trim().min(1).max(128),
  suggestion: z.string().trim().min(1).max(4000).optional()
});

const ROUTE_SCOPES = Object.freeze({
  customers: Object.freeze(["customer:read"]),
  opportunities: Object.freeze(["opportunity:read"]),
  interactions: Object.freeze(["interaction:read"]),
  campaigns: Object.freeze(["campaign:read"]),
  drafts: Object.freeze(["customer:read", "communication:draft"])
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function tokenMatches(suppliedToken, configuredToken) {
  if (!suppliedToken || !configuredToken) return false;
  const expected = Buffer.from(configuredToken);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function resolveAuthenticatedIdentity(req) {
  const authorization = req.header("Authorization")?.trim();
  if (!authorization?.startsWith("Bearer ")) return null;

  const suppliedToken = authorization.slice("Bearer ".length).trim();
  if (tokenMatches(suppliedToken, process.env.AUTH_ADMIN_TOKEN?.trim())) {
    return authenticatedAdminIdentity;
  }
  if (tokenMatches(suppliedToken, process.env.AUTH_DEMO_TOKEN?.trim())) {
    return authenticatedDemoIdentity;
  }
  return null;
}

function parseRequest(schema, value, res) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    res.status(400).json({ error: "Du lieu yeu cau khong hop le." });
    return null;
  }
  return parsed.data;
}

function requireRouteScopes(req, requiredScopes) {
  assertIdentityScopes({ identity: req.identity, requiredScopes });
}

const env = (process.env.NODE_ENV || "development").trim().toLowerCase();
if ((env === "pilot" || env === "production") && process.env.AUTH_ENABLED !== "true") {
  console.error("FATAL: Khoi dong that bai. AUTH_ENABLED=true is required in pilot/production.");
  process.exit(1);
}
if (process.env.AUTH_ENABLED === "true" && !process.env.AUTH_DEMO_TOKEN?.trim()) {
  console.error("FATAL: AUTH_DEMO_TOKEN is required when authentication is enabled.");
  process.exit(1);
}
if (
  process.env.AUTH_ADMIN_TOKEN?.trim() &&
  process.env.AUTH_ADMIN_TOKEN.trim() === process.env.AUTH_DEMO_TOKEN?.trim()
) {
  console.error("FATAL: AUTH_ADMIN_TOKEN must differ from AUTH_DEMO_TOKEN.");
  process.exit(1);
}
try {
  localDemoEntitlements = parseEntitlements(process.env.AUTH_LOCAL_DEMO_ENTITLEMENTS, {
    fallback: DEFAULT_LOCAL_DEMO_ENTITLEMENTS,
    requireNonEmpty: true
  });
} catch {
  console.error("FATAL: AUTH_LOCAL_DEMO_ENTITLEMENTS is invalid.");
  process.exit(1);
}
if (process.env.AUTH_ENABLED === "true") {
  let demoEntitlements;
  let adminEntitlements;
  try {
    demoEntitlements = parseEntitlements(process.env.AUTH_DEMO_ENTITLEMENTS, {
      requireNonEmpty: true
    });
    if (process.env.AUTH_ADMIN_TOKEN?.trim()) {
      adminEntitlements = parseEntitlements(process.env.AUTH_ADMIN_ENTITLEMENTS, {
        allowWildcard: true,
        requireNonEmpty: true
      });
    }
  } catch {
    console.error(
      "FATAL: Protected authentication requires valid server-side AUTH_DEMO_ENTITLEMENTS and AUTH_ADMIN_ENTITLEMENTS when an admin token is configured."
    );
    process.exit(1);
  }
  const parsedDemoIdentity = authenticatedIdentitySchema.safeParse({
    userId: process.env.AUTH_DEMO_USER_ID,
    rmId: process.env.AUTH_DEMO_RM_ID,
    role: "rm",
    branchId: process.env.AUTH_DEMO_BRANCH_ID,
    entitlements: demoEntitlements
  });
  if (!parsedDemoIdentity.success) {
    console.error(
      "FATAL: AUTH_DEMO_USER_ID, AUTH_DEMO_RM_ID and AUTH_DEMO_BRANCH_ID must define a valid non-default server-side identity."
    );
    process.exit(1);
  }
  authenticatedDemoIdentity = Object.freeze({
    ...parsedDemoIdentity.data,
    entitlements: Object.freeze([...parsedDemoIdentity.data.entitlements])
  });
  if (process.env.AUTH_ADMIN_TOKEN?.trim()) {
    const parsedAdminIdentity = authenticatedIdentitySchema.safeParse({
      userId: process.env.AUTH_ADMIN_USER_ID?.trim() || "admin",
      role: "admin",
      entitlements: adminEntitlements
    });
    if (!parsedAdminIdentity.success) {
      console.error(
        "FATAL: AUTH_ADMIN_USER_ID and AUTH_ADMIN_ENTITLEMENTS must define a valid server-side admin identity."
      );
      process.exit(1);
    }
    authenticatedAdminIdentity = Object.freeze({
      ...parsedAdminIdentity.data,
      entitlements: Object.freeze([...parsedAdminIdentity.data.entitlements])
    });
  }
}

try {
  assertAuditCorrelationConfigured(process.env);
} catch {
  console.error(
    "FATAL: AUDIT_CORRELATION_KEY must be a dedicated value of at least 32 UTF-8 bytes in protected runtimes."
  );
  process.exit(1);
}

try {
  getCrmConfig();
} catch (error) {
  console.error(`FATAL: Khoi dong CRM that bai. ${error.message}`);
  process.exit(1);
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-User-Id,X-RM-Id,X-Role,X-Branch-Id"
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  if (process.env.AUTH_ENABLED !== "true") {
    req.identity = {
      userId: req.header("X-User-Id") || "default",
      rmId: req.header("X-RM-Id") || "default",
      role: req.header("X-Role") || "user",
      branchId: req.header("X-Branch-Id") || "default",
      entitlements: localDemoEntitlements,
      authMode: "disabled-local-demo"
    };
    return next();
  }

  if (req.path === "/api/health" || !req.path.startsWith("/api/")) return next();
  const authenticatedIdentity = resolveAuthenticatedIdentity(req);
  if (!authenticatedIdentity) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.identity = authenticatedIdentity;
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "crm-ai-agent-mvp" });
});

app.post(
  "/api/chat",
  asyncRoute(async (req, res) => {
    const startedAt = Date.now();
    const request = parseRequest(chatRequestSchema, req.body ?? {}, res);
    if (!request) return;

    const result = await runAgentTurn({ ...request, identity: req.identity });
    res.json({
      ...result,
      latencyMs: Date.now() - startedAt
    });
  })
);

app.get(
  "/api/crm/customers",
  asyncRoute(async (req, res) => {
    requireRouteScopes(req, ROUTE_SCOPES.customers);
    res.json({ data: await listCustomers(req.identity) });
  })
);

app.get(
  "/api/crm/opportunities",
  asyncRoute(async (req, res) => {
    requireRouteScopes(req, ROUTE_SCOPES.opportunities);
    res.json({ data: await listOpportunities(req.identity) });
  })
);

app.get(
  "/api/crm/interactions",
  asyncRoute(async (req, res) => {
    requireRouteScopes(req, ROUTE_SCOPES.interactions);
    res.json({ data: await listInteractions(req.identity) });
  })
);

app.get(
  "/api/crm/campaigns",
  asyncRoute(async (req, res) => {
    requireRouteScopes(req, ROUTE_SCOPES.campaigns);
    res.json({ data: await listCampaigns(req.identity) });
  })
);

app.post(
  "/api/draft-email",
  asyncRoute(async (req, res) => {
    requireRouteScopes(req, ROUTE_SCOPES.drafts);
    const request = parseRequest(draftRequestSchema, req.body ?? {}, res);
    if (!request) return;
    const {
      customerId,
      suggestion = "Em de xuat tu van phuong an tai tuc phu hop voi nhu cau hien tai."
    } = request;
    const customer = await getCustomerById(customerId, req.identity);
    if (!customer) {
      return res.status(404).json({ error: "Khong tim thay khach hang." });
    }

    res.json({ data: await draftEmailForCustomer(customer, suggestion) });
  })
);

app.post(
  "/api/call-script",
  asyncRoute(async (req, res) => {
    requireRouteScopes(req, ROUTE_SCOPES.drafts);
    const request = parseRequest(draftRequestSchema, req.body ?? {}, res);
    if (!request) return;
    const { customerId, suggestion = "Em co the gui them de xuat san pham phu hop sau cuoc goi." } =
      request;
    const customer = await getCustomerById(customerId, req.identity);
    if (!customer) {
      return res.status(404).json({ error: "Khong tim thay khach hang." });
    }

    res.json({ data: await draftCallScript(customer, suggestion) });
  })
);

app.get("/api/audit-logs", (req, res) => {
  if (process.env.AUTH_ENABLED === "true" && req.identity.role !== "admin") {
    return res.status(403).json({ error: "Access denied. Admin only." });
  }
  res.json({ data: getAuditLogs() });
});

app.get("/api/agents", (_req, res) => {
  res.json({ data: listAgents() });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((error, req, res, _next) => {
  void _next;
  if (error instanceof ToolPolicyDeniedError || error?.code === TOOL_SCOPE_DENIED) {
    res.status(403).json({ error: "Forbidden", code: TOOL_SCOPE_DENIED });
    return;
  }
  console.error("HTTP request failed", {
    method: req.method,
    path: req.path,
    type: error?.name
  });
  if (res.headersSent) return;
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Du lieu yeu cau khong hop le." });
    return;
  }
  res.status(500).json({ error: "Khong the xu ly yeu cau." });
});

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  app.listen(port, () => {
    console.log(`CRM MVP running at http://localhost:${port}`);
  });
}

export { app };
