# YÊU CẦU THỰC THI (PROMPT CHO AI CLI AGENT)

> [!CAUTION]
> **HISTORICAL PROMPT — DO NOT EXECUTE.** Nội dung bên dưới được giữ để truy vết
> một đề xuất nâng cấp cũ và không còn là chỉ dẫn cho agent. Một số bước xung đột
> với kiến trúc MCP-native, chính sách mock/sandbox và workflow review hiện tại.
> Xem [mục lục tài liệu](../../README.md), [kiến trúc hiện hành](../../architecture/architecture.md)
> và [MCP toolkit](../../integrations/mcp-toolkit.md) trước khi lập kế hoạch mới.

Bạn là một AI Coding Agent. Dưới đây là kế hoạch nâng cấp chi tiết từng bước cho dự án **BankRM Copilot (CRM AI Agent)**. Nhiệm vụ của bạn là đọc kỹ, phân tích và thực thi **tuần tự** từng bước dưới đây.
Dự án được xây dựng bằng Node.js, Express và giao diện Vanilla JS ở thư mục `public/`. Không dùng TypeScript.

## MỤC TIÊU TỔNG QUAN
Nâng cấp MVP hiện tại lên các tiêu chuẩn Pilot:
1. Loại bỏ mock data và kết nối với API CRM thật.
2. Đổi in-memory Context Store sang Redis.
3. Áp dụng PII Masking cho LLM Gateway.
4. Nâng cấp bộ Audit Log thành log có cấu trúc.
5. Thiết lập Linter và Unit Test.

---

## BƯỚC 1: THIẾT LẬP MÔI TRƯỜNG & TEST
Mục tiêu: Đảm bảo code quality trước khi thực hiện các thay đổi lớn.
1. **Cài đặt thư viện:** Chạy lệnh `npm install --save-dev jest eslint prettier`.
2. **Cấu hình ESLint & Prettier:**
   - Tạo file `.eslintrc.json` cấu hình cho môi trường Node.js (ES6+, ECMAScript Modules).
   - Tạo file `.prettierrc` (tuỳ chọn format cơ bản).
3. **Cấu hình Package.json:**
   - Cập nhật mục `"scripts"` trong `package.json` thêm:
     `"test": "node --experimental-vm-modules node_modules/jest/bin/jest.js"`,
     `"lint": "eslint src/**/*.js"`

---

## BƯỚC 2: TÍCH HỢP HỆ THỐNG CRM THỰC TẾ (GROUNDING)
Mục tiêu: Loại bỏ dữ liệu giả lập và kết nối hệ thống Core-banking/CRM API.
1. **Cập nhật `.env.example`:** Thêm biến môi trường:
   ```env
   CRM_API_BASE_URL=https://api.sandbox.banka.com/crm/v1
   CRM_API_KEY=your_api_key_here
   ```
2. **Loại bỏ Mock Data:**
   - Xóa bỏ hoàn toàn file `src/services/crmData.js`.
3. **Cập nhật `src/services/crmService.js`:**
   - Xóa import `crmData.js`.
   - Cập nhật các hàm `getCustomers`, `getOpportunities`, `getInteractions`, `getCampaigns` để sử dụng `fetch` (Node 18+) gọi đến `process.env.CRM_API_BASE_URL`.
   - Viết logic bắt lỗi (try/catch) cho API, trả về cấu trúc lỗi hợp lệ nếu API sập.
   - Trả về đúng format như phiên bản MVP cũ để không làm gãy (break) lớp `agentService.js`.

---

## BƯỚC 3: NÂNG CẤP CONTEXT STORE LÊN REDIS
Mục tiêu: Đảm bảo Context không bị mất khi restart server.
1. **Cài đặt Redis:** Chạy lệnh `npm install redis`.
2. **Sửa đổi `src/services/mcpContextEngine.js`:**
   - Thay thế việc sử dụng `Map()` bằng `redis.createClient()`.
   - Sửa các hàm lấy/lưu context (`getContext`, `updateContext`, `clearContext`) thành các hàm bất đồng bộ (`async/await`).
3. **Sửa đổi consumers:**
   - Tìm tất cả các file sử dụng `mcpContextEngine` (đặc biệt là `src/services/agentService.js`) và thêm từ khóa `await` khi gọi các hàm thao tác context.

---

## BƯỚC 4: BẢO MẬT LLM (PII MASKING) & FALLBACK
Mục tiêu: Xóa dữ liệu cá nhân (PII) trước khi gửi prompt lên LLM và dự phòng model.
1. **Cập nhật `src/plugins/llmFallback.js`:**
   - Thêm hàm `maskPII(text)` sử dụng Regex để che giấu thông tin: 
     - Số điện thoại (ví dụ: `0901234567` -> `090****567`).
     - Email (ví dụ: `nguyenvana@gmail.com` -> `ngu***@gmail.com`).
     - CCCD / Số tài khoản ngân hàng (nếu có thể).
   - Gọi hàm `maskPII()` lên `prompt` trước khi gửi request tới LLM API.
2. **Cập nhật Fallback model:**
   - Trong file `.env.example`, thêm biến `SECONDARY_LLM_API_URL` và `SECONDARY_LLM_API_KEY`.
   - Bổ sung logic try/catch khi gọi LLM chính, nếu lỗi (timeout/500) thì tự động gọi sang API Secondary.

---

## BƯỚC 5: NÂNG CẤP AUDIT LOG ĐÁP ỨNG COMPLIANCE
Mục tiêu: Chuyển sang JSON Log có cấu trúc để sẵn sàng đẩy vào hệ thống SIEM.
1. **Cài đặt thư viện:** `npm install winston`.
2. **Sửa đổi `src/services/auditLogger.js`:**
   - Khởi tạo Winston logger, cấu hình 2 transports: 
     1. Ghi ra `logs/audit.log` dưới định dạng JSON (`winston.format.json()`).
     2. Ghi ra `Console` (chỉ log error) để dev dễ debug.
   - Hàm `log(event)` bắt buộc phải ghi các trường sau: `timestamp`, `userId` (tạm mock "RM_001"), `action`, `prompt_hash` (dùng thư viện `crypto` hash nội dung chat nếu có), và `latency`.
3. Cập nhật các module đang gọi `auditLogger.log()` để truyền tham số tương ứng với cấu trúc mới.

---

## BƯỚC 6: KIỂM THỬ VÀ XÁC NHẬN
1. Chạy `npm run lint` và sửa các lỗi 문 pháp/style nếu có.
2. Viết 2 Unit Test đơn giản bằng Jest trong thư mục `tests/`:
   - `textUtils.test.js` (kiểm tra hàm loại bỏ dấu tiếng Việt).
   - `maskPII.test.js` (kiểm tra hàm che số điện thoại, email).
3. Chạy `npm test` để xác minh.
4. Chạy `npm start` và thực hiện call `POST /api/chat` bằng cURL để đảm bảo không gãy luồng chính.

==================================================
**LƯU Ý DÀNH CHO AI AGENT:** 
- Đọc kỹ `AGENTS.md` (nếu có) trước khi bắt đầu để hiểu rõ nguyên tắc viết code.
- Mỗi bước thực hiện xong, hãy review lại xem có gây lỗi cho các module khác không (đặc biệt là vấn đề async/await khi đổi sang Redis).
- Kết quả trả về cho giao diện UI phải TUYỆT ĐỐI giữ nguyên định dạng `{ reply, sources, context }`.
