---
name: campaign-viewer
description: Liệt kê các chiến dịch marketing/bán hàng đang chạy để RM khai thác.
module: campaign
endpoints:
  - GET /campaigns
---

# Skill: Campaign Viewer (Xem chiến dịch)

## Mục tiêu
Cho RM biết nhanh các chiến dịch đang active và nhóm khách hàng mục tiêu, phục vụ chào bán đúng thời điểm.

## Intent kích hoạt
- "Cho tôi danh sách chiến dịch đang chạy"
- "xem chien dich"
- "campaign"
- Phím tắt: `4`

## Điều kiện nhận diện
- Chuỗi chuẩn hóa chứa `chien dich` hoặc `campaign`, **hoặc** input đúng bằng `4`.

## Xử lý
1. Lọc chiến dịch có `status = Active`.
2. Chuyển context: `currentModule = campaign`, `lastIntent = campaign-summary`.

## Đầu ra
- Danh sách chiến dịch active kèm phân khúc mục tiêu (segment).

## Nguồn dữ liệu
- `GET /campaigns`.
