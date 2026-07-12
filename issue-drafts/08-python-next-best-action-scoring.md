# [P2] Python next-best-action scoring và materialized recommendations

Labels: python, backend, db

## Summary
Xây scoring job bằng Python để tính next-best-action cho từng khách hàng dựa trên profile, lịch sử tương tác, cơ hội và product knowledge base.

## Evidence
- Challenge yêu cầu gợi ý hành động kế tiếp dựa trên lịch sử tương tác.
- Python phù hợp cho batch analytics, scoring và thử nghiệm rule/model đơn giản.

## Expected Behavior
Backend JS có thể đọc bảng hoặc file kết quả scoring để trả lời “khách này nên bán chéo sản phẩm nào?” với lý do và nguồn dữ liệu rõ ràng.

## Acceptance Criteria
- [ ] Thêm `scripts/scoring/next_best_action.py`.
- [ ] Input gồm customers, interactions, opportunities, products.
- [ ] Output có `customer_id`, `recommended_product_id`, `score`, `reason`, `generated_at`.
- [ ] Lưu kết quả vào bảng `next_best_actions` hoặc JSON materialized output cho local demo.
- [ ] JS repository đọc được recommendation theo customer.
- [ ] Reply agent có lý do giải thích và `sources`.
- [ ] Có test cho ít nhất 3 phân khúc khách hàng.

## Suggested Scope
- `scripts/scoring/next_best_action.py`
- `db/schema.sql`
- `src/services/crmRepository.js`
- `src/services/mcpContextEngine.js`
- `tests/`

## Verification
```bash
python scripts/scoring/next_best_action.py
npm run test:crm
```
