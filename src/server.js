import { timingSafeEqual } from "node:crypto";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { getCrmConfig } from "./services/dbClient.js";
import { runAgentTurn } from "./services/agentService.js";
import { getAuditLogs } from "./services/auditLogger.js";
import { listAgents } from "./plugins/router.js";
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

const identityValueSchema = z.string().trim().min(1).max(128);
const authenticatedIdentitySchema = z
  .object({
    userId: identityValueSchema,
    rmId: identityValueSchema.optional(),
    role: z.enum(["admin", "rm", "user"]),
    branchId: identityValueSchema.optional()
  })
  .superRefine((identity, context) => {
    if (identity.role !== "admin" && (!identity.rmId || !identity.branchId)) {
      context.addIssue({
        code: "custom",
        message: "RM and branch identity are required for non-admin users."
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

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function tokenMatches(suppliedToken, configuredToken) {
  if (!suppliedToken || !configuredToken) return false;
  const expected = Buffer.from(configuredToken);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function resolveAuthenticatedRole(req) {
  const authorization = req.header("Authorization")?.trim();
  if (!authorization?.startsWith("Bearer ")) return null;

  const suppliedToken = authorization.slice("Bearer ".length).trim();
  if (tokenMatches(suppliedToken, process.env.AUTH_ADMIN_TOKEN?.trim())) return "admin";
  if (tokenMatches(suppliedToken, process.env.AUTH_DEMO_TOKEN?.trim())) return "rm";
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

const env = process.env.NODE_ENV || "development";
if ((env === "pilot" || env === "production") && process.env.AUTH_ENABLED !== "true") {
  console.error(
    "FATAL: Khoi dong that bai. AUTH_ENABLED=true is required in pilot/production."
  );
  process.exit(1);
}
if (
  (env === "pilot" || env === "production") &&
  process.env.AUTH_ENABLED === "true" &&
  !process.env.AUTH_DEMO_TOKEN?.trim()
) {
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
      branchId: req.header("X-Branch-Id") || "default"
    };
    return next();
  }

  if (req.path === "/api/health" || !req.path.startsWith("/api/")) return next();
  const authenticatedRole = resolveAuthenticatedRole(req);
  if (!authenticatedRole) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const parsedIdentity = authenticatedIdentitySchema.safeParse({
    userId: req.header("X-User-Id"),
    rmId: req.header("X-RM-Id") || undefined,
    role: authenticatedRole,
    branchId: req.header("X-Branch-Id") || undefined
  });
  if (!parsedIdentity.success) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.identity = parsedIdentity.data;
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
    res.json({ data: await listCustomers(req.identity) });
  })
);

app.get(
  "/api/crm/opportunities",
  asyncRoute(async (req, res) => {
    res.json({ data: await listOpportunities(req.identity) });
  })
);

app.get(
  "/api/crm/interactions",
  asyncRoute(async (req, res) => {
    res.json({ data: await listInteractions(req.identity) });
  })
);

app.get(
  "/api/crm/campaigns",
  asyncRoute(async (req, res) => {
    res.json({ data: await listCampaigns(req.identity) });
  })
);

app.post(
  "/api/draft-email",
  asyncRoute(async (req, res) => {
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
    const request = parseRequest(draftRequestSchema, req.body ?? {}, res);
    if (!request) return;
    const {
      customerId,
      suggestion = "Em co the gui them de xuat san pham phu hop sau cuoc goi."
    } = request;
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
