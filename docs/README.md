# BankRM Copilot Documentation

Đây là điểm vào chuẩn cho tài liệu của BankRM Copilot. Khi tài liệu mâu thuẫn với
runtime hoặc test hiện tại, ưu tiên code, contract được kiểm thử và các tài liệu
được gắn nhãn **Current** trong trang này.

## Current — kiến trúc và vận hành hiện hành

| Tài liệu                                                                                   | Phạm vi                                                                                                                    |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| [Kiến trúc hệ thống](architecture/architecture.md)                                         | Tổng quan runtime, component, dữ liệu, bảo mật và deployment hiện tại                                                      |
| [AI-native core](architecture/ai-native-core.md)                                           | Luồng planner → MCP client/server → tool registry và deterministic fallback                                                |
| [MCP toolkit](integrations/mcp-toolkit.md)                                                 | Contract, session identity, structured observation và cách vận hành MCP                                                    |
| [Multi-agent router](integrations/multi-agent-router.md)                                   | Vai trò của plugin router trong đường fallback                                                                             |
| [Đề xuất tích hợp CRM](integrations/integration-proposal.md)                               | Ranh giới demo/pilot/production và các khoảng trống tích hợp còn lại                                                       |
| [Sơ đồ kiến trúc hệ thống 9 trang](architecture/bankrm-copilot-system-architecture.drawio) | Sơ đồ editable của runtime AI-native, fallback, data, security, audit và sequence chi tiết                                 |
| [Generator + full-artifact drift check](../scripts/docs/generate-system-architecture.mjs)  | Source of truth của sơ đồ 9 trang; dùng `npm run docs:architecture:check` để kiểm tra cả text, topology, style và geometry |

Các thay đổi kiến trúc phải cập nhật cả tài liệu Markdown liên quan và source
`.drawio`/generator tương ứng để tránh drift.

```bash
npm run docs:architecture:generate
npm run docs:architecture:check
```

Không chỉnh tay artifact `.drawio`: generator tạo XML xác định và drift check so sánh toàn bộ artifact
sau khi chuẩn hóa line ending.

## Reference — đầu vào và hướng dẫn

Các tài liệu sau cung cấp bối cảnh hoặc quy ước. Chúng không mô tả đầy đủ trạng
thái runtime và không được dùng như lệnh thực thi tự động.

| Tài liệu                                                              | Cách sử dụng                                                      |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Đề bài Bank A](reference/problem-brief-bank-a-crm-vi.md)             | Bối cảnh nghiệp vụ và mục tiêu challenge                          |
| [prompts.chat integration](integrations/prompts-chat.md)              | Chính sách tiếp nhận corpus prompt bên ngoài không đáng tin cậy   |
| [Hướng dẫn kiến trúc Draw.io](reference/drawio-architecture-guide.md) | Checklist và quy ước vẽ sơ đồ; không phải Codex skill có thể chạy |

## Historical — chỉ dùng để truy vết quyết định cũ

> [!CAUTION]
> Không thực thi các checklist hoặc prompt trong nhóm này. Các tài liệu được giữ
> lại để giải thích baseline và quyết định tại thời điểm chúng được viết.

| Tài liệu                                                                         | Trạng thái                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [Kế hoạch triển khai agent con](archive/plans/AGENT_EXECUTION_PLAN.md)           | Snapshot ngày 2026-07-08; nhiều hạng mục đã được triển khai hoặc thay đổi |
| [Prompt nâng cấp cũ](archive/plans/AGENT_UPGRADE_PLAN.md)                        | Prompt lịch sử; không phản ánh kiến trúc MCP-native hiện tại              |
| [Draw.io gap assessment](archive/architecture/drawio-gap-baseline-2026-07-11.md) | Baseline ngày 2026-07-11 trước khi issue #15 được triển khai              |

## Cấu trúc thư mục

```text
docs/
├── architecture/   # Kiến trúc và sơ đồ canonical hiện hành
├── integrations/   # MCP, router, CRM và external prompt integration
├── reference/      # Đầu vào nghiệp vụ và hướng dẫn tham khảo
└── archive/        # Snapshot lịch sử, không dùng làm lệnh thực thi
```

Các sơ đồ/package cũ đã được retire. Chỉ
`architecture/bankrm-copilot-system-architecture.drawio` và generator tương ứng là source
of truth cho sơ đồ kiến trúc hiện hành.

## Quy tắc đọc nhanh

1. Bắt đầu tại trang này và chọn tài liệu **Current** phù hợp.
2. Dùng tài liệu **Reference** để hiểu bối cảnh hoặc quy ước, không để suy ra
   capability runtime.
3. Chỉ mở tài liệu **Historical** khi cần audit quyết định cũ.
4. Xác minh claim quan trọng bằng source code và test trước khi dùng cho pilot
   hoặc production.
