#!/usr/bin/env python3
"""
PocketBase Client for Dota 2 Hero Detection API

This module provides a client for interacting with the PocketBase database
to cache and retrieve clip processing results.
"""

import os
import requests
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)

class PocketBaseClient:
    """Client for interacting with PocketBase database."""

    def __init__(self):
        """Initialize the PocketBase client."""
        self.base_url = os.environ.get('POCKETBASE_URL', 'http://pocketbase:8090')
        self.api_url = f"{self.base_url}/api"
        self.collection = "clip_results"
        self._initialized = False

    def initialize(self) -> bool:
        """Initialize the database and create collections if needed."""
        try:
            # Check if the collection exists
            response = requests.get(f"{self.api_url}/collections")
            if response.status_code == 404:
                logger.info("Creating admin user for PocketBase")
                # Set up admin user if first time
                self._setup_admin()

            collections = response.json().get('items', [])
            collection_exists = any(c['name'] == self.collection for c in collections)

            if not collection_exists:
                logger.info(f"Creating collection: {self.collection}")
                self._create_collection()

            self._initialized = True
            logger.info("PocketBase client initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Error initializing PocketBase: {str(e)}")
            return False

    def _setup_admin(self) -> bool:
        """Set up an admin user for PocketBase."""
        try:
            data = {
                "email": "admin@dota-hero-detection.local",
                "password": "adminpassword123",
                "passwordConfirm": "adminpassword123"
            }
            response = requests.post(f"{self.base_url}/api/admins", json=data)
            return response.status_code in (200, 201)
        except Exception as e:
            logger.error(f"Error setting up admin: {str(e)}")
            return False

    def _create_collection(self) -> bool:
        """Create the clip_results collection."""
        try:
            # Log in as admin
            auth_data = {
                "email": "admin@dota-hero-detection.local",
                "password": "adminpassword123"
            }
            auth_response = requests.post(f"{self.base_url}/api/admins/auth-with-password", json=auth_data)

            if auth_response.status_code != 200:
                logger.error("Failed to authenticate as admin")
                return False

            token = auth_response.json().get('token')

            # Create collection
            collection_data = {
                "name": self.collection,
                "type": "base",
                "schema": [
                    {
                        "name": "clip_id",
                        "type": "text",
                        "required": True,
                        "unique": True
                    },
                    {
                        "name": "clip_url",
                        "type": "text",
                        "required": True
                    },
                    {
                        "name": "results",
                        "type": "json",
                        "required": True
                    },
                    {
                        "name": "processed_at",
                        "type": "date",
                        "required": True
                    }
                ]
            }

            headers = {"Authorization": f"Bearer {token}"}
            response = requests.post(f"{self.api_url}/collections", json=collection_data, headers=headers)

            return response.status_code in (200, 201)
        except Exception as e:
            logger.error(f"Error creating collection: {str(e)}")
            return False

    def get_clip_result(self, clip_id: str) -> Optional[Dict[str, Any]]:
        """
        Get cached result for a clip_id if it exists.

        Args:
            clip_id: The Twitch clip ID

        Returns:
            The cached results if found, None otherwise
        """
        if not self._initialized and not self.initialize():
            logger.warning("PocketBase not initialized, can't fetch clip result")
            return None

        try:
            # Use filter to find by clip_id
            filter_query = f'clip_id="{clip_id}"'
            response = requests.get(f"{self.api_url}/collections/{self.collection}/records", params={"filter": filter_query})

            if response.status_code == 200:
                items = response.json().get('items', [])
                if items:
                    # Return the most recent result if multiple exist
                    item = sorted(items, key=lambda x: x.get('processed_at', ''), reverse=True)[0]
                    return item.get('results')
            return None
        except Exception as e:
            logger.error(f"Error getting clip result: {str(e)}")
            return None

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
            logger.warning("PocketBase not initialized, can't save clip result")
            return False

        try:
            data = {
                "clip_id": clip_id,
                "clip_url": clip_url,
                "results": json.dumps(result),
                "processed_at": datetime.now().isoformat()
            }

            response = requests.post(f"{self.api_url}/collections/{self.collection}/records", json=data)

            return response.status_code in (200, 201)
        except Exception as e:
            logger.error(f"Error saving clip result: {str(e)}")
            return False

# Create a singleton instance
pb_client = PocketBaseClient()
