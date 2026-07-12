# [P1] Chuẩn hóa MCP toolkit tools, audit latency và error contract

Labels: backend, mcp, quality

## Summary
Nâng `src/mcp/server.js` từ demo toolkit thành MCP server có wrapper chuẩn cho audit, latency, validation, error JSON và source tracing.

## Evidence
- MCP server hiện có các tool CRM chính nhưng audit latency đang đơn giản và error contract chưa đồng nhất.
- Challenge chấm điểm cao phần MCP context switching và CRM integration depth.

## Expected Behavior
Mọi MCP tool chạy qua wrapper chung, có audit success/error, latency thật, input validation và output JSON chuẩn.

## Acceptance Criteria
- [ ] Thêm wrapper `runTool(toolName, sources, handler)`.
- [ ] Audit tool success và error với latency thật.
- [ ] Error trả `{ error, code, retryable, sources }`.
- [ ] Validate input bằng `zod`.
- [ ] Cap `daysAhead` cho due customers, ví dụ tối đa 30 ngày.
- [ ] Các tool trả kèm `data`, `sources`, `contextHints` nếu phù hợp.
- [ ] Cập nhật docs MCP tương ứng.

## Suggested Scope
- `src/mcp/server.js`
- `mcp.config.json`
- `docs/integrations/mcp-toolkit.md`
- `tests/` nếu có MCP smoke

## Verification
```bash
npm run mcp
npm run lint
npm test
```
