import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { runAgentTurn } from "./services/agentService.js";
import { getAuditLogs } from "./services/auditLogger.js";
import { listAgents } from "./plugins/router.js";
import {
  listCustomers,
  listOpportunities,
  listInteractions,
  listCampaigns
} from "./services/crmService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

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

app.get("/api/crm/customers", (_req, res) => {
  res.json({ data: listCustomers() });
});

app.get("/api/crm/opportunities", (_req, res) => {
  res.json({ data: listOpportunities() });
});

app.get("/api/crm/interactions", (_req, res) => {
  res.json({ data: listInteractions() });
});

app.get("/api/crm/campaigns", (_req, res) => {
  res.json({ data: listCampaigns() });
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

app.listen(port, () => {
  console.log(`CRM MVP running at http://localhost:${port}`);
});
