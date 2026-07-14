import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const targetPath = fileURLToPath(
  new URL("../../docs/architecture/bankrm-copilot-system-architecture.drawio", import.meta.url)
);

const styles = {
  title:
    "text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=26;fontStyle=1;fontColor=#263238;",
  subtitle:
    "text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=15;fontColor=#546E7A;",
  user: "rounded=1;whiteSpace=wrap;html=1;arcSize=12;fillColor=#E3F2FD;strokeColor=#1565C0;strokeWidth=2;fontSize=15;align=center;verticalAlign=middle;spacing=8;",
  api: "rounded=1;whiteSpace=wrap;html=1;arcSize=12;fillColor=#F3E5F5;strokeColor=#6A1B9A;strokeWidth=2;fontSize=15;align=center;verticalAlign=middle;spacing=8;",
  engine:
    "rounded=1;whiteSpace=wrap;html=1;arcSize=12;fillColor=#EDE7F6;strokeColor=#4527A0;strokeWidth=2;fontSize=15;align=center;verticalAlign=middle;spacing=8;",
  crm: "rounded=1;whiteSpace=wrap;html=1;arcSize=12;fillColor=#E8F5E9;strokeColor=#2E7D32;strokeWidth=2;fontSize=15;align=center;verticalAlign=middle;spacing=8;",
  data: "shape=cylinder3d;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#E0F7FA;strokeColor=#00838F;strokeWidth=2;fontSize=15;align=center;verticalAlign=middle;spacing=8;",
  decision:
    "rhombus;whiteSpace=wrap;html=1;fillColor=#FFF8E1;strokeColor=#F9A825;strokeWidth=2;fontSize=15;fontStyle=1;align=center;verticalAlign=middle;spacing=8;",
  audit:
    "rounded=1;whiteSpace=wrap;html=1;arcSize=12;fillColor=#FFF3E0;strokeColor=#EF6C00;strokeWidth=2;fontSize=15;align=center;verticalAlign=middle;spacing=8;",
  fallback:
    "rounded=1;whiteSpace=wrap;html=1;arcSize=12;fillColor=#FFEBEE;strokeColor=#C62828;strokeWidth=2;fontSize=15;align=center;verticalAlign=middle;spacing=8;",
  note: "rounded=1;whiteSpace=wrap;html=1;arcSize=8;fillColor=#FAFAFA;strokeColor=#BDBDBD;strokeWidth=1;fontSize=14;align=left;verticalAlign=top;spacing=10;",
  row: "rounded=1;whiteSpace=wrap;html=1;arcSize=6;fillColor=#FFFFFF;strokeColor=#CFD8DC;strokeWidth=1;fontSize=14;align=left;verticalAlign=middle;spacing=8;",
  header:
    "rounded=1;whiteSpace=wrap;html=1;arcSize=6;fillColor=#ECEFF1;strokeColor=#78909C;strokeWidth=1;fontSize=14;fontStyle=1;align=center;verticalAlign=middle;spacing=8;",
  lane: "rounded=0;whiteSpace=wrap;html=1;fillColor=#FAFAFA;strokeColor=#B0BEC5;strokeWidth=1;fontSize=14;fontStyle=1;align=center;verticalAlign=top;spacingTop=8;",
  anchor: "ellipse;whiteSpace=wrap;html=1;fillColor=none;strokeColor=none;opacity=0;fontSize=1;"
};

const edgeStyles = {
  normal:
    "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;endArrow=block;endFill=1;strokeColor=#546E7A;fontColor=#37474F;fontSize=14;",
  yes: "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;endArrow=block;endFill=1;strokeColor=#2E7D32;fontColor=#2E7D32;fontSize=14;",
  no: "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;endArrow=block;endFill=1;strokeColor=#C62828;fontColor=#C62828;fontSize=14;",
  dashed:
    "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;endArrow=block;endFill=1;dashed=1;strokeColor=#78909C;fontColor=#546E7A;fontSize=14;",
  sequence:
    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;endArrow=block;endFill=1;strokeColor=#455A64;fontColor=#263238;fontSize=14;",
  purple:
    "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;endArrow=block;endFill=1;strokeColor=#6A1B9A;fontColor=#6A1B9A;fontSize=14;",
  orange:
    "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;endArrow=block;endFill=1;strokeColor=#EF6C00;fontColor=#EF6C00;fontSize=14;"
};

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function lines(items) {
  return items.join("<br/>");
}

function cell(id, value, style, x, y, width, height) {
  return `        <mxCell id="${id}" value="${escapeXml(value)}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry" />
        </mxCell>`;
}

function edge(id, source, target, value = "", style = edgeStyles.normal) {
  return `        <mxCell id="${id}" value="${escapeXml(value)}" style="${style}" edge="1" parent="1" source="${source}" target="${target}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`;
}

function routedEdge(id, source, target, value, style, points) {
  const route = points.map(([x, y]) => `<mxPoint x="${x}" y="${y}" />`).join("");
  return `        <mxCell id="${id}" value="${escapeXml(value)}" style="${style}" edge="1" parent="1" source="${source}" target="${target}">
          <mxGeometry relative="1" as="geometry"><Array as="points">${route}</Array></mxGeometry>
        </mxCell>`;
}

function diagram({ id, name, width, height, cells }) {
  return `  <diagram id="${escapeXml(id)}" name="${escapeXml(name)}">
    <mxGraphModel dx="2200" dy="1400" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${height}" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
${cells.join("\n")}
      </root>
    </mxGraphModel>
</diagram>`;
}

function normalizeGeneratedXml(xml) {
  return String(xml).replaceAll("\r\n", "\n").replaceAll("\r", "\n").trimEnd() + "\n";
}

function pageSystemLayers() {
  const cells = [
    cell("l_title", "BankRM Copilot - Tổng Quan Tầng Hệ Thống", styles.title, 40, 20, 1100, 40),
    cell(
      "l_subtitle",
      "AI-native orchestration + MCP-native tool execution + deterministic data scope/fallback",
      styles.subtitle,
      40,
      62,
      1500,
      34
    )
  ];

  const docCyan =
    "shape=document;whiteSpace=wrap;html=1;boundedLbl=1;size=15;fillColor=#E0F7FA;strokeColor=#00838F;strokeWidth=2;fontSize=15;align=center;verticalAlign=middle;spacing=8;";
  const docOrange =
    "shape=document;whiteSpace=wrap;html=1;boundedLbl=1;size=15;fillColor=#FFF3E0;strokeColor=#EF6C00;strokeWidth=2;fontSize=15;align=center;verticalAlign=middle;spacing=8;";
  const cloudGreen =
    "shape=cloud;whiteSpace=wrap;html=1;fillColor=#E8F5E9;strokeColor=#2E7D32;strokeWidth=2;fontSize=15;align=center;verticalAlign=middle;spacing=8;";
  const cloudOrange =
    "shape=cloud;whiteSpace=wrap;html=1;fillColor=#FFF3E0;strokeColor=#EF6C00;strokeWidth=2;fontSize=15;align=center;verticalAlign=middle;spacing=8;";

  // Lane title font = 20
  const zStyle =
    "rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#90A4AE;strokeWidth=2;dashed=1;verticalAlign=top;fontSize=20;fontStyle=1;spacingTop=10;align=left;spacingLeft=10;";
  cells.push(cell("z_mvp", "Current MVP Runtime", zStyle, 40, 120, 1400, 520));
  cells.push(cell("z_db", "Data & DB Layer", zStyle, 40, 680, 1400, 380));
  cells.push(
    cell("z_prod_sec", "Production Target: Security & Governance", zStyle, 1480, 120, 1100, 260)
  );
  cells.push(cell("z_prod_data", "Production Target: Data Stores", zStyle, 1480, 420, 1100, 280));
  cells.push(cell("z_prod_obs", "Production Target: Observability", zStyle, 1480, 740, 1100, 320));

  const legendX = 2250;
  const legendY = 760;
  cells.push(
    cell(
      "leg_box",
      "Legend",
      "rounded=1;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacing=10;fontSize=18;fontStyle=1;fillColor=#FAFAFA;strokeColor=#BDBDBD;",
      legendX,
      legendY,
      250,
      300
    )
  );
  cells.push(cell("leg_ui", "UI / RM", styles.user, legendX + 20, legendY + 50, 210, 30));
  cells.push(cell("leg_api", "API / AI / MCP", styles.engine, legendX + 20, legendY + 90, 210, 30));
  cells.push(cell("leg_crm", "CRM Domain", styles.crm, legendX + 20, legendY + 130, 210, 30));
  cells.push(cell("leg_db", "Data / DB", styles.data, legendX + 20, legendY + 170, 210, 30));
  cells.push(cell("leg_audit", "Audit / Gov", styles.audit, legendX + 20, legendY + 210, 210, 30));
  cells.push(
    cell(
      "leg_txt1",
      "Solid = luồng chính",
      "text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=14;",
      legendX + 20,
      legendY + 250,
      210,
      20
    )
  );
  cells.push(
    cell(
      "leg_txt2",
      "Dashed = target/future",
      "text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=14;",
      legendX + 20,
      legendY + 270,
      210,
      20
    )
  );

  const boxW = 200;
  const boxH = 90;

  // CURRENT MVP RUNTIME
  cells.push(
    cell(
      "c_rm",
      "RM User",
      "shape=umlActor;whiteSpace=wrap;html=1;fillColor=#E3F2FD;strokeColor=#1565C0;strokeWidth=2;fontSize=15;verticalLabelPosition=bottom;verticalAlign=top;align=center;",
      100,
      250,
      50,
      100
    )
  );
  cells.push(cell("c_ui", "Web Chat UI<br/>public/app.js", styles.user, 250, 250, boxW, boxH));
  cells.push(cell("c_api", "POST /api/chat<br/>src/server.js", styles.api, 500, 250, boxW, boxH));
  cells.push(
    cell("c_agent", "Agent Service<br/>agentService.js", styles.engine, 750, 250, boxW, boxH)
  );

  cells.push(
    cell("c_rule", "AI-Native Core<br/>planner + synthesizer", styles.engine, 1000, 170, boxW, boxH)
  );
  cells.push(
    cell(
      "c_decision",
      "MCP Client + Server<br/>initialize / list / call",
      styles.engine,
      1000,
      320,
      boxW,
      boxH
    )
  );
  cells.push(
    cell(
      "c_ext",
      "Deterministic Fallback<br/>mcpContextEngine.js",
      styles.fallback,
      1220,
      320,
      boxW,
      boxH
    )
  );

  cells.push(
    cell("c_registry", "Tool Registry<br/>allowlist + schemas", styles.crm, 980, 450, boxW, 76)
  );
  cells.push(
    cell("c_policy", "Policy / Entitlement<br/>ALL requiredScopes", styles.crm, 1210, 450, boxW, 76)
  );
  cells.push(
    cell(
      "c_observation",
      "Observation Validator<br/>contract + source + time",
      styles.engine,
      980,
      555,
      boxW,
      76
    )
  );
  cells.push(
    cell(
      "c_repo",
      "Application-scoped Repository<br/>RM / branch filtering",
      styles.crm,
      1210,
      555,
      boxW,
      76
    )
  );

  cells.push(
    cell(
      "c_audit",
      "Audit Logger (best-effort)<br/>local NDJSON + memory",
      styles.audit,
      750,
      480,
      boxW,
      boxH
    )
  );

  // DATA & DB LAYER (MVP)
  cells.push(
    cell(
      "d_ctx",
      "Process-local Context Map<br/>TTL + actor isolation<br/>revision + CAS",
      styles.data,
      1220,
      800,
      boxW,
      boxH + 20
    )
  );
  cells.push(
    cell(
      "d_crm",
      "dbClient.js<br/>Mock / SQLite / PostgreSQL / Sandbox",
      docCyan,
      1000,
      800,
      boxW,
      boxH + 20
    )
  );
  cells.push(cell("d_log", "logs/audit.log<br/>Local File", docOrange, 750, 800, boxW, boxH + 20));

  // PRODUCTION TARGET / GOVERNANCE
  // Sec/Gov (Y=200)
  cells.push(cell("t_sso", "SSO / RBAC", styles.user + "dashed=1;", 1550, 200, boxW, boxH));
  cells.push(cell("t_cors", "CORS Allowlist", styles.api + "dashed=1;", 1800, 200, boxW, boxH));
  cells.push(cell("t_pii", "PII Token Vault", styles.engine, 2050, 200, boxW, boxH));
  cells.push(cell("t_llm", "LLM Proxy Policy", styles.engine + "dashed=1;", 2300, 200, boxW, boxH));

  // Data Stores (Y=520)
  cells.push(
    cell(
      "t_redis",
      "Redis / DB Context<br/>distributed CAS + TTL",
      styles.data + "dashed=1;",
      1550,
      520,
      boxW,
      boxH + 20
    )
  );
  cells.push(cell("t_tpl", "Template Store", docCyan + "dashed=1;", 1800, 520, boxW, boxH + 20));
  cells.push(
    cell(
      "t_crmdb",
      "CRM Operational DB/API<br/>query pushdown target",
      cloudGreen + "dashed=1;",
      2050,
      520,
      boxW,
      boxH + 20
    )
  );
  cells.push(
    cell(
      "t_core",
      "Core Banking<br/>API (External)",
      cloudGreen + "dashed=1;",
      2300,
      520,
      boxW,
      boxH + 20
    )
  );

  // Observability (Y=850)
  cells.push(
    cell(
      "t_auditdb",
      "Audit Log Store<br/>SIEM (External)",
      cloudOrange + "dashed=1;",
      1550,
      850,
      boxW,
      boxH + 20
    )
  );
  cells.push(
    cell("t_obs", "Observability<br/>Store", styles.data + "dashed=1;", 1800, 850, boxW, boxH + 20)
  );

  // EDGES - Main Flow
  cells.push(edge("e1", "c_rm", "c_ui"));
  cells.push(edge("e2", "c_ui", "c_api"));
  cells.push(edge("e3", "c_api", "c_agent"));
  cells.push(edge("e4", "c_agent", "c_rule", "AI_NATIVE_CORE=true", edgeStyles.purple));
  cells.push(edge("e5", "c_rule", "c_decision", "plan + MCP session", edgeStyles.purple));
  cells.push(edge("e6", "c_decision", "c_registry", "tools/list + tools/call", edgeStyles.yes));
  cells.push(edge("e14", "c_registry", "c_policy", "filter + re-check", edgeStyles.yes));
  cells.push(edge("e15", "c_policy", "c_repo", "allow", edgeStyles.yes));
  cells.push(edge("e16", "c_repo", "c_observation", "structured result", edgeStyles.yes));
  cells.push(edge("e17", "c_observation", "c_rule", "validated evidence", edgeStyles.yes));
  cells.push(edge("e7", "c_agent", "c_ext", "AI disabled / failed", edgeStyles.no));
  cells.push(edge("e12", "c_ext", "c_policy", "same policy boundary", edgeStyles.no));

  // EDGES - Data access
  cells.push(
    edge(
      "e8",
      "c_rule",
      "d_ctx",
      "snapshot + CAS commit",
      edgeStyles.yes + "exitX=1;exitY=0.5;entryX=0.5;entryY=0;"
    )
  );
  cells.push(edge("e9", "c_repo", "d_crm", "application-scoped read", edgeStyles.yes));

  // EDGES - Audit
  cells.push(edge("e10", "c_agent", "c_audit", "Ghi Log", edgeStyles.orange));
  cells.push(edge("e13", "c_decision", "c_audit", "tool audit + parent mirror", edgeStyles.orange));
  cells.push(edge("e11", "c_audit", "d_log", "Lưu", edgeStyles.orange));

  // EDGES - Target (With Labels)
  cells.push(
    edge(
      "et_ui",
      "c_ui",
      "t_sso",
      "target",
      edgeStyles.dashed + "exitX=0.5;exitY=0;entryX=0;entryY=0.5;"
    )
  );
  cells.push(
    edge(
      "et_api",
      "c_api",
      "t_cors",
      "target",
      edgeStyles.dashed + "exitX=0.5;exitY=0;entryX=0;entryY=0.5;"
    )
  );
  cells.push(
    edge(
      "et_agent",
      "c_rule",
      "t_pii",
      "pre-LLM target",
      edgeStyles.dashed + "exitX=0.5;exitY=0;entryX=0;entryY=0.5;"
    )
  );
  cells.push(
    edge(
      "et_rule",
      "t_pii",
      "t_llm",
      "masked context",
      edgeStyles.dashed + "exitX=1;exitY=0.5;entryX=0;entryY=0.5;"
    )
  );

  cells.push(
    edge(
      "et_ctx",
      "d_ctx",
      "t_redis",
      "target",
      edgeStyles.dashed + "exitX=1;exitY=0.5;entryX=0;entryY=0.5;"
    )
  );
  cells.push(
    edge(
      "et_db",
      "c_repo",
      "t_crmdb",
      "provider pushdown target",
      edgeStyles.dashed + "exitX=1;exitY=0.5;entryX=0;entryY=0.5;"
    )
  );
  cells.push(
    edge(
      "et_core",
      "c_repo",
      "t_core",
      "future",
      edgeStyles.dashed + "exitX=1;exitY=0.5;entryX=0;entryY=0.5;"
    )
  );
  cells.push(
    edge(
      "et_tpl",
      "d_crm",
      "t_tpl",
      "production replacement",
      edgeStyles.dashed + "exitX=1;exitY=0.5;entryX=0;entryY=0.5;"
    )
  );
  cells.push(
    edge(
      "et_log",
      "d_log",
      "t_auditdb",
      "production replacement",
      edgeStyles.dashed + "exitX=1;exitY=0.5;entryX=0;entryY=0.5;"
    )
  );

  return diagram({
    id: "00-system-layers",
    name: "00 Tổng Quan Tầng Hệ Thống",
    width: 2700,
    height: 1200,
    cells
  });
}
function pageWorkflow() {
  const cells = [
    cell(
      "w_title",
      "BankRM Copilot - Deterministic Fallback Workflow",
      styles.title,
      40,
      20,
      1180,
      40
    ),
    cell(
      "w_subtitle",
      "Luồng này chỉ chạy khi AI-native core bị tắt, không khả dụng, sai schema hoặc timeout; không còn là execution path chính.",
      styles.subtitle,
      40,
      62,
      1680,
      34
    ),
    cell("w_rm", "RM nhập câu hỏi tiếng Việt", styles.user, 60, 130, 190, 72),
    cell("w_ui", "Web Chat UI<br/>public/app.js", styles.user, 310, 130, 190, 72),
    cell("w_api", "POST /api/chat<br/>src/server.js", styles.api, 560, 130, 190, 72),
    cell("w_orch", "runAgentTurn()<br/>agentService.js", styles.engine, 810, 130, 210, 72),
    cell(
      "w_engine",
      "Deterministic Fallback<br/>mcpContextEngine.js",
      styles.engine,
      1080,
      130,
      230,
      72
    ),
    cell(
      "w_norm",
      "normalizeVietnamese()<br/>load snapshot + revision",
      styles.engine,
      1370,
      130,
      220,
      72
    ),
    cell("w_decide", "Khớp CRM intent?", styles.decision, 1660, 112, 170, 110),
    cell(
      "w_context",
      lines([
        "Context draft + CAS",
        "currentModule",
        "focusedCustomers",
        "lastIntent",
        "commit after valid response"
      ]),
      styles.note,
      1080,
      250,
      230,
      138
    ),
    cell("w_router", "Intent Router<br/>IF/ELSE rules", styles.engine, 1920, 130, 210, 72),
    cell(
      "w_maturity",
      "1 / nhắc đáo hạn<br/>getMaturityCustomers(7)",
      styles.crm,
      1820,
      280,
      220,
      76
    ),
    cell("w_email", "2 / soạn email<br/>draftEmailForCustomer()", styles.crm, 2080, 280, 220, 76),
    cell(
      "w_opp",
      "3 / gợi ý cơ hội<br/>getCustomerOpportunities()",
      styles.crm,
      2340,
      280,
      230,
      76
    ),
    cell("w_campaign", "4 / chiến dịch<br/>listCampaigns()", styles.crm, 1820, 410, 220, 76),
    cell("w_call", "call script<br/>draftCallScript()", styles.crm, 2080, 410, 220, 76),
    cell(
      "w_customer",
      "Tên khách hàng<br/>profile + opps + interactions",
      styles.crm,
      2340,
      410,
      230,
      76
    ),
    cell(
      "w_policy",
      "Policy / Entitlement<br/>ALL required scopes",
      styles.crm,
      2080,
      545,
      240,
      78
    ),
    cell(
      "w_crm",
      "Application-scoped Repository<br/>crmRepository.js + dbClient.js",
      styles.crm,
      2080,
      675,
      240,
      82
    ),
    cell("w_mock", "Mock CRM data<br/>crmData.js + src/data/mock", styles.data, 1790, 810, 240, 96),
    cell("w_sandbox", "CRM Sandbox API<br/>CRM_MODE=sandbox", styles.data, 2370, 810, 250, 96),
    cell(
      "w_source",
      "Build reply + sources + context<br/>{ reply, sources, context }",
      styles.engine,
      2080,
      950,
      260,
      84
    ),
    cell(
      "w_audit",
      "writeAudit()<br/>auditId, provider, sources, module, latency",
      styles.audit,
      2080,
      1080,
      270,
      88
    ),
    cell(
      "w_response",
      "Response về UI<br/>UI ẩn auditId/module/latencyMs",
      styles.user,
      1370,
      1050,
      260,
      88
    ),
    cell(
      "w_fallback_flag",
      "fallback:true<br/>giữ reply clarification ban đầu",
      styles.fallback,
      1660,
      310,
      210,
      82
    ),
    cell(
      "w_dispatch",
      "dispatchFallback()<br/>plugins/router.js",
      styles.fallback,
      1370,
      470,
      220,
      78
    ),
    cell("w_smalltalk", "smalltalk-agent<br/>chào hỏi/cảm ơn", styles.fallback, 1040, 640, 210, 76),
    cell(
      "w_capability",
      "capability-agent<br/>hỏi agent làm được gì",
      styles.fallback,
      1370,
      640,
      210,
      76
    ),
    cell(
      "w_llm",
      "llm-fallback-agent<br/>configured proxy + policy gate",
      styles.fallback,
      1700,
      640,
      260,
      88
    ),
    cell("w_agent_result", "Agent trả kết quả?", styles.decision, 1385, 795, 180, 108),
    cell(
      "w_static",
      "Không agent nào xử lý<br/>dùng clarification tĩnh",
      styles.fallback,
      1040,
      910,
      230,
      78
    ),
    cell(
      "w_contract",
      lines([
        "Contract bắt buộc",
        "reply: tiếng Việt có dấu",
        "sources: endpoint truy vết",
        "context: module + focusedCustomers + lastIntent"
      ]),
      styles.note,
      2470,
      1010,
      330,
      130
    ),
    edge("we1", "w_rm", "w_ui"),
    edge("we2", "w_ui", "w_api"),
    edge("we3", "w_api", "w_orch"),
    edge("we4", "w_orch", "w_engine", "AI disabled / failed", edgeStyles.no),
    edge("we5", "w_engine", "w_norm"),
    edge("we6", "w_norm", "w_decide"),
    edge("we7", "w_engine", "w_context", "snapshot / draft / CAS", edgeStyles.dashed),
    edge("we8", "w_decide", "w_router", "Có", edgeStyles.yes),
    edge("we9", "w_router", "w_maturity"),
    edge("we10", "w_router", "w_email"),
    edge("we11", "w_router", "w_opp"),
    edge("we12", "w_router", "w_campaign"),
    edge("we13", "w_router", "w_call"),
    edge("we14", "w_router", "w_customer"),
    edge("we15", "w_maturity", "w_policy"),
    edge("we16", "w_email", "w_policy"),
    edge("we17", "w_opp", "w_policy"),
    edge("we18", "w_campaign", "w_policy"),
    edge("we19", "w_call", "w_policy"),
    edge("we20", "w_customer", "w_policy"),
    edge("we39", "w_llm", "w_policy", "scoped evidence", edgeStyles.no),
    edge("we40", "w_policy", "w_crm", "allow", edgeStyles.yes),
    edge("we21", "w_crm", "w_mock", "default"),
    edge("we22", "w_crm", "w_sandbox", "optional", edgeStyles.dashed),
    edge("we23", "w_crm", "w_source"),
    edge("we24", "w_source", "w_audit"),
    edge("we25", "w_audit", "w_response"),
    edge("we26", "w_response", "w_ui", "render reply", edgeStyles.dashed),
    edge("we27", "w_decide", "w_fallback_flag", "Không", edgeStyles.no),
    edge("we28", "w_fallback_flag", "w_dispatch"),
    edge("we29", "w_dispatch", "w_smalltalk", "priority 10"),
    edge("we30", "w_dispatch", "w_capability", "priority 20"),
    edge("we31", "w_dispatch", "w_llm", "priority 90"),
    edge("we32", "w_smalltalk", "w_agent_result"),
    edge("we33", "w_capability", "w_agent_result"),
    edge("we34", "w_llm", "w_agent_result"),
    edge("we35", "w_agent_result", "w_source", "Có", edgeStyles.yes),
    edge("we36", "w_agent_result", "w_static", "Không", edgeStyles.no),
    edge("we37", "w_static", "w_source"),
    edge("we38", "w_source", "w_contract", "schema", edgeStyles.dashed)
  ];

  return diagram({
    id: "01-if-else-workflow",
    name: "01 Deterministic Fallback Workflow",
    width: 2900,
    height: 1250,
    cells
  });
}

function pageIntentMapping() {
  const cells = [
    cell("m_title", "BankRM Copilot - Intent Mapping", styles.title, 40, 20, 900, 40),
    cell(
      "m_subtitle",
      "Các intent demo trọng tâm trong mcpContextEngine.js; product/threshold summary vẫn được test trong CRM scenarios.",
      styles.subtitle,
      40,
      62,
      1300,
      34
    )
  ];

  const columns = [
    { id: "signal", title: "Tín hiệu từ RM", x: 40, w: 310 },
    { id: "intent", title: "Intent / lastIntent", x: 350, w: 270 },
    { id: "context", title: "Context update", x: 620, w: 330 },
    { id: "service", title: "Service gọi trong code", x: 950, w: 360 },
    { id: "sources", title: "sources trả về", x: 1310, w: 340 }
  ];

  for (const col of columns) {
    cells.push(cell(`m_h_${col.id}`, col.title, styles.header, col.x, 120, col.w, 44));
  }

  const rows = [
    [
      "Phím 1 hoặc câu có nhắc + tiết kiệm + đến hạn",
      "maturity-reminder",
      "currentModule=customer-profile<br/>focusedCustomers = khách đáo hạn",
      "getMaturityCustomers(7)",
      "GET /customers"
    ],
    [
      "Hôm nay/ngày nay + khách/chăm sóc/gọi/gặp",
      "today-care-list",
      "currentModule=customer-profile<br/>focusedCustomers = danh sách ưu tiên",
      "getMaturityCustomers(7)",
      "GET /customers"
    ],
    [
      "Phím 2, soạn email, draft, soạn tiếp",
      "email-draft",
      "currentModule=interaction<br/>dùng focusedCustomers hoặc tên khách",
      "resolveTargetCustomers()<br/>draftEmailForCustomer()",
      "GET /customers<br/>POST /draft-email"
    ],
    [
      "Phím 3, cơ hội, opportunity, gợi ý",
      "suggest_opportunity",
      "currentModule=opportunity<br/>focus khách nếu tìm được tên",
      "getCustomerOpportunities()",
      "GET /customers<br/>GET /opportunities"
    ],
    [
      "Phím 4, chiến dịch, campaign",
      "campaign-summary",
      "currentModule=campaign",
      "listCampaigns().filter(status=Active)",
      "GET /campaigns<br/>(+ GET /customers khi có focus)"
    ],
    [
      "call script hoặc kịch bản gọi",
      "call-script",
      "currentModule=interaction<br/>cần target customer",
      "resolveTargetCustomers()<br/>draftCallScript()",
      "GET /customers<br/>POST /call-script"
    ],
    [
      "Tên khách hàng khớp CRM hoặc mẫu khách ...",
      "customer-insight",
      "currentModule=opportunity<br/>focusedCustomers=[customer.id]",
      "getCustomerByName()<br/>getCustomerOpportunities()<br/>getCustomerInteractions()",
      "GET /customers<br/>GET /opportunities<br/>GET /interactions"
    ],
    [
      "Không khớp CRM intent",
      "fallback",
      "currentModule=general<br/>lastIntent=fallback",
      "dispatchFallback()<br/>smalltalk/capability/LLM optional",
      "internal://smalltalk<br/>internal://capability<br/>POST /llm-proxy/chat"
    ]
  ];

  rows.forEach((row, rowIndex) => {
    const y = 164 + rowIndex * 82;
    row.forEach((value, colIndex) => {
      const col = columns[colIndex];
      cells.push(cell(`m_r${rowIndex}_${col.id}`, value, styles.row, col.x, y, col.w, 82));
    });
  });

  cells.push(
    cell(
      "m_note",
      lines([
        "Ghi chú:",
        "- Intent matching luôn chuẩn hóa qua normalizeVietnamese() để hỗ trợ có dấu/không dấu.",
        "- UI không hiển thị raw endpoint; chỉ hiển thị nhãn nguồn thân thiện.",
        "- LLM fallback cần configured URL/key, safe data class và đủ read entitlements."
      ]),
      styles.note,
      40,
      880,
      1610,
      110
    )
  );

  return diagram({
    id: "02-intent-mapping",
    name: "02 Intent Mapping",
    width: 1700,
    height: 1050,
    cells
  });
}

function pageRuntime() {
  const cells = [
    cell("r_title", "BankRM Copilot - Runtime Components", styles.title, 40, 20, 900, 40),
    cell(
      "r_subtitle",
      "Execution path chính: AI Core -> MCP -> Registry -> Entitlement Policy -> Application-scoped Repository; client validates observations.",
      styles.subtitle,
      40,
      62,
      1500,
      34
    ),
    cell(
      "r_frontend",
      "RM Experience<br/>public/index.html<br/>public/app.js",
      styles.user,
      40,
      150,
      230,
      110
    ),
    cell(
      "r_api",
      "API Backend<br/>src/server.js<br/>Express + static hosting",
      styles.api,
      310,
      150,
      250,
      110
    ),
    cell(
      "r_agent",
      "Agent Orchestration<br/>agentService.js<br/>auditId + fallback coordination",
      styles.engine,
      610,
      150,
      300,
      110
    ),
    cell(
      "r_engine",
      "AI-Native Core<br/>planner + synthesizer<br/>snapshot / draft / CAS",
      styles.engine,
      970,
      150,
      300,
      110
    ),
    cell(
      "r_crm",
      "MCP Client<br/>trusted source catalog<br/>strict observation validator",
      styles.crm,
      1330,
      150,
      300,
      110
    ),
    cell(
      "r_server",
      "MCP Stdio Server<br/>server.js<br/>structuredContent",
      styles.crm,
      1680,
      150,
      280,
      110
    ),
    cell(
      "r_mock",
      "Tool Registry<br/>allowlist + schemas<br/>risk metadata",
      styles.crm,
      1330,
      330,
      280,
      110
    ),
    cell(
      "r_sandbox",
      "Policy / Entitlement<br/>filter list + re-check call<br/>ALL requiredScopes",
      styles.crm,
      1680,
      330,
      280,
      110
    ),
    cell(
      "r_repo",
      "Application-scoped Repository<br/>RM/branch filtering<br/>4 configured providers",
      styles.data,
      2010,
      330,
      280,
      110
    ),
    cell(
      "r_router",
      "Multi-Agent Fallback Router<br/>plugins/router.js<br/>priority-based dispatch",
      styles.fallback,
      610,
      500,
      300,
      110
    ),
    cell(
      "r_internal",
      "Internal Agents<br/>smalltalk-agent<br/>capability-agent",
      styles.fallback,
      310,
      650,
      260,
      100
    ),
    cell(
      "r_llm",
      "Configured LLM Proxy<br/>planner + synthesizer + optional fallback<br/>no direct CRM access",
      styles.engine,
      970,
      500,
      300,
      110
    ),
    cell(
      "r_mcp",
      "Deterministic Fallback<br/>mcpContextEngine.js<br/>AI disabled/failed<br/>same policy + repository",
      styles.fallback,
      610,
      330,
      250,
      110
    ),
    cell(
      "r_audit",
      "Audit Logger (best-effort)<br/>child NDJSON + parent mirror<br/>not durable / immutable",
      styles.audit,
      1330,
      500,
      320,
      110
    ),
    cell(
      "r_security",
      lines([
        "Runtime guardrails",
        "identity outside tool arguments",
        "schema + allowlist validation",
        "timeout + concurrency limit",
        "PII masking + audit",
        "deterministic fallback"
      ]),
      styles.note,
      1800,
      650,
      360,
      150
    ),
    edge("re1", "r_frontend", "r_api", "HTTP JSON"),
    edge("re2", "r_api", "r_agent", "POST /api/chat"),
    edge("re3", "r_agent", "r_engine", "AI_NATIVE_CORE=true", edgeStyles.purple),
    edge("re4", "r_engine", "r_crm", "open per-turn session"),
    edge("re14", "r_crm", "r_server", "initialize / list / call", edgeStyles.yes),
    edge("re5", "r_server", "r_mock", "registry dispatch", edgeStyles.yes),
    edge("re6", "r_mock", "r_sandbox", "filter + re-check", edgeStyles.yes),
    edge("re16", "r_sandbox", "r_repo", "allow", edgeStyles.yes),
    edge("re17", "r_repo", "r_crm", "validated structured observation", edgeStyles.yes),
    edge("re7", "r_agent", "r_mcp", "AI disabled / failed", edgeStyles.no),
    edge("re15", "r_mcp", "r_router", "", edgeStyles.no),
    edge("re18", "r_mcp", "r_sandbox", "same policy boundary", edgeStyles.no),
    edge("re8", "r_router", "r_internal", "priority 10/20"),
    edge("re9", "r_router", "r_llm", "priority 90", edgeStyles.dashed),
    edge("re19", "r_llm", "r_sandbox", "fallback evidence policy", edgeStyles.no),
    routedEdge(
      "re11",
      "r_agent",
      "r_audit",
      "final chat audit",
      edgeStyles.orange + "exitX=0.65;exitY=1;entryX=0.5;entryY=1;",
      [
        [800, 300],
        [1250, 300],
        [1250, 620],
        [1490, 620]
      ]
    ),
    routedEdge(
      "re12",
      "r_server",
      "r_audit",
      "MCP child + parent mirror",
      edgeStyles.orange + "exitX=0.5;exitY=1;entryX=1;entryY=0.5;",
      [
        [1650, 290],
        [1650, 555]
      ]
    ),
    edge("re13", "r_engine", "r_llm", "", edgeStyles.dashed)
  ];

  return diagram({
    id: "03-runtime-components",
    name: "03 Runtime Components",
    width: 2350,
    height: 850,
    cells
  });
}

function pageDataLayer() {
  const cells = [
    cell("d_title", "BankRM Copilot - Data & DB Layer", styles.title, 40, 20, 1000, 40),
    cell(
      "d_subtitle",
      "Application policy enforces entitlement + RM/branch scope; provider-side predicate/RLS/query pushdown remains Phase 2.",
      styles.subtitle,
      40,
      62,
      1700,
      34
    ),
    cell("d_current_h", "Current MVP Data Stores", styles.header, 60, 130, 650, 42),
    cell("d_target_h", "Production/Pilot DB Target", styles.header, 940, 130, 760, 42),
    cell(
      "d_policy",
      "Policy / Entitlement<br/>server-bound capabilities",
      styles.crm,
      390,
      210,
      260,
      78
    ),
    cell(
      "d_crm_service",
      "Application-scoped Repository<br/>RM/branch filtering + dbClient",
      styles.crm,
      390,
      320,
      260,
      84
    ),
    cell(
      "d_current_customers",
      "src/services/crmData.js<br/>customers, opportunities,<br/>interactions, campaigns",
      styles.data,
      70,
      220,
      260,
      120
    ),
    cell(
      "d_current_large",
      "src/data/mock/large_*.json<br/>large_customers<br/>large_opportunities<br/>large_interactions",
      styles.data,
      70,
      410,
      260,
      130
    ),
    cell(
      "d_current_templates",
      "src/data/mock/templates<br/>email_templates.json<br/>call_scripts.json",
      styles.data,
      390,
      410,
      260,
      120
    ),
    cell(
      "d_current_audit",
      "child NDJSON<br/>parent memory mirror<br/>200 recent merged via API",
      styles.audit,
      390,
      600,
      260,
      110
    ),
    cell(
      "d_current_context",
      "Process-local Context Map<br/>actor isolation + TTL/bounds<br/>monotonic revision + CAS",
      styles.engine,
      70,
      600,
      260,
      110
    ),
    cell(
      "d_boundary",
      lines([
        "Provider boundary hiện tại",
        "- Hỗ trợ Mock, SQLite, PostgreSQL, Sandbox",
        "- Pilot/production từ chối Mock",
        "- Không implicit fallback giữa providers",
        "- Query scope/page pushdown: Phase 2"
      ]),
      styles.note,
      60,
      770,
      650,
      140
    ),
    cell(
      "d_prod_crm",
      "CRM Operational DB/API<br/>query scope/cursor pushdown",
      styles.data,
      980,
      220,
      250,
      96
    ),
    cell(
      "d_prod_core",
      "Core Banking / Deposit API<br/>sản phẩm tiết kiệm, đáo hạn, số dư",
      styles.data,
      1320,
      220,
      280,
      110
    ),
    cell(
      "d_prod_redis",
      "Redis / Session DB<br/>distributed CAS + context TTL",
      styles.data,
      980,
      410,
      250,
      100
    ),
    cell(
      "d_prod_audit",
      "Audit Log Store / SIEM<br/>immutable logs + retention",
      styles.audit,
      1320,
      410,
      280,
      100
    ),
    cell(
      "d_prod_template",
      "Template / Config Store<br/>email, call script, policy config",
      styles.data,
      980,
      610,
      250,
      105
    ),
    cell(
      "d_prod_observability",
      "Observability Store<br/>metrics, traces, errors, latency",
      styles.audit,
      1320,
      610,
      280,
      105
    ),
    cell("d_entities_h", "Logical CRM Entities", styles.header, 60, 960, 1640, 42)
  ];

  const entityColumns = [
    { id: "entity", title: "Entity / Table", x: 60, w: 240 },
    { id: "purpose", title: "Vai trò", x: 300, w: 420 },
    { id: "source", title: "Current source", x: 720, w: 360 },
    { id: "target", title: "Production target", x: 1080, w: 620 }
  ];

  entityColumns.forEach((col) => {
    cells.push(cell(`d_eh_${col.id}`, col.title, styles.header, col.x, 1015, col.w, 40));
  });

  const entityRows = [
    [
      "customers",
      "Hồ sơ khách hàng, segment, sản phẩm tiết kiệm",
      "crmData.js + large_customers.json",
      "CRM customer/profile DB hoặc CRM customer API"
    ],
    [
      "opportunities",
      "Cơ hội bán chéo, score, estimated value",
      "crmData.js + large_opportunities.json",
      "CRM opportunity DB hoặc sales pipeline API"
    ],
    [
      "interactions",
      "Lịch sử chăm sóc, RM notes, follow-up",
      "crmData.js + large_interactions.json",
      "CRM interaction/activity DB"
    ],
    [
      "campaigns",
      "Chiến dịch đang chạy, target segment",
      "crmData.js",
      "Marketing campaign DB/API"
    ],
    [
      "templates",
      "Email follow-up và call script",
      "email_templates.json + call_scripts.json",
      "Template/config repository có versioning"
    ],
    [
      "conversation_context",
      "currentModule, focusedCustomers, lastIntent",
      "Process-local Map + TTL/bounds + revision/CAS",
      "Redis/DB với TTL + distributed CAS"
    ],
    [
      "audit_events",
      "auditId, prompt, provider, sources, module, latency",
      "logs/audit.log + in-memory recent logs",
      "Immutable audit DB/SIEM/log platform"
    ]
  ];

  entityRows.forEach((row, rowIndex) => {
    const y = 1055 + rowIndex * 70;
    row.forEach((value, colIndex) => {
      const col = entityColumns[colIndex];
      cells.push(cell(`d_er${rowIndex}_${col.id}`, value, styles.row, col.x, y, col.w, 70));
    });
  });

  cells.push(
    edge("de0", "d_policy", "d_crm_service", "allow all required scopes", edgeStyles.yes),
    edge("de1", "d_current_customers", "d_crm_service", "mock provider"),
    edge("de2", "d_current_large", "d_crm_service", "bounded mock data"),
    edge("de3", "d_current_templates", "d_crm_service", "draft content"),
    edge("de4", "d_crm_service", "d_current_audit", "sources used", edgeStyles.dashed),
    edge("de5", "d_crm_service", "d_prod_crm", "provider pushdown target", edgeStyles.dashed),
    edge("de6", "d_crm_service", "d_prod_core", "external banking data", edgeStyles.dashed),
    edge("de7", "d_current_context", "d_prod_redis", "production replacement", edgeStyles.dashed),
    edge("de8", "d_current_audit", "d_prod_audit", "production replacement", edgeStyles.dashed),
    edge("de9", "d_current_templates", "d_prod_template", "versioned templates", edgeStyles.dashed),
    edge("de10", "d_prod_audit", "d_prod_observability", "metrics + alerts", edgeStyles.dashed)
  );

  return diagram({
    id: "04-data-db-layer",
    name: "04 Data & DB Layer",
    width: 1760,
    height: 1600,
    cells
  });
}

function pageCyberSecurityProcess() {
  const cells = [
    cell("sec_title", "BankRM Copilot - Cyber Security Process", styles.title, 40, 20, 1100, 40),
    cell(
      "sec_subtitle",
      "Security lifecycle theo NIST CSF 2.0: Govern -> Identify -> Protect -> Detect -> Respond -> Recover.",
      styles.subtitle,
      40,
      62,
      1700,
      34
    )
  ];

  const stepStyle =
    "rounded=1;whiteSpace=wrap;html=1;arcSize=10;fillColor=#EDE7F6;strokeColor=#4527A0;strokeWidth=2;fontSize=15;fontStyle=1;align=center;verticalAlign=middle;spacing=8;";
  const controlStyle =
    "rounded=1;whiteSpace=wrap;html=1;arcSize=8;fillColor=#F3E5F5;strokeColor=#6A1B9A;strokeWidth=2;fontSize=13;align=center;verticalAlign=middle;spacing=8;";
  const registerStyle =
    "shape=document;whiteSpace=wrap;html=1;boundedLbl=1;size=15;fillColor=#FFF3E0;strokeColor=#EF6C00;strokeWidth=2;fontSize=13;align=center;verticalAlign=middle;spacing=8;";
  const incidentStyle =
    "rounded=1;whiteSpace=wrap;html=1;arcSize=8;fillColor=#FFEBEE;strokeColor=#C62828;strokeWidth=2;fontSize=13;align=center;verticalAlign=middle;spacing=8;";

  const steps = [
    ["sec_gv", "1. Govern<br/>Policy + roles", 70],
    ["sec_id", "2. Identify<br/>Assets + risks", 330],
    ["sec_pr", "3. Protect<br/>Controls", 590],
    ["sec_de", "4. Detect<br/>Monitoring", 850],
    ["sec_rs", "5. Respond<br/>Incident runbook", 1110],
    ["sec_rc", "6. Recover<br/>Restore + improve", 1370]
  ];

  steps.forEach(([id, label, x]) => {
    cells.push(cell(id, label, stepStyle, x, 150, 200, 76));
  });

  for (let i = 0; i < steps.length - 1; i += 1) {
    cells.push(edge(`secp_${i}`, steps[i][0], steps[i + 1][0], "", edgeStyles.purple));
  }
  cells.push(edge("secp_loop", "sec_rc", "sec_gv", "lessons learned", edgeStyles.dashed));

  cells.push(
    cell("sec_policy", "Security Policy<br/>Risk Appetite", controlStyle, 70, 300, 200, 76),
    cell("sec_inventory", "Asset Inventory<br/>Data-flow Map", controlStyle, 330, 300, 200, 76),
    cell(
      "sec_access",
      "[TARGET] SSO/RBAC<br/>CORS allowlist",
      controlStyle + "dashed=1;",
      590,
      300,
      200,
      76
    ),
    cell(
      "sec_masking",
      "[CURRENT] PII token vault<br/>[TARGET] host / mTLS + DLP",
      controlStyle,
      590,
      410,
      200,
      76
    ),
    cell(
      "sec_monitor",
      "[TARGET] Audit + SIEM<br/>Anomaly rules",
      controlStyle + "dashed=1;",
      850,
      300,
      200,
      76
    ),
    cell("sec_alert", "Security Event<br/>Threshold alert", incidentStyle, 850, 410, 200, 76),
    cell("sec_disable", "Disable LLM<br/>Revoke key", incidentStyle, 1110, 300, 200, 76),
    cell("sec_isolate", "Isolate session<br/>Notify owner", incidentStyle, 1110, 410, 200, 76),
    cell("sec_restore", "Restore service<br/>Rotate secrets", controlStyle, 1370, 300, 200, 76),
    cell("sec_post", "Post-incident<br/>Backlog update", controlStyle, 1370, 410, 200, 76),
    edge("sec_e1", "sec_gv", "sec_policy", "evidence", edgeStyles.dashed),
    edge("sec_e2", "sec_id", "sec_inventory", "evidence", edgeStyles.dashed),
    edge("sec_e3", "sec_pr", "sec_access", "target", edgeStyles.dashed),
    edge("sec_e4", "sec_pr", "sec_masking", "target", edgeStyles.dashed),
    edge("sec_e5", "sec_de", "sec_monitor", "target", edgeStyles.dashed),
    edge("sec_e6", "sec_monitor", "sec_alert", "detect", edgeStyles.orange),
    edge("sec_e7", "sec_rs", "sec_disable", "contain", edgeStyles.no),
    edge("sec_e8", "sec_rs", "sec_isolate", "triage", edgeStyles.no),
    edge("sec_e9", "sec_rc", "sec_restore", "recover", edgeStyles.yes),
    edge("sec_e10", "sec_rc", "sec_post", "improve", edgeStyles.dashed)
  );

  cells.push(
    cell("sec_reg_h", "Security Registers", styles.header, 70, 560, 1500, 42),
    cell("sec_reg1", "Risk Register", registerStyle, 100, 640, 190, 80),
    cell("sec_reg2", "Asset Register", registerStyle, 330, 640, 190, 80),
    cell("sec_reg3", "Access Review<br/>Register", registerStyle, 560, 640, 190, 80),
    cell("sec_reg4", "Security Event<br/>Register", registerStyle, 790, 640, 190, 80),
    cell("sec_reg5", "Incident<br/>Register", registerStyle, 1020, 640, 190, 80),
    cell("sec_reg6", "Recovery<br/>Register", registerStyle, 1250, 640, 190, 80),
    edge("sec_r1", "sec_policy", "sec_reg1", "", edgeStyles.orange),
    edge("sec_r2", "sec_inventory", "sec_reg2", "", edgeStyles.orange),
    edge("sec_r3", "sec_access", "sec_reg3", "", edgeStyles.orange),
    edge("sec_r4", "sec_alert", "sec_reg4", "", edgeStyles.orange),
    edge("sec_r5", "sec_isolate", "sec_reg5", "", edgeStyles.orange),
    edge("sec_r6", "sec_post", "sec_reg6", "", edgeStyles.orange)
  );

  cells.push(
    cell(
      "sec_note",
      lines([
        "Current Phase 1 controls",
        "- Server-bound entitlements; ALL required scopes",
        "- Re-check at MCP/routes/repository/fallback",
        "- Strict observation + context CAS",
        "- PII token vault; keyed HMAC conversation ref; legacy read sanitization",
        "- Configured proxy gate; audit best-effort local",
        "Targets: SSO, host/mTLS, DLP/NER, immutable SIEM"
      ]),
      styles.note,
      1620,
      150,
      330,
      220
    )
  );

  return diagram({
    id: "06-cyber-security-process",
    name: "06 Cyber Security Process",
    width: 2000,
    height: 820,
    cells
  });
}

function pageMemoryRegisterOptimization() {
  const cells = [
    cell(
      "mem_title",
      "BankRM Copilot - Memory & Register Optimization",
      styles.title,
      40,
      20,
      1300,
      40
    ),
    cell(
      "mem_subtitle",
      "Tối ưu memory runtime, context state, cache dữ liệu và audit register cho production readiness.",
      styles.subtitle,
      40,
      62,
      1700,
      34
    )
  ];

  const currentStyle =
    "rounded=1;whiteSpace=wrap;html=1;arcSize=8;fillColor=#E3F2FD;strokeColor=#1565C0;strokeWidth=2;fontSize=13;align=center;verticalAlign=middle;spacing=8;";
  const targetStoreStyle =
    "shape=cylinder3d;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#E0F7FA;strokeColor=#00838F;strokeWidth=2;fontSize=13;align=center;verticalAlign=middle;spacing=8;";
  const registerStyle =
    "shape=document;whiteSpace=wrap;html=1;boundedLbl=1;size=15;fillColor=#FFF3E0;strokeColor=#EF6C00;strokeWidth=2;fontSize=13;align=center;verticalAlign=middle;spacing=8;";
  const guardStyle =
    "rounded=1;whiteSpace=wrap;html=1;arcSize=8;fillColor=#E8F5E9;strokeColor=#2E7D32;strokeWidth=2;fontSize=13;align=center;verticalAlign=middle;spacing=8;";

  cells.push(
    cell("mem_z1", "Current Memory Hotspots", styles.header, 50, 130, 520, 42),
    cell("mem_z2", "Optimization Controls", styles.header, 660, 130, 520, 42),
    cell("mem_z3", "Target Stores / Registers", styles.header, 1270, 130, 520, 42)
  );

  cells.push(
    cell(
      "mem_ctx",
      "Process-local Context Map<br/>TTL/bounds + revision/CAS",
      currentStyle,
      80,
      220,
      210,
      80
    ),
    cell("mem_cache", "CRM cached arrays<br/>customers/opps/logs", currentStyle, 330, 220, 210, 80),
    cell("mem_recent", "inMemoryLogs<br/>200 recent events", currentStyle, 80, 360, 210, 80),
    cell("mem_llm", "LLM CRM context<br/>large prompt risk", currentStyle, 330, 360, 210, 80),
    cell(
      "mem_measure",
      "[TARGET] Metrics<br/>size + latency",
      guardStyle + "dashed=1;",
      710,
      200,
      190,
      70
    ),
    cell("mem_limit", "Current limits<br/>focus + plan budget", guardStyle, 950, 200, 190, 70),
    cell("mem_ttl", "Current TTL + CAS<br/>snapshot revision", guardStyle, 710, 320, 190, 70),
    cell("mem_mask", "Current PII token vault<br/>before LLM", guardStyle, 950, 320, 190, 70),
    cell(
      "mem_alert",
      "[TARGET] Alert<br/>memory spike",
      guardStyle + "dashed=1;",
      830,
      440,
      190,
      70
    ),
    cell("mem_redis", "Redis / DB<br/>distributed CAS + TTL", targetStoreStyle, 1300, 210, 210, 90),
    cell("mem_db", "CRM DB/API<br/>paging + index", targetStoreStyle, 1550, 210, 210, 90),
    cell("mem_audit", "Audit Register<br/>SIEM/log store", registerStyle, 1300, 370, 210, 90),
    cell(
      "mem_template",
      "Template Store<br/>versioned config",
      targetStoreStyle,
      1550,
      370,
      210,
      90
    )
  );

  cells.push(
    edge("mem_e1", "mem_ctx", "mem_measure", "target telemetry", edgeStyles.dashed),
    edge("mem_e2", "mem_cache", "mem_measure", "cacheHit/miss", edgeStyles.purple),
    edge("mem_e3", "mem_recent", "mem_measure", "event count", edgeStyles.orange),
    edge("mem_e4", "mem_llm", "mem_measure", "token budget", edgeStyles.purple),
    edge("mem_e5", "mem_measure", "mem_limit", "target signal", edgeStyles.dashed),
    edge("mem_e6", "mem_limit", "mem_ttl", "bounded state", edgeStyles.yes),
    edge("mem_e7", "mem_ttl", "mem_mask", "target", edgeStyles.dashed),
    edge("mem_e8", "mem_mask", "mem_alert", "target", edgeStyles.dashed),
    edge("mem_e9", "mem_ctx", "mem_redis", "production replacement", edgeStyles.dashed),
    edge("mem_e10", "mem_cache", "mem_db", "paging/index", edgeStyles.dashed),
    edge("mem_e11", "mem_recent", "mem_audit", "immutable register", edgeStyles.dashed),
    edge("mem_e12", "mem_llm", "mem_template", "versioned prompt policy", edgeStyles.dashed)
  );

  const cols = [
    { id: "field", title: "Audit Register Field", x: 60, w: 300 },
    { id: "purpose", title: "Purpose", x: 360, w: 420 },
    { id: "memory", title: "Memory Metric", x: 780, w: 360 },
    { id: "control", title: "Control", x: 1140, w: 600 }
  ];

  cells.push(cell("mem_tbl_h", "Audit Register Schema", styles.header, 60, 580, 1680, 42));
  cols.forEach((col) => {
    cells.push(cell(`mem_h_${col.id}`, col.title, styles.header, col.x, 635, col.w, 38));
  });

  const rows = [
    ["auditId/timestamp", "Trace immutable event", "-", "Generated per turn/tool/security event"],
    [
      "actorId/conversationRef",
      "Bind event without raw client ID",
      "contextSize",
      "TTL + session cleanup"
    ],
    ["action/provider/module", "Explain decision path", "latencyMs", "Alert on slow path"],
    ["sources/dataClass", "Trace CRM/data usage", "cacheHit", "Avoid full reload"],
    ["piiMasked/decision", "Security evidence", "focusedCustomerCount", "Max list size + masking"]
  ];

  rows.forEach((row, rowIndex) => {
    const y = 673 + rowIndex * 58;
    row.forEach((value, colIndex) => {
      const col = cols[colIndex];
      cells.push(cell(`mem_r${rowIndex}_${col.id}`, value, styles.row, col.x, y, col.w, 58));
    });
  });

  return diagram({
    id: "07-memory-register-optimization",
    name: "07 Memory & Register Optimization",
    width: 1820,
    height: 1020,
    cells
  });
}

function pageDemoSequences() {
  const cells = [
    cell("s_title", "BankRM Copilot - Demo Sequence Flows", styles.title, 40, 20, 1000, 40),
    cell(
      "s_subtitle",
      "Hai luồng demo tóm tắt; xem page 09 để kiểm tra initialize, tools/list, audit, synthesis và close/fallback chi tiết.",
      styles.subtitle,
      40,
      62,
      1300,
      34
    )
  ];

  const lanes = [
    ["s_rm", "RM", 60],
    ["s_ui", "UI", 310],
    ["s_api", "Express API", 560],
    ["s_engine", "AI Core / Planner + Synthesizer", 810],
    ["s_crm", "MCP -> Registry -> Policy -> Repository", 1090],
    ["s_audit", "Audit", 1380]
  ];
  const laneCenters = Object.fromEntries(lanes.map(([id, , x]) => [id, x + 95]));

  function addSequenceStep(id, fromLane, toLane, y, label) {
    const from = `${id}_from`;
    const to = `${id}_to`;
    cells.push(
      cell(from, "", styles.anchor, laneCenters[fromLane], y, 2, 2),
      cell(to, "", styles.anchor, laneCenters[toLane], y, 2, 2),
      edge(id, from, to, label, edgeStyles.sequence)
    );
  }

  lanes.forEach(([id, label, x]) => {
    cells.push(cell(id, label, styles.lane, x, 130, 190, 760));
  });

  cells.push(
    cell(
      "s_s1",
      "Scenario 1 - RM hỏi: Nhắc tôi khách hàng có tiết kiệm đến hạn trong tuần này",
      styles.header,
      60,
      110,
      1510,
      38
    )
  );

  addSequenceStep("se1", "s_rm", "s_ui", 210, "1. nhập prompt");
  addSequenceStep("se2", "s_ui", "s_api", 250, "2. POST /api/chat");
  addSequenceStep("se3", "s_api", "s_engine", 290, "3. runAgentTurn()");
  addSequenceStep("se4", "s_engine", "s_crm", 330, "4. tools/call crm_customers_due");
  addSequenceStep("se5", "s_crm", "s_engine", 370, "5. validated observation + trusted sources");
  addSequenceStep("se6", "s_engine", "s_audit", 410, "6. writeAudit()");
  addSequenceStep("se7", "s_engine", "s_api", 450, "7. reply + sources + context");
  addSequenceStep("se8", "s_api", "s_ui", 490, "8. response + latencyMs");
  addSequenceStep("se9", "s_ui", "s_rm", 530, "9. render reply + nhãn nguồn CRM");

  cells.push(
    cell(
      "s_state1",
      lines([
        "Context sau scenario 1",
        "currentModule = customer-profile",
        "lastIntent = maturity-reminder",
        "focusedCustomers = danh sách khách đáo hạn"
      ]),
      styles.note,
      1660,
      190,
      330,
      120
    ),
    cell(
      "s_s2",
      "Scenario 2 - RM hỏi nối tiếp: Soạn email cho nhóm này",
      styles.header,
      60,
      460,
      1510,
      38
    )
  );

  addSequenceStep("se10", "s_rm", "s_ui", 560, "1. nhập prompt nối tiếp");
  addSequenceStep("se11", "s_ui", "s_api", 600, "2. POST /api/chat");
  addSequenceStep("se12", "s_api", "s_engine", 640, "3. load focusedCustomers");
  addSequenceStep("se13", "s_engine", "s_crm", 680, "4. tools/call crm_draft_email");
  addSequenceStep("se14", "s_crm", "s_engine", 720, "5. validated observation + sources");
  addSequenceStep("se15", "s_engine", "s_audit", 760, "6. audit sources");
  addSequenceStep("se16", "s_engine", "s_api", 800, "7. email draft response");
  addSequenceStep("se17", "s_api", "s_ui", 840, "8. response");
  addSequenceStep("se18", "s_ui", "s_rm", 880, "9. render email");

  cells.push(
    cell(
      "s_state2",
      lines([
        "Sources scenario 2",
        "GET /customers",
        "POST /draft-email",
        "UI chỉ hiển thị: Đã tham chiếu CRM nội bộ"
      ]),
      styles.note,
      1660,
      540,
      330,
      120
    )
  );

  return diagram({
    id: "08-demo-sequences",
    name: "08 Demo Sequence Flows",
    width: 2050,
    height: 950,
    cells
  });
}

function pageAiNativeTurnSequence() {
  const cells = [
    cell(
      "a_title",
      "BankRM Copilot - Detailed AI-Native Turn Sequence",
      styles.title,
      40,
      20,
      1200,
      40
    ),
    cell(
      "a_subtitle",
      "Current Phase 1 ordering: bounded plan, policy-checked tools, validated evidence, grounded reply and CAS context commit.",
      styles.subtitle,
      40,
      62,
      1500,
      34
    )
  ];

  const lanes = [
    ["a_rm", "RM", 40, 150],
    ["a_ui", "UI", 220, 150],
    ["a_api", "Express API + AgentService", 400, 190],
    ["a_ai", "AI-Native Core", 620, 190],
    ["a_llm", "Configured LLM Proxy", 840, 190],
    ["a_mcp", "MCP Client/Server<br/>Registry + Policy + Repository", 1060, 220],
    ["a_ctx", "Context Manager", 1310, 180],
    ["a_audit", "Audit (best-effort)", 1520, 180]
  ];
  const laneBounds = Object.fromEntries(lanes.map(([id, , x, width]) => [id, { x, width }]));
  const laneCenters = Object.fromEntries(lanes.map(([id, , x, width]) => [id, x + width / 2]));

  function addStep(id, fromLane, toLane, y, label, style = edgeStyles.sequence) {
    const from = `${id}_from`;
    const to = `${id}_to`;
    cells.push(
      cell(from, "", styles.anchor, laneCenters[fromLane], y, 2, 2),
      cell(to, "", styles.anchor, laneCenters[toLane], y, 2, 2),
      edge(id, from, to, label, style)
    );
  }

  function addInternalStep(id, lane, y, label, style = edgeStyles.sequence) {
    const from = `${id}_from`;
    const to = `${id}_to`;
    const { x, width } = laneBounds[lane];
    cells.push(
      cell(from, "", styles.anchor, x + 25, y, 2, 2),
      cell(to, "", styles.anchor, x + width - 25, y, 2, 2),
      edge(id, from, to, label, style)
    );
  }

  lanes.forEach(([id, label, x, width]) => {
    cells.push(cell(id, label, styles.lane, x, 130, width, 1210));
  });

  cells.push(
    cell(
      "a_turn_header",
      "snapshot -> MCP discovery -> bounded plan -> policy calls -> strict observations -> grounded synthesis -> CAS",
      styles.header,
      40,
      110,
      1650,
      38
    )
  );

  addStep("ae1", "a_rm", "a_ui", 180, "1. nhập prompt tiếng Việt");
  addStep("ae2", "a_ui", "a_api", 220, "2. POST /api/chat");
  addStep("ae3", "a_api", "a_ai", 260, "3. resolve identity + server-bound entitlements");
  addStep("ae4", "a_ai", "a_ctx", 300, "4. immutable context snapshot + revision");
  addStep("ae5", "a_ai", "a_mcp", 340, "5. spawn child + MCP initialize");
  addStep("ae6", "a_mcp", "a_ai", 380, "6. entitlement-filtered tools/list + schemas");
  addStep("ae7", "a_ai", "a_llm", 420, "7. planner request + maxSteps");
  addStep("ae8", "a_llm", "a_ai", 460, "8. strict plan JSON");
  addInternalStep("ae9", "a_ai", 500, "9. validate tool/input/plan budget; no truncation");
  addStep("ae10", "a_ai", "a_audit", 540, "10. planner audit", edgeStyles.orange);
  addStep("ae11", "a_ai", "a_mcp", 580, "11. bounded tools/call loop");
  addInternalStep(
    "ae12",
    "a_mcp",
    620,
    "12. ALL scopes before input parse / executor",
    edgeStyles.yes
  );
  addStep("ae13", "a_mcp", "a_audit", 660, "13. registry child audit", edgeStyles.orange);
  addStep("ae14", "a_mcp", "a_ai", 700, "14. strict status/data/errorCode/source/time validation");
  addStep("ae15", "a_ai", "a_audit", 740, "15. parent observation mirror", edgeStyles.orange);
  addInternalStep("ae16", "a_ai", 780, "16. derive nextContext draft; no write");
  addStep("ae17", "a_ai", "a_llm", 820, "17. PII-tokenized synthesis evidence");
  addStep("ae18", "a_llm", "a_ai", 860, "18. strict reply JSON");
  addInternalStep("ae19", "a_ai", 900, "19. typed sensitive-claim grounding");
  addInternalStep("ae20", "a_ai", 940, "20. code-owned sources from observations");
  addStep("ae21", "a_ai", "a_ctx", 980, "21. CAS commit with snapshot revision", edgeStyles.yes);
  addStep("ae22", "a_ai", "a_mcp", 1020, "22. close MCP session in finally");
  addStep("ae23", "a_ai", "a_api", 1060, "23. return response or throw to fallback");
  addStep("ae24", "a_api", "a_audit", 1100, "24. final allow/fallback audit", edgeStyles.orange);
  addStep("ae25", "a_api", "a_ui", 1140, "25. HTTP envelope");
  addStep("ae26", "a_ui", "a_rm", 1180, "26. render reply + friendly source label");

  cells.push(
    cell(
      "a_note_security",
      lines([
        "Implemented boundary",
        "- Token maps to server-side identity + entitlements.",
        "- ALL required scopes; explicit admin-only wildcard.",
        "- tools/list filtered; registry/repository/routes/fallback re-check.",
        "- Risk remains metadata; provider query pushdown is Phase 2."
      ]),
      styles.note,
      1740,
      170,
      450,
      225
    ),
    cell(
      "a_note_failure",
      lines([
        "Failure and audit semantics",
        "- Over-budget plan: no tool call or synthesis.",
        "- Failed observation: no synthesis or context commit.",
        "- Synthesis/source/policy/CAS failure preserves prior state.",
        "- Child + parent audit is local best-effort.",
        "- Redis distributed CAS and durable SIEM remain targets."
      ]),
      styles.note,
      1740,
      400,
      450,
      245
    ),
    cell(
      "a_note_llm",
      lines([
        "LLM boundary",
        "- Data class is a trusted env declaration.",
        "- Direct vendor hosts are blocked; positive host allowlist is target work.",
        "- Configured proxy is not proof of Bank A approval/mTLS.",
        "- PII token vault; app-side controlled restoration.",
        "- Strict JSON + code-owned sources.",
        "- Entity-scoped identity/contact/date/money/rate grounding; product KB remains target."
      ]),
      styles.note,
      1740,
      690,
      450,
      225
    )
  );

  return diagram({
    id: "09-ai-native-turn-sequence",
    name: "09 AI-Native Turn Sequence",
    width: 2250,
    height: 1420,
    cells
  });
}

const diagrams = [
  pageSystemLayers(),
  pageWorkflow(),
  pageIntentMapping(),
  pageRuntime(),
  pageDataLayer(),
  pageCyberSecurityProcess(),
  pageMemoryRegisterOptimization(),
  pageDemoSequences(),
  pageAiNativeTurnSequence()
];

const mxfile = `<mxfile host="Electron" agent="Codex" pages="${diagrams.length}">
${diagrams.join("\n")}
</mxfile>
`;

const checkMode = process.argv.includes("--check");
const outputIndex = process.argv.indexOf("--output");
if (checkMode && outputIndex >= 0) {
  throw new Error("Use either --check or --output, not both.");
}

if (checkMode) {
  const current = readFileSync(targetPath, "utf8");
  if (normalizeGeneratedXml(current) !== normalizeGeneratedXml(mxfile)) {
    console.error(
      "Draw.io artifact drift detected (content, topology, style or geometry). Regenerate the tracked artifact."
    );
    process.exitCode = 1;
  } else {
    console.log(`Draw.io full-artifact check passed for ${diagrams.length} pages.`);
  }
} else {
  const requestedOutput = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
  if (outputIndex >= 0 && (!requestedOutput || requestedOutput.startsWith("--"))) {
    throw new Error("--output requires a file path.");
  }
  const outputPath = requestedOutput ? resolve(process.cwd(), requestedOutput) : targetPath;
  writeFileSync(outputPath, mxfile, "utf8");
  console.log(`Generated ${outputPath} with ${diagrams.length} pages.`);
}
