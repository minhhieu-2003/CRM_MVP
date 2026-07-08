# Original User Request

## Initial Request — 2026-07-08T07:04:08Z

Thiết kế sơ đồ kiến trúc nền của hệ thống `CRM_MVP` bằng cách sử dụng bộ công cụ `drawio-ai-kit` để tạo ra tệp sơ đồ `.drawio` chuẩn mực; đồng thời tiến hành rà soát mã nguồn `CRM_MVP` để tìm kiếm và sửa đổi các phần còn sai sót, đảm bảo hệ thống tuân thủ đầy đủ quy ước của dự án.

Working directory: `d:\ReactNative_Project\CRM_MVP`
Integrity mode: development

## Requirements

### R1. Thiết kế và sinh tự động sơ đồ kiến trúc CRM_MVP
- Viết mã nguồn script JavaScript (`.mjs`) để sử dụng công cụ thiết kế của `drawio-ai-kit` (nằm tại `d:\drawio-ai-kit-main\drawio-ai-kit-main`) nhằm tạo sơ đồ hệ thống `CRM_MVP` (các tầng: Client UI, API Express, MCP Context Engine, CRM Services, Database & Logger).
- Lưu tệp sơ đồ kết quả tại `d:\ReactNative_Project\CRM_MVP\docs\architecture.drawio`.
- Sơ đồ phải sử dụng các hình khối chuẩn từ thư viện (như `database`, `fsx_for_windows_file_server`, hoặc các container nhóm như `group` và `frame`), không được dùng tọa độ cứng (hardcoded coordinates).

### R2. Rà soát và sửa lỗi trong mã nguồn CRM_MVP
- Rà soát kỹ lượng các file nguồn trong `src/` của dự án `CRM_MVP` để sửa các lỗi cú pháp, cấu hình hoặc các lỗi logic nghiệp vụ.
- Đảm bảo toàn bộ hệ thống hoạt động ổn định và đáp ứng tất cả quy ước trong tệp `AGENTS.md`.

## Acceptance Criteria

### Sơ đồ kiến trúc (Diagram)
- [ ] Tệp sơ đồ được tạo ra tự động tại `docs/architecture.drawio` và có thể mở được bằng Draw.io.
- [ ] Tệp sơ đồ vượt qua trình kiểm định tích hợp của bộ công cụ (`node src/cli.mjs validate`).

### Chất lượng mã nguồn & Kiểm thử (Tests)
- [ ] Chạy thử lệnh kiểm thử nội bộ `npm run test:crm` và đảm bảo toàn bộ 21/21 trường hợp kiểm thử (test cases) đều vượt qua (PASS).
- [ ] Máy chủ backend khởi động thành công với `npm start` và phản hồi đúng cổng (mặc định 3000) mà không có bất kỳ lỗi Runtime nào.
