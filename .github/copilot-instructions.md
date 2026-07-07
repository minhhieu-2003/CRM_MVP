# Copilot Instructions — BankRM Copilot (CRM AI Agent)

Đây là hướng dẫn ngắn cho GitHub Copilot khi hỗ trợ trong repo này.

## Bối cảnh
Dự án là AI Agent CRM cho Relationship Manager của Bank A, chạy trên Node.js + Express, frontend HTML/JS thuần. Xem `AGENTS.md` để biết chi tiết đầy đủ.

## Nguyên tắc bắt buộc
- Ngôn ngữ hiển thị cho người dùng cuối: **tiếng Việt có dấu, UTF-8**.
- Hỗ trợ input **có dấu, không dấu, và viết tắt nghiệp vụ** (KH, RM, CBNV). Luôn chuẩn hóa qua `src/services/textUtils.js`.
- Mọi phản hồi agent trả về cấu trúc `{ reply, sources, context }`.
- `sources` phải phản ánh đúng endpoint CRM đã dùng (truy vết nguồn).
- Không rò rỉ metadata kỹ thuật ra UI người dùng.

## Code style
- ESM `import/export`, Node.js hiện đại.
- Hàm thuần, tách logic dữ liệu (`crmService.js`) khỏi logic điều hướng (`mcpContextEngine.js`).
- Comment chỉ khi thật sự cần làm rõ.

## Khi sửa agent logic
- Thêm intent mới trong `mcpContextEngine.js` với điều kiện chuẩn hóa.
- Tránh phá vỡ context multi-turn (`focusedCustomers`, `currentModule`, `lastIntent`).
- Kiểm thử bằng `POST /api/chat` với cả câu có dấu và không dấu.

## Bảo mật
- Giữ audit log cho mọi lượt xử lý.
- Không thêm lời gọi API bên thứ 3 chưa được phê duyệt.
