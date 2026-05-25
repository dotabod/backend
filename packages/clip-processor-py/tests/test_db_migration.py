"""Tests for the schema-migration runner.

All DB I/O is mocked: db_migration talks to the shared `db_client` connection
pool, which we replace with a MagicMock. We assert the migration *orchestration*
(which migrations run, commit/rollback, idempotency) and that each migration
function issues its expected DDL.
"""

from unittest.mock import MagicMock, patch

import pytest

from src import db_migration

MIGRATION_NAMES = [
    "001_initial_schema.sql",
    "002_add_match_id.sql",
]


def _patched_db():
    """A mock db_client whose _get_connection yields a mock conn+cursor."""
    db = MagicMock()
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value = cursor
    db._get_connection.return_value = conn
    return db, conn, cursor


def _applied_inserts(cursor):
    """Return the migration names recorded via INSERT INTO migrations."""
    names = []
    for call in cursor.execute.call_args_list:
        sql = call.args[0]
        if "INSERT INTO migrations" in sql:
            names.append(call.args[1][0])
    return names


# --------------------------------------------------------------------------- #
# run_migrations orchestration
# --------------------------------------------------------------------------- #
def test_runs_all_migrations_when_none_applied():
    db, conn, cursor = _patched_db()
    cursor.fetchall.return_value = []  # no migrations applied yet
    with patch.object(db_migration, "db_client", db):
        assert db_migration.run_migrations() is True
    assert _applied_inserts(cursor) == MIGRATION_NAMES
    assert conn.commit.call_count == 2
    db._return_connection.assert_called_once_with(conn)


def test_skips_already_applied_migrations():
    db, conn, cursor = _patched_db()
    cursor.fetchall.return_value = [(name,) for name in MIGRATION_NAMES]
    with patch.object(db_migration, "db_client", db):
        assert db_migration.run_migrations() is True
    assert _applied_inserts(cursor) == []
    conn.commit.assert_not_called()


def test_runs_only_pending_migrations():
    db, conn, cursor = _patched_db()
    cursor.fetchall.return_value = [("001_initial_schema.sql",)]
    with patch.object(db_migration, "db_client", db):
        assert db_migration.run_migrations() is True
    assert _applied_inserts(cursor) == ["002_add_match_id.sql"]
    assert conn.commit.call_count == 1


def test_rolls_back_and_stops_on_migration_error():
    db, conn, cursor = _patched_db()
    cursor.fetchall.return_value = []
    with patch.object(db_migration, "db_client", db), \
         patch.object(db_migration, "create_initial_schema", side_effect=RuntimeError("boom")):
        assert db_migration.run_migrations() is False
    conn.rollback.assert_called_once()
    conn.commit.assert_not_called()


def test_returns_false_on_connection_failure():
    db = MagicMock()
    db._get_connection.side_effect = RuntimeError("no pool")
    with patch.object(db_migration, "db_client", db):
        assert db_migration.run_migrations() is False


# --------------------------------------------------------------------------- #
# Individual migration DDL
# --------------------------------------------------------------------------- #
def test_initial_schema_creates_both_tables():
    cursor = MagicMock()
    db_migration.create_initial_schema(cursor)
    sql = " ".join(c.args[0] for c in cursor.execute.call_args_list)
    assert "CREATE TABLE IF NOT EXISTS request_queue" in sql
    assert "CREATE TABLE IF NOT EXISTS clip_results" in sql


def test_add_match_id_adds_columns_and_indexes():
    cursor = MagicMock()
    db_migration.add_match_id_column(cursor)
    sql = " ".join(c.args[0] for c in cursor.execute.call_args_list)
    assert "ADD COLUMN IF NOT EXISTS match_id" in sql
    assert "idx_clip_results_match_id" in sql
    assert "idx_processing_queue_match_id" in sql
