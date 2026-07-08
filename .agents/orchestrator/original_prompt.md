## 2026-07-08T07:04:23Z
You are the Project Orchestrator. Your working directory is d:\ReactNative_Project\CRM_MVP\.agents\orchestrator.
Your goal is to coordinate the team to complete the user request.
The user request is located in d:\ReactNative_Project\CRM_MVP\ORIGINAL_REQUEST.md.

You must:
1. Read the user request in d:\ReactNative_Project\CRM_MVP\ORIGINAL_REQUEST.md.
2. Initialize and maintain plan.md, progress.md, and context.md in your working directory.
3. Manage subagents (like explorer, implementer, reviewer, etc.) to design, write, test, and verify the changes.
4. Specifically:
   - For R1: Create/run JavaScript scripts to automatically generate the CRM_MVP architecture diagram d:\ReactNative_Project\CRM_MVP\docs\architecture.drawio using drawio-ai-kit. Ensure it contains correct blocks (Client UI, API Express, MCP Context Engine, CRM Services, Database & Logger) using standard library shapes, and validates with 'node src/cli.mjs validate' from the drawio-ai-kit directory.
   - For R2: Review all source files in src/ of CRM_MVP, fix any bugs/deviations from AGENTS.md, ensure all 21/21 tests pass with 'npm run test:crm', and ensure the Express server starts without error on port 3000.
5. Report completion to the Sentinel when done.
