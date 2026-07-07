---
name: opportunity-advisor
description: Tổng hợp hồ sơ, lịch sử tương tác và cơ hội bán chéo cho một khách hàng cụ thể.
module: opportunity
endpoints:
  - GET /customers
  - GET /opportunities
  - GET /interactions
---

# Skill: Opportunity Advisor (Gợi ý cơ hội)

## Mục tiêu
Trả lời câu hỏi của RM về một khách hàng cụ thể với thông tin có nguồn gốc: hồ sơ, cơ hội bán chéo tốt nhất, và ghi chú tương tác gần nhất.

## Intent kích hoạt
- "Khách Nguyễn Văn An có cơ hội mua bảo hiểm nào phù hợp không?"
- "khach Tran Thi Mai co gi khong"
- Phím tắt: `3` (gợi ý người dùng nêu tên khách hàng)

## Điều kiện nhận diện
- Phát hiện tên khách hàng qua mẫu `khach <tên>` trong câu.

## Xử lý
1. Tra cứu khách hàng theo tên (`getCustomerByName`).
2. Lấy cơ hội (`getCustomerOpportunities`) và chọn cơ hội có `score` cao nhất.
3. Lấy tương tác gần nhất (`getCustomerInteractions`).
4. Chuyển context: `currentModule = opportunity`, `focusedCustomers = [id]`.

## Đầu ra
- Segment, sản phẩm tiết kiệm, số dư.
- Cơ hội tiếp theo tốt nhất kèm xác suất chuyển đổi và giá trị dự kiến.
- Ghi chú lần tương tác gần nhất.

## Nguồn dữ liệu
- `GET /customers`, `GET /opportunities`, `GET /interactions`.
