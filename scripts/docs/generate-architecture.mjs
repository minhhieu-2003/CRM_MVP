// Script to generate the CRM_MVP Architecture Diagram using drawio-ai-kit.
// To be saved at: d:\\ReactNative_Project\\CRM_MVP\\scripts\\generate-architecture.mjs
// Execute with: node scripts/generate-architecture.mjs

import { writeFileSync } from "node:fs";
import { Diagram } from "../../../../drawio-ai-kit-main/drawio-ai-kit-main/src/builder.mjs";
import { group, frame, icon, box, renderTree } from "../../../../drawio-ai-kit-main/drawio-ai-kit-main/src/layout-engine.mjs";

// Initialize diagram. Preset type: network.
const d = new Diagram("network");

// Stage 1: Client UI Layer (Browser)
const clientUI = frame("client_ui", "Client UI (Browser)", { dir: "col", gap: 16, fill: "#F5F8FB", stroke: "#5A6B7B" }, [
  box("index_html", "index.html\n(HTML5 User Interface)"),
  box("app_js", "app.js\n(Fetch API & Event handlers)"),
  box("styles_css", "styles.css\n(CSS Layouts & Styles)")
]);

// Stage 2: API Express Gateway
const apiExpress = frame("api_express", "API Express Gateway", { dir: "col", gap: 16, fill: "#F5F8FB", stroke: "#5A6B7B" }, [
  icon("express_server", "traditional_server", "server.js (Express Server)"),
  box("chat_endpoint", "POST /api/chat\n(Agent Router Entry)"),
  box("crm_endpoints", "GET /api/crm/*\n(Direct CRM Queries)")
]);

// Stage 3: MCP Context Engine Layer
const mcpEngine = frame("mcp_engine", "MCP Context Engine Layer", { dir: "col", gap: 20, fill: "#F5F8FB", stroke: "#5A6B7B" }, [
  box("agent_service", "agentService.js\n(Turn Orchestrator)"),
  group("intent_engine", "group_vpc", "mcpContextEngine.js\n(Rule-based Intent Matching)", { dir: "col", gap: 12 }, [
    box("rules", "Intent Rules & Shortcut Routing\n(1: Reminder, 2: Email, 3: Opps, 4: Campaign)"),
    box("context_store", "Context Store\n(focusedCustomers, lastIntent)")
  ]),
  group("router_group", "group_subnet", "router.js (Agent Registry)", { dir: "col", gap: 12 }, [
    box("smalltalk_agent", "smalltalk-agent"),
    box("capability_agent", "capability-agent"),
    box("llm_fallback_agent", "llm-fallback-agent")
  ])
]);

// Stage 4: CRM Services Layer
const crmServices = frame("crm_services", "CRM Services Layer", { dir: "col", gap: 20, fill: "#F5F8FB", stroke: "#5A6B7B" }, [
  icon("crm_service_js", "server_migration_service", "crmService.js (Drafts & Queries)"),
  group("crm_configs", "group_subnet", "Local Configs & Templates", { dir: "col", gap: 12 }, [
    box("email_templates", "email_templates.json\n(Email Templates)"),
    box("call_scripts", "call_scripts.json\n(Call Scripts)")
  ])
]);

// Stage 5: Database & Logger Layer
const storageLayer = frame("storage_layer", "Database & Logger Layer", { dir: "col", gap: 24, fill: "#F5F8FB", stroke: "#5A6B7B" }, [
  icon("crm_db", "database", "crmData.js (Mock DB Sandbox)"),
  icon("audit_log", "fsx_for_windows_file_server", "audit.log (Audit Logs)")
]);

// Connect everything in a horizontal pipeline layout
const tree = frame("root", "", { dir: "row", gap: 64, align: "center", header: 0, pad: 16, fill: "none", stroke: "none" }, [
  clientUI,
  apiExpress,
  mcpEngine,
  crmServices,
  storageLayer
]);

// Render the tree using layout engine
renderTree(d, tree, [40, 80]);

// Title of the diagram
d.title("CRM_MVP Architecture Diagram (Generated via drawio-ai-kit)");

// Establish connections (Flow links)
// Client -> Express API
d.link("app_js", "chat_endpoint", "REST (JSON)", { flow: true });
d.link("app_js", "crm_endpoints", "REST (JSON)", { flow: true });

// Express API -> agentService / crmService
d.link("chat_endpoint", "agent_service", "Invoke agent turn", { flow: true });
d.link("crm_endpoints", "crm_service_js", "Direct query", { flow: true });

// agentService -> intent engine & fallback router
d.link("agent_service", "intent_engine", "Process & route", { flow: true });
d.link("intent_engine", "router_group", "Fallback dispatch", { flow: true });

// Intent Matching -> crmService / Audit Logs
d.link("intent_engine", "crm_service_js", "Service Query");
d.link("agent_service", "audit_log", "Write audit logs", { flow: true, dash: true });

// Fallback Router Agents -> crmService / LLM API Proxy
d.link("llm_fallback_agent", "crm_service_js", "Context retrieval");

// crmService -> mock db / config templates
d.link("crm_service_js", "crm_db", "Query Database", { flow: true });
d.link("crm_service_js", "email_templates", "Load templates");
d.link("crm_service_js", "call_scripts", "Load scripts");

// Perform self-validation on diagram structure
const res = d.validate();
console.log("Validation Result:", JSON.stringify({
  ok: res.ok,
  errors: res.errors,
  warnings: res.warnings,
  advice: res.audit.advice
}));

// Output the Draw.io file to the target path
const outUrl = new URL("../docs/architecture.drawio", import.meta.url);
writeFileSync(outUrl, d.mxfile("CRM_MVP Architecture Diagram"));
console.log("Success: Architecture diagram generated successfully at docs/architecture.drawio");
