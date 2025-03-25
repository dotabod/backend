#!/usr/bin/env python3
"""
PostgreSQL Client for Dota 2 Hero Detection API

This module provides a client for interacting with the PostgreSQL database
to cache and retrieve clip processing results.
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Tuple
import traceback
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
import uuid
import statistics

logger = logging.getLogger(__name__)


class PostgresClient:
    """Client for interacting with PostgreSQL database."""

    def __init__(self):
        """Initialize the PostgreSQL client."""
        self.database_url = os.environ.get('DATABASE_URL')
        if not self.database_url:
            # Default connection string for local development
            self.database_url = "postgresql://postgres:postgres@localhost:5432/clip_processor"

        self.results_table = "clip_results"
        self.queue_table = "processing_queue"
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

            # Create the results table if it doesn't exist
            create_results_table_sql = f"""
            CREATE TABLE IF NOT EXISTS {self.results_table} (
                id SERIAL PRIMARY KEY,
                clip_id TEXT UNIQUE NOT NULL,
                clip_url TEXT NOT NULL,
                results JSONB NOT NULL,
                processed_at TIMESTAMP NOT NULL,
                processing_time_seconds FLOAT
            );
            """
            cursor.execute(create_results_table_sql)

            # Create the queue table if it doesn't exist
            create_queue_table_sql = f"""
            CREATE TABLE IF NOT EXISTS {self.queue_table} (
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
            );
            """
            cursor.execute(create_queue_table_sql)

            # Create an index on clip_id for faster lookups
            create_clip_index_sql = f"""
            CREATE INDEX IF NOT EXISTS idx_{self.results_table}_clip_id
            ON {self.results_table} (clip_id);
            """
            cursor.execute(create_clip_index_sql)

            # Create indices for the queue table
            create_queue_indices_sql = [
                f"CREATE INDEX IF NOT EXISTS idx_{self.queue_table}_request_id ON {self.queue_table} (request_id);",
                f"CREATE INDEX IF NOT EXISTS idx_{self.queue_table}_status ON {self.queue_table} (status);",
                f"CREATE INDEX IF NOT EXISTS idx_{self.queue_table}_position ON {self.queue_table} (position);"
            ]
            for sql in create_queue_indices_sql:
                cursor.execute(sql)

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
            SELECT results FROM {self.results_table}
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

    def save_clip_result(self, clip_id: str, clip_url: str, result: Dict[str, Any], processing_time: Optional[float] = None) -> bool:
        """
        Save clip processing result to the database.

        Args:
            clip_id: The Twitch clip ID
            clip_url: The Twitch clip URL
            result: The hero detection result to cache
            processing_time: Processing time in seconds (optional)

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
            INSERT INTO {self.results_table}
            (clip_id, clip_url, results, processed_at, processing_time_seconds)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (clip_id)
            DO UPDATE SET
                clip_url = EXCLUDED.clip_url,
                results = EXCLUDED.results,
                processed_at = EXCLUDED.processed_at,
                processing_time_seconds = EXCLUDED.processing_time_seconds
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
                datetime.now(),
                processing_time
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

    def get_average_processing_time(self, request_type: str = 'clip') -> float:
        """
        Get the average processing time for clips or streams.

        Args:
            request_type: Type of request ('clip' or 'stream')

        Returns:
            Average processing time in seconds, or default if no data
        """
        if not self._initialized and not self.initialize():
            return 10.0  # Default value if DB not initialized

        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            if request_type == 'stream':
                # For stream requests, get average from queue table for completed stream requests
                query = f"""
                SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_time
                FROM {self.queue_table}
                WHERE request_type = 'stream'
                AND status = 'completed'
                AND started_at IS NOT NULL
                AND completed_at IS NOT NULL
                """
            else:
                # For clip requests, use the processing_time_seconds column
                query = f"""
                SELECT AVG(processing_time_seconds) as avg_time
                FROM {self.results_table}
                WHERE processing_time_seconds IS NOT NULL
                """

            cursor.execute(query)
            result = cursor.fetchone()
            cursor.close()

            if result and result[0] is not None:
                avg_time = float(result[0])
                logger.info(f"Average processing time for {request_type} requests: {avg_time:.2f} seconds")
                return avg_time
            else:
                # Default values if no data available
                default_time = 15.0 if request_type == 'clip' else 25.0
                logger.info(f"No processing time data available, using default: {default_time:.2f} seconds")
                return default_time

        except Exception as e:
            logger.error(f"Error getting average processing time: {str(e)}")
            # Default values if error
            return 15.0 if request_type == 'clip' else 25.0
        finally:
            if conn:
                self._return_connection(conn)

    def add_to_queue(self,
                    request_type: str,
                    clip_id: Optional[str] = None,
                    clip_url: Optional[str] = None,
                    stream_username: Optional[str] = None,
                    num_frames: int = 3,
                    debug: bool = False,
                    force: bool = False,
                    include_image: bool = True) -> Tuple[str, Dict[str, Any]]:
        """
        Add a request to the processing queue.

        Args:
            request_type: Type of request ('clip' or 'stream')
            clip_id: The Twitch clip ID (for clip requests)
            clip_url: The Twitch clip URL (for clip requests)
            stream_username: Twitch username (for stream requests)
            num_frames: Number of frames to analyze (for stream requests)
            debug: Enable debug mode
            force: Force reprocessing even if cached
            include_image: Include frame image URL in response

        Returns:
            Tuple of (request_id, queue_info)
        """
        if not self._initialized and not self.initialize():
            logger.warning("PostgreSQL not initialized, can't add to queue")
            return None, {}

        # Generate a unique request ID
        request_id = str(uuid.uuid4())

        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get current queue length
            cursor.execute(f"SELECT COUNT(*) FROM {self.queue_table} WHERE status = 'pending'")
            queue_length = cursor.fetchone()['count']
            position = queue_length + 1

            # Estimate completion time
            avg_time = self.get_average_processing_time(request_type)
            estimated_wait_seconds = position * avg_time
            now = datetime.now()
            estimated_completion_time = now + timedelta(seconds=estimated_wait_seconds)

            # Insert the request into the queue
            query = f"""
            INSERT INTO {self.queue_table} (
                request_id, clip_id, clip_url, stream_username, num_frames,
                debug, force, include_image, request_type, status,
                created_at, position, estimated_completion_time, estimated_wait_seconds
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """

            cursor.execute(query, (
                request_id, clip_id, clip_url, stream_username, num_frames,
                debug, force, include_image, request_type, 'pending',
                now, position, estimated_completion_time, estimated_wait_seconds
            ))

            queue_info = cursor.fetchone()
            conn.commit()
            cursor.close()

            logger.info(f"Added {request_type} request to queue: {request_id} (position {position})")
            return request_id, dict(queue_info)

        except Exception as e:
            logger.error(f"Error adding request to queue: {str(e)}")
            logger.error(traceback.format_exc())
            if conn:
                conn.rollback()
            return None, {}
        finally:
            if conn:
                self._return_connection(conn)

    def update_queue_status(self, request_id: str, status: str, result_id: Optional[str] = None) -> bool:
        """
        Update the status of a queued request.

        Args:
            request_id: The request ID
            status: New status ('pending', 'processing', 'completed', 'failed')
            result_id: ID of the result (for completed requests)

        Returns:
            True if successful, False otherwise
        """
        if not self._initialized and not self.initialize():
            logger.warning("PostgreSQL not initialized, can't update queue")
            return False

        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            now = datetime.now()

            # Update fields based on status
            if status == 'processing':
                query = f"""
                UPDATE {self.queue_table}
                SET status = %s, started_at = %s
                WHERE request_id = %s
                """
                cursor.execute(query, (status, now, request_id))
            elif status in ('completed', 'failed'):
                query = f"""
                UPDATE {self.queue_table}
                SET status = %s, completed_at = %s, result_id = %s
                WHERE request_id = %s
                """
                cursor.execute(query, (status, now, result_id, request_id))
            else:
                query = f"""
                UPDATE {self.queue_table}
                SET status = %s
                WHERE request_id = %s
                """
                cursor.execute(query, (status, request_id))

            # If a request is completed or failed, update positions for all pending requests
            if status in ('completed', 'failed'):
                update_positions_query = f"""
                UPDATE {self.queue_table}
                SET position = position - 1,
                    estimated_wait_seconds = estimated_wait_seconds -
                    (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))), 15)
                     FROM {self.queue_table}
                     WHERE status = 'completed' AND request_type = t.request_type
                     LIMIT 1),
                    estimated_completion_time = NOW() +
                    (interval '1 second' * (position - 1) *
                    (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))), 15)
                     FROM {self.queue_table}
                     WHERE status = 'completed' AND request_type = t.request_type
                     LIMIT 1))
                FROM {self.queue_table} AS t
                WHERE {self.queue_table}.request_id = t.request_id
                AND {self.queue_table}.status = 'pending'
                AND {self.queue_table}.position > 1
                """
                cursor.execute(update_positions_query)

            conn.commit()
            cursor.close()

            logger.info(f"Updated queue status for request {request_id}: {status}")
            return True

        except Exception as e:
            logger.error(f"Error updating queue status: {str(e)}")
            logger.error(traceback.format_exc())
            if conn:
                conn.rollback()
            return False
        finally:
            if conn:
                self._return_connection(conn)

    def get_queue_status(self, request_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the current status of a queued request.

        Args:
            request_id: The request ID

        Returns:
            Queue status information if found, None otherwise
        """
        if not self._initialized and not self.initialize():
            logger.warning("PostgreSQL not initialized, can't get queue status")
            return None

        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            query = f"""
            SELECT * FROM {self.queue_table}
            WHERE request_id = %s
            """
            cursor.execute(query, (request_id,))

            queue_info = cursor.fetchone()
            cursor.close()

            if queue_info:
                # Convert to regular dict and format datetime objects
                queue_dict = dict(queue_info)
                for key, value in queue_dict.items():
                    if isinstance(value, datetime):
                        queue_dict[key] = value.isoformat()

                logger.info(f"Retrieved queue status for request {request_id}: {queue_dict['status']}")
                return queue_dict
            else:
                logger.warning(f"No queue entry found for request ID: {request_id}")
                return None

        except Exception as e:
            logger.error(f"Error getting queue status: {str(e)}")
            logger.error(traceback.format_exc())
            return None
        finally:
            if conn:
                self._return_connection(conn)

    def get_next_pending_request(self) -> Optional[Dict[str, Any]]:
        """
        Get the next pending request from the queue.

        Returns:
            Next pending request if available, None otherwise
        """
        if not self._initialized and not self.initialize():
            logger.warning("PostgreSQL not initialized, can't get next request")
            return None

        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            query = f"""
            SELECT * FROM {self.queue_table}
            WHERE status = 'pending'
            ORDER BY position ASC
            LIMIT 1
            """
            cursor.execute(query)

            request = cursor.fetchone()
            cursor.close()

            if request:
                logger.info(f"Retrieved next pending request: {request['request_id']}")
                return dict(request)
            else:
                logger.info("No pending requests in queue")
                return None

        except Exception as e:
            logger.error(f"Error getting next pending request: {str(e)}")
            logger.error(traceback.format_exc())
            return None
        finally:
            if conn:
                self._return_connection(conn)

    def is_queue_processing(self) -> bool:
        """
        Check if there's currently a request being processed.

        Returns:
            True if a request is being processed, False otherwise
        """
        if not self._initialized and not self.initialize():
            logger.warning("PostgreSQL not initialized, can't check queue status")
            return False

        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            query = f"""
            SELECT COUNT(*) FROM {self.queue_table}
            WHERE status = 'processing'
            """
            cursor.execute(query)

            count = cursor.fetchone()[0]
            cursor.close()

            return count > 0

        except Exception as e:
            logger.error(f"Error checking if queue is processing: {str(e)}")
            logger.error(traceback.format_exc())
            return False
        finally:
            if conn:
                self._return_connection(conn)

# Create a singleton instance
db_client = PostgresClient()
