-- Canonical schema for a new database.
-- SQLite foreign-key enforcement is connection-scoped, so every connection must
-- execute this PRAGMA (the schema and migrations do it for their own sessions).
PRAGMA foreign_keys = ON;
PRAGMA secure_delete = ON;

BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY CHECK(version > 0),
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS product_knowledge_base (
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

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    segment TEXT,
    savings_product TEXT,
    savings_amount_vnd REAL CHECK(savings_amount_vnd >= 0),
    maturity_date TEXT,
    risk_profile TEXT,
    location TEXT,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    dob TEXT,
    gender TEXT,
    marital_status TEXT,
    number_of_dependents INTEGER CHECK(number_of_dependents >= 0),
    occupation TEXT,
    employer_name TEXT,
    income_vnd REAL CHECK(income_vnd >= 0),
    monthly_expenses_vnd REAL CHECK(monthly_expenses_vnd >= 0),
    total_assets_vnd REAL CHECK(total_assets_vnd >= 0),
    credit_score INTEGER CHECK(credit_score BETWEEN 0 AND 1000),
    kyc_status TEXT DEFAULT 'verified',
    kyc_last_updated TEXT,
    onboarding_date TEXT,
    branch_code TEXT,
    rm_id TEXT,
    preferred_channel TEXT,
    status TEXT DEFAULT 'active',
    last_interaction_date TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS customer_consents (
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

CREATE TABLE IF NOT EXISTS customer_tags (
    customer_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (customer_id, tag),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target_segment TEXT,
    type TEXT,
    status TEXT,
    start_date TEXT,
    end_date TEXT,
    budget_vnd REAL CHECK(budget_vnd >= 0),
    total_sent INTEGER DEFAULT 0,
    total_responses INTEGER DEFAULT 0,
    roi_vnd REAL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    product TEXT,
    stage TEXT,
    score REAL CHECK(score >= 0),
    estimated_value_vnd REAL CHECK(estimated_value_vnd >= 0),
    expected_close_date TEXT,
    probability INTEGER CHECK(probability BETWEEN 0 AND 100),
    lead_source TEXT,
    lost_reason TEXT,
    competitor TEXT,
    next_step TEXT,
    next_step_date TEXT,
    campaign_id TEXT,
    owner_rm_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    channel TEXT,
    direction TEXT,
    interaction_type TEXT,
    occurred_at TEXT NOT NULL,
    outcome TEXT,
    note TEXT,
    sentiment TEXT,
    duration_minutes INTEGER CHECK(duration_minutes >= 0),
    products_discussed TEXT,
    follow_up_required INTEGER NOT NULL DEFAULT 0 CHECK(follow_up_required IN (0, 1)),
    recording_url TEXT,
    rm_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
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

CREATE TABLE IF NOT EXISTS email_templates (
    template_id TEXT PRIMARY KEY,
    type TEXT,
    product TEXT,
    stage TEXT,
    subject TEXT,
    body TEXT,
    rating REAL CHECK(rating BETWEEN 0 AND 5),
    use_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS call_scripts (
    script_id TEXT PRIMARY KEY,
    objective TEXT,
    product TEXT,
    segment TEXT,
    stage TEXT,
    opening TEXT,
    main_content TEXT,
    objection_handling TEXT,
    closing TEXT,
    rating REAL CHECK(rating BETWEEN 0 AND 5),
    use_count INTEGER DEFAULT 0,
    tags TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Never store prompts, generated text, raw errors, PII, or credentials here.
-- Hashes are produced by the application before insertion; *_ref values must
-- point to separately governed, redacted records.
CREATE TABLE IF NOT EXISTS llm_audit_logs (
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

CREATE TABLE IF NOT EXISTS next_best_actions (
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

-- Context payloads stay outside this event ledger. Only governed references and
-- hashes are retained so context switching remains traceable without copying PII.
CREATE TABLE IF NOT EXISTS context_events (
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

-- Relationship Manager profiles. rm_id TEXT columns in tasks/interactions/
-- opportunities reference this table logically; no hard FK is enforced so that
-- legacy or sandbox data with free-form rm_id values remain valid.
CREATE TABLE IF NOT EXISTS rm_profiles (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    branch_code TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'RM'
        CHECK(role IN ('RM', 'SENIOR_RM', 'BRANCH_MANAGER', 'ADMIN')),
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK(status IN ('ACTIVE', 'INACTIVE', 'ON_LEAVE')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Configurable intent keywords. Replaces hardcoded keyword arrays in
-- mcpContextEngine.js. Each row maps one normalized (no-diacritics) keyword to
-- an intent_name. The engine loads these at startup (or from cache) so intents
-- can be updated via SQL without code changes.
CREATE TABLE IF NOT EXISTS intent_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intent_name TEXT NOT NULL,
    keyword TEXT NOT NULL,
    match_type TEXT NOT NULL DEFAULT 'CONTAINS'
        CHECK(match_type IN ('EXACT', 'CONTAINS', 'STARTS_WITH', 'REGEX')),
    weight REAL NOT NULL DEFAULT 1.0 CHECK(weight > 0),
    language TEXT NOT NULL DEFAULT 'vi',
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(intent_name, keyword)
);

-- Alias/typo normalization table. Maps common misspellings, abbreviations, and
-- informal Vietnamese shorthand to canonical normalized forms before intent
-- matching. Loaded alongside intent_keywords.
CREATE TABLE IF NOT EXISTS keyword_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT NOT NULL UNIQUE,
    canonical TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Saved / pinned queries per RM. Tracks which natural-language queries an RM
-- uses frequently so they can be surfaced as shortcuts in the Chat UI.
-- query_text stores the original message; normalized_query stores the
-- no-diacritics form for deduplication. resolved_intent is populated after the
-- rule engine or fallback agent identifies the intent.
CREATE TABLE IF NOT EXISTS saved_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rm_id TEXT NOT NULL,
    name TEXT NOT NULL,
    query_text TEXT NOT NULL,
    normalized_query TEXT NOT NULL,
    resolved_intent TEXT,
    use_count INTEGER NOT NULL DEFAULT 0 CHECK(use_count >= 0),
    last_used_at TEXT,
    is_pinned INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Notification / alert queue for RMs. Generated by the system (maturity alerts,
-- task due reminders, campaign events, NBA recommendations) and consumed by the
-- Chat UI or a background push mechanism. PII is kept minimal: only IDs are
-- stored; display names are resolved at read time from customers/tasks.
CREATE TABLE IF NOT EXISTS rm_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rm_id TEXT NOT NULL,
    customer_id TEXT,
    type TEXT NOT NULL CHECK(type IN (
        'MATURITY_ALERT', 'TASK_DUE', 'CAMPAIGN_START', 'CAMPAIGN_END',
        'OPPORTUNITY_STALE', 'NBA_READY', 'SYSTEM'
    )),
    title TEXT NOT NULL,
    body TEXT,
    priority TEXT NOT NULL DEFAULT 'NORMAL'
        CHECK(priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    status TEXT NOT NULL DEFAULT 'UNREAD'
        CHECK(status IN ('UNREAD', 'READ', 'DISMISSED', 'ACTIONED')),
    related_entity_type TEXT,
    related_entity_id TEXT,
    scheduled_at TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CHECK(expires_at IS NULL OR expires_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_customers_normalized_name ON customers(normalized_name);
CREATE INDEX IF NOT EXISTS idx_customers_maturity_date ON customers(maturity_date);
CREATE INDEX IF NOT EXISTS idx_customers_segment ON customers(segment);
CREATE INDEX IF NOT EXISTS idx_customers_rm_id ON customers(rm_id);
CREATE INDEX IF NOT EXISTS idx_customers_branch_rm_status ON customers(branch_code, rm_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_consents_current
    ON customer_consents(customer_id, purpose) WHERE is_current = 1;
CREATE INDEX IF NOT EXISTS idx_customer_consents_query
    ON customer_consents(customer_id, purpose, is_current, status);
CREATE INDEX IF NOT EXISTS idx_product_kb_effective
    ON product_knowledge_base(status, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_opportunities_customer_id ON opportunities(customer_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_product ON opportunities(product);
CREATE INDEX IF NOT EXISTS idx_opportunities_campaign_id ON opportunities(campaign_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_rm_query ON opportunities(owner_rm_id, stage, expected_close_date);
CREATE INDEX IF NOT EXISTS idx_interactions_customer_id_occurred_at ON interactions(customer_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_interactions_channel ON interactions(channel);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interactions_rm_query ON interactions(rm_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_rm_id_status ON tasks(rm_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_rm_query ON tasks(rm_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created ON llm_audit_logs(actor_ref, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_conversation_ref ON llm_audit_logs(conversation_ref);
CREATE INDEX IF NOT EXISTS idx_audit_scope_status ON llm_audit_logs(scope, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_query_hash ON llm_audit_logs(query_hash);
CREATE INDEX IF NOT EXISTS idx_nba_customer_id ON next_best_actions(customer_id);
CREATE INDEX IF NOT EXISTS idx_nba_rm_query ON next_best_actions(rm_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_nba_product_id ON next_best_actions(product_id);
CREATE INDEX IF NOT EXISTS idx_context_events_rm_query ON context_events(rm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_context_events_branch_query ON context_events(branch_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_context_events_customer_query ON context_events(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_context_events_conversation_query ON context_events(conversation_ref, created_at);
CREATE INDEX IF NOT EXISTS idx_rm_profiles_branch ON rm_profiles(branch_code, status);
CREATE INDEX IF NOT EXISTS idx_rm_profiles_normalized ON rm_profiles(normalized_name);
CREATE INDEX IF NOT EXISTS idx_intent_keywords_intent ON intent_keywords(intent_name, active);
CREATE INDEX IF NOT EXISTS idx_intent_keywords_keyword ON intent_keywords(keyword, active);
CREATE INDEX IF NOT EXISTS idx_keyword_aliases_alias ON keyword_aliases(alias, active);
CREATE INDEX IF NOT EXISTS idx_saved_queries_rm ON saved_queries(rm_id, is_pinned, use_count DESC);
CREATE INDEX IF NOT EXISTS idx_saved_queries_intent ON saved_queries(resolved_intent);
CREATE INDEX IF NOT EXISTS idx_rm_notifications_rm ON rm_notifications(rm_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rm_notifications_type ON rm_notifications(type, status, priority);
CREATE INDEX IF NOT EXISTS idx_rm_notifications_customer ON rm_notifications(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rm_notifications_scheduled ON rm_notifications(scheduled_at) WHERE status = 'UNREAD';

-- Keep updated_at correct even for writers that omit it. Explicitly supplied
-- updated_at values are respected for controlled imports/backfills.
CREATE TRIGGER IF NOT EXISTS trg_product_kb_updated_at
AFTER UPDATE ON product_knowledge_base FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE product_knowledge_base SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_customers_updated_at
AFTER UPDATE ON customers FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE customers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_customer_consents_updated_at
AFTER UPDATE ON customer_consents FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE customer_consents SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_campaigns_updated_at
AFTER UPDATE ON campaigns FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE campaigns SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_opportunities_updated_at
AFTER UPDATE ON opportunities FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE opportunities SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_tasks_updated_at
AFTER UPDATE ON tasks FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_email_templates_updated_at
AFTER UPDATE ON email_templates FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE email_templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE template_id = NEW.template_id; END;
CREATE TRIGGER IF NOT EXISTS trg_call_scripts_updated_at
AFTER UPDATE ON call_scripts FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE call_scripts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE script_id = NEW.script_id; END;
CREATE TRIGGER IF NOT EXISTS trg_nba_updated_at
AFTER UPDATE ON next_best_actions FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE next_best_actions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_rm_profiles_updated_at
AFTER UPDATE ON rm_profiles FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE rm_profiles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_saved_queries_updated_at
AFTER UPDATE ON saved_queries FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE saved_queries SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_rm_notifications_updated_at
AFTER UPDATE ON rm_notifications FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE rm_notifications SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

INSERT OR IGNORE INTO schema_migrations(version, name)
VALUES (1, 'harden_sqlite_schema');

INSERT OR IGNORE INTO schema_migrations(version, name)
VALUES (2, 'add_keyword_and_query_tables');

-- ─── Seed: intent_keywords ────────────────────────────────────────────────────
-- Maps normalized (no-diacritics) keywords to intent names. Mirrors the
-- hardcoded arrays in mcpContextEngine.js so the engine can optionally load
-- from DB instead of source code.
INSERT OR IGNORE INTO intent_keywords(intent_name, keyword, match_type) VALUES
  -- Intent: maturity-reminder (nhắc tiết kiệm đến hạn)
  ('maturity-reminder', 'nhac', 'CONTAINS'),
  ('maturity-reminder', 'tiet kiem', 'CONTAINS'),
  ('maturity-reminder', 'den han', 'CONTAINS'),
  ('maturity-reminder', '1', 'EXACT'),
  -- Intent: email-draft (soạn email)
  ('email-draft', 'soan', 'CONTAINS'),
  ('email-draft', 'viet', 'CONTAINS'),
  ('email-draft', 'draft', 'CONTAINS'),
  ('email-draft', 'email', 'CONTAINS'),
  ('email-draft', 'mail', 'CONTAINS'),
  ('email-draft', 'soan tiep', 'CONTAINS'),
  ('email-draft', 'follow up', 'CONTAINS'),
  ('email-draft', 'cham soc', 'CONTAINS'),
  ('email-draft', '2', 'EXACT'),
  -- Intent: suggest-opportunity (gợi ý cơ hội)
  ('suggest-opportunity', 'co hoi', 'CONTAINS'),
  ('suggest-opportunity', 'opportunity', 'CONTAINS'),
  ('suggest-opportunity', 'goi y', 'CONTAINS'),
  ('suggest-opportunity', '3', 'EXACT'),
  -- Intent: campaign-summary (chiến dịch)
  ('campaign-summary', 'chien dich', 'CONTAINS'),
  ('campaign-summary', 'campaign', 'CONTAINS'),
  ('campaign-summary', '4', 'EXACT'),
  -- Intent: today-care-list (danh sách chăm sóc hôm nay)
  ('today-care-list', 'hom nay', 'CONTAINS'),
  ('today-care-list', 'ngay nay', 'CONTAINS'),
  ('today-care-list', 'tiep khach', 'CONTAINS'),
  ('today-care-list', 'bao nhieu', 'CONTAINS'),
  ('today-care-list', 'liet ke', 'CONTAINS'),
  ('today-care-list', 'danh sach', 'CONTAINS'),
  -- Intent: product-summary (tổng hợp sản phẩm)
  ('product-summary', 'san pham', 'CONTAINS'),
  ('product-summary', 'tiep can', 'CONTAINS'),
  -- Intent: savings-threshold (lọc theo ngưỡng số dư)
  ('savings-threshold', 'tiet kiem', 'CONTAINS'),
  ('savings-threshold', 'khoan tiet kiem', 'CONTAINS'),
  ('savings-threshold', 'so du', 'CONTAINS'),
  ('savings-threshold', 'lon hon', 'CONTAINS'),
  ('savings-threshold', 'tren', 'CONTAINS'),
  -- Intent: call-script (kịch bản gọi)
  ('call-script', 'call script', 'CONTAINS'),
  ('call-script', 'kich ban goi', 'CONTAINS'),
  ('call-script', 'kich ban', 'CONTAINS');

-- ─── Seed: keyword_aliases ────────────────────────────────────────────────────
-- Common Vietnamese typos, informal forms, and abbreviations mapped to their
-- canonical normalized equivalents used in intent_keywords.
INSERT OR IGNORE INTO keyword_aliases(alias, canonical) VALUES
  ('khac hang',   'khach hang'),
  ('tiep khach',  'khach hang'),
  ('kh',          'khach hang'),
  ('ts',          'tiet kiem'),
  ('tk',          'tiet kiem'),
  ('den han',     'den han'),
  ('dh',          'den han'),
  ('co hoi',      'co hoi'),
  ('ch',          'co hoi'),
  ('cd',          'chien dich'),
  ('em soan',     'soan'),
  ('em viet',     'viet'),
  ('nhac nho',    'nhac'),
  ('nhac han',    'nhac'),
  ('sd',          'so du'),
  ('kqkd',        'ket qua kinh doanh'),
  ('hnay',        'hom nay'),
  ('kbs',         'kich ban'),
  ('kb',          'kich ban goi');

PRAGMA user_version = 2;
COMMIT;
