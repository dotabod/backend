#!/usr/bin/env python3
"""
Tests for the API server functionality, focusing on queue processing and frame_image_url handling
"""

import unittest
from unittest.mock import patch, MagicMock, ANY
import os
import sys
import json
from pathlib import Path

# Add the src directory to the Python path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from api_server import process_clip_request, process_queue_worker, get_image_url


class APIServerTests(unittest.TestCase):
    """Test cases for the API server functionality"""

    @patch("api_server.process_clip_url")
    @patch("api_server.db_client")
    @patch("api_server.get_image_url")
    def test_process_clip_request_from_worker(self, mock_get_image_url, mock_db_client, mock_process_clip_url):
        """Test that frame_image_url is handled correctly when called from worker thread"""
        # Setup mocks
        mock_process_clip_url.return_value = {
            "best_frame_info": {
                "frame_path": "/path/to/frame.jpg"
            }
        }
        mock_get_image_url.return_value = "http://example.com/images/frame.jpg"
        mock_db_client.get_clip_result.return_value = None
        mock_db_client.save_clip_result.return_value = True

        # Test direct processing (not from worker)
        result = process_clip_request(
            clip_url="https://clips.twitch.tv/test",
            clip_id="test123",
            debug=False,
            force=True,
            include_image=True,
            add_to_queue=False,
            from_worker=False
        )

        # Verify frame_image_url is included
        self.assertIn("frame_image_url", result)
        mock_get_image_url.assert_called_once()

        # Reset mocks
        mock_get_image_url.reset_mock()
        mock_db_client.save_clip_result.reset_mock()

        # Test processing from worker
        result = process_clip_request(
            clip_url="https://clips.twitch.tv/test",
            clip_id="test123",
            debug=False,
            force=True,
            include_image=True,
            add_to_queue=False,
            from_worker=True
        )

        # Verify frame_image_url is NOT included when called from worker thread
        self.assertNotIn("frame_image_url", result)
        mock_get_image_url.assert_not_called()

        # Verify frame_image_url is removed before saving to database
        mock_db_client.save_clip_result.assert_called_once()
        saved_result = mock_db_client.save_clip_result.call_args[0][2]
        self.assertNotIn("frame_image_url", saved_result)

    @patch("api_server.db_client")
    def test_get_cached_result_from_worker(self, mock_db_client):
        """Test that frame_image_url is not added to cached results when called from worker thread"""
        # Setup mock
        mock_db_client.get_clip_result.return_value = {
            "best_frame_path": "/path/to/frame.jpg"
        }

        # When from_worker is False, we should try to add frame_image_url
        with patch("api_server.Path.exists", return_value=True), \
             patch("api_server.get_image_url", return_value="http://example.com/images/frame.jpg") as mock_get_image_url:

            # Test retrieving cached result (not from worker)
            result = process_clip_request(
                clip_url="https://clips.twitch.tv/test",
                clip_id="test123",
                debug=False,
                force=False,
                include_image=True,
                add_to_queue=False,
                from_worker=False
            )

            # Verify we attempted to add frame_image_url
            self.assertIn("frame_image_url", result)
            mock_get_image_url.assert_called_once()

            # Reset mocks
            mock_get_image_url.reset_mock()

            # Test retrieving cached result (from worker)
            result = process_clip_request(
                clip_url="https://clips.twitch.tv/test",
                clip_id="test123",
                debug=False,
                force=False,
                include_image=True,
                add_to_queue=False,
                from_worker=True
            )

            # Verify we did NOT attempt to add frame_image_url
            self.assertNotIn("frame_image_url", result)
            mock_get_image_url.assert_not_called()

    @patch("api_server.db_client")
    @patch("api_server.process_clip_request")
    def test_process_queue_worker_removes_frame_image_url(self, mock_process_clip_request, mock_db_client):
        """Test that process_queue_worker handles frame_image_url correctly"""
        # Setup mocks
        mock_db_client.is_queue_processing.side_effect = [False, True]  # Run only once
        mock_db_client.get_next_pending_request.return_value = {
            "request_id": "req123",
            "request_type": "clip",
            "clip_url": "https://clips.twitch.tv/test",
            "clip_id": "test123",
            "debug": False,
            "force": False,
            "include_image": True
        }

        # Mock the result from process_clip_request including a frame_image_url
        mock_process_clip_request.return_value = {
            "best_frame_info": {"frame_path": "/path/to/frame.jpg"},
            "frame_image_url": "http://example.com/images/frame.jpg"
        }

        # Run the worker
        with patch("api_server.time.sleep"):  # Skip sleep
            process_queue_worker()

        # Verify process_clip_request was called with from_worker=True
        mock_process_clip_request.assert_called_once_with(
            ANY, ANY, ANY, ANY, ANY, add_to_queue=False, from_worker=True
        )

        # Verify frame_image_url is removed before saving to database
        mock_db_client.save_clip_result.assert_called_once()

        # Check if first argument of the third call has frame_image_url removed
        # (db_client.update_queue_status will be called first, then save_clip_result)
        saved_args = mock_db_client.save_clip_result.call_args[0]

        # The result should be the third argument (index 2)
        saved_result = saved_args[2] if len(saved_args) > 2 else {}

        # Verify frame_image_url was removed
        self.assertNotIn("frame_image_url", saved_result)


if __name__ == "__main__":
    unittest.main()
