

| Vietnam Innovation Challenge 2026 Đà Nẵng  |  17–19 tháng 7 năm 2026 ĐỀ BÀI CHO ĐỐI TÁC DOANH NGHIỆP *Đề bài cho đối tác doanh nghiệp* |
| :---: |
| **Bank  A** Track: Đổi Mới Sáng Tạo  |  Challenge \#16 — AI Agents cho CRM |

*Lưu ý: Tình huống giả định, mang tính tham khảo.*

| PHẦN A — THÔNG TIN ĐỐI TÁC |
| :---- |

| Tên tổ chức | Ngân hàng TMCP A |
| :---- | :---- |
| **Ngành** | Tài chính — Ngân hàng bán lẻ & doanh nghiệp |

| PHẦN B — TRACK THAM GIA |
| :---- |

**Chọn track:**

| \[ \]  Y Tế & Sức Khỏe | \[ \]  Giáo Dục & Đào Tạo |
| :---- | :---- |
| \[ \]  Phòng Chống Thiên Tai | **\[x\]  Đổi Mới Sáng Tạo** |
| \[ \]  Năng Suất SME | \[ \]  Chính Phủ Thông Minh |
| \[ \]  Nông Nghiệp | \[ \]  Khác |

*Lý do chọn track Đổi Mới Sáng Tạo: Bài toán xây dựng AI Agent cho hệ thống CRM là một giải pháp đổi mới sáng tạo trong lĩnh vực công nghệ tài chính, ứng dụng MCP Protocol để tự động hóa và cá nhân hóa tương tác khách hàng — mô hình chưa có trên thị trường Việt Nam.*

| PHẦN C — MÔ TẢ BÀI TOÁN |
| :---- |

**C1. Tên bài toán**

| \[VI\] | Xây dựng AI Agent tích hợp trong CRM để tự động hóa quá trình chăm sóc khách hàng và hỗ trợ Relationship Manager |
| :---- | :---- |
| **\[EN\]** | **AI Agent cho CRM: Co-Pilot thông minh hỗ trợ tương tác khách hàng, vận hành trên nền tảng Model Context Protocol (MCP)** |

**C2. Bối cảnh & Vấn đề**

| Hệ thống CRM của Bank A là xương sống số cho đội ngũ bán hàng, dịch vụ khách hàng và marketing — quản lý hàng triệu khách hàng, lịch sử tương tác, cơ hội kinh doanh và chiến dịch quảng bá. Hệ thống tích hợp nhiều touchpoint khách hàng và cung cấp góc nhìn 360 độ cho từng cá nhân. Vấn đề cốt lõi: Mỗi Relationship Manager (RM) phải xử lý 50–80 khách hàng mỗi ngày. Việc tìm kiếm thông tin, soạn thảo email theo dõi, và chuẩn bị script gọi điện hiện đang thực hiện thủ công — mất từ 2–3 tiếng mỗi ca làm việc. Điều này khiến RM không đủ thời gian tập trung vào bán hàng và xây dựng quan hệ. Thị trường hiện có: Các giải pháp CRM quốc tế như Salesforce Einstein hay Microsoft Copilot for Sales tồn tại nhưng không hiểu biết về nghiệp vụ ngân hàng Việt Nam, không hỗ trợ tiếng Việt chuyên sâu, và không tích hợp được với hệ sinh thái CRM nội địa của Bank A. Chi phí license quá cao để scale cho toàn bộ đội ngũ RM. Tại sao đây là thời điểm phù hợp: Bank A đã hoàn thiện CRM platform với kiến trúc API-first — các module Lead/Opportunity Management, Customer Interaction History, Campaign Management đều đã có REST API mở. Đây là nền tảng lý tưởng để tích hợp một lớp AI Agent thông minh phía trên. |
| :---- |

**C3. Câu hỏi trọng tâm**

| Làm thế nào để xây dựng một AI Agent — có thể giao tiếp bằng ngôn ngữ tự nhiên tiếng Việt — hoạt động như một co-pilot thông minh cho Relationship Manager trong hệ thống CRM của Bank A: tự động nhắc lịch chăm sóc, soạn thảo email/script gọi điện cá nhân hóa, gợi ý hành động kế tiếp dựa trên lịch sử tương tác, và chuyển nguyên mạch giữa các module CRM thông qua Model Context Protocol (MCP) — tất cả trong giao diện chat đơn giản, không yêu cầu training kỹ thuật cho người dùng? |
| :---- |

| PHẦN D — KẾT QUẢ MONG ĐỢI |
| :---- |

**D1. Kết quả mong đợi**

| \# | Kết quả | Đo lường bằng |
| ----- | :---- | :---- |
| **1** | AI Agent phản hồi đúng và có nguồn gốc khi xử lý câu hỏi liên quan đến profile khách hàng, lịch sử giao dịch, và cơ hội bán hàng — độ chính xác \>= 85% trên bộ 20 ca thử nghiệm do Bank A cung cấp | Demo live với bộ ca thử nghiệm chuẩn của Bank A |
| **2** | RM giảm được \>= 50% thời gian soạn thảo email follow-up và script gọi điện nhờ AI draft sẵn, có thể chỉnh sửa trong 1 click | Khảo sát trực tiếp 3 RM trong demo; đo thời gian thủ công vs AI |
| **3** | Agent chuyển nguyên mạch giữa ít nhất 3 CRM context khác nhau (hồ sơ khách hàng, cơ hội bán hàng, chiến dịch) trong cùng một cuộc trò chuyện mà không mất dữ liệu context | Test scenario tích hợp nhiều module trong demo |

**D2. Deliverables tối thiểu**

* AI Agent Frontend: giao diện chat web-based cho RM sử dụng, hỗ trợ tiếng Việt

* MCP Server: backend xử lý chuyển đổi context giữa các module CRM

* CRM Context Simulations: mock data đại diện cho hồ sơ khách hàng, danh mục sản phẩm, lịch sử tương tác

* Architecture Documentation: sơ đồ kỹ thuật và giải thích luồng dữ liệu

* Integration Proposal: chiến lược tích hợp vào CRM thật của Bank A

* Source Code: repository sạch, có README tiếng Việt, có thể chạy được ở local

**D3. Định nghĩa Pilot Pathway**

| Quy mô pilot | 50 Relationship Manager tại Trung tâm Khách hàng Cá nhân Hà Nội và TP.HCM |
| :---- | :---- |
| **Thời gian thử nghiệm** | 3 tháng, bắt đầu tháng 10/2026 — sau khi hoàn tất kiểm định bảo mật nội bộ |
| **Cam kết từ Bank A** | 1 Product Manager full-time hỗ trợ; cung cấp API key CRM staging environment; ngân sách cloud AWS $3K/tháng trong 3 tháng pilot; đào tạo người dùng cuối |
| **Điều kiện ký pilot** | Agent đạt \>= 85% accuracy trên bộ ca chuẩn, có audit log đầy đủ, tuân thủ Luật An ninh mạng 2018 và Nghị định 13/2023 về bảo vệ dữ liệu cá nhân |

| PHẦN E — DỮ LIỆU & TÀI NGUYÊN |
| :---- |

**E1. Dữ liệu được cung cấp**

| Tên dataset | Mô tả nội dung | Định dạng | Cách truy cập |
| :---- | :---- | :---- | :---- |
| **CRM Sandbox API** | API đầy đủ chức năng: GET /customers, GET /opportunities, GET /interactions, GET /campaigns, POST /draft-email, POST /call-script. Mock data 500 khách hàng giả lập với đủ lịch sử 12 tháng. | REST API / JSON | API key \+ docs phát D-Day; endpoint: sandbox.crm.Bank A.vn |
| **Customer Interaction Dataset** | 10.000 bản ghi tương tác khách hàng đã ẩn danh: loại tương tác, kết quả, thời gian, ghi chú của RM. Đã chia train/test. Tiếng Việt. | JSON / CSV | Phát trực tiếp tại hackathon — cần ký NDA |
| **Email & Script Templates** | 200 mẫu email follow-up và 150 call script thực tế đã được RM sử dụng và đánh giá tốt — dữ liệu nền tảng để nâng cao chất lượng sinh nội dung. | JSON | Public — GitHub link phát trước hackathon |
| **Product Knowledge Base** | Thông tin chi tiết 35 sản phẩm tín dụng, tiết kiệm, bảo hiểm liên kết của Bank A: điều kiện, lãi suất, đối tượng phù hợp — dữ liệu mà Agent cần để gợi ý sản phẩm. | JSON | Public — GitHub link phát trước hackathon |

**E2. Giới hạn & Điều kiện dữ liệu**

| Sử dụng sau hackathon | Chỉ trong hackathon — Customer Interaction Dataset cần ký NDA trước khi nhận |
| :---- | :---- |
| **PII / Dữ liệu cá nhân** | Đã anonymize toàn bộ theo Nghị định 13/2023/NĐ-CP — không có tên, CMND, số điện thoại thật |
| **Yêu cầu bảo mật khác** | Không được train model trên dataset khách hàng và publish publicly. Không được gọi dữ liệu qua API của bên thứ 3 mà không mã hóa. |

**E3. Tài nguyên khác**

* CRM Sandbox API: https://sandbox.crm.Bank A.vn — docs đầy đủ, rate limit 100 req/min

* Tài liệu nghiệp vụ: CRM User Manual v3.2 tiếng Việt, sơ đồ quy trình bán hàng 8 bước của Bank A

* Cloud credits: AWS $500 cho mỗi đội đăng ký qua AWS Activate — phát D-Day

* Chuyên gia nghiệp vụ: Nguyễn Phương Linh (Senior RM, 8 năm kinh nghiệm) — hỗ trợ 08:00–22:00 trong 48h

* Chuyên gia kỹ thuật: Lê Minh Trí (CRM API Lead) — hỗ trợ qua Discord trong toàn bộ hackathon

| PHẦN F — TIÊU CHÍ CHẤM ĐIỂM |
| :---- |

*Rubric chung của BTC: Mức độ phù hợp vấn đề 20% — Kiến trúc AI-Native 20% — Thực thi kỹ thuật 15% — Deployment 15% — Khả thi triển khai 15% — Tiềm năng startup 15%*

**Tiêu chí bổ sung đặc thù track Đổi Mới Sáng Tạo (tổng \<= 30%):**

| Tiêu chí đặc thù | Mô tả | Trọng số |
| :---- | :---- | ----- |
| **MCP Protocol Implementation** | MCP được triển khai đúng cách để quản lý chuyển đổi context giữa các module CRM. Agent không mất context khi chuyển từ module này sang module khác. Có thể xử lý hội thoại nhiều lượt với trạng thái đầy đủ. | **15%** |
| **CRM Integration Depth** | Mức độ tích hợp thực tế với CRM Sandbox API — không phải mock data tĩnh. Đọc được từ \>= 3 endpoint khác nhau và tổng hợp thông tin thành phản hồi có nguồn gốc. | **10%** |
| **Tổng trọng số bổ sung** |  | **25%** |

| PHẦN G — CAM KẾT TỪ ĐỐI TÁC |
| :---- |

| Cam kết | Có | Không |
| :---- | ----- | ----- |
| Cử \>= 1 chuyên gia domain có mặt tại Đà Nẵng trong 48h (17–19/7) | \[x\] | \[ \] |
| Sẵn sàng trả lời câu hỏi từ các đội thi qua Zalo/Discord trong giờ thi | \[x\] | \[ \] |
| Cam kết phản hồi đội thắng trong vòng 30 ngày về cơ hội pilot | \[x\] | \[ \] |
| Xem xét ký hợp đồng pilot 3 tháng với đội thắng track (kèm hỗ trợ $5K) | \[x\] | \[ \] |
| Cho phép dữ liệu được tiếp tục sử dụng trong giai đoạn pilot (nếu thắng) | \[x\] | \[ \] |
| Tham gia Demo Day và đặt câu hỏi cho finalists | \[x\] | \[ \] |
| Chia sẻ bài toán trên kênh truyền thông của tổ chức (tag @VietnamAIHacks) | \[x\] | \[ \] |

| PHẦN H — YÊU CẦU KỸ THUẬT |
| :---- |

**H1. Ngôn ngữ yêu cầu**

| Ngôn ngữ | Mức độ | Ghi chú |
| :---- | :---- | :---- |
| Tiếng Việt | **\[x\] Bắt buộc** | Giao diện chat với RM phải hoàn toàn bằng tiếng Việt, bao gồm cả cách viết tắt nghiệp vụ ngân hàng phổ biến |
| Tiếng Anh | \[ \] Ưu tiên | Tài liệu API và architecture doc có thể bằng tiếng Anh |

*Yêu cầu xử lý ngôn ngữ đặc thù: Agent cần hiểu các viết tắt nghiệp vụ ngân hàng như KH (khách hàng), ĐNCV (điều chỉnh nghiệp vụ), RM (Relationship Manager), CBNV (cán bộ nhân viên). Nên hỗ trợ cả chat có dấu và không dấu (do môi trường gõ phím của RM).*

**H2. Yêu cầu ngữ cảnh địa phương**

| Yêu cầu ngữ cảnh | Bắt buộc | Mô tả cu the |
| :---- | ----- | :---- |
| Hiểu nghiệp vụ ngân hàng Việt Nam | \[x\] | Biết pháp lý về tín dụng, bảo hiểm liên kết, quy trình KYC và các sản phẩm đặc thù của Bank A |
| Tuân thủ quy định pháp lý | \[x\] | Luật An ninh mạng 2018, Nghị định 13/2023 bảo vệ dữ liệu cá nhân, quy định Ngân hàng Nhà nước về bảo mật thông tin khách hàng |
| Dữ liệu thị trường Việt Nam | \[x\] | Tên người Việt, địa chỉ, số điện thoại, đơn vị tiền tệ VND, lịch làm việc theo giờ Việt Nam |
| Tích hợp hệ thống hành chính có sẵn | \[ \] | Không yêu cầu trong hackathon — sẽ xem xét trong giai đoạn pilot |

**H3. Yêu cầu hạ tầng & hiệu năng**

| Môi trường triển khai | \[x\] Cloud (AWS ưu tiên) hoặc kiến trúc có thể deploy on-premise VPC của Bank A |
| :---- | :---- |
| **Kết nối internet** | \[x\] Bắt buộc co internet — Agent hoat dong real-time voi CRM API |
| **Thiết bị người dùng cuối** | \[x\] Web browser — màn hình desktop/laptop của RM; không yêu cầu mobile |
| **Yêu cầu tốc độ phản hồi** | Agent phản hồi trong \<= 5 giây cho câu hỏi đơn giản; \<= 15 giây cho tác vụ tổng hợp phức tạp (soạn email) |
| **Bảo mật & quyền riêng tư** | Không lưu lịch sử chat trên server không mã hóa; tuân thủ ISO 27001 của Bank A; audit log đầy đủ cho mỗi LLM call |
| **API / hệ thống cần tích hợp** | Bắt buộc: Bank A CRM Sandbox API (\>= 3 endpoint); Tuy chon: tich hop email composer |
| **Ngôn ngữ lập trình / Framework** | Python \+ Node.js được khuyến nghị; LLM: OpenAI, Claude, hoặc Gemini (bất kỳ); Framework: LangChain, LlamaIndex, hoặc tự xây |

| PHẦN I — KỲ VỌNG VỀ GIẢI PHÁP TỐT |
| :---- |

**I1. Mô tả gỉai pháp lý tưởng**

| 8 giờ sáng, một RM gõ vào hộp chat: 'Nhắc tôi những khách hàng có tiết kiệm đến hạn trong tuần này'. Agent lập tức gọi CRM API, lọc danh sách 5 khách hàng, và hỏi: 'Bạn có muốn tôi soạn email nhắc hạn cùng gợi ý gia hạn không?' RM gõ 'Có', Agent draft sẵn 5 email cá nhân hóa — mỗi email có tên khách hàng, tên sản phẩm, số tiền, ngày đến hạn và gợi ý sản phẩm mới phù hợp. Sau đó RM hỏi: 'Khách Nguyễn Văn An có cơ hội mua bảo hiểm nào phù hợp không?' — Agent chuyển sang module Opportunity, đọc lịch sử tương tác 6 tháng, và phản hồi: 'Anh An đang có khoản vay mua nhà 2 tỷ — bảo hiểm nhân thọ liên kết tín dụng là sản phẩm phù hợp nhất, tỉ lệ chuyển đổi của RM khác với khách tương tự là 40%. |
| :---- |

**I2. Điều bạn KHÔNG muốn thấy**

* Agent trả lời chung chung không có nguồn gốc từ dữ liệu CRM thật — mỗi phản hồi phải tracing được về endpoint nào

* Demo chỉ là mockup / hardcoded response — không có LLM và CRM API chạy phía sau

* Giao diện phức tạp đòi hỏi RM phải học nhiều lệnh đặc biệt — phải sử dụng được bằng ngôn ngữ tự nhiên thuần túy

* Agent mất context khi đổi sang chủ đề mới — phải giữ toàn bộ lịch sử hội thoại và CRM context

* Phụ thuộc hoàn toàn vào 1 LLM provider không có fallback — chi phí và availability risk không khả thi cho ngân hàng

* Không có audit log cho LLM calls — yêu cầu bắt buộc theo chuẩn bảo mật ngân hàng

**I3. Ví dụ giải pháp truyền cảm hứng**

| Sản phẩm / Dự án | Tại sao truyền cảm hứng | Link |
| :---- | :---- | :---- |
| **Salesforce Einstein Copilot** | Tích hợp AI agent vào CRM — gợi ý hành động kế tiếp, soạn thảo email tự động. Đúng hướng — nhưng Bank A cần phiên bản Việt hóa và giá thành hợp lý hơn. | salesforce.com/einstein |
| **Anthropic MCP Demo (2024)** | Minh họa cách MCP quản lý context đa nguồn trong AI Agent — đúng kỹ thuật cần áp dụng cho bài toán CRM này. | docs.anthropic.com/mcp |
| **Kore.ai Banking Agent** | AI agent cho ngân hàng với khả năng hiểu nghiệp vụ tài chính và chuyển nguyên mạch context — giao diện thuần túy ngôn ngữ tự nhiên. | kore.ai |

| PHẦN J — THÔNG TIN BỔ SUNG |
| :---- |

| Giải thưởng đặc biệt | Cơ hội phỏng vấn nhanh cho 3 thành viên xuất sắc nhất của đội thắng vào vị trí kỹ sư AI tại IT Digital Factory Center Bank A (không bảo đảm nhận dụng — phụ thuộc vào quy trình tuyển dụng chính thức) |
| :---- | :---- |
| **Ràng buộc kỹ thuật bổ sung** | Agent không được trực tiếp gọi các external API ngoài danh sách Bank A đã cho phép. Mọi LLM call phải qua proxy có logging. |
| **Quyền sở hữu trí tuệ** | Code thuộc về đội thi. Dataset và các tài liệu nghiệp vụ Bank A cung cấp vẫn thuộc sở hữu của Bank A. Nếu ký pilot, hai bên đàm phán IP riêng. |
| **Câu hỏi cho BTC** | Bank A cần BTC hỗ trợ setup 1 phòng riêng để demo live với máy tính có kết nối internet ổn định — CRM Sandbox API cần latency thấp. |

| XÁC NHẬN NỘP ĐỀ BÀI Bằng cách nộp tài liệu này, Bank A xác nhận rằng thông tin được cung cấp là chính xác và đồng ý với các điều khoản tham gia của Vietnam Innovation Challenge 2026\. Email liên hệ:  phuongnq@aiforvietnam.org Website:  aiforvietnam.org  |  Vietnam Innovation Challenge 2026  |  Đà Nẵng 17–19/7/2026 |
| :---- |
