# Project: CRM_MVP Architecture & Code Fixes

## Architecture
- Client UI: public/ (index.html, app.js, styles.css)
- API Express: src/server.js
- MCP Context Engine: src/services/mcpContextEngine.js
- CRM Services: src/services/crmService.js, src/services/crmData.js
- Database & Logger: src/services/auditLogger.js

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Exploration & Planning | Investigate drawio-ai-kit and CRM_MVP codebase | none | DONE |
| 2 | M2: Diagram Generation | Generate docs/architecture.drawio and validate | M1 | DONE |
| 3 | M3: Code Audit & Fixes | Audit src/, fix bugs, pass tests | M1 | DONE |
| 4 | M4: Final Audit | Run Forensic Auditor and verify | M2, M3 | DONE |

## Interface Contracts
- drawio-ai-kit CLI validate: node src/cli.mjs validate <file>
- CRM_MVP tests: npm run test:crm
- CRM_MVP server start: npm start (port 3000)

## Code Layout
- CRM_MVP/
  - src/
  - public/
  - docs/
