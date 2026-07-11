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
    income_vnd REAL CHECK(income_vnd >= 0),
    credit_score INTEGER CHECK(credit_score BETWEEN 0 AND 1000),
    status TEXT DEFAULT 'active',
    last_interaction_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_normalized_name ON customers(normalized_name);
CREATE INDEX IF NOT EXISTS idx_customers_maturity_date ON customers(maturity_date);
CREATE INDEX IF NOT EXISTS idx_customers_segment ON customers(segment);

CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    product TEXT,
    stage TEXT,
    score REAL CHECK(score >= 0),
    estimated_value_vnd REAL CHECK(estimated_value_vnd >= 0),
    expected_close_date TEXT,
    probability INTEGER CHECK(probability BETWEEN 0 AND 100),
    owner_rm_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_opportunities_customer_id ON opportunities(customer_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_product ON opportunities(product);

CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    channel TEXT,
    occurred_at TEXT NOT NULL,
    outcome TEXT,
    note TEXT,
    duration_minutes INTEGER CHECK(duration_minutes >= 0),
    products_discussed TEXT,
    rm_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interactions_customer_id_occurred_at ON interactions(customer_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_interactions_channel ON interactions(channel);

CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target_segment TEXT,
    status TEXT,
    start_date TEXT,
    end_date TEXT,
    budget_vnd REAL CHECK(budget_vnd >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
