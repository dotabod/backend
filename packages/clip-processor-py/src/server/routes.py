# Routes for Flask application
import os
import traceback
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse

from flask import Blueprint, request, jsonify, send_file
import psycopg2

from . import require_api_key
from ..api_server import (
    app_initialized,
    initialize_app,
    worker_running,
    start_worker_thread,
    reset_stuck_processing_requests,
    process_clip_request,
    process_stream_request,
    extract_clip_id,
    get_image_url,
    db_client,
    IMAGE_DIR,
    ALLOWED_EXTENSIONS,
)

bp = Blueprint('api', __name__)




@bp.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'service': 'dota-hero-detection-api'})


@bp.route('/queue/debug', methods=['GET'])
@require_api_key
def debug_queue():
    try:
        if not app_initialized:
            initialize_app()

        conn = db_client._get_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cursor.execute(
            f"SELECT status, COUNT(*) FROM {db_client.queue_table} GROUP BY status"
        )
        status_counts = cursor.fetchall()

        cursor.execute(
            f"""
            SELECT request_id, request_type, status, created_at, started_at, completed_at, clip_id, match_id
            FROM {db_client.queue_table}
            ORDER BY created_at DESC
            LIMIT 10
        """
        )
        recent_requests = cursor.fetchall()

        for req in recent_requests:
            for key, value in list(req.items()):
                if isinstance(value, datetime):
                    req[key] = value.isoformat()
            if 'clip_id' in req and 'match_id' in req:
                req['force_process_again'] = (
                    f"http://localhost:5000/detect?clip_id={req['clip_id']}&force=true&match_id={req['match_id']}"
                )

        cursor.close()
        db_client._return_connection(conn)

        worker_status = 'running' if worker_running else 'not running'

        restart = request.args.get('restart', 'false').lower() == 'true'
        if restart and not worker_running:
            start_worker_thread()
            worker_status = 'restarted'

        reset_stuck = request.args.get('reset_stuck', 'false').lower() == 'true'
        if reset_stuck:
            num_reset = reset_stuck_processing_requests()
            worker_status = f"{worker_status}, reset {num_reset} stuck requests"

        return jsonify({
            'worker_status': worker_status,
            'app_initialized': app_initialized,
            'queue_status': [dict(row) for row in status_counts],
            'recent_requests': [dict(row) for row in recent_requests],
        })
    except Exception as e:
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


@bp.route('/queue/status/<request_id>', methods=['GET'])
@require_api_key
def check_queue_status(request_id):
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
        'estimated_completion_time': queue_info.get('estimated_completion_time'),
    }

    if queue_info['status'] in ('completed', 'failed'):
        response['result_id'] = queue_info.get('result_id')
        if queue_info['status'] == 'completed' and queue_info.get('result_id'):
            cached_result = db_client.get_clip_result(queue_info['result_id'])
            if (
                cached_result
                and 'saved_image_path' in cached_result
                and cached_result['saved_image_path']
                and '__HOST_URL__' in cached_result['saved_image_path']
            ):
                host_url = request.host_url.rstrip('/')
                cached_result['saved_image_path'] = cached_result['saved_image_path'].replace(
                    '__HOST_URL__', host_url
                )
            response['result'] = cached_result

    return jsonify(response), status_code


@bp.route('/images/<filename>', methods=['GET'])
@require_api_key
def serve_image(filename):
    try:
        if '/' in filename or '\\' in filename or '..' in filename:
            return jsonify({'error': 'Invalid filename'}), 400
        filename = os.path.basename(filename)
        if '.' not in filename or filename.rsplit('.', 1)[1].lower() not in ALLOWED_EXTENSIONS:
            return jsonify({'error': 'Invalid file type'}), 400
        image_path = IMAGE_DIR / filename
        image_abs_path = os.path.abspath(image_path)
        image_dir_abs_path = os.path.abspath(IMAGE_DIR)
        if not image_abs_path.startswith(image_dir_abs_path + os.sep):
            return jsonify({'error': 'Access denied'}), 403
        if not image_path.exists() or not image_path.is_file():
            return jsonify({'error': 'Image not found'}), 404
        try:
            if not image_path.resolve().is_relative_to(IMAGE_DIR.resolve()):
                return jsonify({'error': 'Access denied'}), 403
        except (ValueError, RuntimeError):
            return jsonify({'error': 'Access denied'}), 403
        response = send_file(image_path, mimetype=f'image/{image_path.suffix[1:]}')
        response.headers['Content-Security-Policy'] = "default-src 'self'"
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        return response
    except Exception:
        return jsonify({'error': 'Internal server error'}), 500


@bp.route('/detect', methods=['GET'])
@require_api_key
def detect_heroes():
    clip_url = request.args.get('url')
    clip_id = request.args.get('clip_id')
    match_id = request.args.get('match_id')
    debug = request.args.get('debug', 'false').lower() == 'true'
    force = request.args.get('force', 'false').lower() == 'true'
    include_image = request.args.get('include_image', 'true').lower() == 'true'
    use_queue = request.args.get('queue', 'true').lower() == 'true'

    if os.environ.get('RUN_LOCALLY') == 'true':
        use_queue = False

    if not match_id:
        return jsonify({'error': 'Missing required parameter: match_id'}), 400

    try:
        match_id = int(match_id)
    except ValueError:
        return jsonify({'error': 'Invalid match_id: must be a number'}), 400
    match_id = str(match_id)

    if not clip_url and not clip_id:
        return jsonify({'error': 'Missing required parameter: either url or clip_id must be provided'}), 400

    if clip_id and not clip_url:
        clip_url = f"https://clips.twitch.tv/{clip_id}"
    elif clip_url and not clip_id:
        extracted_clip_id = extract_clip_id(clip_url)
        clip_id = extracted_clip_id if extracted_clip_id else clip_url

    try:
        parsed_url = urlparse(clip_url)
        if not parsed_url.scheme or not parsed_url.netloc:
            return jsonify({'error': 'Invalid URL format'}), 400
        if 'twitch.tv' not in parsed_url.netloc and 'clips.twitch.tv' not in parsed_url.netloc:
            pass
    except Exception as e:
        return jsonify({'error': f'URL parsing error: {str(e)}'}), 400

    try:
        result = process_clip_request(
            clip_url=clip_url,
            clip_id=clip_id,
            debug=debug,
            force=force,
            include_image=include_image,
            add_to_queue=use_queue,
            match_id=match_id,
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': 'Error processing clip', 'message': str(e), 'trace': traceback.format_exc() if debug else None}), 500


@bp.route('/detect-stream', methods=['GET'])
@require_api_key
def detect_heroes_from_stream():
    username = request.args.get('username')
    num_frames = int(request.args.get('frames', '3'))
    debug = request.args.get('debug', 'false').lower() == 'true'
    include_image = request.args.get('include_image', 'false').lower() == 'true'
    use_queue = request.args.get('queue', 'true').lower() == 'true'

    if os.environ.get('RUN_LOCALLY') == 'true':
        use_queue = False

    if not username:
        return jsonify({'error': 'Missing required parameter: username'}), 400

    if num_frames < 1 or num_frames > 10:
        return jsonify({'error': 'Invalid frames parameter: must be between 1 and 10'}), 400

    try:
        result = process_stream_request(
            username=username,
            num_frames=num_frames,
            debug=debug,
            include_image=include_image,
            add_to_queue=use_queue,
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': 'Error processing stream', 'message': str(e), 'trace': traceback.format_exc() if debug else None}), 500


@bp.route('/match/<match_id>', methods=['GET'])
@require_api_key
def get_match_result(match_id):
    force = request.args.get('force', 'false').lower() == 'true'
    clip_url = request.args.get('clip_url')
    debug = request.args.get('debug', 'false').lower() == 'true'
    include_image = request.args.get('include_image', 'true').lower() == 'true'

    if not match_id:
        return jsonify({'error': 'Missing required parameter: match_id'}), 400

    try:
        match_id = int(match_id)
    except ValueError:
        return jsonify({'error': 'Invalid match_id: must be a number'}), 400
    match_id = str(match_id)

    try:
        if force and clip_url:
            clip_id = extract_clip_id(clip_url)
            if not clip_id:
                return jsonify({'error': 'Could not extract clip ID from URL'}), 400
            result = process_clip_request(
                clip_url=clip_url,
                clip_id=clip_id,
                debug=debug,
                force=True,
                include_image=include_image,
                add_to_queue=True,
                match_id=match_id,
            )
            if isinstance(result, dict) and result.get('queued'):
                return jsonify(result)

        match_status = db_client.check_for_match_processing(match_id)

        if not match_status or not match_status.get('found'):
            if not clip_url:
                return jsonify({'error': 'No results found for this match ID', 'message': 'Please provide a clip_url to process'}), 404
            clip_id = extract_clip_id(clip_url)
            if not clip_id:
                return jsonify({'error': 'Could not extract clip ID from URL'}), 400
            result = process_clip_request(
                clip_url=clip_url,
                clip_id=clip_id,
                debug=debug,
                force=False,
                include_image=include_image,
                add_to_queue=True,
                match_id=match_id,
            )
            return jsonify(result)
        elif match_status.get('status') == 'completed':
            result = db_client.get_clip_result_by_match_id(match_id)
            if result:
                if 'saved_image_path' in result and result['saved_image_path'] and '__HOST_URL__' in result['saved_image_path']:
                    host_url = request.host_url.rstrip('/')
                    result['saved_image_path'] = result['saved_image_path'].replace('__HOST_URL__', host_url)
                result['match_id'] = match_id
                return jsonify(result)
            return jsonify({'error': 'Inconsistent state', 'message': 'Match is marked as completed but no result found'}), 500
        elif match_status.get('status') in ('pending', 'processing'):
            return jsonify({
                'status': match_status.get('status'),
                'clip_id': match_status.get('clip_id'),
                'request_id': match_status.get('request_id'),
                'match_id': match_id,
                'message': f"Match is currently {match_status.get('status')}",
            })
        else:
            if not clip_url:
                return jsonify({'error': 'Previous processing failed', 'status': 'failed', 'clip_id': match_status.get('clip_id'), 'request_id': match_status.get('request_id'), 'match_id': match_id, 'message': 'Previous processing failed. Provide a clip_url to try again.'}), 400
            clip_id = extract_clip_id(clip_url)
            if not clip_id:
                return jsonify({'error': 'Could not extract clip ID from URL'}), 400
            result = process_clip_request(
                clip_url=clip_url,
                clip_id=clip_id,
                debug=debug,
                force=True,
                include_image=include_image,
                add_to_queue=True,
                match_id=match_id,
            )
            return jsonify(result)
    except Exception as e:
        return jsonify({'error': 'Error processing match', 'message': str(e), 'trace': traceback.format_exc() if debug else None}), 500
