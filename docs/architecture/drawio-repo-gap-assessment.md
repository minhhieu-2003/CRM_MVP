# Draw.io Architecture Gap Assessment - BankRM Copilot

Nguon tham chieu: `C:\Users\hieu\Downloads\ai_crm_copilot_architecture.drawio.xml`

Ngay danh gia: 2026-07-11

## 1. Tom tat file XML

File draw.io co `compressed="false"` va gom 12 trang:

1. Executive Solution Overview
2. Traceability Matrix
3. Domain Model
4. Component Architecture
5. C4 Container Diagram
6. Deployment View
7. ReAct Loop Sequence
8. Sequence AS-01 Prepare Customer Contact
9. Context Architecture
10. Data Flow Diagram
11. Tool Map
12. Solution Poster

Kien truc trong diagram mo ta dich den tham vong hon MVP hien tai:

- RM su dung Chat UI + Dashboard + Reminder list + Priority view.
- AI Copilot lam intent, planning, tool orchestration, response formatting.
- Tool Registry dieu phoi MCP Server.
- Context Manager quan ly session, stack, memory, context switch/restore.
- Knowledge Base Service dung vector search, RAG, templates.
- Data layer gom SQLite mock CRM, ChromaDB/vector index, template store.
- Tool catalog gom customer.search/profile, interaction.history, opportunity.list/recommend, campaign.list, reminder.list, knowledge.search, email.generate, callscript.generate, context.switch/restore, session.manage, reasoning.trace, source.cite.
- Principle: AI-first, explainable, context-aware, RM in control, traceability end-to-end.

## 2. Muc do khop voi repo hien tai

| Capability trong XML | Trang thai repo | Danh gia |
| --- | --- | --- |
| RM chat UI | Co `public/index.html`, `public/app.js`, `public/styles.css` | Dat MVP, chua dat workspace/dashboard day du |
| Backend API | Co `src/server.js` Express | Dat MVP, khac XML vi khong dung FastAPI |
| AI Copilot orchestration | Co `src/services/agentService.js` + `mcpContextEngine.js` | Co nen tang, nhung con rule-based IF/ELSE lon |
| Tool Registry | Chua co module registry cho execution path chinh | Thieu P0 |
| MCP Server | Co `src/mcp/server.js` qua stdio | Co toolkit, nhung chua nam trong chat execution path chinh |
| Context Manager | Co `Map` in-memory trong `mcpContextEngine.js` | Partial, chua co TTL/stack/restore/session manage dung diagram |
| CRM data | Co mock JSON + optional sandbox API | Dat demo, chua co SQLite/repository query layer |
| ChromaDB/vector index | Chua co | Chua can P0 neu chua lam RAG/KB search |
| Template store | Co JSON email/call scripts | Partial, chua co versioning/index/RAG |
| Knowledge search | Chua co tool `knowledge.search` | Thieu cho product grounding |
| Reminder list/daily work queue | Co maturity query khi RM hoi | Partial, chua co proactive queue/status workflow |
| Explainability/source cite | Co `sources` tren response | Dat MVP, chua co `reasoning.trace` rieng |
| Audit | Co `auditLogger.js` file JSONL | Partial, con raw prompt/token risk, chua co actor/scope/hash day du |
| Auth/RBAC/RM scope | Chua co | Blocker pilot |
| Evaluation 20 case + latency | Co `test:crm`, nhung report con don gian | Partial |

## 3. Lech kien truc quan trong

### 3.1 MCP chua la duong chay chinh cua chat

Diagram ve luong: Chat UI -> API Gateway -> AI Copilot -> Tool Registry -> MCP Server -> SQLite/CRM.

Repo hien tai la: Chat UI -> Express -> `agentService.js` -> `mcpContextEngine.js` -> `crmService.js`.

`src/mcp/server.js` dang phuc vu client MCP ben ngoai qua stdio, khong phai tool execution path cua `/api/chat`. Day la gap da duoc tach thanh issue #15.

### 3.2 Thieu Query Planner/Tool Planner

XML co cac khai niem Tool Registry, ReAct loop, reasoning, tool calls. Repo hien tai chua co:

- `src/services/queryPlanner.js`
- `src/services/toolPlanner.js`
- Query Priority Matrix
- Multi-field realtime query plan

`mcpContextEngine.js` dang gom detect intent, resolve context, query CRM va compose reply trong mot file. Day la diem can tach truoc khi them nhieu intent moi.

### 3.3 Thieu data scope theo RM

Domain Model trong XML co RM, Customer, Conversation, Interaction, Opportunity, Campaign va quan he theo `rm_id`/assigned RM. Repo hien tai API CRM tra danh sach toan cuc:

- `/api/crm/customers`
- `/api/crm/opportunities`
- `/api/crm/interactions`
- MCP `crm_list_customers`

Chua co identity runtime, `rmId`, `branchId`, role scope hay tool-level authorization. Day la blocker pilot, da duoc tach thanh issue #21.

### 3.4 Context architecture moi dat muc MVP

XML yeu cau context.switch, context.restore, session.manage, stack/memory. Repo hien tai chi co `Map` theo `conversationId` voi:

- `currentModule`
- `focusedCustomers`
- `lastIntent`

Chua co TTL, stack push/pop dung nghia, restore, actor scope, hoac cross-instance storage.

### 3.5 Knowledge Base/RAG chua ton tai

Diagram co Knowledge Base Service, ChromaDB, vector search, RAG, `knowledge.search`. Repo hien tai moi co:

- `email_templates.json`
- `call_scripts.json`
- opportunities san co

Chua co product catalog 35 san pham voi eligibility/effective date/exclusions/policy guardrail. Day phu hop issue #23.

### 3.6 Deployment view trong XML khac stack repo

XML de xuat:

- Next.js 14 frontend
- FastAPI/Python backend
- Python MCP SDK
- SQLite + ChromaDB

Repo hien tai:

- HTML/CSS/JS thuan frontend
- Node.js Express backend
- JS MCP SDK
- JSON mock data

Khuyen nghi khong doi stack luc nay neu muc tieu la hackathon/demo nhanh. Nen cap nhat diagram hoac doc de ghi ro: repo hien tai chon Node/Express de giam build/runtime phuc tap; Python chi nen vao ETL/scoring neu can.

## 4. Diem manh cua repo so voi XML

- Co MVP chay duoc local, khong chi la diagram.
- Co test HTTP va test CRM business cases.
- Co MCP SDK that, du chua nam trong execution path chinh.
- Co mock data lon va data generator.
- Co audit log ngay tu dau.
- Co LLM fallback optional qua proxy, khong bat mac dinh neu thieu config.
- Co UI don gian, phu hop demo nhanh.

## 5. Uu tien bo sung de repo khop target architecture

### P0 - Pilot blockers

1. #21 - RM data scope va tool-level authorization.
2. #15 - Dua MCP/tool abstraction vao execution path chinh cua Chat Agent.
3. #20 - Query Priority Matrix va multi-field realtime query planner.
4. #16 - CRM Sandbox that va demo fail-closed.
5. #17 - Evaluation harness 20 ca, accuracy va latency report.
6. #22 - RM daily work queue va reminder workflow.
7. #23 - Product Knowledge grounding va banking policy guardrail.

### P1 - UX va guardrail

1. #18 - UX chinh sua, copy, chap nhan email/call draft.
2. #19 - Gioi han LLM context va provider failover.
3. #12 - Context stack TTL.
4. #11 - MCP toolkit standardization.

### P2 - Data/AI expansion

1. #8 - DB schema + Python ETL.
2. #9 - JS CRM repository DB mode.
3. #14 - Python next-best-action scoring.
4. Them KB/vector search neu product catalog da on dinh.

## 6. De xuat dieu chinh architecture docs

Nen cap nhat `docs/architecture/architecture.md` hoac diagram draw.io theo 2 lop:

### MVP implementation architecture

- Frontend: HTML/CSS/JS thuan.
- Backend: Node.js Express.
- Agent: rule-based orchestrator + fallback router.
- Data: mock JSON + optional CRM Sandbox.
- MCP: stdio toolkit ben ngoai.

### Target pilot architecture

- API Gateway co auth/RBAC/RM data scope.
- Chat Agent dung Query Planner + Tool Registry.
- MCP/tool execution la duong chinh cho CRM capability.
- Repository layer ap scope, paging, fail-closed sandbox.
- Context stack co TTL.
- Product KB grounding.
- Audit co actor/scope/hash, khong raw token/PII.

## 7. Ket luan danh gia

Repo hien tai dat muc MVP kha tot: co UI, API, mock data, rule engine, MCP toolkit, tests va audit. Tuy nhien, neu lay file draw.io lam target architecture, repo moi dat khoang 45-55% ve mat thanh phan va chi dat khoang 30-40% ve pilot readiness.

Khoang cach lon nhat khong phai SQLite hay Python scoring, ma la:

1. Authorization theo RM/data scope.
2. MCP/tool execution path chinh.
3. Query planner va priority matrix.
4. CRM Sandbox fail-closed.
5. Work queue/reminder workflow.
6. Product knowledge grounding.
7. Evaluation report chinh thuc.

Khuyen nghi: dung cac issue #15-#23 lam pilot backlog P0/P1. Sau khi cac issue nay xong, moi nen dau tu SQLite, ChromaDB, RAG hoac Python scoring de tranh xay tang AI tren nen security/data-scope con yeu.
