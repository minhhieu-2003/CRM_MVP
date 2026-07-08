# Forensic Audit Report

**Work Product**: CRM_MVP Source Code (`src/`) & Architecture Diagram (`docs/architecture.drawio`)
**Profile**: General Project (Integrity Mode: development)
**Verdict**: CLEAN

### Phase Results
- **Hardcoded Output Detection**: PASS — Checked `src/services/mcpContextEngine.js` and `src/services/crmService.js` for hardcoded test results or bypass strings. Checked if test case IDs (TC01-TC21) were hardcoded. None were found. All outputs are computed dynamically using mock data collections and formatting helper routines.
- **Facade Detection**: PASS — Verified that no interfaces or methods are dummy wrappers or placeholder facades. Full logic for intent classification, name matching, template placeholder interpolation, and context switching is active.
- **Pre-populated Artifact Detection**: PASS — Checked workspace for pre-populated logs/artifacts mimicking success. Only dynamic operational logs (`logs/audit.log`) are present.
- **Script Programmatic Generation**: PASS — Inspected `scripts/generate-architecture.mjs` and confirmed it constructs the Draw.io layout dynamically via elements (`frame`, `box`, `icon`, `group`, `d.link`) using the `drawio-ai-kit` library from scratch, rather than loading a pre-made static XML file.
- **Diagram Authenticity & Validation**: PASS — Verified that `docs/architecture.drawio` is a genuine output matching the exact structure (node IDs, labels, styles, and links) defined in `generate-architecture.mjs`. Validated the structure using the Draw.io CLI validator which successfully reports `"ok": true` and `"errors": []`.

---

### Evidence

#### 1. Code Check: Dynamic Context Routing & Name Detection in `mcpContextEngine.js`
The context matching rules are based on user prompt analysis and data-driven properties:
```javascript
const isReminderIntent =
  compact === "1" ||
  (normalized.includes("nhac") &&
    normalized.includes("tiet kiem") &&
    normalized.includes("den han"));

const isEmailIntent =
  compact === "2" ||
  ((hasAny(normalized, ["soan", "draft"]) &&
    hasAny(normalized, ["email", "khach hang", "tiep", "follow up"])) ||
    normalized.includes("soan tiep"));

const isOpportunityIntent =
  !askedName &&
  (compact === "3" ||
    normalized.includes("co hoi") ||
    normalized.includes("opportunity") ||
    normalized.includes("goi y"));
```
Specific customer lookups take precedence over generic intents to handle overlapping keywords correctly (e.g. TC05, TC06):
```javascript
const askedName = await detectCustomerName(message);
// ...
if (askedName) {
  const customer = await getCustomerByName(askedName);
  if (!customer) {
    return {
      reply: `Em không tìm thấy khách hàng "${askedName}" trong CRM sandbox.`,
      sources: sourceTrace(["GET /customers"]),
      context: state
    };
  }
  // Detailed customer insight lookup
}
```

#### 2. Code Check: Dynamic Template Placeholder Interpolation in `crmService.js`
The email drafting routine dynamically substitutes placeholding patterns rather than using hardcoded responses:
```javascript
function fillPlaceholders(text, customer, extra = {}) {
  const reminderDate = extra.reminderDate ?? shiftDate(customer.maturityDate, -3);
  const daysUntilMaturity = extra.daysUntilMaturity ?? daysBetween("2026-07-07", customer.maturityDate);

  return text
    .replaceAll("[Tên]", customer.name)
    .replaceAll("[Tên RM]", extra.rmName ?? "RM Bank A")
    .replaceAll("[SĐT]", extra.rmPhone ?? "1900 0000")
    .replaceAll("[Số TK]", customer.id)
    .replaceAll("[Số tiền]", formatVnd(customer.savingsAmountVnd))
    .replaceAll("[Ngày]", customer.maturityDate)
    .replaceAll("[Ngày-3]", reminderDate)
    .replaceAll("[số ngày]", String(daysUntilMaturity))
    .replaceAll("[Sản phẩm]", customer.savingsProduct)
    .replaceAll("[Giá trị]", formatVnd(customer.savingsAmountVnd));
}
```

#### 3. Diagram Validation Result
The CLI validator output recorded during the build verifies diagram structure authenticity:
```json
{
  "ok": true,
  "errors": [],
  "warnings": [],
  "advice": [
    "Group \"group_subnet\" should be nested inside a higher-level group (AWS Cloud→Region→VPC→AZ→Subnet→SG) — currently placed flat / in the wrong order.",
    "Group \"group_subnet\" should be nested inside a higher-level group (AWS Cloud→Region→VPC→AZ→Subnet→SG) — currently placed flat / in the wrong order.",
    "6 edge crossings — the flow looks tangled. Align the main flow on one row (spine), group fan-out/fan-in through a shared lane, and place shared nodes near their consumers."
  ]
}
```
The warning/advice items are aesthetic design suggestions rather than validation or integrity failures, indicating that the schema validation succeeded completely.
