---
name: customer-reminder
description: Nhắc RM về khách hàng có sản phẩm tiết kiệm sắp đến hạn để chăm sóc kịp thời.
module: customer-profile
endpoints:
  - GET /customers
---

# Skill: Customer Reminder (Nhắc đến hạn)

## Mục tiêu
Giúp RM nhanh chóng biết những khách hàng có khoản tiết kiệm sắp đến hạn (mặc định 7 ngày tới) để chủ động liên hệ, giữ chân và bán chéo.

## Intent kích hoạt
Ví dụ (hỗ trợ có dấu / không dấu / phím tắt):
- "Nhắc tôi những khách hàng có tiết kiệm đến hạn trong tuần này"
- "nhac khach hang den han tiet kiem"
- Phím tắt: `1`

## Điều kiện nhận diện (trong `mcpContextEngine.js`)
- Chuỗi chuẩn hóa chứa `nhac` + `tiet kiem` + `den han`, **hoặc** input đúng bằng `1`.

## Đầu ra
- Danh sách khách hàng đến hạn: tên, sản phẩm, số tiền (định dạng VND), ngày đến hạn.
- Câu hỏi tiếp nối: có muốn soạn email nhắc hạn không?
- Cập nhật context: `currentModule = customer-profile`, `focusedCustomers = [...]`.

## Nguồn dữ liệu
- `GET /customers` (mock: `src/services/crmData.js`).

## Ghi chú
- `focusedCustomers` được dùng lại bởi skill `email-drafter` và `call-script`.
