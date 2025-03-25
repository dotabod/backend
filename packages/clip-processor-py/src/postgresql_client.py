#!/usr/bin/env python3
"""
PostgreSQL Client for Dota 2 Hero Detection API

This module provides a client for interacting with the PostgreSQL database
to cache and retrieve clip processing results.
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
import traceback
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)


class PostgresClient:
    """Client for interacting with PostgreSQL database."""

    def __init__(self):
        """Initialize the PostgreSQL client."""
        self.database_url = os.environ.get('DATABASE_URL')
        if not self.database_url:
            # Default connection string for local development
            self.database_url = "postgresql://postgres:postgres@localhost:5432/clip_processor"

        self.table_name = "clip_results"
        self._initialized = False
        self._connection_pool = None

        logger.info(f"Initialized PostgreSQL client with URL: {self.database_url}")

    def _get_connection(self):
        """Get a connection from the pool."""
        if not self._connection_pool:
            try:
                self._connection_pool = pool.SimpleConnectionPool(
                    1, 10, self.database_url
                )
            except Exception as e:
                logger.error(f"Error creating connection pool: {str(e)}")
                return None

        try:
            return self._connection_pool.getconn()
        except Exception as e:
            logger.error(f"Error getting connection from pool: {str(e)}")
            return None

    def _return_connection(self, conn):
        """Return a connection to the pool."""
        if self._connection_pool and conn:
            self._connection_pool.putconn(conn)

    def _test_connection(self) -> bool:
        """Test the connection to PostgreSQL."""
        conn = None
        try:
            conn = self._get_connection()
            if conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                cursor.close()
                logger.info("PostgreSQL connection test successful")
                return True
            else:
                logger.error("Failed to connect to PostgreSQL")
                return False
        except Exception as e:
            logger.error(f"Error connecting to PostgreSQL: {str(e)}")
            return False
        finally:
            if conn:
                self._return_connection(conn)

    def initialize(self) -> bool:
        """Initialize the database and create tables if needed."""
        if self._initialized:
            return True

        conn = None
        try:
            # Test the connection first
            if not self._test_connection():
                logger.error("Failed to connect to PostgreSQL")
                return False

            conn = self._get_connection()
            cursor = conn.cursor()

            # Create the table if it doesn't exist
            create_table_sql = f"""
            CREATE TABLE IF NOT EXISTS {self.table_name} (
                id SERIAL PRIMARY KEY,
                clip_id TEXT UNIQUE NOT NULL,
                clip_url TEXT NOT NULL,
                results JSONB NOT NULL,
                processed_at TIMESTAMP NOT NULL
            );
            """
            cursor.execute(create_table_sql)

            # Create an index on clip_id for faster lookups
            create_index_sql = f"""
            CREATE INDEX IF NOT EXISTS idx_{self.table_name}_clip_id
            ON {self.table_name} (clip_id);
            """
            cursor.execute(create_index_sql)

            conn.commit()
            cursor.close()

            self._initialized = True
            logger.info("PostgreSQL client initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Error initializing PostgreSQL: {str(e)}")
            if conn:
                conn.rollback()
            return False
        finally:
            if conn:
                self._return_connection(conn)

    def get_clip_result(self, clip_id: str) -> Optional[Dict[str, Any]]:
        """
        Get cached result for a clip_id if it exists.

        Args:
            clip_id: The Twitch clip ID

        Returns:
            The cached results if found, None otherwise
        """
        if not self._initialized and not self.initialize():
            logger.warning("PostgreSQL not initialized, can't fetch clip result")
            return None

        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Query for the clip by ID
            query = f"""
            SELECT results FROM {self.table_name}
            WHERE clip_id = %s
            ORDER BY processed_at DESC
            LIMIT 1
            """

            cursor.execute(query, (clip_id,))
            row = cursor.fetchone()
            cursor.close()

            if row:
                logger.info(f"Found cached result for clip ID: {clip_id}")
                return row['results']
            else:
                logger.info(f"No cached result found for clip ID: {clip_id}")
                return None

        except Exception as e:
            logger.error(f"Error getting clip result: {str(e)}")
            logger.error(traceback.format_exc())
            return None
        finally:
            if conn:
                self._return_connection(conn)

    def save_clip_result(self, clip_id: str, clip_url: str, result: Dict[str, Any]) -> bool:
        """
        Save clip processing result to the database.

        Args:
            clip_id: The Twitch clip ID
            clip_url: The Twitch clip URL
            result: The hero detection result to cache

        Returns:
            True if successful, False otherwise
        """
        if not self._initialized and not self.initialize():
            logger.warning("PostgreSQL not initialized, can't save clip result")
            return False

        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # Use UPSERT to insert or update the record
            query = f"""
            INSERT INTO {self.table_name} (clip_id, clip_url, results, processed_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (clip_id)
            DO UPDATE SET
                clip_url = EXCLUDED.clip_url,
                results = EXCLUDED.results,
                processed_at = EXCLUDED.processed_at
            """

            # Convert result to JSON string if it's not already
            if not isinstance(result, str):
                results_json = json.dumps(result)
            else:
                results_json = result

            cursor.execute(query, (
                clip_id,
                clip_url,
                results_json,
                datetime.now()
            ))

            conn.commit()
            cursor.close()

            logger.info(f"Successfully saved/updated result for clip ID: {clip_id}")
            return True

        except Exception as e:
            logger.error(f"Error saving clip result: {str(e)}")
            logger.error(traceback.format_exc())
            if conn:
                conn.rollback()
            return False
        finally:
            if conn:
                self._return_connection(conn)

# Create a singleton instance
db_client = PostgresClient()
