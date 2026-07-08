# Analysis Report — CRM_MVP Codebase & Diagram Generator Design

## Executive Summary
This report analyzes the `CRM_MVP` codebase for compliance with the project guidelines in `AGENTS.md` and `RULES.md`, and designs a programmatic diagram generator using `drawio-ai-kit`. A critical discrepancy was discovered where the numeric shortcut `3` (gợi ý cơ hội) is not implemented in the context engine routing logic, violating project rules, along with missing error handling for invalid input files.

---

## Part 1: drawio-ai-kit Exploration & Validation
The `drawio-ai-kit` repository (`d:\drawio-ai-kit-main\drawio-ai-kit-main`) provides a library for programmatically drawing and validating diagrams.

### 1. Programmatic API and Stencils
- **Relative Path and Import**: To use the builder from the CRM_MVP project, scripts should import:
  ```javascript
  import { Diagram } from "../../../drawio-ai-kit-main/drawio-ai-kit-main/src/builder.mjs";
  import { group, frame, icon, box, renderTree } from "../../../drawio-ai-kit-main/drawio-ai-kit-main/src/layout-engine.mjs";
  ```
- **Stencil Library**: Stencils are defined in catalog files under `catalog/` (such as `database.json`, `aws.json`). Stencils like `database`, `fsx_for_windows_file_server`, `traditional_server`, and `server_migration_service` can be referenced by name (e.g., as the `name` argument of `icon(id, name, label)`).
- **Positioning**: Instead of hardcoded coordinates, the library uses a declarative flexbox-like flow engine via `group` / `frame` / `renderTree`. Row/column layouts auto-stretch and distribute nodes programmatically.

### 2. Validation Mechanism (`node src/cli.mjs validate <file>`)
The validation command runs the `validateDiagram(xml)` function in `src/core.mjs` (which parses the XML using a built-in XML parser in `src/parser.mjs`):
- **Checks Performed**:
  - **Stencils**: Ensures all referenced shapes/icons exist in the catalog.
  - **Overlaps**: Validates that nodes do not overlap unexpectedly.
  - **Edge Crossings**: Performs geometric routing checks to warn if connections cross obstacles.
  - **Rules**: Evaluates design guidelines (e.g., label sizes, hierarchy limits).
- **Status of Tests**: Running `node src/cli.mjs test` inside `drawio-ai-kit-main` confirms that the test suite passes with **74/74 passing tests**, proving library integrity.

---

## Part 2: CRM_MVP Codebase Audit
An inspection of `d:\ReactNative_Project\CRM_MVP\src\` was performed against the rules in `AGENTS.md` and `RULES.md`.

### 1. General Architecture & Compliance
- **ESM Compliance**: All files in `src/` use ESM `import`/`export` syntax, which complies with `AGENTS.md` (Node.js ESM, `"type": "module"` in `package.json`).
- **Vietnamese Language Compliance**: The chat responses return fully accented Vietnamese.
- **Normalization**: `textUtils.js` provides `normalizeVietnamese()` which is correctly imported and invoked in `mcpContextEngine.js` for intent matching.
- **Source Tracking**: All responses include the `sources` field listing queries executed.
- **Audit Logging**: Handled centrally in `auditLogger.js` and successfully logs LLM actions.

### 2. Discovered Discrepancies, Bugs, & Deficiencies
We identified the following issues:

#### Bug A: Missing Numeric Shortcut "3" (Gợi ý cơ hội)
- **Source**: `d:\ReactNative_Project\CRM_MVP\RULES.md` line 8 specifies:
  > "Hỗ trợ phím tắt số: `1` (nhắc đến hạn), `2` (soạn email), `3` (gợi ý cơ hội), `4` (chiến dịch)."
- **Violation**: In `d:\ReactNative_Project\CRM_MVP\src\services\mcpContextEngine.js`, we have:
  - `isReminderIntent = compact === "1"` (Line 80)
  - `isEmailIntent = compact === "2"` (Line 92)
  - `isCampaignIntent = compact === "4"` (Line 101)
  - **There is no check or routing for shortcut `"3"` (gợi ý cơ hội).** This means typing `3` in the chat will not trigger the opportunity suggestion, violating the rule.
- **Proof**: `grep_search` and manual review of `mcpContextEngine.js` confirms that `"3"` or `isOpportunityIntent` is completely absent from the routing logic.

#### Deficiency B: Unhandled File Read Errors
- **Location**: `d:\ReactNative_Project\CRM_MVP\src\services\crmService.js` (Line 13 & 20)
- **Observation**:
  ```javascript
  const emailTemplates = JSON.parse(fs.readFileSync(new URL("../../skills/email_templates.json", import.meta.url), "utf8"));
  const callScripts = JSON.parse(fs.readFileSync(new URL("../../skills/call_scripts.json", import.meta.url), "utf8"));
  ```
- **Violation**: These synchronous `fs.readFileSync` calls are executed at module load time without a `try-catch` block. If the files are corrupt, missing, or permissions are denied, the entire Node.js server will crash on startup, leading to service downtime.

---

## Part 3: Proposed Remediation Diffs

### Proposal 1: Add Numeric Shortcut "3" and Opportunity Intent in `mcpContextEngine.js`
To comply with `RULES.md` and `AGENTS.md`, we propose adding `isOpportunityIntent` matching for the numeric key `"3"` and the terms `"co hoi"`, `"goi y co hoi"`:

```diff
<<<<
  const isEmailIntent =
    compact === "2" ||
    ((hasAny(normalized, ["soan", "draft"]) &&
      hasAny(normalized, ["email", "khach hang", "tiep", "follow up"])) ||
      normalized.includes("soan tiep"));

  const isCampaignIntent =
    compact === "4" || normalized.includes("chien dich") || normalized.includes("campaign");
====
  const isEmailIntent =
    compact === "2" ||
    ((hasAny(normalized, ["soan", "draft"]) &&
      hasAny(normalized, ["email", "khach hang", "tiep", "follow up"])) ||
      normalized.includes("soan tiep"));

  const isOpportunityIntent =
    compact === "3" ||
    normalized.includes("co hoi") ||
    normalized.includes("opportunity") ||
    normalized.includes("goi y");

  const isCampaignIntent =
    compact === "4" || normalized.includes("chien dich") || normalized.includes("campaign");
>>>>
```

Also, update the intent routing inside `routeConversation`:
```diff
<<<<
  if (isCampaignIntent) {
    state.currentModule = "campaign";
    state.lastIntent = "campaign_summary";
    const campaigns = await getActiveCampaigns();
    return {
      reply: `Danh sách chiến dịch đang diễn ra:\n${campaigns.map(c => `- ${c.name}: ${c.desc}`).join("\n")}`,
      sources: sourceTrace(["GET /campaigns"]),
      context: state
    };
  }
====
  if (isOpportunityIntent) {
    state.currentModule = "opportunity";
    state.lastIntent = "suggest_opportunity";
    if (state.focusedCustomers.length > 0) {
      const customerId = state.focusedCustomers[0];
      const opps = await getCustomerOpportunities(customerId);
      const list = opps.map(o => `- ${o.name}: ${o.valueVnd.toLocaleString("vi-VN")}đ (Độ ấm: ${o.stage})`).join("\n");
      return {
        reply: `Cơ hội kinh doanh cho khách hàng:\n${list || "Chưa ghi nhận cơ hội mới."}`,
        sources: sourceTrace(["GET /opportunities"]),
        context: state
      };
    } else {
      return {
        reply: "RM muốn gợi ý cơ hội cho khách hàng nào? Vui lòng cung cấp tên khách hàng để em tra cứu.",
        sources: [],
        context: state
      };
    }
  }

  if (isCampaignIntent) {
    state.currentModule = "campaign";
    state.lastIntent = "campaign_summary";
    const campaigns = await getActiveCampaigns();
    return {
      reply: `Danh sách chiến dịch đang diễn ra:\n${campaigns.map(c => `- ${c.name}: ${c.desc}`).join("\n")}`,
      sources: sourceTrace(["GET /campaigns"]),
      context: state
    };
  }
>>>>
```

### Proposal 2: Graceful File Reads in `crmService.js`
To avoid server crashes on missing template/script files:

```diff
<<<<
const emailTemplates = JSON.parse(fs.readFileSync(new URL("../../skills/email_templates.json", import.meta.url), "utf8"));
const callScripts = JSON.parse(fs.readFileSync(new URL("../../skills/call_scripts.json", import.meta.url), "utf8"));
====
let emailTemplates = [];
let callScripts = [];
try {
  emailTemplates = JSON.parse(fs.readFileSync(new URL("../../skills/email_templates.json", import.meta.url), "utf8"));
} catch (err) {
  console.error("Warning: Failed to load email templates from skills/email_templates.json. Using fallback empty list.");
}
try {
  callScripts = JSON.parse(fs.readFileSync(new URL("../../skills/call_scripts.json", import.meta.url), "utf8"));
} catch (err) {
  console.error("Warning: Failed to load call scripts from skills/call_scripts.json. Using fallback empty list.");
}
>>>>
```
