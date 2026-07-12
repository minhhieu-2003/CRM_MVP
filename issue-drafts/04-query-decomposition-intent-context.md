# [P1] Bóc tách query, intent và context workflow cho agent

Labels: backend, mcp

## Summary
Tách logic xử lý hội thoại khỏi `mcpContextEngine.js` thành các module nhỏ: intent parser, entity/filter extraction, context resolver và tool planner.

## Evidence
- `src/services/mcpContextEngine.js` hiện chứa nhiều nhánh intent IF/ELSE trong cùng một file.
- Agent cần xử lý các câu như “nhóm này”, “khách đó”, “soạn tiếp” dựa trên context trước đó.

## Expected Behavior
Một lượt chat đi qua pipeline rõ ràng: normalize message -> detect intent -> extract entity/filter -> resolve context -> choose tool/query -> compose reply -> attach sources -> audit.

## Acceptance Criteria
- [ ] Thêm `src/services/intentParser.js`.
- [ ] Thêm `src/services/toolPlanner.js`.
- [ ] Thêm hoặc tách `src/services/contextStore.js`.
- [ ] Hỗ trợ các intent: maturity reminder, customer lookup, interaction history, opportunity advice, draft email, call script, campaign summary.
- [ ] Mọi response nghiệp vụ đều có `sources`.
- [ ] Câu thiếu context phải hỏi lại RM, không tự đoán.
- [ ] Chat không dấu vẫn được normalize qua `normalizeVietnamese()`.

## Suggested Scope
- `src/services/mcpContextEngine.js`
- `src/services/textUtils.js`
- `src/services/intentParser.js`
- `src/services/toolPlanner.js`
- `tests/integration/`

## Verification
```bash
npm run lint
npm test
npm run test:crm
```
