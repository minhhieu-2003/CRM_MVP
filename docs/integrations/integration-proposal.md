# Integration Proposal - Bank A CRM

## Muc tieu pilot

- 50 RM (HN + TP.HCM), 3 thang pilot.
- Dat do chinh xac >= 85% tren bo ca thu nghiem.
- Giam >= 50% thoi gian soan email/call script.

## Cach tich hop vao CRM that

1. **Authentication**
   - Dung OAuth2 client credential hoac mTLS voi CRM Gateway.
2. **MCP Server**
   - Dong goi tool wrappers cho module: customers, opportunities, interactions, campaigns.
   - Moi tool tra ve schema thong nhat + metadata truy vet nguon.
3. **LLM Gateway**
   - Tat ca call LLM di qua proxy noi bo co logging, masking PII, rate limit.
4. **Context Store**
   - Redis/PostgreSQL cho session state va context memory.
5. **Audit + Compliance**
   - Luu day du prompt/response hash, tool traces, userId RM, timestamp.
   - Tuong thich Luat An ninh mang 2018, Nghi dinh 13/2023.

## Lo trinh ky thuat de nang cap MVP

1. Thay `crmData.js` bang CRM sandbox API that.
2. Thay rule engine bang orchestration agent (tool-calling) qua MCP.
3. Bo sung fallback da nha cung cap LLM (primary + secondary).
4. Bo sung RAG cho Product Knowledge Base va templates.
5. Trien khai tren AWS (ECS/Fargate) hoac on-prem VPC.

## KPI do luong

1. Accuracy theo bo 20 test case.
2. Response time: <= 5s (simple), <= 15s (complex draft).
3. Ty le RM chap nhan draft khong can sua > 40%.
4. Ty le tra loi co source trace = 100%.
