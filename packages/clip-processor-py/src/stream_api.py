#!/usr/bin/env python3
"""
Stream Processor API

This module provides a REST API to manage the stream processor service.
It allows adding and removing streams, viewing status, and general management
of the stream capture system.
"""

import os
import json
import logging
import time
import threading
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple, Any

from flask import Flask, request, jsonify, send_file
import waitress

# Import our stream processor
from stream_processor import StreamManager

# Configure logging
log_dir = Path("logs")
log_dir.mkdir(exist_ok=True)
log_file = log_dir / 'stream_api.log'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(log_file, mode='a')
    ]
)
logger = logging.getLogger(__name__)

# Create the Flask app
app = Flask(__name__)

# Create a StreamManager instance
manager = None
manager_lock = threading.RLock()

# Default values
DEFAULT_CAPTURE_INTERVAL = 3  # seconds
DEFAULT_MAX_CONCURRENT = 100
DEFAULT_QUALITY = '720p'
TEMP_DIR = Path("temp")
FRAMES_DIR = TEMP_DIR / "frames"
RESULTS_DIR = TEMP_DIR / "results"

# Global configuration
CONFIG_FILE = Path("config/stream_processor.json")
CONFIG_FILE.parent.mkdir(exist_ok=True)
config = {
    "capture_interval": DEFAULT_CAPTURE_INTERVAL,
    "max_concurrent": DEFAULT_MAX_CONCURRENT,
    "quality": DEFAULT_QUALITY,
    "streams": {}
}

def save_config():
    """Save configuration to file."""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)
    logger.info(f"Configuration saved to {CONFIG_FILE}")

def load_config():
    """Load configuration from file."""
    global config
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, 'r') as f:
                loaded_config = json.load(f)
                config.update(loaded_config)
            logger.info(f"Configuration loaded from {CONFIG_FILE}")
        except Exception as e:
            logger.error(f"Error loading configuration: {e}")
    else:
        logger.info(f"No configuration file found at {CONFIG_FILE}, using defaults")
        save_config()

def init_manager():
    """Initialize the stream manager with current configuration."""
    global manager
    with manager_lock:
        if manager is not None:
            # Stop existing manager
            manager.stop()

        # Create new manager with current config
        manager = StreamManager(
            capture_interval=config["capture_interval"],
            max_concurrent=config["max_concurrent"],
            quality=config["quality"]
        )

        # Add all streams from config
        for username, stream_config in config["streams"].items():
            priority = stream_config.get("priority", 5)
            manager.add_stream(username, priority)

        # Start the manager
        manager.start()

        logger.info(f"Stream manager initialized with {len(config['streams'])} streams")

# API Routes

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get system status."""
    if manager is None:
        return jsonify({
            "status": "not_initialized",
            "message": "Stream manager not initialized"
        }), 503

    stats = manager.get_stats()

    return jsonify({
        "status": "running" if manager.running else "stopped",
        "stats": stats,
        "config": {
            "capture_interval": config["capture_interval"],
            "max_concurrent": config["max_concurrent"],
            "quality": config["quality"],
            "total_streams": len(config["streams"])
        }
    })

@app.route('/api/streams', methods=['GET'])
def get_streams():
    """Get all stream statuses."""
    if manager is None:
        return jsonify({
            "status": "not_initialized",
            "message": "Stream manager not initialized"
        }), 503

    # Get all stream statuses
    streams = manager.get_all_streams()

    # Filter sensitive or large data
    filtered_streams = {}
    for username, stream_info in streams.items():
        # Create a shallow copy without frame paths
        filtered_info = {k: v for k, v in stream_info.items() if k != 'frame_paths'}
        filtered_streams[username] = filtered_info

    return jsonify({
        "streams": filtered_streams,
        "total": len(filtered_streams)
    })

@app.route('/api/streams/<username>', methods=['GET'])
def get_stream(username):
    """Get status of a specific stream."""
    if manager is None:
        return jsonify({
            "status": "not_initialized",
            "message": "Stream manager not initialized"
        }), 503

    stream_status = manager.get_stream_status(username)

    if not stream_status:
        return jsonify({
            "status": "not_found",
            "message": f"Stream {username} not found"
        }), 404

    # Get recent frames
    frames = []
    for frame_path in stream_status.get("frame_paths", []):
        if os.path.exists(frame_path):
            # Replace with relative URL to the frame
            frame_name = os.path.basename(frame_path)
            frames.append(f"/api/frames/{username}/{frame_name}")

    # Filter sensitive or large data
    filtered_status = {k: v for k, v in stream_status.items() if k != 'frame_paths'}
    filtered_status["frames"] = frames

    return jsonify(filtered_status)

@app.route('/api/streams', methods=['POST'])
def add_stream():
    """Add a stream to be monitored."""
    if manager is None:
        return jsonify({
            "status": "not_initialized",
            "message": "Stream manager not initialized"
        }), 503

    data = request.json
    if not data or 'username' not in data:
        return jsonify({
            "status": "error",
            "message": "Missing required field: username"
        }), 400

    username = data['username'].strip()
    priority = int(data.get('priority', 5))

    # Add to manager
    manager.add_stream(username, priority)

    # Add to config
    with manager_lock:
        config["streams"][username] = {
            "priority": priority,
            "added_at": time.time()
        }
        save_config()

    return jsonify({
        "status": "success",
        "message": f"Stream {username} added with priority {priority}"
    })

@app.route('/api/streams/<username>', methods=['DELETE'])
def remove_stream(username):
    """Remove a stream from monitoring."""
    if manager is None:
        return jsonify({
            "status": "not_initialized",
            "message": "Stream manager not initialized"
        }), 503

    # Remove from manager
    manager.remove_stream(username)

    # Remove from config
    with manager_lock:
        if username in config["streams"]:
            del config["streams"][username]
            save_config()

    return jsonify({
        "status": "success",
        "message": f"Stream {username} removed"
    })

@app.route('/api/streams/<username>/priority', methods=['PUT'])
def update_priority(username):
    """Update a stream's priority."""
    if manager is None:
        return jsonify({
            "status": "not_initialized",
            "message": "Stream manager not initialized"
        }), 503

    data = request.json
    if not data or 'priority' not in data:
        return jsonify({
            "status": "error",
            "message": "Missing required field: priority"
        }), 400

    priority = int(data['priority'])

    # Update in manager
    manager.update_priority(username, priority)

    # Update in config
    with manager_lock:
        if username in config["streams"]:
            config["streams"][username]["priority"] = priority
            save_config()

    return jsonify({
        "status": "success",
        "message": f"Stream {username} priority updated to {priority}"
    })

@app.route('/api/config', methods=['GET'])
def get_config():
    """Get current configuration."""
    return jsonify(config)

@app.route('/api/config', methods=['PUT'])
def update_config():
    """Update global configuration."""
    data = request.json
    if not data:
        return jsonify({
            "status": "error",
            "message": "No data provided"
        }), 400

    # Update configuration
    with manager_lock:
        if "capture_interval" in data:
            config["capture_interval"] = int(data["capture_interval"])
        if "max_concurrent" in data:
            config["max_concurrent"] = int(data["max_concurrent"])
        if "quality" in data:
            config["quality"] = data["quality"]

        save_config()

    # Reinitialize manager with new config
    init_manager()

    return jsonify({
        "status": "success",
        "message": "Configuration updated",
        "config": config
    })

@app.route('/api/frames/<username>/<filename>', methods=['GET'])
def get_frame(username, filename):
    """Get a specific frame image."""
    frame_path = FRAMES_DIR / filename

    if not frame_path.exists():
        return jsonify({
            "status": "not_found",
            "message": f"Frame {filename} not found"
        }), 404

    # Verify the frame belongs to this username
    if not filename.startswith(f"{username}_"):
        return jsonify({
            "status": "forbidden",
            "message": "Not authorized to access this frame"
        }), 403

    return send_file(frame_path, mimetype='image/jpeg')

@app.route('/api/restart', methods=['POST'])
def restart_manager():
    """Restart the stream manager."""
    init_manager()

    return jsonify({
        "status": "success",
        "message": "Stream manager restarted"
    })

@app.route('/api/streams/bulk', methods=['POST'])
def bulk_add_streams():
    """Add multiple streams at once."""
    if manager is None:
        return jsonify({
            "status": "not_initialized",
            "message": "Stream manager not initialized"
        }), 503

    data = request.json
    if not data or 'streams' not in data or not isinstance(data['streams'], list):
        return jsonify({
            "status": "error",
            "message": "Missing or invalid required field: streams (array)"
        }), 400

    added_count = 0

    for stream_data in data['streams']:
        if isinstance(stream_data, str):
            username = stream_data.strip()
            priority = 5
        elif isinstance(stream_data, dict) and 'username' in stream_data:
            username = stream_data['username'].strip()
            priority = int(stream_data.get('priority', 5))
        else:
            continue

        # Add to manager
        manager.add_stream(username, priority)

        # Add to config
        with manager_lock:
            config["streams"][username] = {
                "priority": priority,
                "added_at": time.time()
            }

        added_count += 1

    # Save config once after all additions
    save_config()

    return jsonify({
        "status": "success",
        "message": f"Added {added_count} streams"
    })

@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    """Get detailed metrics in Prometheus format."""
    if manager is None:
        return "# Stream manager not initialized\n", 503, {"Content-Type": "text/plain"}

    stats = manager.get_stats()
    streams = manager.get_all_streams()

    lines = []

    # System metrics
    lines.append("# HELP stream_processor_uptime_seconds System uptime in seconds")
    lines.append("# TYPE stream_processor_uptime_seconds gauge")
    lines.append(f"stream_processor_uptime_seconds {stats['uptime']}")

    lines.append("# HELP stream_processor_streams_total Total number of streams")
    lines.append("# TYPE stream_processor_streams_total gauge")
    lines.append(f"stream_processor_streams_total {stats['streams']}")

    lines.append("# HELP stream_processor_streams_active Number of active streams")
    lines.append("# TYPE stream_processor_streams_active gauge")
    lines.append(f"stream_processor_streams_active {stats['active']}")

    lines.append("# HELP stream_processor_captures_total Total number of frame captures")
    lines.append("# TYPE stream_processor_captures_total counter")
    lines.append(f"stream_processor_captures_total {stats['total_captures']}")

    lines.append("# HELP stream_processor_captures_success Successful frame captures")
    lines.append("# TYPE stream_processor_captures_success counter")
    lines.append(f"stream_processor_captures_success {stats['successful_captures']}")

    lines.append("# HELP stream_processor_captures_failed Failed frame captures")
    lines.append("# TYPE stream_processor_captures_failed counter")
    lines.append(f"stream_processor_captures_failed {stats['failed_captures']}")

    lines.append("# HELP stream_processor_dota_matches_found Dota 2 matches detected")
    lines.append("# TYPE stream_processor_dota_matches_found counter")
    lines.append(f"stream_processor_dota_matches_found {stats['dota_matches_found']}")

    # Per-stream metrics
    lines.append("# HELP stream_processor_stream_captures_total Total captures per stream")
    lines.append("# TYPE stream_processor_stream_captures_total counter")

    lines.append("# HELP stream_processor_stream_captures_success Successful captures per stream")
    lines.append("# TYPE stream_processor_stream_captures_success counter")

    lines.append("# HELP stream_processor_stream_dota_matches Dota 2 matches found per stream")
    lines.append("# TYPE stream_processor_stream_dota_matches counter")

    # Add per-stream metrics
    for username, info in streams.items():
        username_label = username.replace('"', '\\"')
        lines.append(f'stream_processor_stream_captures_total{{stream="{username_label}"}} {info["captures"]}')
        lines.append(f'stream_processor_stream_captures_success{{stream="{username_label}"}} {info["successful_captures"]}')
        lines.append(f'stream_processor_stream_dota_matches{{stream="{username_label}"}} {info["dota_matches"]}')

    return "\n".join(lines), 200, {"Content-Type": "text/plain"}

# Main entry point
def main():
    """Main function to start the API server."""
    import argparse
    parser = argparse.ArgumentParser(description='Stream Processor API')
    parser.add_argument('--host', type=str, default='0.0.0.0',
                        help='Host to bind to (default: 0.0.0.0)')
    parser.add_argument('--port', type=int, default=5000,
                        help='Port to bind to (default: 5000)')
    parser.add_argument('--debug', action='store_true',
                        help='Run in debug mode (not recommended for production)')

    args = parser.parse_args()

    # Load configuration
    load_config()

    # Initialize manager
    init_manager()

    logger.info(f"Starting API server on {args.host}:{args.port}")

    if args.debug:
        app.run(host=args.host, port=args.port, debug=True)
    else:
        waitress.serve(app, host=args.host, port=args.port)

if __name__ == "__main__":
    main()
