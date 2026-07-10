---
name: system-architecture-designer
description: Thiết kế, rà soát và điều chỉnh chi tiết kiến trúc hệ thống BankRM Copilot, bao gồm tầng tổng quát, component/service, workflow IF/ELSE, data flow, DB/entity, audit, security, deployment, observability và sơ đồ Draw.io. Use when an agent is asked to update architecture docs or diagrams, add detailed DB objects/entities, refine system layers, or align architecture artifacts with code.
---

# Skill: System Architecture Designer

## Mục tiêu
Giúp agent thiết kế và điều chỉnh phần kiến trúc hệ thống BankRM Copilot ở mức đủ chi tiết để BA, Dev, QA, Security và DevOps cùng review được. Skill này ưu tiên đồng bộ giữa code, tài liệu Markdown và sơ đồ Draw.io.

## Phạm vi bắt buộc
Khi dùng skill này, phải rà và cập nhật các nhóm sau nếu liên quan:

- Tầng tổng quát: RM Experience, API Backend, Agent Orchestration, Rule Engine, CRM Adapter, Data/DB, Agent Extension, Governance/Observability.
- Component/service: file code sở hữu, trách nhiệm, input/output, dependency, failure mode.
- Workflow: IF/ELSE intent, fallback router, MCP tool flow, audit flow.
- Data/DB: current mock/file/in-memory store và target production DB/store.
- DB object/entity: `customers`, `opportunities`, `interactions`, `campaigns`, `templates`, `conversation_context`, `audit_events`.
- Security: auth/RBAC, CORS, PII masking, LLM proxy policy, audit retention.
- Cyber security process: Govern, Identify, Protect, Detect, Respond, Recover theo NIST CSF 2.0.
- Memory/register optimization: context TTL, cache bounds, audit register schema, memory metrics, PII masking.
- Deployment/ops: runtime, environment, context store, centralized logs, monitoring.

## Quy trình thực hiện

1. Đọc bối cảnh repo:
   - `AGENTS.md`
   - `docs/architecture/architecture.md`
   - `scripts/docs/generate-if-else-workflow.mjs`
   - `src/server.js`
   - `src/services/agentService.js`
   - `src/services/mcpContextEngine.js`
   - `src/services/crmService.js`
   - `src/services/auditLogger.js`
   - `src/plugins/router.js`
   - `src/mcp/server.js`

2. Xác định trạng thái hiện tại:
   - Không gọi DB thật nếu repo chỉ có mock JSON.
   - Phân biệt rõ `current MVP` và `production target`.
   - Không vẽ endpoint/tool chưa tồn tại trong code.

3. Cập nhật artifact:
   - Markdown: `docs/architecture/architecture.md`.
   - Draw.io: sửa generator `scripts/docs/generate-if-else-workflow.mjs`, sau đó chạy `node scripts/docs/generate-if-else-workflow.mjs`.
   - Không chỉnh tay XML lớn nếu có thể sinh lại từ script.

4. Kiểm tra:
   - `node --check scripts/docs/generate-if-else-workflow.mjs`
   - `node_modules\.bin\prettier.cmd --check scripts\docs\generate-if-else-workflow.mjs docs\architecture\architecture.md`
   - `git diff --check -- docs\architecture\architecture.md docs\architecture\bankrm-if-else-workflow.drawio scripts\docs\generate-if-else-workflow.mjs`
   - Kiểm tra Draw.io XML có đủ pages và không có missing source/target refs.

## Template mô tả component

Dùng format này khi thêm hoặc chỉnh component:

```md
### <component-name>

- Vai trò:
- File/code sở hữu:
- Input:
- Output:
- Dependency upstream:
- Dependency downstream:
- State sở hữu:
- Sources/audit:
- Failure mode:
- Production gap:
```

## Template mô tả DB/entity

Dùng format này khi thiết kế DB hoặc data store:

```md
### <entity-or-store-name>

- Mục đích:
- Current MVP source:
- Production target:
- Owner service:
- Key fields:
- Quan hệ:
- Index/query chính:
- Retention:
- PII/sensitivity:
- Audit yêu cầu:
- Migration note:
```

## Pages Draw.io tối thiểu

Sơ đồ kiến trúc nên có các page:

1. `00 Tổng Quan Tầng Hệ Thống`
2. `01 IF ELSE Agent Workflow`
3. `02 Intent Mapping`
4. `03 Runtime Components`
5. `04 Data & DB Layer`
6. `06 Cyber Security Process`
7. `07 Memory & Register Optimization`
8. `08 Demo Sequence Flows`

Nếu thêm phần security/deployment/observability chi tiết, thêm page mới thay vì nhồi vào page hiện có.

## Draw.io native palette fallback

Khi người dùng yêu cầu sơ đồ trực quan hơn hoặc agent bị lệch style, phải fallback về bộ shape có sẵn trong Draw.io palette `General` và `Misc`. Không dùng icon tự chế, emoji, ảnh trang trí, SVG phức tạp hoặc shape không chắc chắn mở được trong Draw.io.

### Shape mapping bắt buộc

| Thành phần kiến trúc | Draw.io palette | Shape dùng | Ghi chú style |
| --- | --- | --- | --- |
| Actor/RM/User | General | Stick figure hoặc rounded rectangle | Màu xanh dương nhạt, ít text. |
| Browser/UI/Web Chat | General | Rounded rectangle | Dùng cho `public/index.html`, `public/app.js`. |
| API/Backend/Service | General | Rectangle hoặc rounded rectangle | Màu tím nhạt cho API/agent. |
| Process/Use case | General | Rectangle | Dùng cho `runAgentTurn()`, `routeConversation()`. |
| Decision/IF/ELSE | General | Diamond/rhombus | Chỉ dùng cho câu hỏi có nhánh Có/Không. |
| DB/Data store | General | Cylinder | Dùng cho CRM DB/API, JSON mock, Redis, audit store. |
| External system | General | Cloud hoặc cylinder có nhãn External | Chỉ dùng khi có CRM sandbox, LLM proxy, SIEM. |
| Document/file | General | Document shape | Dùng cho `logs/audit.log`, template JSON nếu cần. |
| Table/entity list | Misc | Table/List item | Dùng cho danh sách entity và DB object. |
| Boundary/layer | General | Large rectangle/container | Dùng làm swimlane hoặc vùng Current/Target. |
| Group annotation | Misc | Brace/bracket | Dùng để gom nhóm current MVP hoặc production target. |
| Sync flow | General connector | Solid arrow | Gắn nhãn endpoint hoặc function call. |
| Optional/target/future | General connector | Dashed arrow | Bắt buộc ghi `optional`, `target`, hoặc `future`. |
| Audit/log flow | General connector | Solid/dashed arrow màu cam | Nối tới audit logger/store. |

### Style constraints

- Mỗi box tối đa 3 dòng text, mỗi dòng ngắn.
- Không dùng hơn 6 màu chủ đạo trên một page.
- Cùng loại object phải cùng màu, stroke và font size.
- Connector không được chồng lên text hoặc đi xuyên qua node.
- Page `00 Tổng Quan Tầng Hệ Thống` phải có legend ở góc phải dưới.
- Nếu một thành phần là đề xuất production, label phải có tiền tố hoặc hậu tố `Production Target`.
- Nếu một thành phần chưa tồn tại trong code, không đặt như hiện trạng.

### Visual fallback prompt

```text
Thiết kế lại page "00 Tổng Quan Tầng Hệ Thống" bằng đúng shape có sẵn trong Draw.io palette General/Misc.

Không dùng custom icon, SVG tự vẽ, ảnh trang trí, emoji hoặc shape ngoài palette.

Shape mapping bắt buộc:
- RM/User: General stick figure hoặc rounded rectangle.
- UI/Web Chat: General rounded rectangle.
- API/Agent/Rule Engine: General rectangle/rounded rectangle.
- IF/ELSE decision: General diamond/rhombus.
- DB/Data store: General cylinder.
- File/log/template: General document shape.
- Entity/table list: Misc table hoặc list item.
- External systems: General cloud hoặc cylinder có nhãn External.
- Layer/swimlane: General large rectangle/container.
- Group annotation: Misc brace/bracket nếu cần gom nhóm.
- Solid arrow: flow hiện tại.
- Dashed arrow: optional/future/production target.

Layout:
1. Chia page thành 3 vùng lớn:
   - Current MVP Runtime
   - Data & DB Layer
   - Production Target / Governance
2. Vẽ flow trái sang phải:
   RM -> UI -> API -> Agent Orchestrator -> Rule Engine -> CRM Adapter -> Data/DB.
3. Đặt Audit/Governance ở hàng dưới, nối bằng arrow màu cam.
4. Đặt Production Target bên phải, nối dashed arrow từ Current MVP sang Target.
5. Thêm legend góc phải dưới với màu/line style.
6. Không dùng endpoint/tool/DB chưa có nếu không ghi rõ Production Target.
7. Sau khi sửa generator, chạy lại node scripts/docs/generate-if-else-workflow.mjs.
```

## Prompt mẫu cho agent

```text
Bạn là Architecture Design Agent cho repo BankRM Copilot.

Nhiệm vụ: rà soát và điều chỉnh chi tiết phần kiến trúc hệ thống, bao gồm tầng tổng quát, component/service, workflow IF/ELSE, DB/entity, data flow, audit, security, deployment và observability.

Yêu cầu bắt buộc:
- Đọc code hiện tại trước khi chỉnh tài liệu.
- Phân biệt rõ Current MVP và Production Target.
- Không vẽ endpoint, tool, DB hoặc service chưa tồn tại nếu không ghi rõ là đề xuất target.
- Với mỗi component, mô tả vai trò, file sở hữu, input/output, dependency, state, failure mode và production gap.
- Với mỗi DB/entity, mô tả current source, production target, owner, key fields, relationship, index/query chính, retention, PII và audit.
- Bổ sung cyber security process theo NIST CSF 2.0: Govern, Identify, Protect, Detect, Respond, Recover; mỗi bước phải có control và register/evidence.
- Bổ sung memory/register optimization: contextStore TTL, bounded cache, Top-K retrieval cho LLM context, audit register schema, memory metrics và alert.
- Khi vẽ Draw.io, dùng đúng shape có sẵn trong palette General/Misc: rounded rectangle cho UI/service, diamond cho decision, cylinder cho DB/data store, document cho file/log/template, table/list cho entity, cloud cho external system, solid arrow cho flow hiện tại, dashed arrow cho optional/future/production target.
- Không dùng custom icon, emoji, SVG tự chế hoặc shape không chắc chắn thuộc Draw.io native palette.
- Cập nhật `docs/architecture/architecture.md`.
- Cập nhật sơ đồ bằng cách sửa `scripts/docs/generate-if-else-workflow.mjs` rồi chạy generator để sinh lại `docs/architecture/bankrm-if-else-workflow.drawio`.
- Sau khi xong, chạy kiểm tra cú pháp, Prettier, diff check và validate Draw.io refs.

Output mong muốn:
1. Danh sách thay đổi chính.
2. Những file đã cập nhật.
3. Kết quả kiểm tra.
4. Các production gaps còn lại.
```

## Definition of Done

- Có tầng tổng quát và DB layer rõ ràng.
- Mỗi tầng có current implementation và production target.
- Mỗi DB/entity chính có owner, quan hệ và dữ liệu nhạy cảm được ghi chú.
- Diagram khớp code hiện tại và không chứa endpoint cũ.
- Markdown và Draw.io được sinh/kiểm tra thành công.
