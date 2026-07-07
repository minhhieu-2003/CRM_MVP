---
name: email-drafter
description: Soạn email follow-up cá nhân hóa cho danh sách khách hàng đang được quan tâm.
module: interaction
endpoints:
  - GET /customers
  - POST /draft-email
---

# Skill: Email Drafter (Soạn email follow-up)

## Mục tiêu
Giảm >= 50% thời gian soạn email của RM bằng cách tạo sẵn email cá nhân hóa (tên, sản phẩm, số tiền, ngày đến hạn, gợi ý sản phẩm phù hợp).

## Intent kích hoạt
- "Soạn email cho nhóm này"
- "soan email follow-up"
- "soan tiep khach hang" (không dấu / gõ sai vẫn nhận diện)
- Phím tắt: `2`

## Điều kiện nhận diện
- Chuỗi chuẩn hóa chứa `soan`/`draft` + (`email`/`khach hang`/`tiep`/`follow up`), **hoặc** `soan tiep`, **hoặc** input đúng bằng `2`.

## Logic chọn khách hàng
1. Nếu context có `focusedCustomers` → dùng danh sách đó.
2. Nếu không → lấy khách hàng đến hạn 7 ngày tới.
3. Nếu vẫn rỗng → yêu cầu RM chỉ định khách hàng.

## Cá nhân hóa gợi ý
- Segment `Affluent` → gợi ý bảo hiểm liên kết vay mua nhà.
- Segment khác → gợi ý tái tục tự động kỳ hạn linh hoạt.

## Nguồn dữ liệu
- `GET /customers`, `POST /draft-email`.

## Đầu ra
- Tối đa 5 email draft, mỗi email gồm tiêu đề + nội dung tiếng Việt có dấu, có thể chỉnh sửa 1-click.
