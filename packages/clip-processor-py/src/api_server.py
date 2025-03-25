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
import re

# Import the hero detection and hero data modules
try:
    from dota_hero_detection import process_clip_url, process_stream_username, load_heroes_data
    from dota_heroes import get_hero_data
    from postgresql_client import db_client
except ImportError as e:
    # Try with relative import for different directory structures
    try:
        from .dota_hero_detection import process_clip_url, process_stream_username, load_heroes_data
        from .dota_heroes import get_hero_data
        from .postgresql_client import db_client
    except ImportError as rel_e:
        print(f"Error: Could not import required modules. First error: {e}, Second error: {rel_e}")
        print("Make sure you're running this from the correct directory.")
        print(f"Current Python path: {os.environ.get('PYTHONPATH', 'Not set')}")
        import sys
        print(f"System path: {sys.path}")
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

# Global variable to store preloaded hero data
heroes_data = None

# Create Flask app
app = Flask(__name__)

# Preload hero templates at application startup
@app.before_request
def preload_hero_templates():
    """Preload hero templates before the first request is processed."""
    global heroes_data
    # Only load if not already loaded
    if heroes_data is None:
        logger.info("Preloading hero templates...")
        heroes_data = load_heroes_data()
        if heroes_data:
            logger.info(f"Successfully preloaded templates for {len(heroes_data)} heroes")
        else:
            logger.error("Failed to preload hero templates")

# Manually preload templates during module import
logger.info("Initializing hero templates during server startup...")
heroes_data = load_heroes_data()
if heroes_data:
    logger.info(f"Successfully preloaded templates for {len(heroes_data)} heroes")
else:
    logger.error("Failed to preload hero templates")

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint."""
    return jsonify({'status': 'ok', 'service': 'dota-hero-detection-api'})

def extract_clip_id(clip_url):
    """
    Extract the clip ID from a Twitch clip URL.

    Args:
        clip_url: The Twitch clip URL

    Returns:
        The clip ID if found, None otherwise
    """
    # Try to extract using pattern matching
    patterns = [
        r'clips\.twitch\.tv/([a-zA-Z0-9]+)',  # clips.twitch.tv/ClipName
        r'twitch\.tv/\w+/clip/([a-zA-Z0-9-]+)',  # twitch.tv/channel/clip/ClipName
        r'clip=([a-zA-Z0-9-]+)'  # URL parameter style
    ]

    for pattern in patterns:
        match = re.search(pattern, clip_url)
        if match:
            return match.group(1)

    # If we can't extract, use the URL path
    parsed = urlparse(clip_url)
    if parsed.path:
        # Get last part of path
        path_parts = parsed.path.strip('/').split('/')
        if path_parts:
            return path_parts[-1]

    return None

@app.route('/detect', methods=['GET'])
def detect_heroes():
    """
    Process a Twitch clip URL or clip ID and return hero detection results.

    Query parameters:
    - url: The Twitch clip URL to process (required if clip_id not provided)
    - clip_id: The Twitch clip ID (required if url not provided)
    - debug: Enable debug mode (optional, default=False)
    - force: Force reprocessing even if cached (optional, default=False)
    """
    clip_url = request.args.get('url')
    clip_id = request.args.get('clip_id')
    debug = request.args.get('debug', 'false').lower() == 'true'
    force = request.args.get('force', 'false').lower() == 'true'

    # Check if either clip_url or clip_id is provided
    if not clip_url and not clip_id:
        return jsonify({'error': 'Missing required parameter: either url or clip_id must be provided'}), 400

    # If clip_id is provided but no url, construct the url
    if clip_id and not clip_url:
        clip_url = f"https://clips.twitch.tv/{clip_id}"
        logger.info(f"Constructed clip URL from ID: {clip_url}")
    # If only URL is provided, try to extract clip_id
    elif clip_url and not clip_id:
        extracted_clip_id = extract_clip_id(clip_url)
        if extracted_clip_id:
            clip_id = extracted_clip_id
            logger.info(f"Extracted clip ID from URL: {clip_id}")
        else:
            logger.warning(f"Could not extract clip ID from URL: {clip_url}")
            clip_id = clip_url  # Use URL as ID fallback

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

    # Check for cached result if not forced to reprocess
    if not force and clip_id:
        cached_result = db_client.get_clip_result(clip_id)
        if cached_result:
            logger.info(f"Returning cached result for clip ID: {clip_id}")
            return jsonify(cached_result)

    logger.info(f"Processing clip URL: {clip_url} (debug={debug}, force={force})")

    try:
        # Process the clip
        result = process_clip_url(
            clip_url=clip_url,
            debug=debug
        )

        if result and clip_id:
            # Cache the result
            success = db_client.save_clip_result(clip_id, clip_url, result)
            if success:
                logger.info(f"Cached result for clip ID: {clip_id}")
            else:
                logger.warning(f"Failed to cache result for clip ID: {clip_id}")

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

@app.route('/detect-stream', methods=['GET'])
def detect_heroes_from_stream():
    """
    Process a Twitch stream by username and return hero detection results.

    Query parameters:
    - username: The Twitch username of the streamer (required)
    - frames: Number of frames to capture and analyze (optional, default=3)
    - debug: Enable debug mode (optional, default=False)
    """
    username = request.args.get('username')
    num_frames = int(request.args.get('frames', '3'))
    debug = request.args.get('debug', 'false').lower() == 'true'

    # Check if username is provided
    if not username:
        return jsonify({'error': 'Missing required parameter: username'}), 400

    # Validate number of frames
    if num_frames < 1 or num_frames > 10:
        return jsonify({'error': 'Invalid frames parameter: must be between 1 and 10'}), 400

    logger.info(f"Processing stream for username: {username} (frames={num_frames}, debug={debug})")

    try:
        # Process the stream
        result = process_stream_username(
            username=username,
            debug=debug,
            num_frames=num_frames
        )

        if result:
            # Return the result as JSON
            return jsonify(result)
        else:
            return jsonify({'error': 'Failed to process stream or no heroes detected'}), 404

    except Exception as e:
        logger.error(f"Error processing stream: {str(e)}", exc_info=True)
        error_details = {
            'error': 'Error processing stream',
            'message': str(e),
            'trace': traceback.format_exc() if debug else None
        }
        return jsonify(error_details), 500

def main():
    """Main entry point for the API server."""
    global heroes_data

    # Check if hero assets exist, and download them if not
    logger.info("Checking for hero assets...")
    try:
        hero_data = get_hero_data()
        logger.info(f"Found {len(hero_data)} heroes with assets")

        # Ensure hero templates are preloaded at server startup
        if heroes_data is None:
            logger.info("Preloading hero templates before server start...")
            heroes_data = load_heroes_data()
            if heroes_data:
                logger.info(f"Successfully preloaded templates for {len(heroes_data)} heroes")
            else:
                logger.error("Failed to preload hero templates")
    except Exception as e:
        logger.error(f"Error loading hero data: {e}")
        logger.info("You may need to run 'download-heroes' command first")
        return

    # Initialize PostgreSQL client
    logger.info("Initializing PostgreSQL client...")
    if db_client.initialize():
        logger.info("PostgreSQL client initialized successfully")
    else:
        logger.warning("Failed to initialize PostgreSQL client, caching will be disabled")

    # Get port from environment variable or use default
    port = int(os.environ.get('PORT', 5000))

    # Start the server
    logger.info(f"Starting Dota 2 Hero Detection API server on port {port}")
    app.run(host='0.0.0.0', port=port)

if __name__ == '__main__':
    main()
