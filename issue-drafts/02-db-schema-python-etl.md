# [P0] Thiết kế DB schema và Python ETL import mock CRM

Labels: backend, db, python

## Summary
Tạo lớp dữ liệu có thể truy vấn thật thay cho việc phụ thuộc trực tiếp vào mock JSON. Local/hackathon dùng SQLite trước, pilot có đường nâng lên PostgreSQL.

## Evidence
- Dữ liệu hiện nằm trong `src/data/mock/*.json` và `src/data/mock/*.csv`.
- `crmService.js` đang đọc JSON/cached arrays trực tiếp.
- Roadmap ưu tiên Python cho ETL, import, data quality và scoring.

## Expected Behavior
Có schema quan hệ tối thiểu cho customers, interactions, opportunities, campaigns, products, templates, context events và audit logs; có script Python import dữ liệu mock vào DB local.

## Acceptance Criteria
- [ ] Thêm `db/schema.sql`.
- [ ] Thêm `scripts/db/init_db.py` để tạo SQLite DB local.
- [ ] Import được customers, opportunities, interactions, campaigns, email templates và call scripts.
- [ ] Tạo field/index `normalized_name` để hỗ trợ tìm tiếng Việt có dấu/không dấu.
- [ ] Có index cho `customers(maturity_date)`, `opportunities(customer_id)`, `interactions(customer_id, occurred_at)`.
- [ ] Script chạy lại được nhiều lần mà không tạo dữ liệu trùng.

## Suggested Scope
- `db/schema.sql`
- `scripts/db/init_db.py`
- `src/data/mock/`
- `.env.example`
- `README.md`

## Verification
```bash
python scripts/db/init_db.py
npm run test:crm
```
