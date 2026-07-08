# BankRM Copilot - Kế hoạch triển khai cho agent con

Ngày lập: 2026-07-08  
Repo: `D:\ReactNative_Project\CRM_MVP`  
Mục tiêu: đưa CRM MVP từ trạng thái demo rule-based/mock lên mức pilot có kiểm soát, có test, có audit, có bảo mật biên API, có UI RM workspace và có đường nâng cấp sang CRM thật.

## 1. Kết luận kiểm duyệt ban đầu

Repo hiện đủ tốt cho demo nội bộ: `npm run test:crm` đang pass 21/21, backend Express chạy được, UI chat hoạt động, MCP toolkit có 8 tool CRM, multi-agent fallback đã có registry. Tuy nhiên repo chưa đủ an toàn để bật LLM với dữ liệu khách hàng thật hoặc deploy public pilot vì API chưa có auth/RBAC, CORS mặc định mở, audit còn lưu raw prompt, LLM fallback chưa masking PII/allowlist proxy, context store là `Map` in-memory và CRM fallback mock có thể che lỗi dữ liệu thật.

Quyết định kỹ thuật:

- P0 không phải thêm tính năng mới cho nhiều hơn; P0 là làm cho luồng hiện tại đáng tin.
- Chưa xóa mock data ngay. Giữ mock làm demo mode, nhưng pilot mode phải fail-closed khi CRM thật lỗi.
- Chưa bật LLM production cho tới khi có proxy allowlist, masking, audit hash và bằng chứng no-training từ Bank A.
- Frontend nên nâng thành RM workspace sau khi backend contract và security baseline ổn.

Nguồn pháp lý đã đối chiếu ở mức định hướng kỹ thuật:

- Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân: ban hành 17-04-2023, hiệu lực 01-07-2023, theo Cổng Thông tin điện tử Chính phủ: https://vanban.chinhphu.vn/?docid=207759&pageid=27160
- Luật An ninh mạng 24/2018/QH14: ban hành 12-06-2018, hiệu lực 01-01-2019, theo Cổng Thông tin điện tử Chính phủ: https://vanban.chinhphu.vn/?docid=206114&pageid=27160

Lưu ý: đây là kế hoạch kỹ thuật, không thay thế ý kiến pháp chế của Bank A.

## 2. Nguyên tắc điều phối agent con

Mỗi agent con phải làm trên phạm vi file được giao, không revert thay đổi của agent khác hoặc của user. Nếu cần chạm file ngoài phạm vi, agent phải báo lại thay vì tự mở rộng scope. Mọi phản hồi nghiệp vụ cho RM phải giữ tiếng Việt có dấu UTF-8 và contract `{ reply, sources, context }`.

Mỗi agent con khi hoàn tất phải báo cáo theo mẫu:

```text
Agent:
Mục tiêu:
Files changed:
Hành vi thay đổi:
Tests đã chạy:
Kết quả:
Evidence:
Rủi ro còn lại:
Điểm cần main reviewer kiểm duyệt:
```

Main reviewer kiểm duyệt theo 6 tiêu chí:

- Không phá `npm run test:crm`.
- Không lộ metadata kỹ thuật trên frontend.
- Không làm mất `sources` trong response nghiệp vụ.
- Không gọi API bên thứ ba ngoài allowlist.
- Không lưu raw PII/raw prompt trong audit production path.
- Không trộn context giữa conversation/RM.

## 3. Roadmap tổng thể

### Phase 0 - Baseline lock

Mục tiêu: đóng băng hiện trạng chạy được trước khi sửa nhiều.

Việc bắt buộc:

- Chạy `npm run test:crm`.
- Chạy `node --check` cho toàn bộ `.js`/`.mjs`.
- Ghi lại `git status --short`.
- Ghi lại smoke `POST /api/chat` với prompt `1`.
- Tạo thư mục evidence theo ngày nếu cần: `evidence/local/2026-07-08/`.

Nghiệm thu:

- Có log test pass.
- Có baseline response mẫu chứa `reply`, `sources`, `context`.
- Không có code change trong phase này, trừ tài liệu/evidence nếu được yêu cầu.

### Phase 1 - Quality gate và regression harness

Mục tiêu: tạo hàng rào chất lượng để các worker sau không làm vỡ MVP.

Owner đề xuất: Worker 01 - Quality/Test.

Phạm vi file:

- `package.json`
- `package-lock.json`
- `eslint.config.js`
- `.prettierrc`
- `.prettierignore`
- `scripts/run-crm-test-cases.mjs`
- `tests/`

Từng bước:

1. Thêm scripts:
   - `test`
   - `test:crm`
   - `test:http`
   - `lint`
   - `format:check`
   - `check`
   - `smoke:local`
2. Pin Node engine phù hợp Vercel, ví dụ `>=20 <25`.
3. Cấu hình ESLint cho ESM Node/browser globals.
4. Cấu hình Prettier ở chế độ check-only cho CI.
5. Giữ 21 test CRM hiện tại và thêm option `--report`.
6. Thêm HTTP contract tests:
   - `GET /api/health`
   - `POST /api/chat`
   - `GET /api/crm/customers`
   - `GET /api/crm/opportunities`
   - `GET /api/crm/interactions`
   - `GET /api/crm/campaigns`
   - `GET /api/agents`
   - invalid `/api/chat` payload trả 400.
7. Test phải set `AUDIT_LOG_DIR` vào temp/evidence để không làm bẩn log thật.

Nghiệm thu:

- `npm ci` pass.
- `npm run lint` pass.
- `npm test` pass.
- `npm run test:crm` pass 21/21 hoặc hơn.
- HTTP test assert `/api/chat` luôn có `reply`, `sources`, `context`.

Rủi ro:

- ESLint có thể phát hiện nhiều lỗi style cũ. Bắt đầu bằng rule vừa đủ, tránh format toàn repo nếu không cần.

Prompt giao việc:

```text
Bạn là Worker 01 - Quality/Test. Chỉ chỉnh package/config/scripts/tests. Không chạm src business logic hoặc public UI. Thiết lập lint, format check, node:test HTTP contract test, report cho CRM regression. Sau khi xong chạy npm run lint, npm test, npm run test:crm và báo cáo theo mẫu.
```

### Phase 2 - Backend correctness: intent, context, sources, clock

Mục tiêu: sửa các lỗi ảnh hưởng trực tiếp độ tin cậy nghiệp vụ.

Owner đề xuất: Worker 02 - Backend Context.

Phạm vi file:

- `src/services/mcpContextEngine.js`
- `src/services/crmService.js` chỉ cho business clock nếu chưa giao Worker 04
- `src/data/mock/bank_a_crm_test_cases.json`
- `scripts/run-crm-test-cases.mjs` chỉ khi cần thêm case

Từng bước:

1. Tách helper `resolveTargetCustomers({ askedName, state, fallbackDue })`.
2. Email intent phải ưu tiên tên khách trong message:
   - `soạn email cho Nguyễn Văn An`
   - `soan email cho Nguyen Van An`
3. Call script intent phải ưu tiên tên khách trong message:
   - `kịch bản gọi cho Đỗ Minh Châu`
   - `call script cho Do Minh Chau`
4. Opportunity intent phải hỗ trợ:
   - hỏi theo tên khách
   - shortcut `3` sau khi đã focus khách
   - nếu thiếu khách thì trả clarification có `sources` hợp lệ.
5. Không trả `sources: []`; dùng `internal://clarification` cho câu hỏi làm rõ.
6. Fallback tĩnh không gắn endpoint CRM chưa gọi.
7. Dedupe sources khi merge rule engine và fallback router.
8. Tách business clock:
   - thêm `CRM_BUSINESS_DATE`.
   - mặc định dùng ngày hệ thống Asia/Bangkok.
   - bỏ hardcode `2026-07-07`.
9. Khi soạn tối đa 5 email từ danh sách dài, phản hồi phải nói rõ đã giới hạn 5 khách đầu.
10. Clone context trước khi trả response để tránh lộ reference mutable.

Nghiệm thu:

- Prompt theo tên khách tạo đúng email/call script cho khách đó.
- Shortcut `3` sau khi hỏi hồ sơ khách dùng đúng focused customer.
- Không còn response nghiệp vụ nào có `sources` rỗng.
- `CRM_BUSINESS_DATE=2026-07-08 npm run test:crm` pass sau khi test fixture được cập nhật hợp lý.

Test cần thêm:

- Chat sequence: hỏi khách cụ thể, sau đó `3`.
- Email theo tên khách có dấu.
- Email theo tên khách không dấu.
- Call script theo tên khách.
- Opportunity thiếu khách.
- Unknown fallback.

Prompt giao việc:

```text
Bạn là Worker 02 - Backend Context. Chỉ chỉnh mcpContextEngine và test fixture liên quan; chỉ chạm crmService nếu cần tách business clock. Sửa target resolution theo tên khách, sources nhất quán, context clone, bỏ hardcode ngày. Không đổi contract { reply, sources, context }. Chạy npm run test:crm và test HTTP nếu có.
```

### Phase 3 - Security baseline: auth, CORS, audit, LLM guardrail

Mục tiêu: biến demo public thành pilot có kiểm soát.

Owner đề xuất: Worker 03 - Security/Compliance.

Phạm vi file:

- `src/server.js`
- `src/services/authService.js`
- `src/services/auditLogger.js`
- `src/services/agentService.js`
- `src/plugins/llmFallback.js`
- `src/plugins/agents/llmAgent.js`
- `.env.example`
- `tests/security*.mjs`

Từng bước auth/CORS:

1. Thêm `AUTH_MODE=disabled|api-key|gateway-header|jwt`.
2. Default local có thể `disabled`, production phải fail-closed nếu thiếu auth config.
3. Thêm middleware `requireAuth` cho mọi `/api/*` trừ `/api/health`.
4. Thêm `requireRole("admin")` cho `/api/audit-logs` và có thể `/api/agents`.
5. Set `req.rm = { userId, branchId, role, segments }`.
6. CORS production không default `*`; dùng `CORS_ORIGIN` allowlist.
7. Ẩn `detail: error.message` ở 500 khi production.
8. Thêm rate limit nhẹ cho `/api/chat` nếu không cần dependency mới thì dùng in-memory sliding window demo mode.

Từng bước audit:

1. Định nghĩa audit schema:
   - `eventId`
   - `timestamp`
   - `correlationId`
   - `userIdHash`
   - `action`
   - `route` hoặc `tool`
   - `provider`
   - `model`
   - `sources`
   - `status`
   - `errorCode`
   - `latencyMs`
   - `promptHash`
   - `responseHash`
   - `dataCategories`
2. Không lưu raw prompt mặc định.
3. Chỉ lưu `redactedPrompt` khi `AUDIT_STORE_REDACTED=true`.
4. Ghi audit cả success và error path trong `runAgentTurn`.
5. `/api/audit-logs` phải redact và admin-only.
6. Chuẩn bị sink SIEM/syslog/HTTPS collector bằng interface, local file chỉ là fallback dev.

Từng bước LLM guardrail:

1. Thêm `LLM_ENABLED=false` mặc định.
2. Thêm `LLM_ALLOWED_HOSTS`.
3. URL ngoài allowlist thì agent LLM không enabled.
4. Implement `maskPII(text)`:
   - phone
   - email
   - CCCD/CMND
   - số tài khoản
   - tên khách hàng lấy từ CRM context nếu có thể
   - số tiền lớn nếu gửi ra ngoài
5. Chỉ gửi context tối thiểu theo intent, không gửi toàn bộ danh sách CRM mặc định.
6. Thêm timeout, secondary proxy chỉ nếu cũng nằm trong allowlist.
7. Log `llm_request`/`llm_response` bằng hash, không raw content.

Nghiệm thu:

- Không token vào protected API trả 401.
- Sai role vào audit trả 403.
- Host LLM ngoài allowlist không gọi ra ngoài.
- Request tới mock LLM không chứa số điện thoại/email/tên KH thật.
- Audit không chứa raw prompt mặc định.
- `npm run security:smoke` pass.

Prompt giao việc:

```text
Bạn là Worker 03 - Security/Compliance. Chỉ chỉnh server auth/CORS, audit logger/orchestration, LLM fallback/agent và tests security. Không chạm frontend UI, không thay CRM business logic. Mục tiêu: fail-closed production, audit không raw PII, LLM allowlist + maskPII. Chạy lint/test/security smoke và báo cáo evidence.
```

### Phase 4 - CRM adapter pilot mode

Mục tiêu: tách rõ demo mock và pilot CRM thật, không để mock che lỗi production.

Owner đề xuất: Worker 04 - CRM Adapter.

Phạm vi file:

- `src/services/crmService.js`
- `.env.example`
- `tests/crm-adapter*.mjs`
- `docs/integration-proposal.md`

Từng bước:

1. Tách provider rõ:
   - mock provider
   - sandbox API provider
   - production API provider nếu cần.
2. Thêm `CRM_MODE=mock|sandbox|production`.
3. Pilot/production default `CRM_FALLBACK_TO_MOCK=false`.
4. `crmRequest` có `AbortController` timeout.
5. Phân loại lỗi:
   - config missing
   - auth failed
   - timeout
   - malformed response
   - 4xx/5xx
6. Validate response shape tối thiểu trước khi đưa vào agent.
7. Field allowlist cho dữ liệu trả UI.
8. Thêm `sourceType=mock|real` trong trace nội bộ hoặc audit, không nhất thiết hiện frontend.
9. Lỗi CRM thật phải trả thông báo rõ cho RM, không silently dùng mock trong pilot.
10. Nếu có pagination từ CRM thật, adapter phải gom hoặc giới hạn có kiểm soát.

Nghiệm thu:

- `CRM_MODE=mock npm run test:crm` pass.
- `CRM_USE_SANDBOX_API=true CRM_FALLBACK_TO_MOCK=false CRM_API_BASE_URL=https://127.0.0.1:9` không trả mock.
- Malformed CRM response không làm server crash.
- Audit ghi `crm_request_failed` khi outbound lỗi.

Prompt giao việc:

```text
Bạn là Worker 04 - CRM Adapter. Chỉ chỉnh crmService, env docs và tests adapter. Mục tiêu: phân biệt mock/sandbox/production, timeout, schema validation, pilot không fallback mock âm thầm. Không chạm mcpContextEngine trừ khi cần cập nhật error contract đã thống nhất.
```

### Phase 5 - Frontend RM workspace

Mục tiêu: biến ô chat thành workspace RM có thao tác nhanh, nguồn dữ liệu và trạng thái rõ.

Owner đề xuất: Worker 05 - Frontend.

Phạm vi file:

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `public/config.js` nếu cần cấu hình API base rõ hơn

Từng bước:

1. Thêm welcome state với quick actions:
   - Khách hàng đến hạn tuần này
   - Soạn email follow-up
   - Cơ hội bán chéo
   - Chiến dịch đang chạy
   - Bạn làm được gì?
2. Đổi composer sang textarea:
   - Enter gửi
   - Shift+Enter xuống dòng
   - có label ẩn accessibility.
3. Thêm loading bubble.
4. Thêm retry state khi lỗi fetch hoặc JSON parse.
5. Thêm `aria-live="polite"` cho chat window.
6. Thêm panel `workspacePanel`:
   - context hiện tại
   - sources gần nhất
   - không hiển thị `auditId`, `latency`, endpoint kỹ thuật nếu policy không cho phép; nếu hiển thị nguồn thì dùng nhãn thân thiện.
7. Thêm dashboard snapshot tùy chọn:
   - customers
   - opportunities
   - interactions
   - campaigns
8. Responsive dưới 640px:
   - bỏ margin bubble 24%
   - app full viewport
   - panel xếp dưới hoặc drawer.
9. Draft email/call script:
   - detect `lastIntent=email-draft|call-script`
   - copy to clipboard
   - không gửi email thật.

Nghiệm thu:

- Viewport 360px không vỡ layout.
- RM hoàn thành demo bằng quick action, không cần nhớ prompt.
- Chat không submit trùng khi bấm nhanh.
- Không lộ metadata kỹ thuật cấm trên UI.
- Text tiếng Việt có dấu hiển thị đúng trên browser.

Prompt giao việc:

```text
Bạn là Worker 05 - Frontend RM Workspace. Chỉ chỉnh public/*. Không chạm backend. Nâng chat UI thành workspace có quick actions, loading/retry, context/sources panel, responsive/accessibility. Không hiển thị auditId/module/latency. Kiểm thử thủ công 360px, 768px, desktop và báo cáo screenshot/evidence nếu có.
```

### Phase 6 - MCP toolkit và ops docs

Mục tiêu: làm MCP và vận hành đủ rõ để agent ngoài dùng được.

Owner đề xuất: Worker 06 - MCP/Ops Docs.

Phạm vi file:

- `src/mcp/server.js`
- `mcp.config.json`
- `docs/mcp-toolkit.md`
- `docs/OPERATIONS.md`
- `README.md`
- `.gitignore`
- `.github/workflows/ci.yml` nếu Worker 01 chưa làm

Từng bước MCP:

1. Sửa `mcp.config.json` `cwd` về repo thật hoặc dùng relative path nếu client hỗ trợ.
2. Thêm wrapper `runTool(tool, sources, fn)`:
   - đo latency
   - audit success
   - audit error
   - trả JSON error chuẩn.
3. Cap `daysAhead` cho due customers.
4. MCP audit không dùng latency `0`.
5. Thử đủ 8 tool bằng MCP inspector/client nếu có.

Từng bước ops:

1. Cập nhật README scripts thật.
2. Thêm `docs/OPERATIONS.md`:
   - local run
   - env vars
   - deploy Vercel/Firebase
   - smoke checks
   - rollback
   - audit log caveat
   - troubleshooting.
3. `.gitignore` ignore drawio temp:
   - `docs/.$*.bkp`
   - `docs/.$*.dtmp`
4. Không đưa script diagram phụ thuộc path ngoài repo vào CI nếu chưa vendor dependency.

Nghiệm thu:

- `npm run mcp` khởi động từ repo hiện tại.
- MCP tool lỗi vẫn có audit.
- Người mới clone repo chạy được từ `npm ci` tới smoke local theo README.

Prompt giao việc:

```text
Bạn là Worker 06 - MCP/Ops Docs. Chỉ chỉnh MCP server/config và docs/ops. Không thay business logic. Sửa cwd MCP, audit latency/error cho tool, cập nhật README/OPERATIONS, ignore drawio temp. Chạy npm run mcp smoke nếu có thể và báo cáo.
```

## 4. Thứ tự triển khai đề xuất

Thứ tự an toàn:

1. Worker 01: Quality/Test.
2. Worker 02: Backend Context.
3. Worker 03: Security/Compliance.
4. Worker 04: CRM Adapter.
5. Worker 05: Frontend RM Workspace.
6. Worker 06: MCP/Ops Docs.

Có thể chạy song song sau Phase 1:

- Worker 02 và Worker 05 có thể song song nếu Worker 05 chỉ dùng contract hiện có.
- Worker 04 và Worker 06 có thể song song nếu Worker 06 không sửa `crmService.js`.
- Worker 03 nên được review kỹ và không chạy song song với Worker 04 nếu cùng chạm error/audit behavior của CRM.

Không nên chạy song song:

- Worker 01 và bất kỳ worker nào cần thêm test/deps vào `package.json`.
- Worker 02 và Worker 04 nếu cả hai cùng sửa `crmService.js`.
- Worker 03 và Worker 06 nếu cả hai cùng sửa audit MCP/server cùng lúc.

## 5. Gate kiểm duyệt sau mỗi phase

Sau mỗi phase, main reviewer chạy:

```bash
git status --short
npm run lint
npm test
npm run test:crm
```

Nếu có dev server:

```bash
npm start
curl -s -X POST http://localhost:3000/api/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"conversationId\":\"review-smoke\",\"message\":\"1\"}"
```

Review thủ công:

- Response có `reply`.
- Response có `sources`.
- Response có `context`.
- Frontend chỉ hiển thị nội dung phù hợp cho RM.
- Audit không chứa raw prompt/PII trong production mode.
- Không có outbound LLM nếu LLM disabled hoặc URL không allowlist.

## 6. Backlog tính năng sau pilot

Chỉ làm sau khi P0/P1 ổn:

- RM workspace có danh sách việc cần làm hôm nay.
- Customer 360 với products, interactions, opportunities, campaigns.
- Next-best-action có scoring và lý do giải thích.
- Draft email/SMS/call script structured response `{ type, subject, body, customerIds }`.
- Redis hoặc database cho context store bền vững.
- SIEM production sink và retention policy thật.
- RBAC theo chi nhánh, phân khúc, danh mục khách hàng.
- CRM read-only pilot rồi mới mở write-back action.

## 7. Báo cáo rà soát agent con

Explorer A - Backend/Context:

- Xác nhận rule engine xử lý nhiều intent cốt lõi.
- Phát hiện target theo tên khách bị bỏ qua ở email/call script.
- Phát hiện ngày nghiệp vụ hardcode `2026-07-07`.
- Phát hiện sources rỗng/sources không khớp hành động.
- Đề xuất context store có TTL/reset/clone.

Explorer B - Security/Compliance:

- Xác nhận API đang mở CORS `*`, chưa auth/RBAC.
- Audit đang lưu raw prompt và `/api/audit-logs` exposed.
- LLM fallback gửi context CRM rộng, chưa masking/allowlist.
- Đề xuất auth, audit hash/redaction, LLM proxy guardrail, CRM mock fallback guard.

Explorer C - Frontend/RM Workflow:

- Xác nhận UI hiện là chat MVP.
- Thiếu quick actions, loading/retry, context/sources panel, responsive/accessibility.
- Đề xuất nâng lên RM workspace trước khi thêm hành động thật.

Explorer D - Test/DevOps:

- Xác nhận `npm run test:crm` pass 21/21.
- Chưa có lint/test runner/CI/deploy smoke chuẩn.
- Vercel entrypoint hoạt động, Firebase là static hosting.
- Đề xuất quality gate, HTTP contract test, GitHub Actions, ops runbook.

## 8. Quyết định cuối để bắt đầu implementation

Khuyến nghị bắt đầu bằng Worker 01 rồi Worker 02. Lý do: nếu chưa có quality gate, các sửa security/frontend dễ làm vỡ demo mà không phát hiện sớm; nếu chưa sửa target/context/sources/clock, UI đẹp hơn cũng chỉ che lỗi nghiệp vụ.

Sau Worker 01 và Worker 02 pass, main reviewer mới mở Worker 03. Security changes có khả năng làm gãy demo public nên cần có mode local/demo rõ ràng trước khi bật fail-closed production.
