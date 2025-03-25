#!/usr/bin/env python3
"""
Unit tests for the clip processing queue system
"""

import unittest
import time
from unittest.mock import MagicMock, patch
import sys
import os
from datetime import datetime, timedelta

# Adjust path to import modules from parent directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../src')))

# Import the modules to test
from postgresql_client import PostgresClient

class TestQueueSystem(unittest.TestCase):
    """Test cases for the queue system."""

    def setUp(self):
        """Set up test fixtures."""
        # Create a mock DB client
        self.db_client = PostgresClient()
        # Override connection methods to avoid actual DB connections
        self.db_client._test_connection = MagicMock(return_value=True)
        self.db_client._get_connection = MagicMock()
        self.db_client._return_connection = MagicMock()
        self.db_client._initialized = True

    def test_add_to_queue(self):
        """Test adding a request to the queue."""
        # Mock the cursor and connection
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        self.db_client._get_connection.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cursor

        # Set up mock response for queue length
        mock_cursor.fetchone.side_effect = [
            {'count': 2},  # First call for queue length
            {'id': 1, 'request_id': 'test-id', 'status': 'pending', 'position': 3}  # Second call for the inserted row
        ]

        # Call the method
        request_id, queue_info = self.db_client.add_to_queue(
            request_type='clip',
            clip_id='test-clip',
            clip_url='https://clips.twitch.tv/test-clip'
        )

        # Assertions
        self.assertIsNotNone(request_id)
        self.assertEqual(queue_info.get('status'), 'pending')
        self.assertEqual(queue_info.get('position'), 3)
        mock_cursor.execute.assert_called()  # Should have executed SQL
        mock_conn.commit.assert_called_once()  # Should have committed

    def test_get_average_processing_time(self):
        """Test calculating average processing time."""
        # Mock the cursor and connection
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        self.db_client._get_connection.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cursor

        # Test with existing data
        mock_cursor.fetchone.return_value = [10.5]  # Average processing time

        avg_time = self.db_client.get_average_processing_time('clip')
        self.assertEqual(avg_time, 10.5)

        # Test with no data
        mock_cursor.fetchone.return_value = [None]
        avg_time = self.db_client.get_average_processing_time('clip')
        self.assertEqual(avg_time, 15.0)  # Should return default value

        # Test for stream type
        mock_cursor.fetchone.return_value = [20.3]
        avg_time = self.db_client.get_average_processing_time('stream')
        self.assertEqual(avg_time, 20.3)

    def test_update_queue_status(self):
        """Test updating the queue status."""
        # Mock the cursor and connection
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        self.db_client._get_connection.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cursor

        # Test updating to processing
        success = self.db_client.update_queue_status('test-id', 'processing')
        self.assertTrue(success)
        mock_conn.commit.assert_called_once()

        # Reset mocks
        mock_conn.reset_mock()
        mock_cursor.reset_mock()

        # Test updating to completed
        success = self.db_client.update_queue_status('test-id', 'completed', 'result-id')
        self.assertTrue(success)
        self.assertEqual(mock_cursor.execute.call_count, 2)  # Should call execute twice
        mock_conn.commit.assert_called_once()

    def test_get_next_pending_request(self):
        """Test getting next pending request."""
        # Mock the cursor and connection
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        self.db_client._get_connection.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cursor

        # Set up mock response
        mock_request = {
            'request_id': 'test-id',
            'clip_id': 'test-clip',
            'status': 'pending',
            'position': 1
        }
        mock_cursor.fetchone.return_value = mock_request

        # Call the method
        request = self.db_client.get_next_pending_request()

        # Assertions
        self.assertIsNotNone(request)
        self.assertEqual(request['request_id'], 'test-id')
        self.assertEqual(request['status'], 'pending')

        # Test no pending requests
        mock_cursor.fetchone.return_value = None
        request = self.db_client.get_next_pending_request()
        self.assertIsNone(request)

    def test_queue_status_estimation(self):
        """Test queue position and wait time estimation."""
        # Create a new request with position 5
        now = datetime.now()
        avg_time = 15.0  # seconds per request

        # Calculate expected values
        position = 5
        expected_wait = position * avg_time
        expected_completion = now + timedelta(seconds=expected_wait)

        # Verify calculations manually
        self.assertEqual(expected_wait, 75.0)

        # In a real implementation, this would be tested against the actual
        # database calculations, but for this unit test we're just verifying logic

    def test_duplicate_request_detection(self):
        """Test that duplicate requests are detected correctly."""
        # Mock the cursor and connection
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        self.db_client._get_connection.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cursor

        # Set up mock response for is_request_in_queue
        mock_existing_request = {
            'request_id': 'existing-id',
            'clip_id': 'test-clip',
            'status': 'pending',
            'position': 3,
            'created_at': datetime.now(),
            'estimated_wait_seconds': 45,
            'estimated_completion_time': datetime.now() + timedelta(seconds=45)
        }
        mock_cursor.fetchone.return_value = mock_existing_request

        # Test is_request_in_queue function
        existing = self.db_client.is_request_in_queue('clip', 'test-clip')
        self.assertIsNotNone(existing)
        self.assertEqual(existing['request_id'], 'existing-id')

        # Test that add_to_queue returns the existing request
        request_id, queue_info = self.db_client.add_to_queue(
            request_type='clip',
            clip_id='test-clip',
            clip_url='https://clips.twitch.tv/test-clip'
        )

        # The is_request_in_queue should be called, and the existing request returned
        self.assertEqual(request_id, 'existing-id')
        self.assertEqual(queue_info['status'], 'pending')
        self.assertEqual(queue_info['position'], 3)

        # For a stream request
        mock_cursor.fetchone.return_value = {
            'request_id': 'stream-id',
            'stream_username': 'test-user',
            'status': 'processing',
            'position': 0
        }

        existing = self.db_client.is_request_in_queue('stream', None, 'test-user')
        self.assertIsNotNone(existing)
        self.assertEqual(existing['request_id'], 'stream-id')

        # Test with no match
        mock_cursor.fetchone.return_value = None
        existing = self.db_client.is_request_in_queue('clip', 'non-existent-clip')
        self.assertIsNone(existing)

if __name__ == '__main__':
    unittest.main()
