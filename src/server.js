import express from "express";
import path from "path";
import { fileURLToPath } from "url";
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
} from "./services/crmService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "crm-ai-agent-mvp" });
});

app.post("/api/chat", async (req, res) => {
  const startedAt = Date.now();
  const { conversationId = "default", message } = req.body ?? {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message là bắt buộc." });
  }

  try {
    const result = await runAgentTurn({ conversationId, message });
    res.json({
      ...result,
      latencyMs: Date.now() - startedAt
    });
  } catch (error) {
    res.status(500).json({
      error: "Không thể xử lý yêu cầu.",
      detail: error.message
    });
  }
});

app.get("/api/crm/customers", async (_req, res) => {
  res.json({ data: await listCustomers() });
});

app.get("/api/crm/opportunities", async (_req, res) => {
  res.json({ data: await listOpportunities() });
});

app.get("/api/crm/interactions", async (_req, res) => {
  res.json({ data: await listInteractions() });
});

app.get("/api/crm/campaigns", async (_req, res) => {
  res.json({ data: await listCampaigns() });
});

app.post("/api/draft-email", async (req, res) => {
  const { customerId, suggestion = "Em đề xuất tư vấn phương án tái tục phù hợp với nhu cầu hiện tại." } =
    req.body ?? {};
  const customer = await getCustomerById(customerId);
  if (!customer) {
    return res.status(404).json({ error: "Không tìm thấy khách hàng." });
  }

  res.json({ data: await draftEmailForCustomer(customer, suggestion) });
});

app.post("/api/call-script", async (req, res) => {
  const { customerId, suggestion = "Em có thể gửi thêm đề xuất sản phẩm phù hợp sau cuộc gọi." } =
    req.body ?? {};
  const customer = await getCustomerById(customerId);
  if (!customer) {
    return res.status(404).json({ error: "Không tìm thấy khách hàng." });
  }

  res.json({ data: await draftCallScript(customer, suggestion) });
});

app.get("/api/audit-logs", (_req, res) => {
  res.json({ data: getAuditLogs() });
});

app.get("/api/agents", (_req, res) => {
  res.json({ data: listAgents() });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  app.listen(port, () => {
    console.log(`CRM MVP running at http://localhost:${port}`);
  });
}

export { app };
