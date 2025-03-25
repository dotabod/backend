#!/usr/bin/env python3
"""
Database migration script for Clip Processor

This script updates the database schema when new fields are added
or when other schema changes are needed.
"""

import os
import logging
import psycopg2
from postgresql_client import db_client

# Configure logging
log_dir = os.path.join(os.path.dirname(__file__), 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, 'db_migration.log')
logging.basicConfig(
    force=True,
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(log_file, mode='a')
    ]
)
logger = logging.getLogger(__name__)

def run_migrations():
    """Run all pending database migrations"""
    logger.info("Starting database migrations...")

    # Get database connection
    conn = None
    try:
        conn = db_client._get_connection()
        if not conn:
            logger.error("Failed to connect to database")
            return False

        cursor = conn.cursor()

        # Create migration tracking table if it doesn't exist
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS db_migrations (
            id SERIAL PRIMARY KEY,
            migration_name TEXT UNIQUE NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """)
        conn.commit()

        # Run each migration in sequence
        migrations = [
            add_processing_time_column,
            fix_position_ambiguity
        ]

        for migration in migrations:
            migration_name = migration.__name__

            # Check if migration was already applied
            cursor.execute("SELECT COUNT(*) FROM db_migrations WHERE migration_name = %s", (migration_name,))
            count = cursor.fetchone()[0]

            if count == 0:
                logger.info(f"Applying migration: {migration_name}")
                success = migration(conn)

                if success:
                    # Record successful migration
                    cursor.execute(
                        "INSERT INTO db_migrations (migration_name) VALUES (%s)",
                        (migration_name,)
                    )
                    conn.commit()
                    logger.info(f"Migration {migration_name} applied successfully")
                else:
                    logger.error(f"Failed to apply migration: {migration_name}")
                    return False
            else:
                logger.info(f"Migration {migration_name} already applied, skipping")

        logger.info("All migrations completed successfully")
        return True

    except Exception as e:
        logger.error(f"Error during migrations: {e}")
        if conn:
            conn.rollback()
        return False

    finally:
        if conn:
            db_client._return_connection(conn)

def add_processing_time_column(conn):
    """Add processing_time_seconds column to clip_results table if it doesn't exist"""
    try:
        cursor = conn.cursor()

        # Check if column exists
        cursor.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'clip_results' AND column_name = 'processing_time_seconds'
        """)

        if cursor.fetchone() is None:
            logger.info("Adding processing_time_seconds column to clip_results table")
            cursor.execute("""
            ALTER TABLE clip_results
            ADD COLUMN processing_time_seconds FLOAT
            """)
            conn.commit()
        else:
            logger.info("Column processing_time_seconds already exists in clip_results table")

        return True

    except Exception as e:
        logger.error(f"Error adding processing_time_seconds column: {e}")
        conn.rollback()
        return False

def fix_position_ambiguity(conn):
    """Fix ambiguous column reference in update_queue_status by fully qualifying the column name"""
    try:
        # This is a code-level fix, but we'll verify the tables have the correct structure
        cursor = conn.cursor()

        # Check if position column exists in the processing_queue table
        cursor.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'processing_queue' AND column_name = 'position'
        """)

        if cursor.fetchone() is None:
            logger.error("Position column doesn't exist in processing_queue table")
            return False

        logger.info("Position column exists, no database changes needed")
        logger.info("The fix for ambiguous position references is in the code update")

        # No database changes needed for this fix as it's a code-level issue
        return True

    except Exception as e:
        logger.error(f"Error checking position column: {e}")
        conn.rollback()
        return False

if __name__ == "__main__":
    if run_migrations():
        logger.info("Migrations completed successfully")
    else:
        logger.error("Migrations failed")
        exit(1)
