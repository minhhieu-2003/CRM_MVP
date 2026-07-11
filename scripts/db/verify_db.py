import argparse
import sqlite3
import sys

from init_db import (
    DEFAULT_BUSY_TIMEOUT_MS,
    DEFAULT_DB_PATH,
    EtlError,
    SCHEMA_VERSION,
    configure_connection,
    current_schema_version,
    data_quality_report,
    display_path,
    repo_path,
    validate_schema_contract,
)


def verify_database(db_path, busy_timeout_ms):
    if not db_path.is_file():
        raise EtlError(f"Database file not found: {display_path(db_path)}")

    connection = sqlite3.connect(
        f"file:{db_path.as_posix()}?mode=ro",
        uri=True,
        timeout=busy_timeout_ms / 1_000,
    )
    try:
        configure_connection(connection, busy_timeout_ms)
        version = current_schema_version(connection)
        if version != SCHEMA_VERSION:
            raise EtlError(
                f"Unsupported database schema version {version}; expected {SCHEMA_VERSION}."
            )
        validate_schema_contract(connection)
        return version, data_quality_report(connection)
    finally:
        connection.close()


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Verify CRM SQLite schema, row counts, and foreign keys without reading PII."
    )
    parser.add_argument(
        "--db",
        default=str(DEFAULT_DB_PATH),
        help="Database path; relative paths are resolved from the repository root.",
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
    try:
        version, counts = verify_database(db_path, args.busy_timeout_ms)
    except (EtlError, sqlite3.Error) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(f"Database: {display_path(db_path)}")
    print(f"Schema version: {version}")
    print("Database counts (no PII):")
    for table, count in counts.items():
        print(f"  {table}: {count}")
    print("Foreign key violations: 0")
    print("Database verification complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
