#!/usr/bin/env python3
"""
Twitch Stream Processor

This module provides a scalable solution for capturing frames from multiple Twitch streams
concurrently. It uses asynchronous processing to efficiently manage hundreds of streams
simultaneously, minimizing resource usage while maintaining reliable frame capture.

Key features:
- Asynchronous stream processing with asyncio
- Dynamic stream priority and scheduling
- Automatic error recovery and retry mechanisms
- Resource management to prevent system overload
- Integration with Dota 2 hero detection pipeline
"""

import os
import asyncio
import logging
import time
import signal
import json
from pathlib import Path
from datetime import datetime
import random
from typing import Dict, List, Optional, Set, Tuple, Any
import concurrent.futures
import queue
import threading
import traceback

# Import stream utilities
from stream_utils import get_stream_url, is_preparing_screen
import cv2
import numpy as np

# Try to import Dota 2 detection
try:
    from detection.image_processing import process_frame_for_heroes
    DOTA_DETECTION_AVAILABLE = True
except ImportError:
    DOTA_DETECTION_AVAILABLE = False
    print("Warning: detection module not available, will only capture frames without analysis")

# Configure logging
log_dir = Path("logs")
log_dir.mkdir(exist_ok=True)
log_file = log_dir / 'stream_processor.log'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(log_file, mode='a')
    ]
)
logger = logging.getLogger(__name__)

# Create directories
TEMP_DIR = Path("temp")
TEMP_DIR.mkdir(exist_ok=True)
FRAMES_DIR = TEMP_DIR / "frames"
FRAMES_DIR.mkdir(exist_ok=True)
RESULTS_DIR = TEMP_DIR / "results"
RESULTS_DIR.mkdir(exist_ok=True)

# Constants
DEFAULT_CAPTURE_INTERVAL = 3  # seconds between frame captures
DEFAULT_QUALITY = '720p'  # Lower quality than 1080p to save bandwidth
MAX_WORKERS = 32  # Maximum concurrent workers for CPU-bound tasks
MAX_CONCURRENT_STREAMS = 100  # Maximum simultaneous stream connections
MAX_RETRIES = 3  # Maximum number of retries when capture fails
FRAMES_TO_SKIP = 5  # Number of frames to skip to avoid ads
STREAM_TIMEOUT = 10  # Seconds to wait before considering a stream capture failed
HEALTH_CHECK_INTERVAL = 60  # Seconds between health checks
CLEANUP_INTERVAL = 300  # Seconds between cleanup operations (5 minutes)
MAX_FRAME_AGE = 3600  # Maximum age of frames to keep (1 hour)

class StreamStatus:
    """Track the status of a stream."""
    OFFLINE = "offline"
    ONLINE = "online"
    ERROR = "error"
    PENDING = "pending"
    PROCESSING = "processing"


class StreamManager:
    """
    Manages a pool of Twitch streams for efficient frame capture and analysis.

    This class handles the concurrent processing of multiple streams, scheduling
    frame captures based on priority and availability, and integrating with
    the Dota 2 hero detection pipeline.
    """

    def __init__(self, capture_interval: int = DEFAULT_CAPTURE_INTERVAL,
                 max_concurrent: int = MAX_CONCURRENT_STREAMS,
                 quality: str = DEFAULT_QUALITY):
        """
        Initialize the stream manager.

        Args:
            capture_interval: Seconds between frame captures for each stream
            max_concurrent: Maximum number of concurrent stream connections
            quality: Stream quality to request
        """
        self.capture_interval = capture_interval
        self.max_concurrent = max_concurrent
        self.quality = quality

        # Stream tracking
        self.streams: Dict[str, Dict[str, Any]] = {}  # username -> stream info
        self.active_streams: Set[str] = set()  # Currently active usernames
        self.stream_queue = None  # Will be initialized in the thread's event loop

        # Thread pools
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS)

        # Control flags
        self.running = False
        self.loop = None

        # Stats tracking
        self.stats = {
            "total_captures": 0,
            "successful_captures": 0,
            "failed_captures": 0,
            "dota_matches_found": 0,
            "start_time": time.time(),
        }

        # Lock for thread safety
        self._lock = threading.RLock()

        logger.info(f"Stream Manager initialized with {max_concurrent} max concurrent streams")

    def add_stream(self, username: str, priority: int = 5) -> None:
        """
        Add a stream to be monitored.

        Args:
            username: Twitch username
            priority: Stream priority (1-10, lower is higher priority)
        """
        with self._lock:
            if username in self.streams:
                # Update existing stream
                self.streams[username]["priority"] = priority
                logger.debug(f"Updated stream {username} with priority {priority}")
                return

            # Add new stream
            self.streams[username] = {
                "username": username,
                "priority": priority,
                "status": StreamStatus.PENDING,
                "last_capture": 0,
                "next_capture": time.time(),  # Schedule immediately
                "error_count": 0,
                "consecutive_errors": 0,
                "captures": 0,
                "successful_captures": 0,
                "dota_matches": 0,
                "last_error": None,
                "frame_paths": [],
            }

            # Schedule for immediate capture if the manager is running
            if self.running and self.stream_queue and self.loop:
                self.loop.call_soon_threadsafe(
                    lambda: self.stream_queue.put_nowait((0, username))
                )

            logger.info(f"Added stream {username} with priority {priority}")

    def remove_stream(self, username: str) -> None:
        """
        Remove a stream from monitoring.

        Args:
            username: Twitch username
        """
        with self._lock:
            if username in self.streams:
                del self.streams[username]
                if username in self.active_streams:
                    self.active_streams.remove(username)
                logger.info(f"Removed stream {username}")

    def update_priority(self, username: str, priority: int) -> None:
        """
        Update a stream's priority.

        Args:
            username: Twitch username
            priority: New priority (1-10, lower is higher priority)
        """
        with self._lock:
            if username in self.streams:
                self.streams[username]["priority"] = priority
                logger.debug(f"Updated {username} priority to {priority}")

    async def _capture_frame(self, username: str) -> Optional[str]:
        """
        Capture a single frame from a stream.

        Args:
            username: Twitch username

        Returns:
            Path to the saved frame or None if capture failed
        """
        try:
            # Get the stream URL
            stream_url = await asyncio.get_event_loop().run_in_executor(
                self.executor, get_stream_url, username, self.quality
            )

            if not stream_url:
                logger.warning(f"Could not get stream URL for {username}")
                return None

            # Create a unique filename
            timestamp = int(time.time())
            frame_path = FRAMES_DIR / f"{username}_{timestamp}.jpg"

            # Capture frame using OpenCV in a separate thread
            def _capture():
                try:
                    # Open the stream
                    capture = cv2.VideoCapture(stream_url)
                    if not capture.isOpened():
                        logger.error(f"Failed to open stream for {username}")
                        return None

                    # Set the frame rate to 5fps
                    capture.set(cv2.CAP_PROP_FPS, 5)

                    # Skip initial frames to avoid ads
                    for i in range(FRAMES_TO_SKIP):
                        capture.read()
                        time.sleep(0.2)  # 5fps = 0.2s per frame

                    # Try to read a frame with timeout
                    success, frame = capture.read()

                    if success:
                        # Check if it's a "preparing" screen
                        if is_preparing_screen(frame):
                            logger.warning(f"Detected 'preparing your stream' screen for {username}")
                            capture.release()
                            return None

                        # Save the frame
                        cv2.imwrite(str(frame_path), frame)
                        logger.debug(f"Frame captured for {username} at {frame_path}")

                        # Release the capture
                        capture.release()
                        return str(frame_path)
                    else:
                        logger.warning(f"Failed to read frame for {username}")
                        capture.release()
                        return None

                except Exception as e:
                    logger.error(f"Error capturing frame for {username}: {e}")
                    traceback.print_exc()
                    return None

            # Run the capture in a thread pool
            result = await asyncio.get_event_loop().run_in_executor(
                self.executor, _capture
            )

            return result

        except Exception as e:
            logger.error(f"Error in _capture_frame for {username}: {e}")
            traceback.print_exc()
            return None

    async def _process_frame(self, username: str, frame_path: str) -> bool:
        """
        Process a captured frame for Dota 2 detection.

        Args:
            username: Twitch username
            frame_path: Path to the captured frame

        Returns:
            True if Dota 2 match was detected, False otherwise
        """
        if not DOTA_DETECTION_AVAILABLE:
            logger.debug(f"Dota 2 detection not available, skipping analysis for {username}")
            return False

        try:
            # Process the frame for Dota 2 heroes
            def _process():
                try:
                    result = process_frame_for_heroes(frame_path, debug=False)

                    # Save results
                    if result and result.get("heroes"):
                        # Create results directory for this username if it doesn't exist
                        user_dir = RESULTS_DIR / username
                        user_dir.mkdir(exist_ok=True)

                        # Save results to a JSON file
                        timestamp = int(time.time())
                        result_path = user_dir / f"{timestamp}.json"

                        with open(result_path, 'w') as f:
                            json.dump(result, f, indent=2)

                        logger.info(f"Dota 2 match detected for {username} with {len(result['heroes'])} heroes")
                        return True
                    else:
                        logger.debug(f"No Dota 2 match detected for {username}")
                        return False

                except Exception as e:
                    logger.error(f"Error processing frame for {username}: {e}")
                    traceback.print_exc()
                    return False

            # Run processing in a thread pool
            result = await asyncio.get_event_loop().run_in_executor(
                self.executor, _process
            )

            return result

        except Exception as e:
            logger.error(f"Error in _process_frame for {username}: {e}")
            traceback.print_exc()
            return False

    async def _process_stream(self, username: str) -> None:
        """
        Process a single stream - capture a frame and analyze it.

        Args:
            username: Twitch username
        """
        with self._lock:
            if username not in self.streams:
                logger.warning(f"Stream {username} not found, skipping")
                return

            # Mark stream as processing
            self.streams[username]["status"] = StreamStatus.PROCESSING
            self.active_streams.add(username)

        try:
            # Capture a frame
            frame_path = await self._capture_frame(username)

            with self._lock:
                self.stats["total_captures"] += 1
                self.streams[username]["captures"] += 1
                self.streams[username]["last_capture"] = time.time()

                # If capture failed
                if not frame_path:
                    self.stats["failed_captures"] += 1
                    self.streams[username]["error_count"] += 1
                    self.streams[username]["consecutive_errors"] += 1
                    self.streams[username]["status"] = StreamStatus.ERROR
                    self.streams[username]["last_error"] = "Failed to capture frame"

                    # Schedule next capture with exponential backoff
                    backoff = min(2 ** self.streams[username]["consecutive_errors"], 30)
                    next_capture = time.time() + backoff
                    self.streams[username]["next_capture"] = next_capture

                    logger.warning(f"Failed to capture frame for {username}, next try in {backoff}s")
                else:
                    # Successful capture
                    self.stats["successful_captures"] += 1
                    self.streams[username]["successful_captures"] += 1
                    self.streams[username]["consecutive_errors"] = 0
                    self.streams[username]["status"] = StreamStatus.ONLINE
                    self.streams[username]["frame_paths"].append(frame_path)

                    # Keep only the last 10 frame paths
                    if len(self.streams[username]["frame_paths"]) > 10:
                        self.streams[username]["frame_paths"] = self.streams[username]["frame_paths"][-10:]

                    # Process the frame for Dota 2 detection
                    is_dota_match = await self._process_frame(username, frame_path)

                    if is_dota_match:
                        self.stats["dota_matches_found"] += 1
                        self.streams[username]["dota_matches"] += 1

                    # Schedule next capture
                    next_capture = time.time() + self.capture_interval
                    self.streams[username]["next_capture"] = next_capture

        except Exception as e:
            logger.error(f"Error processing stream {username}: {e}")
            traceback.print_exc()

            with self._lock:
                self.streams[username]["error_count"] += 1
                self.streams[username]["consecutive_errors"] += 1
                self.streams[username]["status"] = StreamStatus.ERROR
                self.streams[username]["last_error"] = str(e)

                # Schedule next capture with exponential backoff
                backoff = min(2 ** self.streams[username]["consecutive_errors"], 30)
                next_capture = time.time() + backoff
                self.streams[username]["next_capture"] = next_capture

        finally:
            # Always remove from active streams
            with self._lock:
                if username in self.active_streams:
                    self.active_streams.remove(username)

                # Schedule for next capture
                priority = self.streams[username]["priority"]
                next_capture = self.streams[username]["next_capture"]

                # Queue up for next capture
                if self.running:
                    self.loop.call_soon_threadsafe(
                        lambda: self.stream_queue.put_nowait((next_capture, username))
                    )

    async def _scheduler(self) -> None:
        """
        Main scheduler loop that processes streams based on priority and timing.
        """
        while self.running:
            try:
                # Get the next stream to process
                next_time, username = await self.stream_queue.get()

                # Wait until it's time to process this stream
                now = time.time()
                if next_time > now:
                    await asyncio.sleep(next_time - now)

                # Check if we're still running
                if not self.running:
                    break

                # Check if we still have this stream
                with self._lock:
                    if username not in self.streams:
                        self.stream_queue.task_done()
                        continue

                # Check if we have too many active streams
                while len(self.active_streams) >= self.max_concurrent:
                    await asyncio.sleep(0.1)
                    if not self.running:
                        break

                # Process the stream
                asyncio.create_task(self._process_stream(username))

                # Mark task as done
                self.stream_queue.task_done()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in scheduler: {e}")
                traceback.print_exc()
                await asyncio.sleep(1)

    async def _health_check(self) -> None:
        """
        Periodic health check to log stats and ensure streams are being processed.
        """
        while self.running:
            try:
                # Log stats
                with self._lock:
                    uptime = int(time.time() - self.stats["start_time"])
                    total_streams = len(self.streams)
                    active_streams = len(self.active_streams)

                    # Calculate success rate
                    if self.stats["total_captures"] > 0:
                        success_rate = self.stats["successful_captures"] / self.stats["total_captures"] * 100
                    else:
                        success_rate = 0

                    logger.info(f"Health check: Uptime={uptime}s, Streams={total_streams}, "
                                f"Active={active_streams}, Captures={self.stats['total_captures']}, "
                                f"Success rate={success_rate:.1f}%, Dota matches={self.stats['dota_matches_found']}")

                # Wait for next check
                await asyncio.sleep(HEALTH_CHECK_INTERVAL)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in health check: {e}")
                await asyncio.sleep(10)

    async def _cleanup(self) -> None:
        """
        Periodic cleanup to remove old frames and handle stale streams.
        """
        while self.running:
            try:
                logger.info("Running cleanup")
                now = time.time()

                # Clean up old frames
                count = 0
                for frame_path in FRAMES_DIR.glob("*.jpg"):
                    try:
                        # Get file age
                        mtime = frame_path.stat().st_mtime
                        age = now - mtime

                        # Remove if too old
                        if age > MAX_FRAME_AGE:
                            frame_path.unlink()
                            count += 1
                    except Exception as e:
                        logger.error(f"Error cleaning up frame {frame_path}: {e}")

                logger.info(f"Cleaned up {count} old frames")

                # Wait for next cleanup
                await asyncio.sleep(CLEANUP_INTERVAL)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup: {e}")
                await asyncio.sleep(60)

    async def _initialize(self) -> None:
        """
        Initialize all streams for processing.
        """
        # Make sure the queue is initialized
        if self.stream_queue is None:
            self.stream_queue = asyncio.PriorityQueue()

        with self._lock:
            for username, info in self.streams.items():
                # Initialize all streams with random delays to prevent thundering herd
                delay = random.uniform(0, 5)
                await self.stream_queue.put((time.time() + delay, username))
                logger.debug(f"Queued stream {username} with delay {delay:.2f}s")

    async def run(self) -> None:
        """
        Run the stream manager asynchronously.
        """
        self.running = True
        self.loop = asyncio.get_running_loop()
        self.stats["start_time"] = time.time()

        try:
            # Start background tasks
            scheduler_task = asyncio.create_task(self._scheduler())
            health_check_task = asyncio.create_task(self._health_check())
            cleanup_task = asyncio.create_task(self._cleanup())

            # Initialize all streams
            await self._initialize()

            # Wait for SIGINT or other termination signal
            while self.running:
                await asyncio.sleep(1)

        except asyncio.CancelledError:
            logger.info("Stream manager received cancellation")
        finally:
            # Cleanup
            self.running = False

            # Cancel all tasks
            scheduler_task.cancel()
            health_check_task.cancel()
            cleanup_task.cancel()

            try:
                await asyncio.gather(
                    scheduler_task, health_check_task, cleanup_task,
                    return_exceptions=True
                )
            except Exception:
                pass

            # Shutdown executor
            self.executor.shutdown(wait=False)

            logger.info("Stream manager shutdown complete")

    def start(self) -> None:
        """
        Start the stream manager in a new thread.
        """
        if self.running:
            logger.warning("Stream manager already running")
            return

        def _run_loop():
            # Create a new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            # Initialize a new queue in this thread's loop
            self.stream_queue = asyncio.PriorityQueue()

            # Run the manager
            loop.run_until_complete(self.run())

        thread = threading.Thread(target=_run_loop)
        thread.daemon = True
        thread.start()

        logger.info("Stream manager started")

    def stop(self) -> None:
        """
        Stop the stream manager.
        """
        if not self.running:
            logger.warning("Stream manager not running")
            return

        self.running = False
        logger.info("Stream manager stopping...")

    def get_stats(self) -> Dict[str, Any]:
        """
        Get current statistics.

        Returns:
            Dict of stats
        """
        with self._lock:
            stats = self.stats.copy()
            stats["uptime"] = int(time.time() - stats["start_time"])
            stats["streams"] = len(self.streams)
            stats["active"] = len(self.active_streams)

            if stats["total_captures"] > 0:
                stats["success_rate"] = stats["successful_captures"] / stats["total_captures"] * 100
            else:
                stats["success_rate"] = 0

            return stats

    def get_stream_status(self, username: str) -> Optional[Dict[str, Any]]:
        """
        Get status of a specific stream.

        Args:
            username: Twitch username

        Returns:
            Stream status dict or None if not found
        """
        with self._lock:
            if username in self.streams:
                return self.streams[username].copy()
            return None

    def get_all_streams(self) -> Dict[str, Dict[str, Any]]:
        """
        Get status of all streams.

        Returns:
            Dict of username -> stream status
        """
        with self._lock:
            return {username: info.copy() for username, info in self.streams.items()}

# Create a simple CLI example
async def main():
    """
    Example usage of the StreamManager.
    """
    # Parse command line arguments
    import argparse
    parser = argparse.ArgumentParser(description='Twitch Stream Processor')
    parser.add_argument('--interval', type=int, default=DEFAULT_CAPTURE_INTERVAL,
                        help=f'Seconds between frame captures (default: {DEFAULT_CAPTURE_INTERVAL})')
    parser.add_argument('--max-concurrent', type=int, default=MAX_CONCURRENT_STREAMS,
                        help=f'Maximum concurrent streams (default: {MAX_CONCURRENT_STREAMS})')
    parser.add_argument('--quality', type=str, default=DEFAULT_QUALITY,
                        help=f'Stream quality (default: {DEFAULT_QUALITY})')
    parser.add_argument('--streams', type=str, default='',
                        help='Comma-separated list of Twitch usernames to monitor')
    parser.add_argument('--streams-file', type=str, default='',
                        help='Path to file containing Twitch usernames (one per line)')
    parser.add_argument('--run-time', type=int, default=0,
                        help='How long to run in seconds (0 = indefinitely)')

    args = parser.parse_args()

    # Create stream manager
    manager = StreamManager(
        capture_interval=args.interval,
        max_concurrent=args.max_concurrent,
        quality=args.quality
    )

    # Add streams from command line
    if args.streams:
        for username in args.streams.split(','):
            username = username.strip()
            if username:
                manager.add_stream(username)

    # Add streams from file
    if args.streams_file:
        try:
            with open(args.streams_file, 'r') as f:
                for line in f:
                    username = line.strip()
                    if username and not username.startswith('#'):
                        manager.add_stream(username)
        except Exception as e:
            logger.error(f"Error reading streams file: {e}")

    # Handle signals for graceful shutdown
    loop = asyncio.get_running_loop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(shutdown(manager)))

    # Start the manager
    manager_task = asyncio.create_task(manager.run())

    # Run for specified time or indefinitely
    if args.run_time > 0:
        try:
            await asyncio.sleep(args.run_time)
            await shutdown(manager)
        except asyncio.CancelledError:
            pass
    else:
        try:
            await manager_task
        except asyncio.CancelledError:
            pass

async def shutdown(manager):
    """Handle graceful shutdown."""
    logger.info("Shutting down...")
    manager.stop()

if __name__ == "__main__":
    asyncio.run(main())
