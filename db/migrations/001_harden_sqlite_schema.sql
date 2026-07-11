-- Upgrade the original unversioned Issue #8 schema (user_version = 0) to v1.
-- Apply exactly once. The schema_migrations row and user_version are the gate
-- used by a migration runner to skip this file on already-upgraded databases.
-- PRAGMA foreign_keys cannot be changed while a transaction is active.
PRAGMA foreign_keys = OFF;
-- Zero dropped payload pages instead of leaving sensitive text on the freelist.
PRAGMA secure_delete = ON;
BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY CHECK(version > 0),
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

ALTER TABLE product_knowledge_base RENAME TO product_knowledge_base_v0;
CREATE TABLE product_knowledge_base (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    interest_rate_percent REAL,
    min_investment_vnd REAL CHECK(min_investment_vnd >= 0),
    eligibility TEXT,
    exclusions TEXT,
    fees TEXT,
    target_audience TEXT,
    description TEXT,
    effective_from TEXT,
    effective_to TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
    source_ref TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
INSERT INTO product_knowledge_base (
    id, name, category, interest_rate_percent, min_investment_vnd,
    eligibility, target_audience, description, version, status, created_at, updated_at
)
SELECT id, name, category, interest_rate_percent, min_investment_vnd,
       conditions, target_audience, description, 1,
       CASE lower(COALESCE(status, 'active'))
           WHEN 'active' THEN 'ACTIVE'
           WHEN 'inactive' THEN 'INACTIVE'
           WHEN 'expired' THEN 'EXPIRED'
           WHEN 'draft' THEN 'DRAFT'
           ELSE 'INACTIVE'
       END,
       COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
       COALESCE(updated_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM product_knowledge_base_v0;
DROP TABLE product_knowledge_base_v0;

ALTER TABLE customer_consents RENAME TO customer_consents_v0;
CREATE TABLE customer_consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    legal_basis TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('GRANTED', 'DENIED', 'REVOKED', 'EXPIRED', 'UNKNOWN')),
    captured_at TEXT NOT NULL,
    expires_at TEXT,
    version INTEGER NOT NULL CHECK(version > 0),
    evidence_ref TEXT,
    is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CHECK(expires_at IS NULL OR expires_at >= captured_at)
);
INSERT INTO customer_consents (
    id, customer_id, purpose, legal_basis, source, status, captured_at,
    version, is_current, created_at, updated_at
)
SELECT id, customer_id, consent_type, 'UNSPECIFIED_LEGACY', 'LEGACY_MIGRATION',
       CASE lower(COALESCE(status, ''))
           WHEN 'granted' THEN 'GRANTED'
           WHEN 'denied' THEN 'DENIED'
           WHEN 'revoked' THEN 'REVOKED'
           WHEN 'expired' THEN 'EXPIRED'
           ELSE 'UNKNOWN'
       END,
       COALESCE(last_updated, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
       ROW_NUMBER() OVER (
           PARTITION BY customer_id, consent_type
           ORDER BY COALESCE(last_updated, '') ASC, id ASC
       ),
       CASE WHEN ROW_NUMBER() OVER (
           PARTITION BY customer_id, consent_type
           ORDER BY COALESCE(last_updated, '') DESC, id DESC
       ) = 1 THEN 1 ELSE 0 END,
       COALESCE(last_updated, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
       COALESCE(last_updated, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM customer_consents_v0;
DROP TABLE customer_consents_v0;

ALTER TABLE tasks RENAME TO tasks_v0;
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    rm_id TEXT NOT NULL,
    customer_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'SNOOZED', 'DONE', 'DISMISSED')),
    priority TEXT DEFAULT 'medium',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);
INSERT INTO tasks (
    id, rm_id, customer_id, title, description, due_date, status, priority, created_at, updated_at
)
SELECT id, rm_id, customer_id, title, description, due_date,
       CASE lower(COALESCE(status, 'pending'))
           WHEN 'snoozed' THEN 'SNOOZED'
           WHEN 'done' THEN 'DONE'
           WHEN 'completed' THEN 'DONE'
           WHEN 'dismissed' THEN 'DISMISSED'
           WHEN 'cancelled' THEN 'DISMISSED'
           WHEN 'canceled' THEN 'DISMISSED'
           ELSE 'OPEN'
       END,
       priority,
       COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
       COALESCE(updated_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM tasks_v0;
DROP TABLE tasks_v0;

-- Deliberately discard v0 request_payload/response_payload. Standard SQLite has
-- no built-in cryptographic hash, so migration must not retain raw data or label
-- a non-cryptographic value as a hash.
ALTER TABLE llm_audit_logs RENAME TO llm_audit_logs_v0;
CREATE TABLE llm_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_type TEXT NOT NULL DEFAULT 'RM' CHECK(actor_type IN ('RM', 'SYSTEM', 'SERVICE')),
    actor_ref TEXT NOT NULL,
    scope TEXT NOT NULL,
    conversation_ref TEXT NOT NULL,
    agent_intent TEXT,
    query_hash TEXT,
    request_hash TEXT,
    response_hash TEXT,
    request_ref TEXT,
    response_ref TEXT,
    api_endpoint_called TEXT,
    model_provider TEXT,
    model_name TEXT,
    model_version TEXT,
    prompt_tokens INTEGER CHECK(prompt_tokens IS NULL OR prompt_tokens >= 0),
    completion_tokens INTEGER CHECK(completion_tokens IS NULL OR completion_tokens >= 0),
    total_tokens INTEGER CHECK(total_tokens IS NULL OR total_tokens >= 0),
    latency_ms INTEGER CHECK(latency_ms IS NULL OR latency_ms >= 0),
    status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'ERROR', 'CANCELLED', 'TIMEOUT', 'UNKNOWN')),
    error_code TEXT,
    error_ref TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK(query_hash IS NULL OR length(query_hash) >= 32),
    CHECK(request_hash IS NULL OR length(request_hash) >= 32),
    CHECK(response_hash IS NULL OR length(response_hash) >= 32),
    CHECK(total_tokens IS NULL OR prompt_tokens IS NULL OR completion_tokens IS NULL OR total_tokens = prompt_tokens + completion_tokens),
    CHECK(status = 'ERROR' OR error_code IS NULL)
);
INSERT INTO llm_audit_logs (
    id, actor_type, actor_ref, scope, conversation_ref, agent_intent,
    request_ref, response_ref, api_endpoint_called, model_provider,
    prompt_tokens, completion_tokens, total_tokens, latency_ms, status, created_at
)
SELECT id, 'RM', rm_id, 'CRM_ASSISTANT', printf('legacy-audit-%d', id), agent_intent,
       CASE WHEN request_payload IS NULL THEN NULL ELSE 'LEGACY_PAYLOAD_DISCARDED' END,
       CASE WHEN response_payload IS NULL THEN NULL ELSE 'LEGACY_PAYLOAD_DISCARDED' END,
       api_endpoint_called, llm_provider, prompt_tokens, completion_tokens,
       CASE WHEN prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL
            THEN prompt_tokens + completion_tokens ELSE NULL END,
       latency_ms, 'UNKNOWN',
       COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM llm_audit_logs_v0;
DROP TABLE llm_audit_logs_v0;

ALTER TABLE next_best_actions RENAME TO next_best_actions_v0;
CREATE TABLE next_best_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL,
    rm_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    product_id TEXT,
    product_snapshot TEXT,
    reasoning_ref TEXT,
    confidence_score REAL CHECK(confidence_score BETWEEN 0 AND 100),
    source_ref TEXT,
    model_provider TEXT,
    model_name TEXT,
    model_version TEXT,
    recommendation_version INTEGER NOT NULL DEFAULT 1 CHECK(recommendation_version > 0),
    expires_at TEXT,
    dedupe_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES product_knowledge_base(id) ON DELETE SET NULL,
    UNIQUE(customer_id, rm_id, dedupe_key),
    CHECK(expires_at IS NULL OR expires_at >= created_at)
);
INSERT INTO next_best_actions (
    id, customer_id, rm_id, action_type, product_id, product_snapshot,
    reasoning_ref, confidence_score, recommendation_version, dedupe_key,
    status, created_at, updated_at
)
SELECT nba.id, nba.customer_id, nba.rm_id, nba.action_type,
       COALESCE(
           (SELECT pkb.id FROM product_knowledge_base AS pkb
            WHERE pkb.id = nba.recommended_product LIMIT 1),
           (SELECT pkb.id FROM product_knowledge_base AS pkb
            WHERE pkb.name = nba.recommended_product ORDER BY pkb.id LIMIT 1)
       ),
       nba.recommended_product,
       CASE WHEN nba.reasoning IS NULL THEN NULL ELSE printf('legacy-nba-%d-reasoning-redacted', nba.id) END,
       nba.confidence_score, 1, printf('legacy-nba-%d', nba.id),
       CASE lower(COALESCE(nba.status, 'pending'))
           WHEN 'accepted' THEN 'ACCEPTED'
           WHEN 'rejected' THEN 'REJECTED'
           WHEN 'expired' THEN 'EXPIRED'
           ELSE 'PENDING'
       END,
       COALESCE(nba.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
       COALESCE(nba.updated_at, nba.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM next_best_actions_v0 AS nba;
DROP TABLE next_best_actions_v0;

CREATE TABLE context_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rm_id TEXT NOT NULL,
    branch_code TEXT,
    customer_id TEXT,
    conversation_ref TEXT NOT NULL,
    scope TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('CONTEXT_SET', 'CONTEXT_SWITCHED', 'CONTEXT_CLEARED', 'CONTEXT_ACCESSED')),
    source_context TEXT,
    target_context TEXT,
    context_hash TEXT,
    context_ref TEXT,
    source_endpoint TEXT,
    status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK(status IN ('SUCCESS', 'DENIED', 'ERROR')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CHECK(context_hash IS NULL OR length(context_hash) >= 32)
);

CREATE INDEX IF NOT EXISTS idx_customers_branch_rm_status ON customers(branch_code, rm_id, status);
CREATE UNIQUE INDEX uq_customer_consents_current
    ON customer_consents(customer_id, purpose) WHERE is_current = 1;
CREATE INDEX idx_customer_consents_query
    ON customer_consents(customer_id, purpose, is_current, status);
CREATE INDEX idx_product_kb_effective
    ON product_knowledge_base(status, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_opportunities_rm_query ON opportunities(owner_rm_id, stage, expected_close_date);
CREATE INDEX IF NOT EXISTS idx_interactions_rm_query ON interactions(rm_id, occurred_at DESC);
CREATE INDEX idx_tasks_rm_id_status ON tasks(rm_id, status);
CREATE INDEX idx_tasks_rm_query ON tasks(rm_id, status, due_date);
CREATE INDEX idx_audit_actor_created ON llm_audit_logs(actor_ref, created_at DESC);
CREATE INDEX idx_audit_conversation_ref ON llm_audit_logs(conversation_ref);
CREATE INDEX idx_audit_scope_status ON llm_audit_logs(scope, status, created_at DESC);
CREATE INDEX idx_audit_query_hash ON llm_audit_logs(query_hash);
CREATE INDEX idx_nba_customer_id ON next_best_actions(customer_id);
CREATE INDEX idx_nba_rm_query ON next_best_actions(rm_id, status, expires_at);
CREATE INDEX idx_nba_product_id ON next_best_actions(product_id);
CREATE INDEX idx_context_events_rm_query ON context_events(rm_id, created_at DESC);
CREATE INDEX idx_context_events_branch_query ON context_events(branch_code, created_at DESC);
CREATE INDEX idx_context_events_customer_query ON context_events(customer_id, created_at DESC);
CREATE INDEX idx_context_events_conversation_query ON context_events(conversation_ref, created_at);

CREATE TRIGGER trg_product_kb_updated_at
AFTER UPDATE ON product_knowledge_base FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE product_knowledge_base SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_customers_updated_at
AFTER UPDATE ON customers FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE customers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_customer_consents_updated_at
AFTER UPDATE ON customer_consents FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE customer_consents SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_campaigns_updated_at
AFTER UPDATE ON campaigns FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE campaigns SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_opportunities_updated_at
AFTER UPDATE ON opportunities FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE opportunities SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_tasks_updated_at
AFTER UPDATE ON tasks FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_email_templates_updated_at
AFTER UPDATE ON email_templates FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE email_templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE template_id = NEW.template_id; END;
CREATE TRIGGER IF NOT EXISTS trg_call_scripts_updated_at
AFTER UPDATE ON call_scripts FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE call_scripts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE script_id = NEW.script_id; END;
CREATE TRIGGER trg_nba_updated_at
AFTER UPDATE ON next_best_actions FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE next_best_actions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

INSERT INTO schema_migrations(version, name)
VALUES (1, 'harden_sqlite_schema');
PRAGMA user_version = 1;
COMMIT;

PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
