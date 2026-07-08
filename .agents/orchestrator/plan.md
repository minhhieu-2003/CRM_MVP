# Project Orchestration Plan: CRM_MVP Architecture & Code Fixes

## Objectives
1. **R1: Architecture Diagram**
   - Automatically generate `d:\ReactNative_Project\CRM_MVP\docs\architecture.drawio` using `drawio-ai-kit`.
   - Ensure it includes correct blocks (Client UI, API Express, MCP Context Engine, CRM Services, Database & Logger).
   - Ensure it validates using `node src/cli.mjs validate` from `d:\drawio-ai-kit-main\drawio-ai-kit-main`.
2. **R2: Code Review & Bug Fixes**
   - Review and fix `src/` files in `CRM_MVP` to comply with `AGENTS.md`.
   - Ensure `npm run test:crm` has 21/21 passing tests.
   - Ensure Express server starts on port 3000 without errors.

## Strategy
We will follow the Project Pattern:
1. **Phase 1: Exploration**
   - Spawn an Explorer to investigate `drawio-ai-kit-main` examples, CLI, and APIs, and `CRM_MVP` codebase and tests.
2. **Phase 2: Execution**
   - Spawn a Worker to write the diagram generation script, execute it, validate the diagram, review code, apply fixes, and run tests.
3. **Phase 3: Review & Audit**
   - Spawn a Reviewer to verify the changes and validation status.
   - Spawn a Forensic Auditor to ensure no integrity violations (hardcoded test results, facade implementations).

## Milestone Tracker
- [ ] M1: Exploration & Plan Refinement
- [ ] M2: Diagram Generation Script & Execution (R1)
- [ ] M3: Source Code Audit & Test Fixes (R2)
- [ ] M4: Final Review & Forensic Audit
