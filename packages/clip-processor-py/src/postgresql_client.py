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

# Configure logging
log_dir = os.path.join(os.path.dirname(__file__), 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, 'postgresql_client.log')
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
                processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
            SELECT results, facets FROM {self.results_table}
            WHERE clip_id = %s
            ORDER BY processed_at DESC
            LIMIT 1
            """

            cursor.execute(query, (clip_id,))
            row = cursor.fetchone()
            cursor.close()

            if row:
                logger.info(f"Found cached result for clip ID: {clip_id}")
                result = row['results']
                facets = row['facets']
                if facets:
                    if 'players' in result:
                        for player in result['players']:
                            team = player['team'].lower()
                            position = player['position']

                            # Find matching facet info
                            for hero_facet in facets[team]:
                                if hero_facet['position'] == position:
                                    player['facet'] = hero_facet['facet']
                                    break
                return result
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

    def get_clip_result_by_match_id(self, match_id: str) -> Optional[Dict[str, Any]]:
        """
        Get cached result for a match_id if it exists.

        Args:
            match_id: The Dota 2 match ID

        Returns:
            The cached results if found, None otherwise
        """
        if not self._initialized and not self.initialize():
            logger.warning("PostgreSQL not initialized, can't fetch clip result by match ID")
            return None

        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Query for the clip by match ID, ordering by most recent
            query = f"""
            SELECT clip_id, clip_url, results, facets FROM {self.results_table}
            WHERE match_id = %s
            ORDER BY processed_at DESC
            LIMIT 1
            """

            cursor.execute(query, (match_id,))
            row = cursor.fetchone()
            cursor.close()

            if row:
                logger.info(f"Found cached result for match ID: {match_id}")
                result = row['results']
                facets = row['facets']
                # Add clip details to result
                if isinstance(result, dict):
                    result['clip_id'] = row['clip_id']
                    result['clip_url'] = row['clip_url']
                if facets:
                    if 'players' in result:
                        for player in result['players']:
                            team = player['team'].lower()
                            position = player['position']

                            # Find matching facet info
                            for hero_facet in facets[team]:
                                if hero_facet['position'] == position:
                                    player['facet'] = hero_facet['facet']
                                    break
                return result
            else:
                logger.info(f"No cached result found for match ID: {match_id}")
                return None

        except Exception as e:
            logger.error(f"Error getting clip result by match ID: {str(e)}")
            logger.error(traceback.format_exc())
            return None
        finally:
            if conn:
                self._return_connection(conn)

    def check_for_match_processing(self, match_id: str) -> Optional[Dict[str, Any]]:
        """
        Check if a match is already being processed or has a successful result.

        Args:
            match_id: The Dota 2 match ID

        Returns:
            A dictionary with information about the status of the match processing:
            - found: True if match is found in queue or results
            - status: Status of processing (completed, pending, processing, failed)
            - clip_id: Clip ID if applicable
            - request_id: Request ID if the match is in the queue
            None if there's an error or match isn't being processed
        """
        if not self._initialized and not self.initialize():
            logger.warning("PostgreSQL not initialized, can't check match processing status")
            return None

        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # First check for a completed successful result
            query = f"""
            SELECT clip_id FROM {self.results_table}
            WHERE match_id = %s
            ORDER BY processed_at DESC
            LIMIT 1
            """
            cursor.execute(query, (match_id,))
            result_row = cursor.fetchone()

            # If we found a result, return it as completed
            if result_row:
                cursor.close()
                logger.info(f"Found completed result for match ID: {match_id}")
                return {
                    'found': True,
                    'status': 'completed',
                    'clip_id': result_row['clip_id']
                }

            # If no completed result, check if there's an active queue entry
            query = f"""
            SELECT request_id, clip_id, status FROM {self.queue_table}
            WHERE match_id = %s AND status IN ('pending', 'processing')
            ORDER BY
                CASE
                    WHEN status = 'processing' THEN 0
                    WHEN status = 'pending' THEN 1
                END,
                created_at ASC
            LIMIT 1
            """
            cursor.execute(query, (match_id,))
            queue_row = cursor.fetchone()

            # If found in queue, return the status
            if queue_row:
                cursor.close()
                logger.info(f"Found {queue_row['status']} request for match ID: {match_id}")
                return {
                    'found': True,
                    'status': queue_row['status'],
                    'clip_id': queue_row.get('clip_id'),
                    'request_id': queue_row['request_id']
                }

            # Check for failed requests
            query = f"""
            SELECT request_id, clip_id FROM {self.queue_table}
            WHERE match_id = %s AND status = 'failed'
            ORDER BY completed_at DESC
            LIMIT 1
            """
            cursor.execute(query, (match_id,))
            failed_row = cursor.fetchone()
            cursor.close()

            if failed_row:
                logger.info(f"Found failed request for match ID: {match_id}")
                return {
                    'found': True,
                    'status': 'failed',
                    'clip_id': failed_row.get('clip_id'),
                    'request_id': failed_row['request_id']
                }

            # No match found in results or queue
            logger.info(f"No processing found for match ID: {match_id}")
            return {
                'found': False
            }

        except Exception as e:
            logger.error(f"Error checking match processing status: {str(e)}")
            logger.error(traceback.format_exc())
            return None
        finally:
            if conn:
                self._return_connection(conn)

    def save_clip_result(self, clip_id: str, clip_url: str, result: Dict[str, Any], processing_time_seconds: Optional[float] = None, match_id: Optional[str] = None) -> bool:
        """
        Save clip processing result to the database.

        Args:
            clip_id: The Twitch clip ID
            clip_url: The Twitch clip URL
            result: The hero detection result to cache
            processing_time_seconds: Processing time in seconds (optional)
            match_id: The Dota 2 match ID (optional)

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

            # Extract facet information from result
            facets = {
                'radiant': [],
                'dire': []
            }

            if 'players' in result:
                for player in result['players']:
                    if 'facet' in player:
                        facets[player['team'].lower()].append({
                            'position': player['position'],
                            'facet': player['facet']
                        })

            # Save result with facet information
            cursor.execute(f"""
            INSERT INTO {self.results_table} (
                clip_id, clip_url, results, processing_time_seconds, match_id, facets, processed_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, NOW()
            )
            ON CONFLICT (clip_id) DO UPDATE SET
                    clip_url = EXCLUDED.clip_url,
                results = EXCLUDED.results,
                processing_time_seconds = EXCLUDED.processing_time_seconds,
                match_id = EXCLUDED.match_id,
                facets = EXCLUDED.facets,
                processed_at = NOW()
            """, (
                    clip_id,
                    clip_url,
                json.dumps(result),
                    processing_time_seconds,
                    match_id,
                    json.dumps(facets) if facets['radiant'] or facets['dire'] else None
                ))

            conn.commit()
            cursor.close()
            self._return_connection(conn)
            return True

        except Exception as e:
            logger.error(f"Error saving clip result: {str(e)}")
            logger.error(traceback.format_exc())
            if conn:
                conn.rollback()
                self._return_connection(conn)
            return False

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

    def is_request_in_queue(self, request_type: str, clip_id: Optional[str] = None,
                            stream_username: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Check if a request with the same clip_id or stream_username is already in the queue.

        Args:
            request_type: Type of request ('clip' or 'stream')
            clip_id: The Twitch clip ID (for clip requests)
            stream_username: Twitch username (for stream requests)

        Returns:
            The queue entry if found, None otherwise
        """
        if not self._initialized and not self.initialize():
            logger.warning("PostgreSQL not initialized, can't check queue")
            return None

        if request_type == 'clip' and not clip_id:
            return None
        if request_type == 'stream' and not stream_username:
            return None

        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            query = None
            params = None

            if request_type == 'clip':
                query = f"""
                SELECT * FROM {self.queue_table}
                WHERE request_type = 'clip' AND clip_id = %s AND status in ('pending', 'processing')
                ORDER BY created_at DESC
                LIMIT 1
                """
                params = (clip_id,)
            elif request_type == 'stream':
                query = f"""
                SELECT * FROM {self.queue_table}
                WHERE request_type = 'stream' AND stream_username = %s AND status in ('pending', 'processing')
                ORDER BY created_at DESC
                LIMIT 1
                """
                params = (stream_username,)

            if query and params:
                cursor.execute(query, params)
                queue_entry = cursor.fetchone()
                cursor.close()

                if queue_entry:
                    logger.info(f"Found existing {request_type} request in queue: {queue_entry['request_id']}")
                    return dict(queue_entry)

                return None
            else:
                return None

        except Exception as e:
            logger.error(f"Error checking if request is in queue: {str(e)}")
            logger.error(traceback.format_exc())
            return None
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
                    include_image: bool = True,
                    match_id: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
        """
        Add a request to the processing queue.

        Args:
            request_type: Type of request ('clip' or 'stream')
            clip_id: The Twitch clip ID (for clip requests)
            clip_url: The Twitch clip URL (for clip requests)
            stream_username: The Twitch username (for stream requests)
            num_frames: Number of frames to capture (for stream requests)
            debug: Enable debug mode
            force: Force reprocessing even if cached
            include_image: Include image URL in the result
            match_id: The Dota 2 match ID (optional, for clip requests)

        Returns:
            Tuple of (request_id, queue_info)
        """
        if not self._initialized and not self.initialize():
            logger.warning("PostgreSQL not initialized, can't add to queue")
            return str(uuid.uuid4()), {}

        # Check if match_id column exists
        has_match_id_column = False
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'processing_queue' AND column_name = 'match_id'
            """)
            has_match_id_column = cursor.fetchone() is not None
            cursor.close()
            self._return_connection(conn)
        except Exception as e:
            logger.warning(f"Error checking for match_id column: {e}")
            # Continue anyway, we'll handle it in the query

        # Validate request type
        if request_type not in ('clip', 'stream'):
            logger.error(f"Invalid request type: {request_type}")
            return str(uuid.uuid4()), {}

        # Check parameters based on request type
        if request_type == 'clip' and not clip_url:
            logger.error("Missing clip_url for clip request")
            return str(uuid.uuid4()), {}
        elif request_type == 'stream' and not stream_username:
            logger.error("Missing stream_username for stream request")
            return str(uuid.uuid4()), {}

        # Generate a unique request ID
        request_id = str(uuid.uuid4())

        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if there's already a pending or processing request for this clip/stream
            if request_type == 'clip' and clip_id:
                query = f"""
                SELECT * FROM {self.queue_table}
                WHERE clip_id = %s AND status IN ('pending', 'processing')
                LIMIT 1
                """
                cursor.execute(query, (clip_id,))
                existing = cursor.fetchone()
                if existing:
                    # Return the existing request info
                    cursor.close()
                    self._return_connection(conn)
                    logger.info(f"Returning existing queue entry for clip ID: {clip_id}")
                    return existing['request_id'], dict(existing)
            elif request_type == 'stream' and stream_username:
                query = f"""
                SELECT * FROM {self.queue_table}
                WHERE stream_username = %s AND status IN ('pending', 'processing')
                LIMIT 1
                """
                cursor.execute(query, (stream_username,))
                existing = cursor.fetchone()
                if existing:
                    # Return the existing request info
                    cursor.close()
                    self._return_connection(conn)
                    logger.info(f"Returning existing queue entry for stream: {stream_username}")
                    return existing['request_id'], dict(existing)

            # Calculate position and estimated wait time
            cursor.execute(f"SELECT COUNT(*) FROM {self.queue_table} WHERE status = 'pending'")
            position = cursor.fetchone()['count'] + 1

            # Get average processing time
            avg_time = self.get_average_processing_time(request_type)
            estimated_wait_seconds = position * avg_time

            # Calculate estimated completion time
            now = datetime.now()
            estimated_completion_time = now + timedelta(seconds=estimated_wait_seconds)

            # Insert the new request
            if has_match_id_column:
                query = f"""
                INSERT INTO {self.queue_table} (
                    request_id, clip_id, clip_url, stream_username, num_frames,
                    debug, force, include_image, request_type, status,
                    created_at, position, estimated_completion_time, estimated_wait_seconds, match_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """
                cursor.execute(query, (
                    request_id, clip_id, clip_url, stream_username, num_frames,
                    debug, force, include_image, request_type, 'pending',
                    now, position, estimated_completion_time, estimated_wait_seconds, match_id
                ))
            else:
                # Fallback without match_id if column doesn't exist yet
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

            # Get the inserted row
            result = cursor.fetchone()
            conn.commit()
            cursor.close()

            logger.info(f"Added {request_type} request to queue: {request_id}")
            return request_id, dict(result)

        except Exception as e:
            logger.error(f"Error adding to queue: {str(e)}")
            logger.error(traceback.format_exc())
            if conn:
                conn.rollback()
            return request_id, {}
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
                UPDATE {self.queue_table} AS q
                SET position = q.position - 1,
                    estimated_wait_seconds = q.estimated_wait_seconds -
                    (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))), 15)
                     FROM {self.queue_table}
                     WHERE status = 'completed' AND request_type = t.request_type
                     LIMIT 1),
                    estimated_completion_time = NOW() +
                    (interval '1 second' * (q.position - 1) *
                    (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))), 15)
                     FROM {self.queue_table}
                     WHERE status = 'completed' AND request_type = t.request_type
                     LIMIT 1))
                FROM {self.queue_table} AS t
                WHERE q.request_id = t.request_id
                AND q.status = 'pending'
                AND q.position > 1
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

            # Log the result more explicitly
            if count > 0:
                logger.debug(f"Found {count} request(s) with 'processing' status")
            else:
                logger.debug("No requests currently being processed")

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
