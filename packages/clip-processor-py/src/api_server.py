#!/usr/bin/env python3
"""
Dota 2 Hero Detection API Server

This module provides a Flask-based web service to process Twitch clip URLs
and return Dota 2 hero detection results as JSON.
"""

import os
import json
import logging
from flask import request, jsonify, Response, send_file
from urllib.parse import urlparse
import traceback
import re
import time
import threading
from threading import Lock
from pathlib import Path
import psycopg2
from datetime import datetime, timedelta
logger = logging.getLogger(__name__)

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
def before_first_request():
    """Ensure app is initialized before handling the first request."""
    if not app_initialized:
        logger.info("Initializing app before first request...")
        initialize_app()


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

def process_clip_request(clip_url, clip_id, debug=False, force=False, include_image=True, add_to_queue=True, from_worker=False, match_id=None):
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

                # Create a filtered result that includes the facet data
                filtered_result = {
                    'saved_image_path': cached_result.get('saved_image_path'),
                    'players': cached_result.get('players', []),
                    'heroes': cached_result.get('heroes', [])  # Include heroes which has facet data
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
            image_url, saved_image_path = get_image_url(frame_path, clip_id)
            if image_url:
                result['frame_image_url'] = image_url
                result['saved_image_path'] = saved_image_path
                # Store the actual frame path for potential future use
                result['best_frame_path'] = str(frame_path)

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
from server import create_app

app = create_app()


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
