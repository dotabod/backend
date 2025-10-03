#!/usr/bin/env python3
"""
Database migration script for Clip Processor

This script updates the database schema when new fields are added
or when other schema changes are needed.
"""

import os
import logging
import psycopg2
from .postgresql_client import db_client

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
    """Run all database migrations in order."""
    try:
        # Get a connection from the pool
        conn = db_client._get_connection()
        cursor = conn.cursor()

        # Create the migrations table if it doesn't exist
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS migrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        """)

        # List of migrations to run in order
        migrations = [
            ('001_initial_schema.sql', create_initial_schema),
            ('002_add_match_id.sql', add_match_id_column),
            ('003_add_facets.sql', add_facets_column)
        ]

        # Check which migrations have been applied
        cursor.execute("SELECT name FROM migrations")
        applied_migrations = {row[0] for row in cursor.fetchall()}

        # Run any migrations that haven't been applied yet
        for migration_name, migration_func in migrations:
            if migration_name not in applied_migrations:
                logger.info(f"Applying migration: {migration_name}")
                try:
                    # Run the migration
                    migration_func(cursor)

                    # Record that this migration has been applied
                    cursor.execute(
                        "INSERT INTO migrations (name) VALUES (%s)",
                        (migration_name,)
                    )

                    # Commit after each successful migration
                    conn.commit()
                    logger.info(f"Successfully applied migration: {migration_name}")
                except Exception as e:
                    # Roll back on error
                    conn.rollback()
                    logger.error(f"Error applying migration {migration_name}: {e}")
                    return False

        cursor.close()
        db_client._return_connection(conn)
        return True

    except Exception as e:
        logger.error(f"Error running migrations: {e}")
        return False

def create_initial_schema(cursor):
    """Create the initial database schema."""
    # Create the queue table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS request_queue (
        request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        clip_url TEXT,
        clip_id VARCHAR(255),
        stream_username VARCHAR(255),
        num_frames INTEGER,
        debug BOOLEAN DEFAULT FALSE,
        force BOOLEAN DEFAULT FALSE,
        include_image BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        result_id VARCHAR(255)
    )
    """)

    # Create the results table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clip_results (
        clip_id VARCHAR(255) PRIMARY KEY,
        clip_url TEXT NOT NULL,
        results JSONB NOT NULL,
        processing_time_seconds FLOAT,
        processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
    """)

def add_match_id_column(cursor):
    """Add match_id column to relevant tables."""
    # Ensure processing_queue table exists (align with PostgresClient)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS processing_queue (
        id SERIAL PRIMARY KEY,
        request_id TEXT UNIQUE NOT NULL,
        clip_id TEXT,
        clip_url TEXT,
        stream_username TEXT,
        num_frames INTEGER DEFAULT 3,
        debug BOOLEAN DEFAULT FALSE,
        force BOOLEAN DEFAULT FALSE,
        include_image BOOLEAN DEFAULT TRUE,
        request_type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        position INTEGER,
        estimated_completion_time TIMESTAMP,
        estimated_wait_seconds INTEGER,
        result_id TEXT
    )
    """)

    # Add match_id to processing_queue table
    cursor.execute("""
    ALTER TABLE processing_queue
    ADD COLUMN IF NOT EXISTS match_id VARCHAR(255)
    """)

    # Add match_id to clip_results table
    cursor.execute("""
    ALTER TABLE clip_results
    ADD COLUMN IF NOT EXISTS match_id VARCHAR(255)
    """)

    # Create index on match_id for faster lookups
    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_clip_results_match_id ON clip_results (match_id)
    """)
    
    # Create index on match_id for processing_queue table
    cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_processing_queue_match_id ON processing_queue (match_id)
    """)

def add_facets_column(cursor):
    """Add facets column to clip_results table."""
    # Add facets column to store facet information in JSONB format
    cursor.execute("""
    ALTER TABLE clip_results
    ADD COLUMN IF NOT EXISTS facets JSONB
    """)

    # Update the result column to include facet information for each hero
    cursor.execute("""
    COMMENT ON COLUMN clip_results.facets IS 'Stores facet information for heroes in format: {"team": "radiant/dire", "heroes": [{"position": 1, "facet": {"name": "...", "title": "...", "icon": "...", "confidence": 0.95}}]}'
    """)

if __name__ == "__main__":
    if run_migrations():
        logger.info("Migrations completed successfully")
    else:
        logger.error("Migrations failed")
        exit(1)
