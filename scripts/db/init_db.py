import argparse
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import unicodedata
import warnings


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = REPO_ROOT / "db" / "crm.db"
DEFAULT_SCHEMA_PATH = REPO_ROOT / "db" / "schema.sql"
DEFAULT_V1_MIGRATION_PATH = REPO_ROOT / "db" / "migrations" / "001_harden_sqlite_schema.sql"
DEFAULT_BUSY_TIMEOUT_MS = 5_000
SCHEMA_VERSION = 2

SCHEMA_CONTRACT = {
    "schema_migrations": {"version", "name", "applied_at"},
    "product_knowledge_base": {
        "id",
        "name",
        "category",
        "interest_rate_percent",
        "min_investment_vnd",
        "eligibility",
        "exclusions",
        "fees",
        "target_audience",
        "description",
        "effective_from",
        "effective_to",
        "version",
        "source_ref",
        "status",
    },
    "customers": {
        "id",
        "name",
        "normalized_name",
        "segment",
        "savings_product",
        "savings_amount_vnd",
        "maturity_date",
        "risk_profile",
        "location",
    },
    "customer_consents": {
        "id",
        "customer_id",
        "purpose",
        "legal_basis",
        "source",
        "status",
        "captured_at",
        "version",
        "is_current",
    },
    "customer_tags": {"customer_id", "tag"},
    "campaigns": {"id", "name", "target_segment", "status"},
    "opportunities": {
        "id",
        "customer_id",
        "product",
        "stage",
        "score",
        "estimated_value_vnd",
        "campaign_id",
    },
    "interactions": {
        "id",
        "customer_id",
        "channel",
        "occurred_at",
        "outcome",
        "note",
    },
    "tasks": {"id", "rm_id", "customer_id", "title"},
    "email_templates": {
        "template_id",
        "type",
        "product",
        "stage",
        "subject",
        "body",
        "rating",
        "use_count",
    },
    "call_scripts": {
        "script_id",
        "objective",
        "product",
        "segment",
        "stage",
        "opening",
        "main_content",
        "objection_handling",
        "closing",
        "rating",
        "use_count",
        "tags",
    },
    "llm_audit_logs": {
        "id",
        "actor_ref",
        "scope",
        "conversation_ref",
        "status",
        "created_at",
    },
    "next_best_actions": {
        "id",
        "customer_id",
        "rm_id",
        "action_type",
        "product_id",
        "dedupe_key",
        "status",
    },
    "context_events": {
        "id",
        "rm_id",
        "conversation_ref",
        "scope",
        "event_type",
        "status",
    },
    "rm_profiles": {
        "id",
        "full_name",
        "normalized_name",
        "branch_code",
        "role",
        "status",
    },
    "intent_keywords": {
        "id",
        "intent_name",
        "keyword",
        "match_type",
        "weight",
        "active",
    },
    "keyword_aliases": {
        "id",
        "alias",
        "canonical",
        "active",
    },
    "saved_queries": {
        "id",
        "rm_id",
        "name",
        "query_text",
        "normalized_query",
        "resolved_intent",
        "use_count",
        "is_pinned",
    },
    "rm_notifications": {
        "id",
        "rm_id",
        "type",
        "title",
        "priority",
        "status",
    },
}

REQUIRED_INDEXES = {
    "idx_customers_normalized_name",
    "idx_customers_maturity_date",
    "idx_opportunities_customer_id",
    "idx_interactions_customer_id_occurred_at",
    "idx_intent_keywords_intent",
    "idx_keyword_aliases_alias",
    "idx_rm_notifications_rm",
    "idx_saved_queries_rm",
}

COUNT_TABLES = (
    "customers",
    "opportunities",
    "interactions",
    "campaigns",
    "email_templates",
    "call_scripts",
    "product_knowledge_base",
)

NODE_EXTRACT_SCRIPT = """
import('./src/services/crmData.js')
  .then((module) => {
    const payload = {
      customers: module.customers,
      opportunities: module.opportunities,
      interactions: module.interactions,
      campaigns: module.campaigns
    };
    process.stdout.write(JSON.stringify(payload));
  })
  .catch((error) => {
    console.error(error?.stack ?? String(error));
    process.exit(1);
  });
"""


class EtlError(RuntimeError):
    pass


def normalize_vietnamese(text):
    if not text:
        return ""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.replace("đ", "d").replace("Đ", "D").lower()


def repo_path(value):
    path = Path(value).expanduser()
    return path.resolve() if path.is_absolute() else (REPO_ROOT / path).resolve()


def display_path(path):
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path)


def require_value(record, key, source_name, row_number):
    value = record.get(key)
    if value is None or value == "":
        raise EtlError(
            f"Missing required field '{key}' in {source_name} row {row_number}."
        )
    return value


def ensure_records(value, source_name):
    if not isinstance(value, list):
        raise EtlError(f"Expected a JSON array in {source_name}.")
    for row_number, record in enumerate(value, start=1):
        if not isinstance(record, dict):
            raise EtlError(f"Expected an object in {source_name} row {row_number}.")
    return value


def read_json_records(path, source_name, *, required, wrapper_keys=()):
    if not path.is_file():
        if required:
            raise EtlError(f"Required source file not found: {display_path(path)}")
        warnings.warn(
            f"Optional source file not found: {display_path(path)}",
            stacklevel=2,
        )
        return []

    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError) as error:
        raise EtlError(f"Cannot read {display_path(path)}: {error}") from error
    except json.JSONDecodeError as error:
        raise EtlError(
            f"Invalid JSON in {display_path(path)} at line {error.lineno}, "
            f"column {error.colno}."
        ) from error

    if isinstance(payload, dict):
        for key in wrapper_keys:
            if key in payload:
                payload = payload[key]
                break
    return ensure_records(payload, source_name)


def extract_core_data(node_binary):
    try:
        result = subprocess.run(
            [node_binary, "--input-type=module", "--eval", NODE_EXTRACT_SCRIPT],
            cwd=REPO_ROOT,
            capture_output=True,
            check=True,
            encoding="utf-8",
            text=True,
        )
    except FileNotFoundError as error:
        raise EtlError(f"Node executable not found: {node_binary}") from error
    except subprocess.CalledProcessError as error:
        raise EtlError(
            "Node extraction failed "
            f"with exit code {error.returncode}; check src/services/crmData.js."
        ) from error

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise EtlError(
            "Node extraction returned invalid JSON "
            f"at line {error.lineno}, column {error.colno}."
        ) from error

    if not isinstance(payload, dict):
        raise EtlError("Node extraction must return a JSON object.")

    extracted = {}
    for key in ("customers", "opportunities", "interactions", "campaigns"):
        if key not in payload:
            raise EtlError(f"Node extraction did not export '{key}'.")
        extracted[key] = ensure_records(payload[key], f"crmData.js:{key}")
    return extracted


def locate_product_kb(explicit_path):
    if explicit_path:
        return repo_path(explicit_path)

    candidates = (
        REPO_ROOT / "src" / "data" / "mock" / "product_knowledge_base.json",
        REPO_ROOT / "src" / "data" / "mock" / "product_catalog.json",
        REPO_ROOT / "src" / "data" / "mock" / "products.json",
    )
    return next((path for path in candidates if path.is_file()), candidates[0])


def load_sources(node_binary, product_kb_path):
    core = extract_core_data(node_binary)
    mock_dir = REPO_ROOT / "src" / "data" / "mock"

    sources = {
        "customers": core["customers"]
        + read_json_records(
            mock_dir / "large_customers.json",
            "large_customers.json",
            required=False,
        ),
        "opportunities": core["opportunities"]
        + read_json_records(
            mock_dir / "large_opportunities.json",
            "large_opportunities.json",
            required=False,
        ),
        "interactions": core["interactions"]
        + read_json_records(
            mock_dir / "large_interactions.json",
            "large_interactions.json",
            required=False,
        ),
        "campaigns": core["campaigns"],
        "email_templates": read_json_records(
            mock_dir / "email_templates.json",
            "email_templates.json",
            required=True,
        ),
        "call_scripts": read_json_records(
            mock_dir / "call_scripts.json",
            "call_scripts.json",
            required=True,
        ),
        "product_knowledge_base": read_json_records(
            product_kb_path,
            display_path(product_kb_path),
            required=False,
            wrapper_keys=("products", "product_knowledge_base", "product_catalog"),
        ),
    }
    return sources


def configure_connection(connection, busy_timeout_ms):
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute(f"PRAGMA busy_timeout = {int(busy_timeout_ms)}")
    enabled = connection.execute("PRAGMA foreign_keys").fetchone()[0]
    if enabled != 1:
        raise EtlError("Could not enable SQLite foreign key enforcement.")


def current_schema_version(connection):
    return connection.execute("PRAGMA user_version").fetchone()[0]


def has_existing_schema(connection):
    return connection.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        LIMIT 1
        """
    ).fetchone() is not None


def check_input_schema_version(connection):
    version = current_schema_version(connection)
    if version not in (0, SCHEMA_VERSION):
        raise EtlError(
            f"Unsupported database schema version {version}; "
            f"this ETL supports unversioned legacy databases and version {SCHEMA_VERSION}."
        )
    return version


def validate_schema_contract(connection):
    table_names = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }
    errors = []
    for table, required_columns in SCHEMA_CONTRACT.items():
        if table not in table_names:
            errors.append(f"missing table {table}")
            continue
        actual_columns = {
            row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')
        }
        missing_columns = sorted(required_columns - actual_columns)
        if missing_columns:
            errors.append(f"{table} missing columns: {', '.join(missing_columns)}")

    actual_indexes = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'index'"
        )
    }
    missing_indexes = sorted(REQUIRED_INDEXES - actual_indexes)
    if missing_indexes:
        errors.append(f"missing indexes: {', '.join(missing_indexes)}")

    if errors:
        raise EtlError(
            "Database schema is incompatible with schema version "
            f"{SCHEMA_VERSION}: {'; '.join(errors)}"
        )


def migrate_legacy_product_catalog(connection):
    legacy_exists = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        ("product_catalog",),
    ).fetchone()
    if not legacy_exists:
        return 0

    columns = {
        row[1] for row in connection.execute('PRAGMA table_info("product_catalog")')
    }
    required = {
        "id",
        "name",
        "category",
        "interest_rate_percent",
        "min_investment_vnd",
        "description",
        "status",
        "created_at",
        "updated_at",
    }
    missing = sorted(required - columns)
    if missing:
        raise EtlError(
            "Legacy product_catalog cannot be migrated; missing columns: "
            + ", ".join(missing)
        )

    count = connection.execute("SELECT COUNT(*) FROM product_catalog").fetchone()[0]
    connection.execute(
        """
        INSERT INTO product_knowledge_base (
            id, name, category, interest_rate_percent, min_investment_vnd,
            description, status, created_at, updated_at
        )
        SELECT
            id, name, category, interest_rate_percent, min_investment_vnd,
            description, UPPER(status), created_at, updated_at
        FROM product_catalog
        WHERE 1
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            category = excluded.category,
            interest_rate_percent = excluded.interest_rate_percent,
            min_investment_vnd = excluded.min_investment_vnd,
            description = excluded.description,
            status = UPPER(excluded.status),
            updated_at = excluded.updated_at
        """
    )
    return count


def import_customers(connection, records):
    rows = []
    for row_number, record in enumerate(records, start=1):
        name = require_value(record, "name", "customers", row_number)
        rows.append(
            (
                require_value(record, "id", "customers", row_number),
                name,
                normalize_vietnamese(name),
                record.get("segment"),
                record.get("savingsProduct"),
                record.get("savingsAmountVnd"),
                record.get("maturityDate"),
                record.get("riskProfile"),
                record.get("location"),
            )
        )
    connection.executemany(
        """
        INSERT INTO customers (
            id, name, normalized_name, segment, savings_product,
            savings_amount_vnd, maturity_date, risk_profile, location
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            normalized_name = excluded.normalized_name,
            segment = excluded.segment,
            savings_product = excluded.savings_product,
            savings_amount_vnd = excluded.savings_amount_vnd,
            maturity_date = excluded.maturity_date,
            risk_profile = excluded.risk_profile,
            location = excluded.location,
            updated_at = CURRENT_TIMESTAMP
        """,
        rows,
    )


def import_campaigns(connection, records):
    rows = []
    for row_number, record in enumerate(records, start=1):
        rows.append(
            (
                require_value(record, "id", "campaigns", row_number),
                require_value(record, "name", "campaigns", row_number),
                record.get("targetSegment"),
                record.get("status"),
            )
        )
    connection.executemany(
        """
        INSERT INTO campaigns (id, name, target_segment, status)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            target_segment = excluded.target_segment,
            status = excluded.status,
            updated_at = CURRENT_TIMESTAMP
        """,
        rows,
    )


def import_opportunities(connection, records):
    rows = []
    for row_number, record in enumerate(records, start=1):
        rows.append(
            (
                require_value(record, "id", "opportunities", row_number),
                require_value(record, "customerId", "opportunities", row_number),
                record.get("product"),
                record.get("stage"),
                record.get("score"),
                record.get("estimatedValueVnd"),
            )
        )
    connection.executemany(
        """
        INSERT INTO opportunities (
            id, customer_id, product, stage, score, estimated_value_vnd
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            customer_id = excluded.customer_id,
            product = excluded.product,
            stage = excluded.stage,
            score = excluded.score,
            estimated_value_vnd = excluded.estimated_value_vnd,
            updated_at = CURRENT_TIMESTAMP
        """,
        rows,
    )


def import_interactions(connection, records):
    rows = []
    for row_number, record in enumerate(records, start=1):
        rows.append(
            (
                require_value(record, "id", "interactions", row_number),
                require_value(record, "customerId", "interactions", row_number),
                record.get("channel"),
                require_value(record, "timestamp", "interactions", row_number),
                record.get("outcome"),
                record.get("note"),
            )
        )
    connection.executemany(
        """
        INSERT INTO interactions (
            id, customer_id, channel, occurred_at, outcome, note
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            customer_id = excluded.customer_id,
            channel = excluded.channel,
            occurred_at = excluded.occurred_at,
            outcome = excluded.outcome,
            note = excluded.note
        """,
        rows,
    )


def import_email_templates(connection, records):
    rows = []
    for row_number, record in enumerate(records, start=1):
        rows.append(
            (
                require_value(record, "template_id", "email_templates", row_number),
                record.get("type"),
                record.get("product"),
                record.get("stage"),
                record.get("subject"),
                record.get("body"),
                record.get("rating"),
                record.get("use_count"),
            )
        )
    connection.executemany(
        """
        INSERT INTO email_templates (
            template_id, type, product, stage, subject, body, rating, use_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(template_id) DO UPDATE SET
            type = excluded.type,
            product = excluded.product,
            stage = excluded.stage,
            subject = excluded.subject,
            body = excluded.body,
            rating = excluded.rating,
            use_count = excluded.use_count,
            updated_at = CURRENT_TIMESTAMP
        """,
        rows,
    )


def json_column(value):
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def import_call_scripts(connection, records):
    rows = []
    for row_number, record in enumerate(records, start=1):
        rows.append(
            (
                require_value(record, "script_id", "call_scripts", row_number),
                record.get("objective"),
                record.get("product"),
                record.get("segment"),
                record.get("stage"),
                record.get("opening"),
                record.get("main_content"),
                json_column(record.get("objection_handling")),
                record.get("closing"),
                record.get("rating"),
                record.get("use_count"),
                json_column(record.get("tags")),
            )
        )
    connection.executemany(
        """
        INSERT INTO call_scripts (
            script_id, objective, product, segment, stage, opening,
            main_content, objection_handling, closing, rating, use_count, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(script_id) DO UPDATE SET
            objective = excluded.objective,
            product = excluded.product,
            segment = excluded.segment,
            stage = excluded.stage,
            opening = excluded.opening,
            main_content = excluded.main_content,
            objection_handling = excluded.objection_handling,
            closing = excluded.closing,
            rating = excluded.rating,
            use_count = excluded.use_count,
            tags = excluded.tags,
            updated_at = CURRENT_TIMESTAMP
        """,
        rows,
    )


def product_value(record, snake_name, camel_name):
    return record.get(snake_name, record.get(camel_name))


def import_product_knowledge_base(connection, records):
    rows = []
    for row_number, record in enumerate(records, start=1):
        rows.append(
            (
                require_value(record, "id", "product_knowledge_base", row_number),
                require_value(record, "name", "product_knowledge_base", row_number),
                record.get("category"),
                product_value(record, "interest_rate_percent", "interestRatePercent"),
                product_value(record, "min_investment_vnd", "minInvestmentVnd"),
                record.get("eligibility", record.get("conditions")),
                record.get("exclusions"),
                record.get("fees"),
                product_value(record, "target_audience", "targetAudience"),
                record.get("description"),
                product_value(record, "effective_from", "effectiveFrom"),
                product_value(record, "effective_to", "effectiveTo"),
                record.get("version", 1),
                product_value(record, "source_ref", "sourceRef"),
                str(record.get("status") or "ACTIVE").upper(),
            )
        )
    connection.executemany(
        """
        INSERT INTO product_knowledge_base (
            id, name, category, interest_rate_percent, min_investment_vnd,
            eligibility, exclusions, fees, target_audience, description,
            effective_from, effective_to, version, source_ref, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            category = excluded.category,
            interest_rate_percent = excluded.interest_rate_percent,
            min_investment_vnd = excluded.min_investment_vnd,
            eligibility = excluded.eligibility,
            exclusions = excluded.exclusions,
            fees = excluded.fees,
            target_audience = excluded.target_audience,
            description = excluded.description,
            effective_from = excluded.effective_from,
            effective_to = excluded.effective_to,
            version = excluded.version,
            source_ref = excluded.source_ref,
            status = excluded.status,
            updated_at = CURRENT_TIMESTAMP
        """,
        rows,
    )


def import_all(connection, sources):
    # Parent rows must be loaded before child rows while foreign keys are enabled.
    import_customers(connection, sources["customers"])
    import_campaigns(connection, sources["campaigns"])
    import_opportunities(connection, sources["opportunities"])
    import_interactions(connection, sources["interactions"])
    import_email_templates(connection, sources["email_templates"])
    import_call_scripts(connection, sources["call_scripts"])
    import_product_knowledge_base(connection, sources["product_knowledge_base"])


def data_quality_report(connection):
    counts = {
        table: connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        for table in COUNT_TABLES
    }
    foreign_key_violations = connection.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_key_violations:
        raise EtlError(
            "Foreign key check failed with "
            f"{len(foreign_key_violations)} violation(s)."
        )
    return counts


def initialize_database(db_path, schema_path, sources, busy_timeout_ms):
    try:
        schema_sql = schema_path.read_text(encoding="utf-8-sig")
    except OSError as error:
        raise EtlError(f"Cannot read schema file {display_path(schema_path)}: {error}") from error

    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(
        db_path,
        timeout=busy_timeout_ms / 1_000,
        isolation_level=None,
    )
    try:
        configure_connection(connection, busy_timeout_ms)
        input_version = check_input_schema_version(connection)
        if input_version == 0 and has_existing_schema(connection):
            try:
                migration_sql = DEFAULT_V1_MIGRATION_PATH.read_text(encoding="utf-8-sig")
            except OSError as error:
                raise EtlError(
                    f"Cannot read migration file {display_path(DEFAULT_V1_MIGRATION_PATH)}: {error}"
                ) from error
            connection.executescript(migration_sql)
        else:
            # The canonical schema owns its DDL transaction and schema version.
            connection.executescript(schema_sql)
        validate_schema_contract(connection)
        applied_version = current_schema_version(connection)
        if applied_version != SCHEMA_VERSION:
            raise EtlError(
                f"Schema file applied version {applied_version}; expected {SCHEMA_VERSION}."
            )
        connection.execute("BEGIN IMMEDIATE")
        migrated_products = migrate_legacy_product_catalog(connection)
        import_all(connection, sources)
        connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        counts = data_quality_report(connection)
        connection.commit()
        return input_version, migrated_products, counts
    except Exception:
        if connection.in_transaction:
            connection.rollback()
        raise
    finally:
        connection.close()


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Initialize the CRM SQLite database from repository mock data."
    )
    parser.add_argument(
        "--db",
        default=str(DEFAULT_DB_PATH),
        help="Database path; relative paths are resolved from the repository root.",
    )
    parser.add_argument(
        "--schema",
        default=str(DEFAULT_SCHEMA_PATH),
        help="Schema path; relative paths are resolved from the repository root.",
    )
    parser.add_argument(
        "--product-kb",
        help="Optional product knowledge-base JSON path, resolved from the repository root.",
    )
    parser.add_argument(
        "--node-bin",
        default=os.environ.get("NODE_BINARY", "node"),
        help="Node.js executable used to extract src/services/crmData.js.",
    )
    parser.add_argument(
        "--busy-timeout-ms",
        type=int,
        default=DEFAULT_BUSY_TIMEOUT_MS,
        help="SQLite lock wait timeout in milliseconds.",
    )
    args = parser.parse_args(argv)
    if args.busy_timeout_ms < 0:
        parser.error("--busy-timeout-ms must be zero or greater")
    return args


def main(argv=None):
    args = parse_args(argv)
    db_path = repo_path(args.db)
    schema_path = repo_path(args.schema)
    product_kb_path = locate_product_kb(args.product_kb)

    try:
        sources = load_sources(args.node_bin, product_kb_path)
        print("Source rows (no PII):")
        for name, records in sources.items():
            print(f"  {name}: {len(records)}")

        input_version, migrated_products, counts = initialize_database(
            db_path,
            schema_path,
            sources,
            args.busy_timeout_ms,
        )
    except (EtlError, sqlite3.Error) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(f"Database: {display_path(db_path)}")
    print(f"Schema version: {input_version} -> {SCHEMA_VERSION}")
    if migrated_products:
        print(f"Migrated legacy product rows: {migrated_products}")
    print("Database counts (no PII):")
    for table, count in counts.items():
        print(f"  {table}: {count}")
    print("Foreign key violations: 0")
    print("Database initialization complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
