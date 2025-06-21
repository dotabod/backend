#!/usr/bin/env python3
"""Lightweight PostgreSQL client wrapper."""
from typing import Dict, Any, Optional, Tuple

from .db import connection, queries

import logging
logger = logging.getLogger(__name__)


class PostgresClient:
    """Thin wrapper around query helpers."""

    def __init__(self):
        self.results_table = "clip_results"
        self.queue_table = "processing_queue"
        self._initialized = False
        logger.info("PostgresClient initialized")

    def _get_connection(self):
        return connection.get_connection()

    def _return_connection(self, conn):
        connection.return_connection(conn)

    def _test_connection(self) -> bool:
        return connection.test_connection()

    def initialize(self) -> bool:
        if self._initialized:
            return True
        self._initialized = queries.initialize_db(self.results_table, self.queue_table)
        return self._initialized

    def get_clip_result(self, clip_id: str) -> Optional[Dict[str, Any]]:
        if not self.initialize():
            return None
        return queries.get_clip_result(self.results_table, clip_id)

    def get_clip_result_by_match_id(self, match_id: str) -> Optional[Dict[str, Any]]:
        if not self.initialize():
            return None
        return queries.get_clip_result_by_match_id(self.results_table, match_id)

    def check_for_match_processing(self, match_id: str) -> Optional[Dict[str, Any]]:
        if not self.initialize():
            return None
        return queries.check_for_match_processing(self.results_table, self.queue_table, match_id)

    def save_clip_result(self, clip_id: str, clip_url: str, result: Dict[str, Any], processing_time_seconds: Optional[float] = None, match_id: Optional[str] = None) -> bool:
        if not self.initialize():
            return False
        return queries.save_clip_result(self.results_table, clip_id, clip_url, result, processing_time_seconds, match_id)

    def get_average_processing_time(self, request_type: str = "clip") -> float:
        if not self.initialize():
            return 10.0
        return queries.get_average_processing_time(self.results_table, self.queue_table, request_type)

    def is_request_in_queue(self, request_type: str, clip_id: Optional[str] = None, stream_username: Optional[str] = None) -> Optional[Dict[str, Any]]:
        if not self.initialize():
            return None
        return queries.is_request_in_queue(self.queue_table, request_type, clip_id, stream_username)

    def add_to_queue(self, request_type: str, clip_id: Optional[str] = None, clip_url: Optional[str] = None, stream_username: Optional[str] = None, num_frames: int = 3, debug: bool = False, force: bool = False, include_image: bool = True, match_id: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
        if not self.initialize():
            import uuid
            return str(uuid.uuid4()), {}
        return queries.add_to_queue(self.results_table, self.queue_table, request_type, clip_id, clip_url, stream_username, num_frames, debug, force, include_image, match_id)

    def update_queue_status(self, request_id: str, status: str, result_id: Optional[str] = None) -> bool:
        if not self.initialize():
            return False
        return queries.update_queue_status(self.queue_table, request_id, status, result_id)

    def get_queue_status(self, request_id: str) -> Optional[Dict[str, Any]]:
        if not self.initialize():
            return None
        return queries.get_queue_status(self.queue_table, request_id)

    def get_next_pending_request(self) -> Optional[Dict[str, Any]]:
        if not self.initialize():
            return None
        return queries.get_next_pending_request(self.queue_table)

    def is_queue_processing(self) -> bool:
        if not self.initialize():
            return False
        return queries.is_queue_processing(self.queue_table)


# Singleton instance
db_client = PostgresClient()
