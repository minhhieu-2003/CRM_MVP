-- Migration 002: Add keyword tables and query support tables.
-- Upgrades schema from user_version = 1 to user_version = 2.
-- This file is idempotent (uses IF NOT EXISTS / INSERT OR IGNORE).
-- PRAGMA foreign_keys cannot be changed inside a transaction.
PRAGMA foreign_keys = OFF;
PRAGMA secure_delete = ON;
BEGIN IMMEDIATE;

-- Guard: only run if schema_migrations exists and we are on version 1.
-- A migration runner should check this before executing; the INSERT OR IGNORE
-- at the end acts as an idempotency gate if run manually.

-- ─── Table: rm_profiles ───────────────────────────────────────────────────────
-- Relationship Manager identity. Other tables (tasks, interactions, opportunities)
-- reference rm_id as a TEXT column without a hard FK so legacy / sandbox data
-- with free-form rm_id values stay valid.
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

-- ─── Table: intent_keywords ───────────────────────────────────────────────────
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

-- ─── Table: keyword_aliases ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS keyword_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT NOT NULL UNIQUE,
    canonical TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ─── Table: saved_queries ─────────────────────────────────────────────────────
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

-- ─── Table: rm_notifications ──────────────────────────────────────────────────
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

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rm_profiles_branch     ON rm_profiles(branch_code, status);
CREATE INDEX IF NOT EXISTS idx_rm_profiles_normalized ON rm_profiles(normalized_name);
CREATE INDEX IF NOT EXISTS idx_intent_keywords_intent  ON intent_keywords(intent_name, active);
CREATE INDEX IF NOT EXISTS idx_intent_keywords_keyword ON intent_keywords(keyword, active);
CREATE INDEX IF NOT EXISTS idx_keyword_aliases_alias   ON keyword_aliases(alias, active);
CREATE INDEX IF NOT EXISTS idx_saved_queries_rm        ON saved_queries(rm_id, is_pinned, use_count DESC);
CREATE INDEX IF NOT EXISTS idx_saved_queries_intent    ON saved_queries(resolved_intent);
CREATE INDEX IF NOT EXISTS idx_rm_notifications_rm        ON rm_notifications(rm_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rm_notifications_type      ON rm_notifications(type, status, priority);
CREATE INDEX IF NOT EXISTS idx_rm_notifications_customer  ON rm_notifications(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rm_notifications_scheduled ON rm_notifications(scheduled_at) WHERE status = 'UNREAD';

-- ─── Triggers ─────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_rm_profiles_updated_at
AFTER UPDATE ON rm_profiles FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE rm_profiles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_saved_queries_updated_at
AFTER UPDATE ON saved_queries FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE saved_queries SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_rm_notifications_updated_at
AFTER UPDATE ON rm_notifications FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE rm_notifications SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

-- ─── Seed: intent_keywords ────────────────────────────────────────────────────
INSERT OR IGNORE INTO intent_keywords(intent_name, keyword, match_type) VALUES
  ('maturity-reminder', 'nhac',            'CONTAINS'),
  ('maturity-reminder', 'tiet kiem',       'CONTAINS'),
  ('maturity-reminder', 'den han',         'CONTAINS'),
  ('maturity-reminder', '1',               'EXACT'),
  ('email-draft', 'soan',                  'CONTAINS'),
  ('email-draft', 'viet',                  'CONTAINS'),
  ('email-draft', 'draft',                 'CONTAINS'),
  ('email-draft', 'email',                 'CONTAINS'),
  ('email-draft', 'mail',                  'CONTAINS'),
  ('email-draft', 'soan tiep',             'CONTAINS'),
  ('email-draft', 'follow up',             'CONTAINS'),
  ('email-draft', 'cham soc',              'CONTAINS'),
  ('email-draft', 'khach hang',            'CONTAINS'),
  ('email-draft', 'nhom',                  'CONTAINS'),
  ('email-draft', 'tiep',                  'CONTAINS'),
  ('email-draft', '2',                     'EXACT'),
  ('suggest-opportunity', 'co hoi',        'CONTAINS'),
  ('suggest-opportunity', 'opportunity',   'CONTAINS'),
  ('suggest-opportunity', 'goi y',         'CONTAINS'),
  ('suggest-opportunity', '3',             'EXACT'),
  ('campaign-summary', 'chien dich',       'CONTAINS'),
  ('campaign-summary', 'campaign',         'CONTAINS'),
  ('campaign-summary', '4',                'EXACT'),
  ('today-care-list', 'hom nay',           'CONTAINS'),
  ('today-care-list', 'ngay nay',          'CONTAINS'),
  ('today-care-list', 'tiep',              'CONTAINS'),
  ('today-care-list', 'cham soc',          'CONTAINS'),
  ('today-care-list', 'gap',               'CONTAINS'),
  ('today-care-list', 'goi',               'CONTAINS'),
  ('today-care-list', 'bao nhieu',         'CONTAINS'),
  ('today-care-list', 'liet ke',           'CONTAINS'),
  ('today-care-list', 'danh sach',         'CONTAINS'),
  ('today-care-list', 'can',               'CONTAINS'),
  ('product-summary', 'san pham',          'CONTAINS'),
  ('product-summary', 'bao nhieu',         'CONTAINS'),
  ('product-summary', 'liet ke',           'CONTAINS'),
  ('product-summary', 'danh sach',         'CONTAINS'),
  ('product-summary', 'tiep can',          'CONTAINS'),
  ('product-summary', 'khach hang',        'CONTAINS'),
  ('savings-threshold', 'tiet kiem',       'CONTAINS'),
  ('savings-threshold', 'khoan tiet kiem', 'CONTAINS'),
  ('savings-threshold', 'so du',           'CONTAINS'),
  ('savings-threshold', 'lon hon',         'CONTAINS'),
  ('savings-threshold', 'tren',            'CONTAINS'),
  ('savings-threshold', 'hon',             'CONTAINS'),
  ('savings-threshold', 'bao nhieu',       'CONTAINS'),
  ('savings-threshold', 'nguoi',           'CONTAINS'),
  ('savings-threshold', 'khach',           'CONTAINS'),
  ('savings-threshold', 'liet ke',         'CONTAINS'),
  ('savings-threshold', 'danh sach',       'CONTAINS'),
  ('call-script', 'call script',           'CONTAINS'),
  ('call-script', 'kich ban goi',          'CONTAINS'),
  ('call-script', 'kich ban',              'CONTAINS');

-- ─── Seed: keyword_aliases ────────────────────────────────────────────────────
INSERT OR IGNORE INTO keyword_aliases(alias, canonical) VALUES
  ('khac hang',   'khach hang'),
  ('tiep khach',  'khach hang'),
  ('kh',          'khach hang'),
  ('ts',          'tiet kiem'),
  ('tk',          'tiet kiem'),
  ('tiet tkiem',  'tiet kiem'),
  ('dh',          'den han'),
  ('sap den han', 'den han'),
  ('ch',          'co hoi'),
  ('cd',          'chien dich'),
  ('chien djch',  'chien dich'),
  ('em soan',     'soan'),
  ('em viet',     'viet'),
  ('nhac nho',    'nhac'),
  ('nhac han',    'nhac'),
  ('sd',          'so du'),
  ('hnay',        'hom nay'),
  ('hom nqy',     'hom nay'),
  ('kbs',         'kich ban'),
  ('kb',          'kich ban goi'),
  ('sp',          'san pham'),
  ('kqkd',        'ket qua kinh doanh');

-- ─── Schema version bookkeeping ───────────────────────────────────────────────
INSERT OR IGNORE INTO schema_migrations(version, name)
VALUES (2, 'add_keyword_and_query_tables');

PRAGMA user_version = 2;
COMMIT;

PRAGMA foreign_keys = ON;
