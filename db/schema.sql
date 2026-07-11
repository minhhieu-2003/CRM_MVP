CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    segment TEXT,
    savings_product TEXT,
    savings_amount_vnd REAL,
    maturity_date TEXT,
    risk_profile TEXT,
    location TEXT
);

CREATE INDEX IF NOT EXISTS idx_customers_normalized_name ON customers(normalized_name);
CREATE INDEX IF NOT EXISTS idx_customers_maturity_date ON customers(maturity_date);

CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    product TEXT,
    stage TEXT,
    score REAL,
    estimated_value_vnd REAL,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_opportunities_customer_id ON opportunities(customer_id);

CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    channel TEXT,
    occurred_at TEXT, -- mapped from 'timestamp' in JSON
    outcome TEXT,
    note TEXT,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_interactions_customer_id_occurred_at ON interactions(customer_id, occurred_at);

CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target_segment TEXT,
    status TEXT
);

CREATE TABLE IF NOT EXISTS email_templates (
    template_id TEXT PRIMARY KEY,
    type TEXT,
    product TEXT,
    stage TEXT,
    subject TEXT,
    body TEXT,
    rating REAL,
    use_count INTEGER
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
    rating REAL,
    use_count INTEGER,
    tags TEXT -- stored as JSON string
);
