# Skill: Hướng dẫn thiết kế kiến trúc hệ thống toàn bộ hệ sinh thái bằng draw.io

## 1) Mục tiêu
Tài liệu này hướng dẫn cách thiết kế **kiến trúc hệ thống chi tiết** cho toàn bộ hệ sinh thái đề bài bằng **draw.io (diagrams.net)**, nhằm:
- Chuẩn hóa cách vẽ và đọc sơ đồ giữa các vai trò (BA, Dev, QA, DevOps, Security).
- Truy vết rõ ràng từ yêu cầu nghiệp vụ -> module -> luồng dữ liệu -> triển khai.
- Hỗ trợ review kỹ thuật, ước lượng, và vận hành.

> Tham khảo chính thức: https://www.drawio.com/docs/

---

## 2) Nguyên tắc thiết kế kiến trúc

1. **Top-down 4 cấp**:
   - Cấp 1: Context (toàn cảnh hệ sinh thái)
   - Cấp 2: Container/Service (các hệ thống chính)
   - Cấp 3: Component (module nội bộ từng service)
   - Cấp 4: Flow chi tiết (sequence/data flow/deployment)

2. **Một sơ đồ - một mục tiêu chính**:
   - Không trộn quá nhiều mục tiêu trong 1 trang.
   - Mỗi page chỉ trả lời 1 câu hỏi kiến trúc cụ thể.

3. **Chuẩn hóa ký hiệu và màu sắc**:
   - Cùng loại thành phần dùng cùng kiểu shape và màu.
   - Có legend (bảng chú giải) ở góc dưới phải.

4. **Phân tách concern rõ ràng**:
   - Domain, ứng dụng, tích hợp, dữ liệu, hạ tầng, bảo mật.

5. **Truy vết được**:
   - Mọi flow quan trọng có đánh số bước (1,2,3...).
   - Các API/Topic/Event phải có tên nhất quán.

---

## 3) Cấu trúc file draw.io đề xuất

- Tạo 1 file chính: `docs/architecture/system-ecosystem.drawio`.
- Dùng nhiều **Page** trong cùng file:
  1. `00-legend-conventions`
  2. `01-system-context`
  3. `02-container-view`
  4. `03-component-crm-core`
  5. `04-integration-adapters`
  6. `05-data-flow-order-to-cash` (hoặc flow nghiệp vụ chính)
  7. `06-security-trust-boundary`
  8. `07-deployment-runtime`
  9. `08-observability-logging-monitoring`
  10. `09-failure-scenarios-retry-dlq`

> Nếu hệ sinh thái lớn, tách thêm file theo domain nhưng phải giữ chung quy ước.

---

## 4) Quy ước ký hiệu (Shape Convention)

### 4.1 Thành phần logic
- **Actor/User/System ngoài**: hình người hoặc rounded rectangle màu xám nhạt.
- **Frontend/Web/Mobile**: rectangle xanh dương nhạt.
- **API Gateway/BFF**: hexagon hoặc rectangle viền đậm.
- **Microservice/Backend Service**: rectangle bo góc màu xanh lá nhạt.
- **Worker/Job/Consumer**: rectangle nét đứt.
- **Database**: cylinder.
- **Cache**: cylinder nhỏ màu cam nhạt.
- **Message Broker/Queue/Topic**: queue shape hoặc parallelogram tím nhạt.
- **External 3rd-party**: cloud shape.

### 4.2 Đường nối (Connector)
- **Sync request/response**: đường liền, mũi tên đặc.
- **Async event/message**: đường nét đứt, mũi tên rỗng.
- **Data replication/ETL**: nét chấm gạch.
- **Phụ thuộc nội bộ**: đường mảnh màu xám.

### 4.3 Nhãn bắt buộc trên connector
Mỗi connector nên có format:
- `METHOD /endpoint` (với HTTP)
- `topic.name` hoặc `event.name.v1` (với event)
- `payload: key fields` (ngắn gọn)

Ví dụ:
- `POST /api/v1/leads`
- `crm.customer.created.v1`

---

## 5) Chuẩn đặt tên thành phần

- Service: `<domain>-service` (vd: `customer-service`, `deal-service`)
- DB: `<service>-db` (vd: `customer-db`)
- Topic/Event: `<domain>.<entity>.<action>.v<version>`
- API path: `/api/v1/<resource>`
- Job: `<domain>-<purpose>-worker`

Quy tắc:
- Không viết tắt khó hiểu.
- Cùng 1 entity dùng đúng 1 từ trên toàn hệ sinh thái.

---

## 6) Khung nội dung cho từng loại sơ đồ

## 6.1 Context Diagram (Page `01-system-context`)
Mục tiêu: cho thấy ranh giới hệ thống và tương tác với tác nhân ngoài.

Bắt buộc có:
- Internal system boundary.
- Actor chính (Admin/Sales/CS/Manager).
- External systems (Email/SMS/Payment/ERP/... nếu có).
- Luồng dữ liệu chính 2 chiều.

Checklist:
- [ ] Đã thể hiện đầy đủ tác nhân chính?
- [ ] Đã thể hiện trust boundary?
- [ ] Có legend?

## 6.2 Container Diagram (Page `02-container-view`)
Mục tiêu: cho thấy các khối triển khai chính.

Bắt buộc có:
- Frontend, API gateway/BFF, backend services, DB/cache/broker.
- Kết nối sync/async.
- Ghi rõ nơi lưu state.

Checklist:
- [ ] Service nào sở hữu DB nào?
- [ ] Có điểm nghẽn single point of failure?
- [ ] Có đường đi request end-to-end?

## 6.3 Component Diagram (Page `03-*`)
Mục tiêu: mô tả module nội bộ của 1 service quan trọng.

Bắt buộc có:
- Controller/Handler
- Application Service/Use Case
- Domain Model
- Repository/Adapter
- Outbound integrations

Checklist:
- [ ] Dependency đúng chiều (ngoài -> trong)?
- [ ] Domain không phụ thuộc framework?
- [ ] Có điểm mở rộng?

## 6.4 Data Flow / Sequence (Page `05-*`)
Mục tiêu: mô tả chi tiết một quy trình nghiệp vụ chính.

Bắt buộc có:
- Trigger
- Các bước đồng bộ + bất đồng bộ
- Chỗ validate + authorize
- Chỗ ghi DB + phát event
- Error handling + retry

Checklist:
- [ ] Có idempotency key ở bước cần thiết?
- [ ] Có transaction boundary rõ?
- [ ] Có trạng thái thất bại và bù trừ?

## 6.5 Security Diagram (Page `06-security-trust-boundary`)
Mục tiêu: thể hiện biên tin cậy và kiểm soát bảo mật.

Bắt buộc có:
- Trust zones: Public / Private / Restricted.
- AuthN/AuthZ flow.
- Secret management.
- Encryption in transit/at rest.
- Audit log path.

Checklist:
- [ ] Endpoint public đã qua gateway/WAF?
- [ ] Service-to-service auth có mTLS/JWT?
- [ ] PII được masking/tokenization ở đâu?

## 6.6 Deployment Diagram (Page `07-deployment-runtime`)
Mục tiêu: cách hệ thống chạy trên môi trường thật.

Bắt buộc có:
- Environments: dev/staging/prod.
- Runtime (VM/K8s/Serverless).
- Scaling strategy.
- HA/DR (multi-AZ/backup/restore).

Checklist:
- [ ] Có health check/readiness/liveness?
- [ ] Có autoscaling rule?
- [ ] Có backup retention và RTO/RPO?

## 6.7 Observability (Page `08-observability-logging-monitoring`)
Mục tiêu: theo dõi và cảnh báo vận hành.

Bắt buộc có:
- Log pipeline
- Metrics pipeline
- Tracing pipeline
- Alert rules
- Dashboard theo domain

Checklist:
- [ ] Correlation ID chạy xuyên suốt?
- [ ] Có SLI/SLO cho luồng chính?
- [ ] Có alert chống noise?

---

## 7) Quy trình thực hiện trên draw.io (thực hành chuẩn)

1. Mở app/web draw.io và chọn nơi lưu file (Git, local, cloud).
2. Tạo file theo tên chuẩn và thêm các page theo mục 3.
3. Thiết lập style chung từ page `00-legend-conventions`.
4. Bật grid/snap để căn chỉnh đều.
5. Dùng container/boundary để nhóm domain.
6. Vẽ từ trái sang phải theo hướng luồng chính.
7. Gắn nhãn cho mọi connector quan trọng.
8. Thêm legend + version + owner + ngày cập nhật ở footer mỗi page.
9. Export bản review: PNG/SVG/PDF cho stakeholder.
10. Commit cả file `.drawio` + ảnh export vào repo.

---

## 8) Quy chuẩn review kiến trúc

### 8.1 Review checklist kỹ thuật
- [ ] Tính nhất quán tên gọi giữa các page.
- [ ] Không có thành phần “mồ côi” (không kết nối).
- [ ] Luồng auth/authz đầy đủ.
- [ ] Data ownership rõ ràng.
- [ ] Event contract/versioning rõ.
- [ ] Error path và retry path hiện diện.
- [ ] Monitoring/alerting bao phủ luồng quan trọng.

### 8.2 Definition of Done cho sơ đồ kiến trúc
- [ ] Có đủ các page bắt buộc (context/container/component/flow/security/deployment/observability).
- [ ] Được review bởi ít nhất 2 vai trò (Dev + DevOps/Security/BA).
- [ ] Có commit message rõ: `docs(architecture): update ecosystem drawio vX.Y`.

---

## 9) Gợi ý bố cục kiến trúc hệ sinh thái CRM (mẫu tham khảo)

Các khối chính nên có:
- `crm-web-app`
- `api-gateway`
- `auth-service`
- `customer-service`
- `lead-service`
- `deal-service`
- `activity-service`
- `notification-service`
- `reporting-service`
- `integration-service` (email/sms/erp)
- `message-broker`
- Các DB tương ứng từng service
- `cache`
- `object-storage` (nếu lưu file)
- `observability-stack`

Luồng cốt lõi ví dụ:
1. User thao tác trên CRM Web.
2. Web gọi API Gateway.
3. Gateway xác thực qua Auth Service.
4. Gateway gọi domain service tương ứng.
5. Service ghi DB và phát event.
6. Notification/Reporting/Integration consume event.
7. Log/metric/trace được đẩy về observability stack.

---

## 10) Versioning & quản trị thay đổi

- Mỗi thay đổi kiến trúc phải cập nhật:
  - file `.drawio`
  - changelog ngắn trong PR description.
- Dùng semantic version cho tài liệu kiến trúc: `vMAJOR.MINOR`.
- MAJOR: đổi cấu trúc lớn; MINOR: bổ sung luồng/thành phần.

Mẫu commit:
- `docs(architecture): add security trust boundary diagram`
- `docs(architecture): refine async event flow for deals`

---

## 11) Mẫu khung nội dung footer mỗi page

- `Owner:`
- `Reviewers:`
- `Last updated:`
- `Version:`
- `Source of truth:` link tới file drawio trong repo

---

## 12) Anti-pattern cần tránh

- Nhồi nhét toàn bộ hệ thống vào 1 page duy nhất.
- Không phân biệt sync và async.
- Không có trust boundary.
- Dùng tên chung chung: `service1`, `db1`.
- Thiếu error/retry path.
- Không cập nhật diagram sau khi code đã đổi.

---

## 13) Tài liệu tham khảo

- draw.io docs: https://www.drawio.com/docs/
- diagrams.net (app): https://app.diagrams.net/

---

## 14) Kết luận

Áp dụng tài liệu này giúp team xây dựng sơ đồ kiến trúc có tính hệ thống, nhất quán, và sẵn sàng cho triển khai/vận hành thực tế. Khi cần mở rộng hệ sinh thái, ưu tiên cập nhật từ **Context -> Container -> Component -> Flow -> Deployment/Security/Observability** để đảm bảo không bỏ sót tác động liên quan.
