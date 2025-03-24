#!/usr/bin/env python3
"""
Dota 2 Hero Detection API Server

This module provides a Flask-based web service to process Twitch clip URLs
and return Dota 2 hero detection results as JSON.
"""

import os
import json
import logging
from flask import Flask, request, jsonify, Response
from urllib.parse import urlparse
import traceback

# Import the hero detection module
try:
    from dota_hero_detection import process_clip_url
except ImportError:
    # Try with relative import for different directory structures
    try:
        from .dota_hero_detection import process_clip_url
    except ImportError:
        print("Error: Could not import dota_hero_detection module.")
        print("Make sure you're running this from the correct directory.")
        exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('api_server.log')
    ]
)
logger = logging.getLogger(__name__)

# Create Flask app
app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint."""
    return jsonify({'status': 'ok', 'service': 'dota-hero-detection-api'})

@app.route('/detect', methods=['GET'])
def detect_heroes():
    """
    Process a Twitch clip URL or clip ID and return hero detection results.

    Query parameters:
    - url: The Twitch clip URL to process (required if clip_id not provided)
    - clip_id: The Twitch clip ID (required if url not provided)
    - debug: Enable debug mode (optional, default=False)
    """
    clip_url = request.args.get('url')
    clip_id = request.args.get('clip_id')
    debug = request.args.get('debug', 'false').lower() == 'true'

    # Check if either clip_url or clip_id is provided
    if not clip_url and not clip_id:
        return jsonify({'error': 'Missing required parameter: either url or clip_id must be provided'}), 400

    # If clip_id is provided but no url, construct the url
    if clip_id and not clip_url:
        clip_url = f"https://clips.twitch.tv/{clip_id}"
        logger.info(f"Constructed clip URL from ID: {clip_url}")

    # Basic URL validation
    try:
        parsed_url = urlparse(clip_url)
        if not parsed_url.scheme or not parsed_url.netloc:
            return jsonify({'error': 'Invalid URL format'}), 400

        # Check if it's likely a Twitch clip URL
        if 'twitch.tv' not in parsed_url.netloc and 'clips.twitch.tv' not in parsed_url.netloc:
            logger.warning(f"URL may not be a Twitch clip: {clip_url}")
    except Exception as e:
        return jsonify({'error': f'URL parsing error: {str(e)}'}), 400

    logger.info(f"Processing clip URL: {clip_url} (debug={debug})")

    try:
        # Process the clip
        result = process_clip_url(
            clip_url=clip_url,
            debug=debug
        )

        if result:
            # Return the result as JSON
            return jsonify(result)
        else:
            return jsonify({'error': 'Failed to process clip or no heroes detected'}), 404

    except Exception as e:
        logger.error(f"Error processing clip: {str(e)}", exc_info=True)
        error_details = {
            'error': 'Error processing clip',
            'message': str(e),
            'trace': traceback.format_exc() if debug else None
        }
        return jsonify(error_details), 500

if __name__ == '__main__':
    # Get port from environment variable or use default
    port = int(os.environ.get('PORT', 5000))

    # Start the server
    logger.info(f"Starting Dota 2 Hero Detection API server on port {port}")
    app.run(host='0.0.0.0', port=port)
