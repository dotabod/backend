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
import time
import threading
from threading import Lock
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

# Global lock for queue processing
queue_lock = Lock()
# Flag to indicate if worker thread is running
worker_running = False

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

def start_worker_thread():
    """Start the worker thread to process queued requests if not already running."""
    global worker_running

    if not worker_running:
        worker_thread = threading.Thread(target=process_queue_worker, daemon=True)
        worker_thread.start()
        worker_running = True
        logger.info("Started queue worker thread")

def process_queue_worker():
    """Worker thread function to process queued requests."""
    global worker_running

    logger.info("Queue worker thread started")

    try:
        while True:
            with queue_lock:
                # Check if there's a request being processed
                if db_client.is_queue_processing():
                    logger.debug("A request is already being processed, waiting...")
                    continue

                # Get the next pending request
                request = db_client.get_next_pending_request()

                if not request:
                    # No pending requests, sleep and check again
                    worker_running = False
                    break

                # Mark the request as processing
                db_client.update_queue_status(request['request_id'], 'processing')

            # Process the request outside the lock to allow new requests to be added
            result = None
            error = None
            start_time = time.time()

            try:
                if request['request_type'] == 'clip':
                    result = process_clip_request(
                        request['clip_url'],
                        request['clip_id'],
                        request['debug'],
                        request['force'],
                        request['include_image'],
                        add_to_queue=False,  # Don't re-queue
                        from_worker=True     # Indicate this is called from worker thread
                    )
                    logger.info(f"Processed clip request: {request['request_id']}")
                elif request['request_type'] == 'stream':
                    result = process_stream_request(
                        request['stream_username'],
                        request['num_frames'],
                        request['debug'],
                        request['include_image'],
                        add_to_queue=False,  # Don't re-queue
                        from_worker=True     # Indicate this is called from worker thread
                    )
                    logger.info(f"Processed stream request: {request['request_id']}")
                else:
                    error = f"Unknown request type: {request['request_type']}"
            except Exception as e:
                error = str(e)
                logger.error(f"Error processing queued request {request['request_id']}: {error}")
                logger.error(traceback.format_exc())

            processing_time = time.time() - start_time
            logger.info(f"Request {request['request_id']} processed in {processing_time:.2f} seconds")

            with queue_lock:
                if error:
                    db_client.update_queue_status(request['request_id'], 'failed')
                else:
                    # Update result with processing time
                    if result and isinstance(result, dict):
                        result['processing_time'] = f"{processing_time:.2f}s"

                        # For clip requests, also save processing time in results table
                        if request['request_type'] == 'clip' and request['clip_id']:
                            # Skip saving frame_image_url since that requires an active request context
                            if 'frame_image_url' in result:
                                del result['frame_image_url']

                            db_client.save_clip_result(
                                request['clip_id'],
                                request['clip_url'],
                                result,
                                processing_time
                            )

                    db_client.update_queue_status(request['request_id'], 'completed', result_id=request.get('clip_id'))

            # Small sleep to prevent high CPU usage
            time.sleep(0.1)
    except Exception as e:
        logger.error(f"Queue worker thread error: {e}")
        logger.error(traceback.format_exc())
    finally:
        with queue_lock:
            worker_running = False
        logger.info("Queue worker thread stopped")

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint."""
    return jsonify({'status': 'ok', 'service': 'dota-hero-detection-api'})

@app.route('/queue/status/<request_id>', methods=['GET'])
def check_queue_status(request_id):
    """
    Check the status of a queued request.

    Parameters:
    - request_id: The unique ID of the request

    Returns:
    - Queue status information
    """
    queue_info = db_client.get_queue_status(request_id)

    if not queue_info:
        return jsonify({'error': 'Request not found'}), 404

    status_code = 200
    response = {
        'request_id': request_id,
        'status': queue_info['status'],
        'position': queue_info.get('position', 0),
        'created_at': queue_info.get('created_at'),
        'started_at': queue_info.get('started_at'),
        'completed_at': queue_info.get('completed_at'),
        'estimated_wait_seconds': queue_info.get('estimated_wait_seconds', 0),
        'estimated_completion_time': queue_info.get('estimated_completion_time')
    }

    # Add result ID for completed requests
    if queue_info['status'] in ('completed', 'failed'):
        response['result_id'] = queue_info.get('result_id')

        # For completed requests, add the result
        if queue_info['status'] == 'completed' and queue_info.get('result_id'):
            if queue_info['request_type'] == 'clip':
                cached_result = db_client.get_clip_result(queue_info['result_id'])
                if cached_result:
                    response['result'] = cached_result

    return jsonify(response), status_code

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

def process_clip_request(clip_url, clip_id, debug=False, force=False, include_image=True, add_to_queue=True, from_worker=False):
    """
    Process a clip URL and return the result or add it to the queue.

    Args:
        clip_url: The Twitch clip URL
        clip_id: The Twitch clip ID
        debug: Enable debug mode
        force: Force reprocessing even if cached
        include_image: Include image URL in the result
        add_to_queue: Add to queue instead of processing immediately
        from_worker: Whether this is being called from the worker thread

    Returns:
        The processing result or queue information
    """
    # Check for cached result if not forced to reprocess
    if not force and clip_id:
        cached_result = db_client.get_clip_result(clip_id)
        if cached_result:
            logger.info(f"Returning cached result for clip ID: {clip_id}")

            # If we need to include the image but it's not in the cached result
            if include_image and 'frame_image_url' not in cached_result and 'best_frame_path' in cached_result and not from_worker:
                frame_path = cached_result.get('best_frame_path')
                if frame_path and Path(frame_path).exists():
                    image_url = get_image_url(frame_path, clip_id)
                    if image_url:
                        cached_result['frame_image_url'] = image_url
                        # Update the cache with the image URL
                        db_client.save_clip_result(clip_id, clip_url, cached_result)
            return cached_result

    # If queuing is enabled, add to queue and return queue info
    if add_to_queue:
        request_id, queue_info = db_client.add_to_queue(
            request_type='clip',
            clip_id=clip_id,
            clip_url=clip_url,
            debug=debug,
            force=force,
            include_image=include_image
        )

        # Check if this is an existing request already in the queue
        if 'status' in queue_info and queue_info.get('status') in ('pending', 'processing'):
            # Create a response with queue status info
            response = {
                'queued': True,
                'request_id': request_id,
                'status': queue_info.get('status', 'pending'),
                'position': queue_info.get('position', 1),
                'estimated_wait_seconds': queue_info.get('estimated_wait_seconds', 0),
                'estimated_completion_time': queue_info.get('estimated_completion_time'),
            }

            if queue_info.get('status') == 'pending':
                response['message'] = 'This clip is already in the processing queue'
            elif queue_info.get('status') == 'processing':
                response['message'] = 'This clip is currently being processed'

            return response

        # Start worker thread if not running
        start_worker_thread()

        # Return queue status
        return {
            'queued': True,
            'request_id': request_id,
            'status': queue_info.get('status', 'pending'),
            'position': queue_info.get('position', 1),
            'estimated_wait_seconds': queue_info.get('estimated_wait_seconds', 0),
            'estimated_completion_time': queue_info.get('estimated_completion_time'),
            'message': 'Your request has been queued for processing'
        }

    # Process the clip directly
    logger.info(f"Processing clip URL: {clip_url} (debug={debug}, force={force}, include_image={include_image})")
    start_time = time.time()

    # Process the clip
    result = process_clip_url(
        clip_url=clip_url,
        debug=debug
    )

    processing_time = time.time() - start_time
    logger.info(f"Clip processed in {processing_time:.2f} seconds")

    if result:
        # Add processing time to result
        result['processing_time'] = f"{processing_time:.2f}s"

        # Add frame image URL if requested and not from worker thread
        if include_image and not from_worker and 'best_frame_info' in result and 'frame_path' in result['best_frame_info']:
            frame_path = result['best_frame_info']['frame_path']
            image_url = get_image_url(frame_path, clip_id)
            if image_url:
                result['frame_image_url'] = image_url
                # Store the actual frame path for potential future use
                result['best_frame_path'] = str(frame_path)

        if clip_id:
            # Skip saving frame_image_url when called from worker thread
            result_to_save = result.copy()
            if from_worker and 'frame_image_url' in result_to_save:
                del result_to_save['frame_image_url']

            # Cache the result
            success = db_client.save_clip_result(clip_id, clip_url, result_to_save, processing_time)
            if success:
                logger.info(f"Cached result for clip ID: {clip_id}")
            else:
                logger.warning(f"Failed to cache result for clip ID: {clip_id}")

                # Try to include the image even if we couldn't cache the result
                if include_image and not from_worker and 'frame_image_url' not in result and 'best_frame_info' in result and 'frame_path' in result['best_frame_info']:
                    frame_path = result['best_frame_info']['frame_path']
                    image_url = get_image_url(frame_path, clip_id)
                    if image_url:
                        result['frame_image_url'] = image_url
                        result['best_frame_path'] = str(frame_path)

        return result
    else:
        return {'error': 'Failed to process clip or no heroes detected'}

def process_stream_request(username, num_frames=3, debug=False, include_image=True, add_to_queue=True, from_worker=False):
    """
    Process a stream request and return the result or add it to the queue.

    Args:
        username: The Twitch username
        num_frames: Number of frames to capture
        debug: Enable debug mode
        include_image: Include image URL in the result
        add_to_queue: Add to queue instead of processing immediately
        from_worker: Whether this is being called from the worker thread

    Returns:
        The processing result or queue information
    """
    # If queuing is enabled, add to queue and return queue info
    if add_to_queue:
        request_id, queue_info = db_client.add_to_queue(
            request_type='stream',
            stream_username=username,
            num_frames=num_frames,
            debug=debug,
            include_image=include_image
        )

        # Check if this is an existing request already in the queue
        if 'status' in queue_info and queue_info.get('status') in ('pending', 'processing'):
            # Create a response with queue status info
            response = {
                'queued': True,
                'request_id': request_id,
                'status': queue_info.get('status', 'pending'),
                'position': queue_info.get('position', 1),
                'estimated_wait_seconds': queue_info.get('estimated_wait_seconds', 0),
                'estimated_completion_time': queue_info.get('estimated_completion_time'),
            }

            if queue_info.get('status') == 'pending':
                response['message'] = 'This stream is already in the processing queue'
            elif queue_info.get('status') == 'processing':
                response['message'] = 'This stream is currently being processed'

            return response

        # Start worker thread if not running
        start_worker_thread()

        # Return queue status
        return {
            'queued': True,
            'request_id': request_id,
            'status': queue_info.get('status', 'pending'),
            'position': queue_info.get('position', 1),
            'estimated_wait_seconds': queue_info.get('estimated_wait_seconds', 0),
            'estimated_completion_time': queue_info.get('estimated_completion_time'),
            'message': 'Your request has been queued for processing'
        }

    # Process the stream directly
    logger.info(f"Processing stream for username: {username} (frames={num_frames}, debug={debug}, include_image={include_image})")
    start_time = time.time()

    # Process the stream
    result = process_stream_username(
        username=username,
        debug=debug,
        num_frames=num_frames
    )

    processing_time = time.time() - start_time
    logger.info(f"Stream processed in {processing_time:.2f} seconds")

    if result:
        # Add processing time to result
        result['processing_time'] = f"{processing_time:.2f}s"

        # Add frame image URL if requested and not from worker thread
        if include_image and not from_worker and 'best_frame_info' in result and 'frame_path' in result['best_frame_info']:
            frame_path = result['best_frame_info']['frame_path']
            image_url = get_image_url(frame_path, f"stream_{username}")
            if image_url:
                result['frame_image_url'] = image_url
                # Store the actual frame path for potential future use
                result['best_frame_path'] = str(frame_path)

        return result
    else:
        return {'error': 'Failed to process stream or no heroes detected'}

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
    - queue: Use queue system (optional, default=True)
    """
    clip_url = request.args.get('url')
    clip_id = request.args.get('clip_id')
    debug = request.args.get('debug', 'false').lower() == 'true'
    force = request.args.get('force', 'false').lower() == 'true'
    include_image = request.args.get('include_image', 'true').lower() == 'true'
    use_queue = request.args.get('queue', 'true').lower() == 'true'

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

    try:
        # Process the clip or add to queue
        result = process_clip_request(
            clip_url=clip_url,
            clip_id=clip_id,
            debug=debug,
            force=force,
            include_image=include_image,
            add_to_queue=use_queue
        )

        # Return the result
        return jsonify(result)

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
    - queue: Use queue system (optional, default=True)
    """
    username = request.args.get('username')
    num_frames = int(request.args.get('frames', '3'))
    debug = request.args.get('debug', 'false').lower() == 'true'
    include_image = request.args.get('include_image', 'false').lower() == 'true'
    use_queue = request.args.get('queue', 'true').lower() == 'true'

    # Check if username is provided
    if not username:
        return jsonify({'error': 'Missing required parameter: username'}), 400

    # Validate number of frames
    if num_frames < 1 or num_frames > 10:
        return jsonify({'error': 'Invalid frames parameter: must be between 1 and 10'}), 400

    try:
        # Process the stream or add to queue
        result = process_stream_request(
            username=username,
            num_frames=num_frames,
            debug=debug,
            include_image=include_image,
            add_to_queue=use_queue
        )

        # Return the result
        return jsonify(result)

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

    # Run database migrations first
    try:
        logger.info("Running database migrations...")
        # Import here to avoid circular imports
        from db_migration import run_migrations
        if run_migrations():
            logger.info("Database migrations completed successfully")
        else:
            logger.warning("Database migrations failed, some features may not work correctly")
    except Exception as e:
        logger.error(f"Error running database migrations: {e}")
        logger.warning("Continuing without migrations, some features may not work correctly")

    # Initialize PostgreSQL client
    logger.info("Initializing PostgreSQL client...")
    if db_client.initialize():
        logger.info("PostgreSQL client initialized successfully")
    else:
        logger.warning("Failed to initialize PostgreSQL client, caching will be disabled")

    # Start the worker thread
    start_worker_thread()

    # Get port from environment variable or use default
    port = int(os.environ.get('PORT', 5000))

    # Start the server
    logger.info(f"Starting Dota 2 Hero Detection API server on port {port}")
    app.run(host='0.0.0.0', port=port)

if __name__ == '__main__':
    main()
