CREATE TABLE IF NOT EXISTS product_knowledge_base (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT CHECK(category IN ('tín dụng', 'tiết kiệm', 'bảo hiểm', 'thẻ', 'khác')),
    interest_rate_percent REAL,
    min_investment_vnd REAL,
    conditions TEXT,
    target_audience TEXT,
    description TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    kyc_last_updated DATETIME,
    onboarding_date TEXT,
    branch_code TEXT,
    rm_id TEXT,
    preferred_channel TEXT,
    status TEXT DEFAULT 'active',
    last_interaction_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_normalized_name ON customers(normalized_name);
CREATE INDEX IF NOT EXISTS idx_customers_maturity_date ON customers(maturity_date);
CREATE INDEX IF NOT EXISTS idx_customers_segment ON customers(segment);
CREATE INDEX IF NOT EXISTS idx_customers_rm_id ON customers(rm_id);

CREATE TABLE IF NOT EXISTS customer_consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL,
    consent_type TEXT NOT NULL, -- e.g., 'marketing_email', 'data_processing_nd13'
    status TEXT CHECK(status IN ('granted', 'revoked')),
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_tags (
    customer_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_opportunities_customer_id ON opportunities(customer_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_product ON opportunities(product);
CREATE INDEX IF NOT EXISTS idx_opportunities_campaign_id ON opportunities(campaign_id);

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
    follow_up_required BOOLEAN DEFAULT 0,
    recording_url TEXT,
    rm_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interactions_customer_id_occurred_at ON interactions(customer_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_interactions_channel ON interactions(channel);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(interaction_type);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    rm_id TEXT NOT NULL,
    customer_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_rm_id_status ON tasks(rm_id, status);

CREATE TABLE IF NOT EXISTS email_templates (
    template_id TEXT PRIMARY KEY,
    type TEXT,
    product TEXT,
    stage TEXT,
    subject TEXT,
    body TEXT,
    rating REAL CHECK(rating BETWEEN 0 AND 5),
    use_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_scripts (
    script_id TEXT PRIMARY KEY,
    objective TEXT,
    product TEXT,
    segment TEXT,
    stage TEXT,
    opening TEXT,
    main_content TEXT,
    objection_handling TEXT, -- stored as JSON string
    closing TEXT,
    rating REAL CHECK(rating BETWEEN 0 AND 5),
    use_count INTEGER DEFAULT 0,
    tags TEXT, -- stored as JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS llm_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rm_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    agent_intent TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    latency_ms INTEGER,
    api_endpoint_called TEXT,
    llm_provider TEXT,
    request_payload TEXT, -- stored as JSON string
    response_payload TEXT, -- stored as JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_rm_id ON llm_audit_logs(rm_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_conversation_id ON llm_audit_logs(conversation_id);

CREATE TABLE IF NOT EXISTS next_best_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL,
    rm_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- e.g., 'cross_sell', 'retention', 'meeting'
    recommended_product TEXT,
    reasoning TEXT,
    confidence_score REAL CHECK(confidence_score BETWEEN 0 AND 100),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_nba_customer_id ON next_best_actions(customer_id);
