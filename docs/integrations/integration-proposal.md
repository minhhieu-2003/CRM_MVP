# Đề xuất tích hợp Bank A CRM

> **Trạng thái:** Đề xuất đưa MVP hiện tại lên pilot. Xem [mục lục tài liệu](../README.md),
> [kiến trúc tổng thể](../architecture/architecture.md) và [MCP Toolkit](mcp-toolkit.md).

## Mục tiêu pilot

- 50 RM tại Hà Nội và TP.HCM trong 3 tháng.
- Độ chính xác nghiệp vụ tối thiểu 85% trên bộ ca thử nghiệm đã duyệt.
- 100% phản hồi nghiệp vụ có source trace.
- Giảm tối thiểu 50% thời gian soạn email và call script.
- Không phát sinh truy cập chéo RM/chi nhánh trong kiểm thử phân quyền.

## Baseline đã có trong MVP

MVP không còn ở giai đoạn “thay rule engine bằng orchestration agent”. Khi
`AI_NATIVE_CORE=true`, đường chính đã là:

```text
/api/chat
  -> AI planner qua configured LLM proxy
  -> MCP stdio client/server
  -> canonical tool registry
  -> server-bound policy / entitlement engine
  -> application-scoped CRM repository
  -> configured provider
  -> grounded synthesis
```

Deterministic engine và multi-agent plugins là chuỗi dự phòng. Registry công bố schema, risk,
access, source và `requiredScopes`; `tools/list` lọc theo entitlement và registry kiểm tra lại trước
execution. Mọi tool call hợp lệ trả strict structured observation. Repository
hiện hỗ trợ bốn provider rõ ràng:

| `CRM_MODE` | Mục đích                                      | Ràng buộc hiện tại                                                  |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------- |
| `mock`     | Demo/test local                               | Bị từ chối ở `pilot` và `production`.                               |
| `sqlite`   | Local integration và test có dữ liệu bền vững | Read-only, yêu cầu đúng schema version.                             |
| `postgres` | Môi trường dùng database tập trung            | Hiện đọc collection qua adapter chung.                              |
| `sandbox`  | CRM API được cấu hình                         | API key hoặc bearer, timeout bắt buộc, không tự fallback sang mock. |

Capability entitlement và RM/branch data scope được enforce trong `toolPolicy.js` /
`crmRepository.js` cho customer, opportunity, interaction và campaign. Cùng boundary bảo vệ direct
CRM/draft HTTP, deterministic fallback và LLM fallback. Draft email/call script chỉ tạo nội dung;
không gửi, không gọi và không ghi CRM.

## Khoảng cách cần đóng trước pilot

| Khu vực        | Hiện tại                                                                                                                         | Yêu cầu pilot/production                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Authentication | Bearer token map sang identity phía server; local có thể tắt auth                                                                | SSO/OIDC cho RM, service identity tới CRM Gateway, rotation và revocation.                                           |
| Authorization  | Server-bound entitlement + RM/branch data scope; protected mode fail-closed                                                      | SSO/OIDC + entitlement/RBAC service tập trung, provisioning/revocation và review định kỳ.                            |
| Tool scopes    | Enforce ALL `requiredScopes` tại filtered list, registry, repository và fallback/routes; admin wildcard phải cấu hình tường minh | Quản trị capability tập trung và policy-decision audit bền vững.                                                     |
| CRM query      | Repository scope dữ liệu rồi collection tool cắt page                                                                            | Đẩy filter, sort, limit và cursor xuống PostgreSQL/CRM API; tránh tải full collection.                               |
| LLM policy     | Chỉ cho `synthetic`/`anonymized`, configured HTTPS proxy; chặn direct vendor                                                     | Approved-host/mTLS, DLP/redaction trước proxy, logging/rate limit được kiểm chứng, model allowlist và egress policy. |
| Context        | Process-local snapshot/revision/CAS theo actor + conversation, có TTL/size bound                                                 | Redis/PostgreSQL có distributed CAS, mã hóa, retention và xóa theo policy.                                           |
| Grounding      | Strict JSON, code-owned sources và typed sensitive-claim validation                                                              | Harden field/entity-scoped provenance và đánh giá grounding theo domain.                                             |
| Audit          | NDJSON cục bộ và recent-memory merge                                                                                             | Immutable centralized audit/SIEM, correlation ID, retention và alerting.                                             |
| MCP transport  | Child process stdio theo chat turn                                                                                               | Process/container runtime ổn định hoặc remote MCP transport có mTLS và service auth.                                 |
| Resilience     | Timeout, bounded discovery retry, deterministic fallback                                                                         | SLO, circuit breaker, backpressure, telemetry và diễn tập failover.                                                  |

Ứng dụng kiểm tra cấu hình proxy và data class nhưng chưa thể chứng minh proxy thực sự có
logging/masking/rate-limit hoặc thuộc approved host. Entitlement Phase 1 đã được enforce trong
process; đây chưa thay thế lifecycle/RBAC service và audit policy tập trung của Bank A.

## Kiến trúc tích hợp mục tiêu

1. **Identity và access**
   - RM đăng nhập qua SSO/OIDC; backend xác minh token và ánh xạ user/RM/branch/role.
   - MCP authorization nhận identity từ backend qua session environment riêng và không tin tool arguments/prompt; planner vẫn nhận một safe identity subset (`role`, `rmId`, `branchId`) làm authorization context.
   - Capability entitlement tiếp tục được đối chiếu theo ALL `requiredScopes`; production thay map cấu hình bằng entitlement service có provisioning/revocation.
2. **CRM Gateway**
   - Dùng OAuth2 client credentials hoặc mTLS cho service-to-service.
   - Hỗ trợ filter/cursor/page tại nguồn cho customers, opportunities, interactions và campaigns.
   - Không tự hạ xuống mock khi sandbox/CRM lỗi.
3. **LLM Gateway**
   - Mọi planner/synthesizer/fallback call đi qua proxy nội bộ được duyệt.
   - Áp data classification, PII redaction/DLP, model allowlist, logging, rate limit và timeout.
4. **Context và audit**
   - Đưa conversation state ra store có TTL; khóa namespace theo actor + conversation.
   - Gửi tool trace, policy decision và response metadata vào audit store bất biến/SIEM.
5. **Runtime MCP**
   - Với VM/container, có thể giữ stdio nếu process lifecycle và capacity được giám sát.
   - Guard hiện chỉ tự nhận diện Vercel và fail closed stdio tại đó; serverless khác phải có deployment policy tương đương. Production nên dùng remote MCP transport hoặc chuyển AI orchestration sang runtime cho phép child process.

## Lộ trình triển khai

### Giai đoạn 0 — Pilot readiness

- Chốt data inventory, classification và DPIA/đánh giá tuân thủ theo chính sách Bank A.
- Kết nối CRM sandbox qua gateway; kiểm thử scope chéo RM/branch và fail-closed.
- Xác nhận configured proxy trở thành approved endpoint bằng host allowlist/service identity, logging, redaction, rate limit và egress control.
- Tạo dashboard latency/error/source coverage và runbook khi MCP/LLM/CRM lỗi.

### Giai đoạn 1 — Policy và state consistency (đã triển khai trong MVP)

- Enforce ALL `requiredScopes` ở MCP list/call và mọi application data path; deny bằng `TOOL_SCOPE_DENIED`.
- Validate strict observation contract/source/timestamp và không đưa scope vào LLM evidence.
- Reject plan vượt budget; draft/validate/CAS context sau synthesis/grounding/source validation.

### Giai đoạn 2 — Data và hạ tầng bền vững

- Thêm query scope/filter/limit/cursor pushdown cho PostgreSQL và sandbox API.
- Đưa context sang Redis/DB có distributed CAS và audit sang hạ tầng immutable có retention policy.
- Harden grounding theo entity/field provenance và kiểm thử domain-specific claims.

### Giai đoạn 3 — Runtime production

- Chọn container/VM cho stdio hoặc triển khai remote MCP transport có mTLS.
- Bổ sung backpressure, circuit breaker, capacity planning và disaster recovery.
- Pen-test prompt/tool boundary, auth mapping, audit integrity và data leakage.

### Giai đoạn 4 — Mở rộng có kiểm soát

- Thêm Product Knowledge Base/RAG sau khi có content governance và retrieval evaluation.
- Chỉ bổ sung provider/model fallback khi cùng đi qua gateway đã được phê duyệt và policy chung.
- Mở rộng tool write-action sau khi có approval workflow, idempotency và audit phù hợp; các tool MVP
  hiện vẫn content-only/read access.

## KPI và tiêu chí go/no-go

| Chỉ số                                 | Mục tiêu pilot |
| -------------------------------------- | -------------: |
| Accuracy trên bộ ca đã duyệt           |       `>= 85%` |
| Source trace coverage                  |         `100%` |
| Simple-query latency                   |    `<= 5 giây` |
| Multi-customer/draft latency           |   `<= 15 giây` |
| Draft được RM chấp nhận không cần sửa  |        `> 40%` |
| Cross-scope access trong security test |            `0` |
| Mock data trong pilot/production       |            `0` |

Go-live chỉ được duyệt sau khi entitlement/RBAC lifecycle tập trung, query pushdown, centralized
audit, proxy approval controls và phương án MCP runtime đã có evidence kiểm thử.
