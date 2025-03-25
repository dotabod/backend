#!/usr/bin/env python3
"""
Dota 2 Hero Detection API Server

This module provides a Flask-based web service to process Twitch clip URLs
and return Dota 2 hero detection results as JSON.
"""

import os
import json
import logging
from flask import Flask, request, jsonify, Response, send_file
from urllib.parse import urlparse
import traceback
import re
from pathlib import Path

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
# Define the directory for storing frame images
TEMP_DIR = Path(os.path.dirname(os.path.abspath(__file__))).parent / "temp"
TEMP_DIR.mkdir(exist_ok=True)
IMAGE_DIR = TEMP_DIR / "frames"
IMAGE_DIR.mkdir(exist_ok=True, parents=True)

# Allowed image extensions for security
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png'}

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
@app.route('/images/<filename>', methods=['GET'])
def serve_image(filename):
    """Serve the frame image with security checks."""
    try:
        # Reject filenames with path components
        if '/' in filename or '\\' in filename or '..' in filename:
            logger.warning(f"Attempted path traversal with invalid characters: {filename}")
            return jsonify({'error': 'Invalid filename'}), 400

        # Sanitize filename to prevent path traversal attacks
        filename = os.path.basename(filename)

        # Validate file extension
        if '.' not in filename or filename.rsplit('.', 1)[1].lower() not in ALLOWED_EXTENSIONS:
            logger.warning(f"Invalid file extension requested: {filename}")
            return jsonify({'error': 'Invalid file type'}), 400

        # Construct safe path and check if it exists within IMAGE_DIR
        image_path = IMAGE_DIR / filename

        # Convert to absolute paths for strict comparison
        image_abs_path = os.path.abspath(image_path)
        image_dir_abs_path = os.path.abspath(IMAGE_DIR)

        # Ensure the file path is strictly within IMAGE_DIR
        if not image_abs_path.startswith(image_dir_abs_path + os.sep):
            logger.warning(f"Attempted directory traversal: {filename}")
            return jsonify({'error': 'Access denied'}), 403

        if not image_path.exists() or not image_path.is_file():
            logger.warning(f"Image not found or is not a file: {filename}")
            return jsonify({'error': 'Image not found'}), 404

        # Additional check to verify the file is within the IMAGE_DIR (prevent symlink attacks)
        try:
            if not image_path.resolve().is_relative_to(IMAGE_DIR.resolve()):
                logger.warning(f"Attempted symlink attack: {filename}")
                return jsonify({'error': 'Access denied'}), 403
        except (ValueError, RuntimeError) as e:
            logger.warning(f"Path resolution error for {filename}: {e}")
            return jsonify({'error': 'Access denied'}), 403

        # Set security headers
        response = send_file(image_path, mimetype=f'image/{image_path.suffix[1:]}')
        response.headers['Content-Security-Policy'] = "default-src 'self'"
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        return response
    except Exception as e:
        logger.error(f"Error serving image {filename}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

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

def get_image_url(frame_path, clip_id):
    """
    Copy the frame image to the public image directory and return its URL.

    Args:
        frame_path: Path to the original frame
        clip_id: The clip ID for uniqueness

    Returns:
        The URL to access the image
    """
    import shutil
    from datetime import datetime

    # Create a unique filename based on clip ID and timestamp
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{clip_id}_{timestamp}.jpg"
    dest_path = IMAGE_DIR / filename

    try:
        # Copy the image to our public directory
        shutil.copy2(frame_path, dest_path)

        # Generate URL path
        # Get the host from the request
        host_url = request.host_url.rstrip('/')
        image_url = f"{host_url}/images/{filename}"

        logger.info(f"Saved frame image: {dest_path}, URL: {image_url}")
        return image_url
    except Exception as e:
        logger.error(f"Error copying frame image: {e}")
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
    - include_image: Include frame image URL in response (optional, default=False)
    """
    clip_url = request.args.get('url')
    clip_id = request.args.get('clip_id')
    debug = request.args.get('debug', 'false').lower() == 'true'
    force = request.args.get('force', 'false').lower() == 'true'
    include_image = request.args.get('include_image', 'true').lower() == 'true'

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

            # If we need to include the image but it's not in the cached result
            if include_image and 'frame_image_url' not in cached_result and 'best_frame_path' in cached_result:
                frame_path = cached_result.get('best_frame_path')
                if frame_path and Path(frame_path).exists():
                    image_url = get_image_url(frame_path, clip_id)
                    if image_url:
                        cached_result['frame_image_url'] = image_url
                        # Update the cache with the image URL
                        db_client.save_clip_result(clip_id, clip_url, cached_result)
            return jsonify(cached_result)

    logger.info(f"Processing clip URL: {clip_url} (debug={debug}, force={force}, include_image={include_image})")

    try:
        # Process the clip
        result = process_clip_url(
            clip_url=clip_url,
            debug=debug
        )
        if result:
            # Add frame image URL if requested
            if include_image and 'best_frame_info' in result and 'frame_path' in result['best_frame_info']:
                frame_path = result['best_frame_info']['frame_path']
                image_url = get_image_url(frame_path, clip_id)
                if image_url:
                    result['frame_image_url'] = image_url
                    # Store the actual frame path for potential future use
                    result['best_frame_path'] = str(frame_path)

            if clip_id:
                # Cache the result
                success = db_client.save_clip_result(clip_id, clip_url, result)
                if success:
                    logger.info(f"Cached result for clip ID: {clip_id}")
                else:
                    logger.warning(f"Failed to cache result for clip ID: {clip_id}")

                    # Try to include the image even if we couldn't cache the result
                    if include_image and 'frame_image_url' not in result and 'best_frame_info' in result and 'frame_path' in result['best_frame_info']:
                        frame_path = result['best_frame_info']['frame_path']
                        image_url = get_image_url(frame_path, clip_id)
                        if image_url:
                            result['frame_image_url'] = image_url
                            result['best_frame_path'] = str(frame_path)

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
    - include_image: Include frame image URL in response (optional, default=False)
    """
    username = request.args.get('username')
    num_frames = int(request.args.get('frames', '3'))
    debug = request.args.get('debug', 'false').lower() == 'true'
    include_image = request.args.get('include_image', 'false').lower() == 'true'

    # Check if username is provided
    if not username:
        return jsonify({'error': 'Missing required parameter: username'}), 400

    # Validate number of frames
    if num_frames < 1 or num_frames > 10:
        return jsonify({'error': 'Invalid frames parameter: must be between 1 and 10'}), 400

    logger.info(f"Processing stream for username: {username} (frames={num_frames}, debug={debug}, include_image={include_image})")

    try:
        # Process the stream
        result = process_stream_username(
            username=username,
            debug=debug,
            num_frames=num_frames
        )

        if result:
            # Add frame image URL if requested
            if include_image and 'best_frame_info' in result and 'frame_path' in result['best_frame_info']:
                frame_path = result['best_frame_info']['frame_path']
                image_url = get_image_url(frame_path, f"stream_{username}")
                if image_url:
                    result['frame_image_url'] = image_url
                    # Store the actual frame path for potential future use
                    result['best_frame_path'] = str(frame_path)

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
