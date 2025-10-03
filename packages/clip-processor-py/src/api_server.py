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
import difflib
import unicodedata
from urllib.parse import urlparse
import traceback
import re
import time
import threading
from threading import Lock
from pathlib import Path
import psycopg2
from datetime import datetime, timedelta
from functools import wraps

# Configure logging
log_dir = os.path.join(os.path.dirname(__file__), 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, 'api_server.log')
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

logger.info("=== API Server logging initialized ===")

# Import the hero detection and hero data modules
try:
    from dota_hero_detection import process_clip_url, process_stream_username, load_heroes_data
    from dota_heroes import get_hero_data
    from src.postgresql_client import db_client
except ImportError as e:
    # Try with relative import for different directory structures
    try:
        from .dota_hero_detection import process_clip_url, process_stream_username, load_heroes_data
        from .dota_heroes import get_hero_data
        from src.postgresql_client import db_client
    except ImportError as rel_e:
        logger.error(f"Error: Could not import required modules. First error: {e}, Second error: {rel_e}")
        logger.error("Make sure you're running this from the correct directory.")
        logger.error(f"Current Python path: {os.environ.get('PYTHONPATH', 'Not set')}")
        import sys
        logger.error(f"System path: {sys.path}")
        exit(1)

# Global variable to store preloaded hero data
heroes_data = None

# Create Flask app
app = Flask(__name__)
# Define the API key for authentication
API_KEY = os.environ.get('VISION_API_KEY')
if not API_KEY and os.environ.get('RUN_LOCALLY') != 'true':
    logger.error("No API key found. Set VISION_API_KEY environment variable.")
    raise ValueError("VISION_API_KEY environment variable must be set")

# Authentication decorator
def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # If running locally, skip authentication
        if os.environ.get('RUN_LOCALLY') == 'true':
            return f(*args, **kwargs)

        provided_key = request.headers.get('X-API-Key')
        if provided_key and provided_key == API_KEY:
            return f(*args, **kwargs)
        else:
            logger.warning(f"Unauthorized access attempt: {request.remote_addr} - {request.path}")
            return jsonify({'error': 'Unauthorized. Valid API key required.'}), 401
    return decorated_function

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
# Flag to track if app is initialized
app_initialized = False

def initialize_app():
    """Initialize the application - load hero data, setup database, start worker thread."""
    global heroes_data, app_initialized

    # Only initialize once
    if app_initialized:
        logger.info("App already initialized, skipping initialization")
        return True

    try:
        # Step 1: Load hero data
        logger.info("Loading hero data...")
        heroes_data = load_heroes_data()
        if not heroes_data:
            logger.error("Failed to load hero templates")
            return False
        logger.info(f"Successfully loaded templates for {len(heroes_data)} heroes")

        # Step 1.5: Load hero abilities
        logger.info("Loading hero abilities...")
        hero_abilities = get_hero_data()
        if not hero_abilities:
            logger.error("Failed to load hero abilities")
            return False
        logger.info(f"Successfully loaded abilities for {len(hero_abilities)} heroes")

        # Step 2: Run database migrations
        try:
            logger.info("Running database migrations...")
            # Import here to avoid circular imports
            from src.db_migration import run_migrations
            if run_migrations():
                logger.info("Database migrations completed successfully")
            else:
                logger.warning("Database migrations failed, some features may not work correctly")
        except Exception as e:
            logger.error(f"Error running database migrations: {e}")
            logger.warning("Continuing without migrations, some features may not work correctly")

        # Step 3: Initialize PostgreSQL client
        logger.info("Initializing PostgreSQL client...")
        if not db_client.initialize():
            logger.error("Failed to initialize PostgreSQL client, caching will be disabled")
            # We still continue as this is not fatal
        else:
            logger.info("PostgreSQL client initialized successfully")

        # Step 4: Start the worker thread
        logger.info("Starting worker thread...")
        start_worker_thread()

        # Step 5: Start the worker monitoring thread
        if os.environ.get('RUN_LOCALLY') != 'true':
            start_worker_monitor()

        # Mark as initialized
        app_initialized = True
        logger.info("Application initialization complete")
        return True

    except Exception as e:
        logger.error(f"Error during app initialization: {e}")
        logger.error(traceback.format_exc())
        return False

def start_worker_thread():
    """Start the worker thread to process queued requests if not already running."""
    global worker_running
    # Don't start worker thread if running locally
    if os.environ.get('RUN_LOCALLY') == 'true':
        logger.info("Running locally, not starting worker thread")
        return

    if not worker_running:
        worker_thread = threading.Thread(target=process_queue_worker, daemon=True)
        worker_thread.start()
        worker_running = True
        logger.info("Started queue worker thread")
    else:
        logger.debug("Worker thread is already running")

def start_worker_monitor():
    """Start a thread to monitor the worker thread and restart it if needed."""
    def check_worker_thread():
        logger.info(f"Checking worker thread status. Current status: running={worker_running}")
        if not worker_running:
            logger.info("Worker thread not running, restarting it...")
            start_worker_thread()

        # Also check for stuck requests
        reset_stuck_processing_requests()

    def periodic_worker_check():
        while True:
            time.sleep(30)  # Check every 30 seconds
            check_worker_thread()

    # Start the monitor thread
    monitor_thread = threading.Thread(target=periodic_worker_check, daemon=True)
    monitor_thread.start()
    logger.info("Started worker monitoring thread")

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
                    # Sleep briefly to avoid tight loop
                    time.sleep(1)
                    continue

                # Get the next pending request
                request = db_client.get_next_pending_request()
                logger.info(f"Next pending request: {request}")

                if not request:
                    # No pending requests, sleep and check again instead of exiting
                    logger.debug("No pending requests in the queue, checking again in 5 seconds")
                    # Don't set worker_running to False here anymore

            # If no requests, sleep outside the lock to prevent holding it
            if not request:
                time.sleep(5)  # Check for new requests every 5 seconds
                continue

            # If we have a request, process it
            with queue_lock:
                # Mark the request as processing
                db_client.update_queue_status(request['request_id'], 'processing')
                logger.info(f"Processing request {request['request_id']} from queue")

            # Process the request outside the lock to allow new requests to be added
            result = None
            error = None
            start_time = time.time()

            try:
                if request['request_type'] == 'clip':
                    # Check if there's already a completed result for this match_id
                    match_id = request.get('match_id')
                    if match_id and not request.get('force', False):
                        # Check if a previous request for this match has already completed successfully
                        match_status = db_client.check_for_match_processing(match_id)
                        if match_status and match_status.get('found') and match_status.get('status') == 'completed':
                            # If there's a completed result, use that instead of processing this request
                            existing_clip_id = match_status.get('clip_id')
                            logger.info(f"Match ID {match_id} already has a completed result for clip {existing_clip_id}, using that instead")
                            existing_result = db_client.get_clip_result(existing_clip_id)
                            if existing_result:
                                # Mark as completed but point to the existing result
                                db_client.update_queue_status(request['request_id'], 'completed', result_id=existing_clip_id)
                                logger.info(f"Using existing result for match ID {match_id}, request {request['request_id']}")
                                continue  # Skip to the next request

                    logger.info(f"Processing clip request: {request['clip_url']} ({request['request_id']})")
                    result = process_clip_request(
                        clip_url=request['clip_url'],
                        clip_id=request['clip_id'],
                        debug=request['debug'],
                        force=request['force'],
                        include_image=request['include_image'],
                        add_to_queue=False,  # Don't re-queue
                        from_worker=True,    # Indicate this is called from worker thread
                        match_id=request.get('match_id')  # Pass match_id if present
                    )
                    logger.info(f"Processed clip request: {request['request_id']}")

                    # Add image URL to database result for worker thread - using HTTP URL
                    if result and 'best_frame_info' in result and 'frame_path' in result['best_frame_info'] and request['clip_id']:
                        frame_path = result['best_frame_info']['frame_path']
                        # Create an HTTP URL for the image
                        if Path(frame_path).exists():
                            # Generate a URL for the image that can be accessed via HTTP
                            # Since we can't access request.host_url from the worker thread,
                            # save the frame_path and handle URL generation when serving the result
                            # We'll use a placeholder that will be replaced when the result is served
                            result['saved_image_path'] = f"__HOST_URL__/images/{request['clip_id']}.jpg"
                elif request['request_type'] == 'stream':
                    logger.info(f"Processing stream request: {request['stream_username']} ({request['request_id']})")
                    result = process_stream_request(
                        request['stream_username'],
                        request['num_frames'],
                        request['debug'],
                        request['include_image'],
                        add_to_queue=False,  # Don't re-queue
                        from_worker=True     # Indicate this is called from worker thread
                    )
                    logger.info(f"Processed stream request: {request['request_id']}")

                    # Same for stream requests - using HTTP URL
                    if result and 'best_frame_info' in result and 'frame_path' in result['best_frame_info']:
                        frame_path = result['best_frame_info']['frame_path']
                        if Path(frame_path).exists():
                            result['saved_image_path'] = f"__HOST_URL__/images/stream_{request['stream_username']}.jpg"
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
                    logger.error(f"Failed to process request {request['request_id']}: {error}")
                else:
                    # Check if result contains an error
                    if isinstance(result, dict) and ('error' in result or not result.get('players', [])):
                        db_client.update_queue_status(request['request_id'], 'failed')
                        logger.error(f"Failed to process request {request['request_id']}: {result.get('error', 'No heroes detected')}")
                    else:
                        # Update result with processing time
                        if result and isinstance(result, dict):
                            result['processing_time'] = f"{processing_time:.2f}s"

                            # For clip requests, also save processing time in results table
                            if request['request_type'] == 'clip' and request['clip_id']:
                                # Skip saving frame_image_url since that requires an active request context
                                if 'frame_image_url' in result:
                                    del result['frame_image_url']

                                # Replace placeholder with real host URL when the result is retrieved
                                db_client.save_clip_result(
                                    request['clip_id'],
                                    request['clip_url'],
                                    result,
                                    processing_time_seconds=processing_time,
                                    match_id=request.get('match_id')  # Pass match_id if present
                                )

                        db_client.update_queue_status(request['request_id'], 'completed', result_id=request.get('clip_id'))
                        logger.info(f"Completed processing request {request['request_id']}")

            # Small sleep to prevent high CPU usage
            time.sleep(0.1)
    except Exception as e:
        logger.error(f"Queue worker thread error: {e}")
        logger.error(traceback.format_exc())
    finally:
        with queue_lock:
            worker_running = False
        logger.info("Queue worker thread stopped")

# Initialize app before first request
@app.before_request
def before_first_request():
    """Ensure app is initialized before handling the first request."""
    if not app_initialized:
        logger.info("Initializing app before first request...")
        initialize_app()

# Health check endpoint - no authentication required
@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint."""
    return jsonify({'status': 'ok', 'service': 'dota-hero-detection-api'})

# All other endpoints require authentication
@app.route('/queue/debug', methods=['GET'])
@require_api_key
def debug_queue():
    """
    Debug endpoint to check the queue status and worker thread.

    This is for administrative use only.
    """
    try:
        # Ensure the app is initialized
        if not app_initialized:
            initialize_app()

        # Get all pending requests
        conn = db_client._get_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Get counts of requests by status
        cursor.execute(f"SELECT status, COUNT(*) FROM {db_client.queue_table} GROUP BY status")
        status_counts = cursor.fetchall()

        # Get the 10 most recent requests
        cursor.execute(f"""
            SELECT request_id, request_type, status, created_at, started_at, completed_at, clip_id, match_id
            FROM {db_client.queue_table}
            ORDER BY created_at DESC
            LIMIT 10
        """)
        recent_requests = cursor.fetchall()

        # Format datetime objects for JSON and prepare force processing URL
        for req in recent_requests:
            # First pass: format datetime objects
            for key, value in list(req.items()):
                if isinstance(value, datetime):
                    req[key] = value.isoformat()

            # Second pass: add force processing URL if clip_id and match_id exist
            if 'clip_id' in req and 'match_id' in req:
                req['force_process_again'] = f"http://localhost:5000/detect?clip_id={req['clip_id']}&force=true&match_id={req['match_id']}"

        cursor.close()
        db_client._return_connection(conn)

        # Check worker thread status
        worker_status = "running" if worker_running else "not running"

        # Manual restart option
        restart = request.args.get('restart', 'false').lower() == 'true'
        if restart and not worker_running:
            start_worker_thread()
            worker_status = "restarted"

        # Manual reset stuck processing requests option
        reset_stuck = request.args.get('reset_stuck', 'false').lower() == 'true'
        if reset_stuck:
            num_reset = reset_stuck_processing_requests()
            worker_status = f"{worker_status}, reset {num_reset} stuck requests"

        return jsonify({
            'worker_status': worker_status,
            'app_initialized': app_initialized,
            'queue_status': [dict(row) for row in status_counts],
            'recent_requests': [dict(row) for row in recent_requests]
        })
    except Exception as e:
        logger.error(f"Error in debug endpoint: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'error': str(e),
            'trace': traceback.format_exc()
        }), 500

@app.route('/queue/status/<request_id>', methods=['GET'])
@require_api_key
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
        'clip_id': queue_info.get('clip_id'),
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
                    # Replace placeholder with real host URL
                    if 'saved_image_path' in cached_result and cached_result['saved_image_path'] and '__HOST_URL__' in cached_result['saved_image_path']:
                        host_url = request.host_url.rstrip('/')
                        cached_result['saved_image_path'] = cached_result['saved_image_path'].replace('__HOST_URL__', host_url)

                    response['result'] = cached_result

    return jsonify(response), status_code

@app.route('/images/<filename>', methods=['GET'])
@require_api_key
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
        Tuple of (image URL, full HTTP path to saved image)
    """
    import shutil

    # Create a unique filename based on clip ID and timestamp
    filename = f"{clip_id}.jpg"
    dest_path = IMAGE_DIR / filename

    try:
        # Copy the image to our public directory
        shutil.copy2(frame_path, dest_path)

        # Generate URL path
        # Get the host from the request
        host_url = request.host_url.rstrip('/')
        image_url = f"{host_url}/images/{filename}"

        logger.info(f"Saved frame image: {dest_path}, URL: {image_url}")
        return image_url, image_url  # Return the HTTP URL twice, once for image_url and once for saved_image_path
    except Exception as e:
        logger.error(f"Error copying frame image: {e}")
        return None, None

def _normalize_name(s: str) -> str:
    """Normalize names for matching across Latin and Cyrillic.

    - Lowercase
    - Unicode NFKD normalize
    - Map common Cyrillic/Latin confusables to a shared ASCII skeleton
    - Keep only alphanumeric characters (Unicode), drop spaces/punct
    """
    if not s:
        return ''
    s = unicodedata.normalize('NFKD', s).lower().strip()

    # Map common confusables (Cyrillic -> Latin skeleton)
    conf = {
        'а': 'a', 'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'å': 'a',
        'е': 'e', 'ё': 'e', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
        'о': 'o', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o',
        'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'к': 'k', 'в': 'v',
        'м': 'm', 'т': 't', 'н': 'n', 'г': 'g', 'і': 'i', 'ї': 'i', 'й': 'i',
        'б': 'b', 'д': 'd', 'ж': 'zh', 'з': 'z', 'и': 'i', 'л': 'l', 'п': 'p', 'ф': 'f', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ы': 'y', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    }
    mapped = []
    for ch in s:
        if ch in conf:
            mapped.append(conf[ch])
        else:
            mapped.append(ch)
    s = ''.join(mapped)

    # Keep alnum only
    return ''.join(ch for ch in s if ch.isalnum())


def _align_players_with_draft(players: list, draft_order: list, min_ratio: float = 0.7):
    """Return mapping and reordered players based on draft order names using tolerant fuzzy match.

    Rules (in priority):
      1) exact normalized match
      2) substring containment (either direction)
      3) token overlap (>= 0.5)
      4) difflib ratio (>= min_ratio)
    """
    def tokens(s: str):
        # split by spaces after unicode normalization; keep tokens length>=2
        t = [t for t in re.split(r"\s+", s) if len(t) >= 2]
        return t or ([s] if s else [])

    current_raw = [p.get('player_name', '') or '' for p in players]
    draft_raw = [n or '' for n in draft_order]

    current_norm = [_normalize_name(x) for x in current_raw]
    draft_norm = [_normalize_name(x) for x in draft_raw]

    current_tokens = [tokens(x) for x in current_norm]
    draft_tokens = [tokens(x) for x in draft_norm]

    # Step 1: exact matches
    unmatched_current = set(range(len(players)))
    unmatched_draft = set(i for i, n in enumerate(draft_norm) if n)
    mapping = {}

    for di in list(unmatched_draft):
        dn = draft_norm[di]
        if not dn:
            continue
        for ci in list(unmatched_current):
            if dn and dn == current_norm[ci] and dn != '':
                mapping[di] = ci
                unmatched_draft.discard(di)
                unmatched_current.discard(ci)
                break

    # Build candidate scores for remaining pairs and greedy assign
    candidates = []
    for di in list(unmatched_draft):
        dn = draft_norm[di]
        if not dn:
            continue
        dtoks = set(draft_tokens[di])
        for ci in list(unmatched_current):
            cn = current_norm[ci]
            if not cn:
                continue
            ctoks = set(current_tokens[ci])
            # Exact already handled; compute features
            contain = 0
            if dn and cn and (dn in cn or cn in dn):
                contain = 1
            # token overlap
            overlap = 0.0
            if dtoks:
                matches = sum(1 for t in dtoks if any(t in c for c in ctoks))
                overlap = matches / max(1, len(dtoks))
            # diff ratio
            ratio = difflib.SequenceMatcher(None, dn, cn).ratio()
            # numeric alignment bonus
            num_bonus = 0.05 if (re.match(r"^\d+", draft_raw[di] or '') and re.match(r"^\d+", current_raw[ci] or '')) else 0.0

            # Build score
            if contain:
                score = 1.10 + num_bonus
            elif overlap >= 0.6:
                score = 1.00 + (overlap - 0.6) * 0.5 + num_bonus
            else:
                score = ratio + num_bonus

            # Keep only reasonable candidates
            if contain or overlap >= 0.5 or ratio >= min_ratio:
                candidates.append((score, di, ci))

    # Greedy assignment by highest score
    candidates.sort(key=lambda x: x[0], reverse=True)
    for score, di, ci in candidates:
        if di in unmatched_draft and ci in unmatched_current:
            mapping[di] = ci
            unmatched_draft.discard(di)
            unmatched_current.discard(ci)

    # Build reordered players
    players_reordered = [None] * len(draft_order)
    for di, ci in mapping.items():
        if 0 <= ci < len(players):
            players_reordered[di] = players[ci]

    return mapping, players_reordered


def _refine_alignment_with_captains_and_leftovers(mapping, players, draft_order, draft_info, strategy_captains=None):
    """Refine mapping by using captains anchors and assigning remaining pairs.

    - Force map draft index 0 (Radiant captain) and 1 (Dire captain) to names in result['captains']
      if present and still unmatched.
    - If exactly one or two pairs remain, assign greedily using the same scoring as alignment,
      but without minimum thresholds.
    """
    # Build current state
    current_norm = [_normalize_name(p.get('player_name', '') or '') for p in players]
    draft_norm = [_normalize_name(n or '') for n in draft_order]

    unmatched_draft = set(i for i, n in enumerate(draft_norm) if i not in mapping and n)
    unmatched_current = set(i for i in range(len(players)) if i not in mapping.values())

    # 1) Anchor captains if available
    # Prefer draft captains as ground truth; fallback to strategy captains if draft missing
    caps = (draft_info.get('captains') if isinstance(draft_info, dict) else None) or (strategy_captains or {})
    cap_map = {0: caps.get('Radiant'), 1: caps.get('Dire')}
    for di, cap_name in cap_map.items():
        if cap_name and di in unmatched_draft:
            cnorm = _normalize_name(cap_name)
            # Find exact normalized match among unmatched current
            for ci in list(unmatched_current):
                if current_norm[ci] and current_norm[ci] == cnorm:
                    mapping[di] = ci
                    unmatched_draft.discard(di)
                    unmatched_current.discard(ci)
                    break

    # 2) If leftovers remain (1-3 pairs), assign by best score without thresholds
    if unmatched_draft and unmatched_current:
        # reuse scoring from alignment
        def tokens(s: str):
            t = [t for t in re.split(r"\s+", s) if len(t) >= 2]
            return t or ([s] if s else [])

        draft_tokens = [tokens(x) for x in draft_norm]
        current_tokens = [tokens(x) for x in current_norm]

        candidates = []
        for di in list(unmatched_draft):
            dn = draft_norm[di]
            if not dn:
                continue
            dtoks = set(draft_tokens[di])
            for ci in list(unmatched_current):
                cn = current_norm[ci]
                if not cn:
                    continue
                ctoks = set(current_tokens[ci])
                contain = 1 if (dn in cn or cn in dn) else 0
                overlap = 0.0
                if dtoks:
                    matches = sum(1 for t in dtoks if any(t in c for c in ctoks))
                    overlap = matches / max(1, len(dtoks))
                ratio = difflib.SequenceMatcher(None, dn, cn).ratio()
                num_bonus = 0.05 if (re.match(r"^\d+", draft_order[di] or '') and re.match(r"^\d+", players[ci].get('player_name', '') or '')) else 0.0
                if contain:
                    score = 1.10 + num_bonus
                elif overlap > 0:
                    score = 0.9 + overlap * 0.2 + num_bonus
                else:
                    score = ratio + num_bonus
                candidates.append((score, di, ci))

        candidates.sort(key=lambda x: x[0], reverse=True)
        for score, di, ci in candidates:
            if di in unmatched_draft and ci in unmatched_current:
                mapping[di] = ci
                unmatched_draft.discard(di)
                unmatched_current.discard(ci)

    # Build reordered list
    players_reordered = [None] * len(draft_order)
    for di, ci in mapping.items():
        if 0 <= ci < len(players):
            players_reordered[di] = players[ci]

    return mapping, players_reordered


def process_clip_request(clip_url, clip_id, debug=False, force=False, include_image=True, add_to_queue=True, from_worker=False, match_id=None, only_draft=False):
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
        match_id: The Dota 2 match ID (required)

    Returns:
        The processing result or queue information
    """
    # If force is True, we skip all cache checks and directly process the clip
    if not force:
        # If we have a match_id, check if we already have a successful result for it
        if match_id:
            match_status = db_client.check_for_match_processing(match_id)
            if match_status and match_status.get('found') and match_status.get('status') == 'completed':
                # If there's a completed result, use that instead of processing this request
                existing_clip_id = match_status.get('clip_id')
                logger.info(f"Match ID {match_id} already has a completed result for clip {existing_clip_id}, using that instead")
                existing_result = db_client.get_clip_result(existing_clip_id)
                if existing_result:
                    # Replace placeholder with real host URL if needed
                    if 'saved_image_path' in existing_result and existing_result['saved_image_path'] and '__HOST_URL__' in existing_result['saved_image_path'] and not from_worker:
                        host_url = request.host_url.rstrip('/')
                        existing_result['saved_image_path'] = existing_result['saved_image_path'].replace('__HOST_URL__', host_url)

                    # Add match_id for context
                    existing_result['match_id'] = match_id
                    existing_result['clip_id'] = existing_clip_id

                    return existing_result

        # Check for cached result if not forced to reprocess
        if clip_id:
            cached_result = db_client.get_clip_result(clip_id)
            if cached_result:
                logger.info(f"Returning cached result for clip ID: {clip_id}")

                # If we need to include the image but it's not in the cached result
                if include_image and 'frame_image_url' not in cached_result and 'best_frame_path' in cached_result and not from_worker:
                    frame_path = cached_result.get('best_frame_path')
                    if frame_path and Path(frame_path).exists():
                        image_url, saved_image_path = get_image_url(frame_path, clip_id)
                        if image_url:
                            host_url = request.host_url.rstrip('/')
                            cached_result['saved_image_path'] = saved_image_path.replace('__HOST_URL__', host_url)
                            # Update the cache with the image URL
                            db_client.save_clip_result(clip_id, clip_url, cached_result, match_id=match_id)

                # Replace placeholder with real host URL if needed
                if 'saved_image_path' in cached_result and cached_result['saved_image_path'] and '__HOST_URL__' in cached_result['saved_image_path']:
                    host_url = request.host_url.rstrip('/')
                    cached_result['saved_image_path'] = cached_result['saved_image_path'].replace('__HOST_URL__', host_url)

                # For draft-only requests, return the cached draft payload as-is
                if only_draft:
                    return cached_result

                # Otherwise, return a filtered result (strategy)
                filtered_result = {
                    'saved_image_path': cached_result.get('saved_image_path'),
                    'players': cached_result.get('players', []),
                    'heroes': cached_result.get('heroes', [])
                }
                return filtered_result

    # Skip queueing when running locally
    if os.environ.get('RUN_LOCALLY') == 'true':
        add_to_queue = False
        logger.info("Running locally, processing clip immediately without using queue")

    # If queuing is enabled, add to queue and return queue info
    if add_to_queue:
        request_id, queue_info = db_client.add_to_queue(
            request_type='clip',
            clip_id=clip_id,
            clip_url=clip_url,
            debug=debug,
            force=force,
            include_image=include_image,
            match_id=match_id  # Pass match_id
        )

        # Check if this is an existing request already in the queue
        if 'status' in queue_info and queue_info.get('status') in ('pending', 'processing'):
            # Create a response with queue status info
            response = {
                'queued': True,
                'request_id': request_id,
                'clip_id': queue_info.get('clip_id'),
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
            'clip_id': queue_info.get('clip_id'),
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
        debug=debug,
        only_draft=only_draft
    )

    processing_time = time.time() - start_time
    logger.info(f"Clip processed in {processing_time:.2f} seconds")

    if result:
        # Add processing time to result
        result['processing_time'] = f"{processing_time:.2f}s"

        # Add frame image URL if requested and not from worker thread
        if include_image and not from_worker and 'best_frame_info' in result and 'frame_path' in result['best_frame_info']:
            frame_path = result['best_frame_info']['frame_path']
            image_url, saved_image_path = get_image_url(frame_path, clip_id)
            if image_url:
                result['frame_image_url'] = image_url
                result['saved_image_path'] = saved_image_path
                # Store the actual frame path for potential future use
                result['best_frame_path'] = str(frame_path)

        # If this is a non-draft result and match_id is provided, try to align with draft
        if match_id and not result.get('is_draft'):
            try:
                draft = db_client.get_latest_draft_for_match(match_id)
                if draft and draft.get('draft_player_order'):
                    # Prepare players list from result
                    players_list = result.get('players') or []
                    mapping, reordered = _align_players_with_draft(players_list, draft['draft_player_order'])

                    # Refinement: captains anchors and leftover resolution
                    mapping, reordered = _refine_alignment_with_captains_and_leftovers(
                        mapping,
                        players_list,
                        draft['draft_player_order'],
                        draft_info=draft,
                        strategy_captains=result.get('captains') if isinstance(result, dict) else None
                    )

                    # Assign stable player_id from draft index to current players and heroes
                    # Assumes players[] and heroes[] are in the same order as constructed
                    for di, ci in mapping.items():
                        try:
                            if 0 <= ci < len(players_list):
                                # Ensure player_id on players
                                result['players'][ci]['player_id'] = di
                                # Mirror onto heroes by same index, if present
                                if 'heroes' in result and 0 <= ci < len(result['heroes']):
                                    result['heroes'][ci]['player_id'] = di
                        except Exception:
                            pass

                    result['draft_alignment'] = {
                        'mapping': mapping,
                        'players_reordered': reordered,
                        'draft_player_order': draft['draft_player_order']
                    }
            except Exception as e:
                logger.warning(f"Draft alignment failed: {e}")

        if clip_id:
            # Skip saving frame_image_url when called from worker thread
            result_to_save = result.copy()
            if from_worker and 'frame_image_url' in result_to_save:
                del result_to_save['frame_image_url']

            # Cache the result
            success = db_client.save_clip_result(clip_id, clip_url, result_to_save, processing_time_seconds=processing_time, match_id=match_id)
            if success:
                logger.info(f"Cached result for clip ID: {clip_id}" + (f", match ID: {match_id}" if match_id else ""))
            else:
                logger.warning(f"Failed to cache result for clip ID: {clip_id}")

                # Try to include the image even if we couldn't cache the result
                if include_image and not from_worker and 'frame_image_url' not in result and 'best_frame_info' in result and 'frame_path' in result['best_frame_info']:
                    frame_path = result['best_frame_info']['frame_path']
                    image_url, saved_image_path = get_image_url(frame_path, clip_id)
                    if image_url:
                        result['frame_image_url'] = image_url
                        result['saved_image_path'] = saved_image_path
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
    # Skip queueing when running locally
    if os.environ.get('RUN_LOCALLY') == 'true':
        add_to_queue = False
        logger.info("Running locally, processing stream immediately without using queue")

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
                'clip_id': queue_info.get('clip_id'),
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
            'clip_id': queue_info.get('clip_id'),
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
            image_url, saved_image_path = get_image_url(frame_path, f"stream_{username}")
            if image_url:
                result['frame_image_url'] = image_url
                result['saved_image_path'] = saved_image_path
                # Store the actual frame path for potential future use
                result['best_frame_path'] = str(frame_path)

        return result
    else:
        return {'error': 'Failed to process stream or no heroes detected'}

@app.route('/detect', methods=['GET'])
@require_api_key
def detect_heroes():
    """
    Process a Twitch clip URL or clip ID and return hero detection results.

    Query parameters:
    - url: The Twitch clip URL to process (required if clip_id not provided)
    - clip_id: The Twitch clip ID (required if url not provided)
    - match_id: The Dota 2 match ID to associate with this clip (required)
    - debug: Enable debug mode (optional, default=False)
    - force: Force reprocessing even if cached (optional, default=False)
    - include_image: Include frame image URL in response (optional, default=False)
    - queue: Use queue system (optional, default=True)
    """
    clip_url = request.args.get('url')
    clip_id = request.args.get('clip_id')
    match_id = request.args.get('match_id')
    debug = request.args.get('debug', 'false').lower() == 'true'
    force = request.args.get('force', 'false').lower() == 'true'
    include_image = request.args.get('include_image', 'true').lower() == 'true'
    use_queue = request.args.get('queue', 'true').lower() == 'true'

    # When running locally, override queue parameter to process immediately
    if os.environ.get('RUN_LOCALLY') == 'true':
        use_queue = False
        logger.info("Running locally, overriding queue parameter to process immediately")

    # Check if match_id is provided
    if not match_id:
        return jsonify({'error': 'Missing required parameter: match_id'}), 400

    # Validate match_id is a number
    try:
        match_id = int(match_id)
    except ValueError:
        return jsonify({'error': 'Invalid match_id: must be a number'}), 400

    # Convert back to string for consistent handling in the rest of the code
    match_id = str(match_id)

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
            add_to_queue=use_queue,
            match_id=match_id  # Pass match_id to the function
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

@app.route('/detect_draft', methods=['GET'])
@require_api_key
def detect_draft():
    """
    Process a Twitch clip URL or clip ID and return draft detection results.

    Query parameters:
    - url: The Twitch clip URL to process (required if clip_id not provided)
    - clip_id: The Twitch clip ID (required if url not provided)
    - match_id: The Dota 2 match ID to associate with this clip (required)
    - debug: Enable debug mode (optional, default=False)
    - force: Force reprocessing even if cached (optional, default=False)
    - include_image: Include frame image URL in response (optional, default=False)
    - queue: Use queue system (optional, default=True)
    """
    clip_url = request.args.get('url')
    clip_id = request.args.get('clip_id')
    match_id = request.args.get('match_id')
    debug = request.args.get('debug', 'false').lower() == 'true'
    force = request.args.get('force', 'false').lower() == 'true'
    include_image = request.args.get('include_image', 'true').lower() == 'true'
    use_queue = request.args.get('queue', 'true').lower() == 'true'

    # When running locally, override queue parameter to process immediately
    if os.environ.get('RUN_LOCALLY') == 'true':
        use_queue = False
        logger.info("Running locally, overriding queue parameter to process immediately (draft)")

    # Check if match_id is provided
    if not match_id:
        return jsonify({'error': 'Missing required parameter: match_id'}), 400

    # Validate match_id is a number
    try:
        match_id = int(match_id)
    except ValueError:
        return jsonify({'error': 'Invalid match_id: must be a number'}), 400
    match_id = str(match_id)

    # Check if either clip_url or clip_id is provided
    if not clip_url and not clip_id:
        return jsonify({'error': 'Missing required parameter: either url or clip_id must be provided'}), 400

    # If clip_id is provided but no url, construct the url
    if clip_id and not clip_url:
        clip_url = f"https://clips.twitch.tv/{clip_id}"
        logger.info(f"Constructed clip URL from ID: {clip_url}")
    elif clip_url and not clip_id:
        extracted_clip_id = extract_clip_id(clip_url)
        if extracted_clip_id:
            clip_id = extracted_clip_id
            logger.info(f"Extracted clip ID from URL: {clip_id}")
        else:
            logger.warning(f"Could not extract clip ID from URL: {clip_url}")
            clip_id = clip_url  # Fallback

    try:
        result = process_clip_request(
            clip_url=clip_url,
            clip_id=clip_id,
            debug=debug,
            force=force,
            include_image=include_image,
            add_to_queue=use_queue,
            match_id=match_id,
            only_draft=True
        )

        return jsonify(result)
    except Exception as e:
        logger.error(f"Error processing draft clip: {str(e)}", exc_info=True)
        error_details = {
            'error': 'Error processing draft clip',
            'message': str(e),
            'trace': traceback.format_exc() if debug else None
        }
        return jsonify(error_details), 500

@app.route('/detect-stream', methods=['GET'])
@require_api_key
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

    # When running locally, override queue parameter to process immediately
    if os.environ.get('RUN_LOCALLY') == 'true':
        use_queue = False
        logger.info("Running locally, overriding queue parameter to process immediately")

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

def reset_stuck_processing_requests(timeout_minutes=1):
    """
    Reset any requests that have been stuck in processing state for too long.

    Args:
        timeout_minutes: Minutes after which to consider a processing request as stuck

    Returns:
        Number of requests that were reset
    """
    try:
        conn = db_client._get_connection()
        cursor = conn.cursor()

        # Find requests stuck in processing state for more than timeout_minutes
        timeout_threshold = datetime.now() - timedelta(minutes=timeout_minutes)

        # For requests with started_at set
        query = f"""
        UPDATE {db_client.queue_table}
        SET status = 'failed',
            completed_at = NOW()
        WHERE status = 'processing'
        AND started_at < %s
        RETURNING request_id
        """
        cursor.execute(query, (timeout_threshold,))
        reset_with_started_at = cursor.fetchall()

        # For requests without started_at but created a long time ago
        query = f"""
        UPDATE {db_client.queue_table}
        SET status = 'failed',
            completed_at = NOW()
        WHERE status = 'processing'
        AND started_at IS NULL
        AND created_at < %s
        RETURNING request_id
        """
        cursor.execute(query, (timeout_threshold,))
        reset_without_started_at = cursor.fetchall()

        conn.commit()
        cursor.close()
        db_client._return_connection(conn)

        total_reset = len(reset_with_started_at) + len(reset_without_started_at)
        if total_reset > 0:
            request_ids = [r[0] for r in reset_with_started_at] + [r[0] for r in reset_without_started_at]
            logger.info(f"Reset {total_reset} stuck processing requests: {request_ids}")

            # If worker isn't running, restart it
            if not worker_running:
                start_worker_thread()
                logger.info("Restarted worker thread after resetting stuck requests")

        return total_reset
    except Exception as e:
        logger.error(f"Error resetting stuck processing requests: {e}")
        logger.error(traceback.format_exc())
        return 0

@app.route('/match/<match_id>', methods=['GET'])
@require_api_key
def get_match_result(match_id):
    """
    Get hero detection results for a Dota 2 match ID.

    Path parameters:
    - match_id: The Dota 2 match ID

    Query parameters:
    - force: Force reprocessing by submitting a new clip (optional, default=False)
    - clip_url: The Twitch clip URL to process if forcing (optional)
    - debug: Enable debug mode (optional, default=False)
    - include_image: Include frame image URL in response (optional, default=True)
    """
    force = request.args.get('force', 'false').lower() == 'true'
    clip_url = request.args.get('clip_url')
    debug = request.args.get('debug', 'false').lower() == 'true'
    include_image = request.args.get('include_image', 'true').lower() == 'true'

    # Check if match_id is provided
    if not match_id:
        return jsonify({'error': 'Missing required parameter: match_id'}), 400

    # Check if match id is a number
    try:
        match_id = int(match_id)
    except ValueError:
        return jsonify({'error': 'Invalid match_id: must be a number'}), 400

    # Convert back to string for consistent handling in the rest of the code
    match_id = str(match_id)

    try:
        # If force is true and clip_url is provided, process the new clip
        if force and clip_url:
            # Extract clip_id from URL
            clip_id = extract_clip_id(clip_url)
            if not clip_id:
                return jsonify({'error': 'Could not extract clip ID from URL'}), 400

            # Process the clip with the match_id
            result = process_clip_request(
                clip_url=clip_url,
                clip_id=clip_id,
                debug=debug,
                force=True,  # Always force when explicitly requested
                include_image=include_image,
                add_to_queue=True,  # Always queue for match_id requests
                match_id=match_id
            )

            # If the result is queued, return that
            if isinstance(result, dict) and result.get('queued'):
                return jsonify(result)

        # Check if this match has any existing results or is in queue
        match_status = db_client.check_for_match_processing(match_id)

        if not match_status or not match_status.get('found'):
            # If no existing processing and no new clip URL provided
            if not clip_url:
                return jsonify({
                    'error': 'No results found for this match ID',
                    'message': 'Please provide a clip_url to process'
                }), 404

            # If we have a clip_url but didn't force, process it anyway
            clip_id = extract_clip_id(clip_url)
            if not clip_id:
                return jsonify({'error': 'Could not extract clip ID from URL'}), 400

            # Process the clip with the match_id
            result = process_clip_request(
                clip_url=clip_url,
                clip_id=clip_id,
                debug=debug,
                force=False,
                include_image=include_image,
                add_to_queue=True,
                match_id=match_id
            )

            return jsonify(result)

        elif match_status.get('status') == 'completed':
            # If we have a completed result, fetch and return it
            result = db_client.get_clip_result_by_match_id(match_id)

            if result:
                # Replace placeholder with real host URL if needed
                if 'saved_image_path' in result and result['saved_image_path'] and '__HOST_URL__' in result['saved_image_path']:
                    host_url = request.host_url.rstrip('/')
                    result['saved_image_path'] = result['saved_image_path'].replace('__HOST_URL__', host_url)

                # Add match_id for context
                result['match_id'] = match_id

                return jsonify(result)
            else:
                # This shouldn't happen if match_status says completed
                return jsonify({
                    'error': 'Inconsistent state',
                    'message': 'Match is marked as completed but no result found'
                }), 500

        elif match_status.get('status') in ('pending', 'processing'):
            # If the match is in queue, return status
            return jsonify({
                'status': match_status.get('status'),
                'clip_id': match_status.get('clip_id'),
                'request_id': match_status.get('request_id'),
                'match_id': match_id,
                'message': f"Match is currently {match_status.get('status')}"
            })

        elif match_status.get('status') == 'draft':
            # Return the latest draft result
            draft = db_client.get_latest_draft_for_match(match_id)
            if draft:
                draft['match_id'] = match_id
                return jsonify(draft)
            return jsonify({
                'error': 'Draft result not found',
                'status': 'draft',
                'match_id': match_id
            }), 404

        else:  # Failed
            # If failed and no new clip_url, report failure
            if not clip_url:
                return jsonify({
                    'error': 'Previous processing failed',
                    'status': 'failed',
                    'clip_id': match_status.get('clip_id'),
                    'request_id': match_status.get('request_id'),
                    'match_id': match_id,
                    'message': 'Previous processing failed. Provide a clip_url to try again.'
                }), 400

            # If we have a clip_url and previous processing failed, try again
            clip_id = extract_clip_id(clip_url)
            if not clip_id:
                return jsonify({'error': 'Could not extract clip ID from URL'}), 400

            # Process the clip with the match_id
            result = process_clip_request(
                clip_url=clip_url,
                clip_id=clip_id,
                debug=debug,
                force=True,  # Force when previous failed
                include_image=include_image,
                add_to_queue=True,
                match_id=match_id
            )

            return jsonify(result)

    except Exception as e:
        logger.error(f"Error processing match ID {match_id}: {str(e)}", exc_info=True)
        error_details = {
            'error': 'Error processing match',
            'message': str(e),
            'trace': traceback.format_exc() if debug else None
        }
        return jsonify(error_details), 500

def main():
    """Main entry point for the API server."""
    # Initialize the application
    initialize_app()

    # Get port from environment variable or use default
    port = int(os.environ.get('PORT', 5000))

    # Start the server
    logger.info(f"Starting Dota 2 Hero Detection API server on port {port}")
    app.run(host='0.0.0.0', port=port)

if __name__ == '__main__':
    main()
