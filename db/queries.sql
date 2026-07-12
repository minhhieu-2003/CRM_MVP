-- =============================================================================
-- BankRM Copilot — SQL Query Reference
-- Mục đích : Tập hợp các câu truy vấn thực dụng cho RM (Relationship Manager).
-- Schema    : db/schema.sql (version 2)
-- Ghi chú   : Tất cả query chạy trên SQLite ≥ 3.35.
--              Thay thế các placeholder :rm_id, :customer_id, ... bằng
--              giá trị thực tế khi gọi từ ứng dụng Node.js (better-sqlite3).
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. KHÁCH HÀNG (customers / customer_tags)
-- ─────────────────────────────────────────────────────────────────────────────

-- A-1. Tìm khách hàng theo tên (không dấu, partial match)
SELECT id, name, segment, savings_amount_vnd, maturity_date,
       email, phone, status
FROM   customers
WHERE  normalized_name LIKE '%' || :normalized_name || '%'
  AND  status = 'active'
ORDER  BY name;

-- A-2. Danh sách khách hàng của một RM, kèm tag
SELECT c.id,
       c.name,
       c.segment,
       c.savings_amount_vnd,
       c.maturity_date,
       c.email,
       c.phone,
       GROUP_CONCAT(ct.tag, ', ') AS tags
FROM   customers c
LEFT   JOIN customer_tags ct ON ct.customer_id = c.id
WHERE  c.rm_id  = :rm_id
  AND  c.status = 'active'
GROUP  BY c.id
ORDER  BY c.name;

-- A-3. Lọc khách hàng theo chi nhánh + segment
SELECT id, name, segment, savings_amount_vnd, risk_profile
FROM   customers
WHERE  branch_code = :branch_code
  AND  segment     = :segment   -- VD: 'VIP', 'MASS', 'SME'
  AND  status      = 'active'
ORDER  BY savings_amount_vnd DESC;

-- A-4. Khách hàng có số dư tiết kiệm lớn hơn ngưỡng
SELECT id, name, savings_product, savings_amount_vnd, maturity_date
FROM   customers
WHERE  savings_amount_vnd >= :threshold_vnd
  AND  status = 'active'
ORDER  BY savings_amount_vnd DESC;

-- A-5. Khách hàng chưa tương tác trong N ngày
SELECT c.id, c.name, c.email, c.phone,
       c.last_interaction_date,
       julianday('now') - julianday(c.last_interaction_date) AS days_silent
FROM   customers c
WHERE  c.rm_id  = :rm_id
  AND  c.status = 'active'
  AND  (c.last_interaction_date IS NULL
     OR julianday('now') - julianday(c.last_interaction_date) >= :days)
ORDER  BY days_silent DESC;

-- A-6. Tổng số khách hàng phân theo segment (dashboard)
SELECT segment,
       COUNT(*)                                    AS total,
       SUM(savings_amount_vnd)                     AS total_savings_vnd,
       AVG(savings_amount_vnd)                     AS avg_savings_vnd,
       COUNT(*) FILTER (WHERE status = 'active')   AS active_count
FROM   customers
WHERE  branch_code = :branch_code
GROUP  BY segment
ORDER  BY total_savings_vnd DESC;

-- A-7. Thông tin chi tiết một khách hàng (full profile)
SELECT c.*,
       GROUP_CONCAT(ct.tag, ', ') AS tags
FROM   customers c
LEFT   JOIN customer_tags ct ON ct.customer_id = c.id
WHERE  c.id = :customer_id
GROUP  BY c.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. TIẾT KIỆM ĐẾN HẠN — Maturity Reminder
-- ─────────────────────────────────────────────────────────────────────────────

-- B-1. Khách hàng có tiết kiệm đến hạn trong N ngày tới (của một RM)
SELECT c.id,
       c.name,
       c.email,
       c.phone,
       c.savings_product,
       c.savings_amount_vnd,
       c.maturity_date,
       julianday(c.maturity_date) - julianday('now') AS days_until_maturity
FROM   customers c
WHERE  c.rm_id  = :rm_id
  AND  c.status = 'active'
  AND  c.maturity_date IS NOT NULL
  AND  julianday(c.maturity_date) - julianday('now') BETWEEN 0 AND :days_ahead
ORDER  BY c.maturity_date ASC;

-- B-2. Khách hàng đã QUÁ HẠN tiết kiệm (chưa tái tục)
SELECT id, name, email, phone,
       savings_product, savings_amount_vnd, maturity_date,
       julianday('now') - julianday(maturity_date) AS overdue_days
FROM   customers
WHERE  rm_id  = :rm_id
  AND  status = 'active'
  AND  maturity_date < date('now')
ORDER  BY overdue_days DESC;

-- B-3. Thống kê tiết kiệm đến hạn theo tháng (12 tháng tới)
SELECT strftime('%Y-%m', maturity_date)  AS month,
       COUNT(*)                           AS customer_count,
       SUM(savings_amount_vnd)            AS total_amount_vnd
FROM   customers
WHERE  rm_id        = :rm_id
  AND  status       = 'active'
  AND  maturity_date BETWEEN date('now') AND date('now', '+12 months')
GROUP  BY month
ORDER  BY month;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. TƯƠNG TÁC (interactions)
-- ─────────────────────────────────────────────────────────────────────────────

-- C-1. Lịch sử tương tác của một khách hàng (gần nhất trước)
SELECT id, channel, direction, interaction_type,
       occurred_at, outcome, note, sentiment, duration_minutes,
       products_discussed, follow_up_required
FROM   interactions
WHERE  customer_id = :customer_id
ORDER  BY occurred_at DESC
LIMIT  :limit;

-- C-2. Tương tác cần follow-up chưa xử lý
SELECT i.id,
       i.customer_id,
       c.name AS customer_name,
       i.channel, i.occurred_at, i.note, i.outcome
FROM   interactions i
JOIN   customers c ON c.id = i.customer_id
WHERE  i.rm_id              = :rm_id
  AND  i.follow_up_required = 1
ORDER  BY i.occurred_at DESC;

-- C-3. Thống kê tương tác theo kênh trong 30 ngày qua
SELECT channel,
       COUNT(*)                                           AS total,
       COUNT(*) FILTER (WHERE sentiment = 'positive')    AS positive,
       COUNT(*) FILTER (WHERE sentiment = 'negative')    AS negative,
       AVG(duration_minutes)                             AS avg_duration_min
FROM   interactions
WHERE  rm_id       = :rm_id
  AND  occurred_at >= date('now', '-30 days')
GROUP  BY channel
ORDER  BY total DESC;

-- C-4. Sản phẩm được thảo luận nhiều nhất trong tương tác
SELECT products_discussed,
       COUNT(*) AS mention_count
FROM   interactions
WHERE  rm_id = :rm_id
  AND  products_discussed IS NOT NULL
  AND  occurred_at >= date('now', '-90 days')
GROUP  BY products_discussed
ORDER  BY mention_count DESC
LIMIT  10;

-- ─────────────────────────────────────────────────────────────────────────────
-- D. CƠ HỘI BÁN (opportunities)
-- ─────────────────────────────────────────────────────────────────────────────

-- D-1. Pipeline cơ hội của một RM theo stage
SELECT o.id,
       c.name   AS customer_name,
       o.product,
       o.stage,
       o.score,
       o.estimated_value_vnd,
       o.probability,
       o.expected_close_date,
       o.next_step,
       o.next_step_date
FROM   opportunities o
JOIN   customers c ON c.id = o.customer_id
WHERE  o.owner_rm_id = :rm_id
  AND  o.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')
ORDER  BY o.score DESC, o.expected_close_date ASC;

-- D-2. Funnel theo stage (số lượng + tổng giá trị)
SELECT stage,
       COUNT(*)                  AS opp_count,
       SUM(estimated_value_vnd)  AS total_value_vnd,
       AVG(probability)          AS avg_probability
FROM   opportunities
WHERE  owner_rm_id = :rm_id
GROUP  BY stage
ORDER  BY CASE stage
            WHEN 'LEAD'         THEN 1
            WHEN 'QUALIFIED'    THEN 2
            WHEN 'PROPOSAL'     THEN 3
            WHEN 'NEGOTIATION'  THEN 4
            WHEN 'CLOSED_WON'   THEN 5
            WHEN 'CLOSED_LOST'  THEN 6
            ELSE 99
          END;

-- D-3. Cơ hội sắp đóng trong 7 ngày tới
SELECT o.id,
       c.name AS customer_name,
       o.product, o.stage, o.estimated_value_vnd,
       o.expected_close_date, o.probability, o.next_step
FROM   opportunities o
JOIN   customers c ON c.id = o.customer_id
WHERE  o.owner_rm_id      = :rm_id
  AND  o.expected_close_date BETWEEN date('now') AND date('now', '+7 days')
  AND  o.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')
ORDER  BY o.expected_close_date ASC;

-- D-4. Cơ hội bị đình trệ (không update trong 14 ngày)
SELECT o.id,
       c.name AS customer_name,
       o.product, o.stage, o.estimated_value_vnd, o.updated_at,
       julianday('now') - julianday(o.updated_at) AS stale_days
FROM   opportunities o
JOIN   customers c ON c.id = o.customer_id
WHERE  o.owner_rm_id = :rm_id
  AND  o.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')
  AND  julianday('now') - julianday(o.updated_at) >= 14
ORDER  BY stale_days DESC;

-- D-5. Cơ hội theo khách hàng cụ thể
SELECT id, product, stage, score, estimated_value_vnd,
       probability, expected_close_date, notes
FROM   opportunities
WHERE  customer_id = :customer_id
ORDER  BY created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- E. CHIẾN DỊCH (campaigns)
-- ─────────────────────────────────────────────────────────────────────────────

-- E-1. Tất cả chiến dịch đang chạy
SELECT id, name, type, target_segment, status,
       start_date, end_date, budget_vnd,
       total_sent, total_responses,
       CASE WHEN total_sent > 0
            THEN ROUND(100.0 * total_responses / total_sent, 2)
            ELSE 0
       END AS response_rate_pct,
       roi_vnd
FROM   campaigns
WHERE  status = 'ACTIVE'
   OR  (start_date <= date('now') AND end_date >= date('now'))
ORDER  BY start_date DESC;

-- E-2. Hiệu quả chiến dịch (ROI + response rate)
SELECT id, name, type, target_segment,
       total_sent,
       total_responses,
       ROUND(100.0 * total_responses / NULLIF(total_sent, 0), 2) AS response_rate_pct,
       budget_vnd,
       roi_vnd,
       ROUND(roi_vnd / NULLIF(budget_vnd, 0), 2)                 AS roi_ratio
FROM   campaigns
WHERE  status IN ('COMPLETED', 'ACTIVE')
ORDER  BY roi_ratio DESC NULLS LAST;

-- E-3. Cơ hội phát sinh từ một chiến dịch
SELECT o.id,
       c.name   AS customer_name,
       o.product, o.stage, o.estimated_value_vnd,
       o.created_at
FROM   opportunities o
JOIN   customers c ON c.id = o.customer_id
WHERE  o.campaign_id = :campaign_id
ORDER  BY o.estimated_value_vnd DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- F. NHIỆM VỤ — Tasks
-- ─────────────────────────────────────────────────────────────────────────────

-- F-1. Danh sách task OPEN của RM (sắp đến hạn trước)
SELECT t.id,
       t.title, t.description, t.due_date, t.priority,
       t.status, c.name AS customer_name
FROM   tasks t
LEFT   JOIN customers c ON c.id = t.customer_id
WHERE  t.rm_id  = :rm_id
  AND  t.status = 'OPEN'
ORDER  BY t.priority DESC,
          t.due_date ASC NULLS LAST;

-- F-2. Task quá hạn
SELECT t.id,
       t.title, t.due_date, t.priority,
       julianday('now') - julianday(t.due_date) AS overdue_days,
       c.name AS customer_name
FROM   tasks t
LEFT   JOIN customers c ON c.id = t.customer_id
WHERE  t.rm_id   = :rm_id
  AND  t.status  = 'OPEN'
  AND  t.due_date < date('now')
ORDER  BY overdue_days DESC;

-- F-3. Task hôm nay
SELECT t.id,
       t.title, t.due_date, t.priority, t.status,
       c.name AS customer_name
FROM   tasks t
LEFT   JOIN customers c ON c.id = t.customer_id
WHERE  t.rm_id   = :rm_id
  AND  t.due_date = date('now')
  AND  t.status  IN ('OPEN', 'SNOOZED')
ORDER  BY t.priority DESC;

-- F-4. Thống kê task theo trạng thái
SELECT status, priority, COUNT(*) AS cnt
FROM   tasks
WHERE  rm_id = :rm_id
GROUP  BY status, priority
ORDER  BY status, priority;

-- ─────────────────────────────────────────────────────────────────────────────
-- G. EMAIL TEMPLATE & CALL SCRIPT
-- ─────────────────────────────────────────────────────────────────────────────

-- G-1. Tìm email template phù hợp theo sản phẩm và stage
SELECT template_id, type, product, stage,
       subject, body, rating, use_count
FROM   email_templates
WHERE  (product = :product OR :product IS NULL)
  AND  (stage   = :stage   OR :stage   IS NULL)
ORDER  BY rating DESC, use_count DESC
LIMIT  5;

-- G-2. Email template được dùng nhiều nhất
SELECT template_id, type, product, stage,
       subject, rating, use_count
FROM   email_templates
ORDER  BY use_count DESC
LIMIT  10;

-- G-3. Tìm call script theo segment và objective
SELECT script_id, objective, product, segment, stage,
       opening, main_content, objection_handling, closing,
       rating, use_count
FROM   call_scripts
WHERE  (segment = :segment OR :segment IS NULL)
  AND  (product = :product OR :product IS NULL)
ORDER  BY rating DESC, use_count DESC
LIMIT  5;

-- G-4. Call script phổ biến nhất
SELECT script_id, objective, product, segment,
       rating, use_count, tags
FROM   call_scripts
ORDER  BY use_count DESC
LIMIT  10;

-- ─────────────────────────────────────────────────────────────────────────────
-- H. NEXT BEST ACTION — NBA
-- ─────────────────────────────────────────────────────────────────────────────

-- H-1. NBA đang hoạt động (PENDING) của một RM
SELECT n.id,
       n.customer_id,
       c.name     AS customer_name,
       n.action_type,
       pkb.name   AS product_name,
       pkb.category,
       pkb.interest_rate_percent,
       n.confidence_score,
       n.expires_at,
       n.status
FROM   next_best_actions n
JOIN   customers c              ON c.id = n.customer_id
LEFT   JOIN product_knowledge_base pkb ON pkb.id = n.product_id
WHERE  n.rm_id  = :rm_id
  AND  n.status = 'PENDING'
  AND  (n.expires_at IS NULL OR n.expires_at > datetime('now'))
ORDER  BY n.confidence_score DESC;

-- H-2. NBA của một khách hàng cụ thể
SELECT n.id,
       n.action_type,
       pkb.name  AS product_name,
       pkb.interest_rate_percent,
       n.confidence_score,
       n.recommendation_version,
       n.status,
       n.expires_at,
       n.created_at
FROM   next_best_actions n
LEFT   JOIN product_knowledge_base pkb ON pkb.id = n.product_id
WHERE  n.customer_id = :customer_id
ORDER  BY n.created_at DESC;

-- H-3. Sản phẩm được gợi ý nhiều nhất (top NBA product)
SELECT pkb.id, pkb.name, pkb.category,
       COUNT(n.id)                                              AS recommendation_count,
       AVG(n.confidence_score)                                 AS avg_confidence,
       SUM(CASE WHEN n.status = 'ACCEPTED' THEN 1 ELSE 0 END) AS accepted_count
FROM   next_best_actions n
JOIN   product_knowledge_base pkb ON pkb.id = n.product_id
GROUP  BY pkb.id
ORDER  BY recommendation_count DESC
LIMIT  10;

-- H-4. Sản phẩm trong KB đang ACTIVE
SELECT id, name, category, interest_rate_percent,
       min_investment_vnd, eligibility, target_audience, status
FROM   product_knowledge_base
WHERE  status = 'ACTIVE'
  AND  (effective_to IS NULL OR effective_to >= date('now'))
ORDER  BY category, name;

-- ─────────────────────────────────────────────────────────────────────────────
-- I. AUDIT & CONTEXT (llm_audit_logs / context_events)
-- ─────────────────────────────────────────────────────────────────────────────

-- I-1. Audit logs gần nhất của một RM (không lấy PII/hash)
SELECT id, actor_type, actor_ref, scope,
       conversation_ref, agent_intent,
       model_provider, model_name,
       prompt_tokens, completion_tokens, total_tokens,
       latency_ms, status, error_code, created_at
FROM   llm_audit_logs
WHERE  actor_ref = :rm_id
ORDER  BY created_at DESC
LIMIT  :limit;

-- I-2. Thống kê latency và token usage theo scope
SELECT scope,
       COUNT(*)              AS call_count,
       AVG(latency_ms)       AS avg_latency_ms,
       MAX(latency_ms)       AS max_latency_ms,
       SUM(total_tokens)     AS total_tokens_used,
       COUNT(*) FILTER (WHERE status = 'ERROR') AS error_count
FROM   llm_audit_logs
WHERE  created_at >= datetime('now', '-7 days')
GROUP  BY scope
ORDER  BY call_count DESC;

-- I-3. Error rate theo ngày (7 ngày gần nhất)
SELECT date(created_at) AS day,
       COUNT(*)          AS total_calls,
       COUNT(*) FILTER (WHERE status = 'ERROR')   AS errors,
       COUNT(*) FILTER (WHERE status = 'SUCCESS') AS successes,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'ERROR') / COUNT(*), 2) AS error_rate_pct
FROM   llm_audit_logs
WHERE  created_at >= datetime('now', '-7 days')
GROUP  BY day
ORDER  BY day DESC;

-- I-4. Context events của một RM (gần nhất trước)
SELECT id, rm_id, branch_code, customer_id,
       conversation_ref, scope, event_type,
       source_context, target_context, status, created_at
FROM   context_events
WHERE  rm_id = :rm_id
ORDER  BY created_at DESC
LIMIT  :limit;

-- I-5. Số lần context switch theo loại event
SELECT event_type, scope, COUNT(*) AS cnt
FROM   context_events
WHERE  rm_id = :rm_id
  AND  created_at >= datetime('now', '-30 days')
GROUP  BY event_type, scope
ORDER  BY cnt DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- J. RM PROFILE & NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- J-1. Danh sách RM theo chi nhánh
SELECT id, full_name, role, email, phone, status
FROM   rm_profiles
WHERE  branch_code = :branch_code
  AND  status      = 'ACTIVE'
ORDER  BY role, full_name;

-- J-2. Thông tin profile của một RM
SELECT id, full_name, normalized_name, branch_code,
       email, phone, role, status
FROM   rm_profiles
WHERE  id = :rm_id;

-- J-3. Thông báo chưa đọc của RM (UNREAD, sắp xếp theo priority)
SELECT id, type, title, body, priority,
       related_entity_type, related_entity_id,
       scheduled_at, expires_at, created_at
FROM   rm_notifications
WHERE  rm_id  = :rm_id
  AND  status = 'UNREAD'
  AND  (expires_at IS NULL OR expires_at > datetime('now'))
ORDER  BY CASE priority
            WHEN 'URGENT' THEN 1
            WHEN 'HIGH'   THEN 2
            WHEN 'NORMAL' THEN 3
            WHEN 'LOW'    THEN 4
            ELSE 5
          END,
          created_at DESC;

-- J-4. Đánh dấu thông báo đã đọc
UPDATE rm_notifications
SET    status     = 'READ',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE  id    = :notification_id
  AND  rm_id = :rm_id;

-- J-5. Thống kê thông báo theo loại
SELECT type, priority, status, COUNT(*) AS cnt
FROM   rm_notifications
WHERE  rm_id = :rm_id
GROUP  BY type, priority, status
ORDER  BY type, priority;

-- ─────────────────────────────────────────────────────────────────────────────
-- K. INTENT KEYWORDS & ALIASES (rule engine)
-- ─────────────────────────────────────────────────────────────────────────────

-- K-1. Tất cả keywords đang active, nhóm theo intent
SELECT intent_name,
       GROUP_CONCAT(keyword || ' [' || match_type || ']', ' | ') AS keywords
FROM   intent_keywords
WHERE  active = 1
GROUP  BY intent_name
ORDER  BY intent_name;

-- K-2. Tìm intent từ một keyword cụ thể (CONTAINS match)
SELECT DISTINCT intent_name, keyword, match_type, weight
FROM   intent_keywords
WHERE  active = 1
  AND  :user_input LIKE '%' || keyword || '%'
ORDER  BY weight DESC;

-- K-3. Tất cả alias đang active
SELECT alias, canonical
FROM   keyword_aliases
WHERE  active = 1
ORDER  BY alias;

-- K-4. Giải alias: tra canonical từ một từ nhập vào
SELECT alias, canonical
FROM   keyword_aliases
WHERE  active = 1
  AND  alias = :input_word;

-- ─────────────────────────────────────────────────────────────────────────────
-- L. CONSENT — Customer Consents (GDPR / Nghị định 13/2023)
-- ─────────────────────────────────────────────────────────────────────────────

-- L-1. Consent hiện hành của một khách hàng
SELECT id, purpose, legal_basis, source, status,
       captured_at, expires_at, version, evidence_ref
FROM   customer_consents
WHERE  customer_id = :customer_id
  AND  is_current  = 1
ORDER  BY purpose;

-- L-2. Consent sắp hết hạn trong 30 ngày
SELECT cc.id,
       cc.customer_id,
       c.name     AS customer_name,
       cc.purpose,
       cc.status,
       cc.expires_at,
       julianday(cc.expires_at) - julianday('now') AS days_until_expiry
FROM   customer_consents cc
JOIN   customers c ON c.id = cc.customer_id
WHERE  cc.is_current = 1
  AND  cc.status     = 'GRANTED'
  AND  cc.expires_at IS NOT NULL
  AND  julianday(cc.expires_at) - julianday('now') BETWEEN 0 AND 30
ORDER  BY days_until_expiry ASC;

-- L-3. Khách hàng chưa có consent cho một mục đích
SELECT c.id, c.name, c.email, c.phone
FROM   customers c
WHERE  c.rm_id  = :rm_id
  AND  c.status = 'active'
  AND  NOT EXISTS (
         SELECT 1
         FROM   customer_consents cc
         WHERE  cc.customer_id = c.id
           AND  cc.purpose     = :purpose  -- VD: 'MARKETING_EMAIL'
           AND  cc.is_current  = 1
           AND  cc.status      = 'GRANTED'
       )
ORDER  BY c.name;

-- L-4. Thống kê consent theo mục đích
SELECT purpose, status, COUNT(*) AS cnt
FROM   customer_consents
WHERE  is_current = 1
GROUP  BY purpose, status
ORDER  BY purpose, status;

-- ─────────────────────────────────────────────────────────────────────────────
-- M. SAVED QUERIES (Pinned shortcuts)
-- ─────────────────────────────────────────────────────────────────────────────

-- M-1. Danh sách query được ghim của một RM
SELECT id, name, query_text, resolved_intent, use_count, last_used_at
FROM   saved_queries
WHERE  rm_id     = :rm_id
  AND  is_pinned = 1
ORDER  BY use_count DESC;

-- M-2. Query được dùng nhiều nhất trong 30 ngày
SELECT id, name, query_text, resolved_intent, use_count, last_used_at
FROM   saved_queries
WHERE  rm_id        = :rm_id
  AND  last_used_at >= date('now', '-30 days')
ORDER  BY use_count DESC
LIMIT  10;

-- ─────────────────────────────────────────────────────────────────────────────
-- N. DASHBOARD / TỔNG HỢP NHANH (Composite queries)
-- ─────────────────────────────────────────────────────────────────────────────

-- N-1. Dashboard RM: tổng hợp ngày hôm nay (single-row result)
SELECT
  (SELECT COUNT(*) FROM customers
   WHERE  rm_id = :rm_id AND status = 'active')                                        AS total_customers,

  (SELECT COUNT(*) FROM customers
   WHERE  rm_id = :rm_id AND status = 'active'
     AND  maturity_date BETWEEN date('now') AND date('now', '+7 days'))                AS maturing_7d,

  (SELECT COUNT(*) FROM tasks
   WHERE  rm_id = :rm_id AND status = 'OPEN'
     AND  due_date = date('now'))                                                       AS tasks_today,

  (SELECT COUNT(*) FROM tasks
   WHERE  rm_id = :rm_id AND status = 'OPEN'
     AND  due_date < date('now'))                                                       AS overdue_tasks,

  (SELECT COUNT(*) FROM opportunities
   WHERE  owner_rm_id = :rm_id
     AND  stage NOT IN ('CLOSED_WON', 'CLOSED_LOST'))                                 AS open_opportunities,

  (SELECT COALESCE(SUM(estimated_value_vnd), 0) FROM opportunities
   WHERE  owner_rm_id = :rm_id
     AND  stage NOT IN ('CLOSED_WON', 'CLOSED_LOST'))                                 AS pipeline_value_vnd,

  (SELECT COUNT(*) FROM rm_notifications
   WHERE  rm_id = :rm_id AND status = 'UNREAD')                                       AS unread_notifications;

-- N-2. Danh sách chăm sóc ưu tiên hôm nay (care list tổng hợp)
--      Gộp: tiết kiệm sắp đến hạn + task hôm nay + cơ hội sắp đóng
SELECT 'MATURITY'    AS care_type,
       c.id           AS customer_id,
       c.name         AS customer_name,
       c.phone,
       c.savings_product AS detail,
       c.maturity_date   AS due_date
FROM   customers c
WHERE  c.rm_id  = :rm_id AND c.status = 'active'
  AND  c.maturity_date BETWEEN date('now') AND date('now', '+7 days')

UNION ALL

SELECT 'TASK'        AS care_type,
       c.id           AS customer_id,
       c.name         AS customer_name,
       c.phone,
       t.title        AS detail,
       t.due_date
FROM   tasks t
JOIN   customers c ON c.id = t.customer_id
WHERE  t.rm_id  = :rm_id
  AND  t.status = 'OPEN'
  AND  t.due_date = date('now')

UNION ALL

SELECT 'OPPORTUNITY' AS care_type,
       c.id           AS customer_id,
       c.name         AS customer_name,
       c.phone,
       o.product      AS detail,
       o.expected_close_date AS due_date
FROM   opportunities o
JOIN   customers c ON c.id = o.customer_id
WHERE  o.owner_rm_id = :rm_id
  AND  o.expected_close_date BETWEEN date('now') AND date('now', '+3 days')
  AND  o.stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')

ORDER  BY due_date ASC, care_type;

-- =============================================================================
-- End of BankRM Copilot Query Reference
-- =============================================================================
