import os
import logging
import tempfile
import time
from pathlib import Path
import streamlink
import cv2
import numpy as np
from streamlink.stream import Stream
import re

# Try to import pytesseract for OCR-based detection
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    print("Warning: pytesseract not available, using image-based detection only")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('stream_utils.log')
    ]
)
logger = logging.getLogger(__name__)

# Create temp directory
TEMP_DIR = Path("temp")
TEMP_DIR.mkdir(exist_ok=True)

def get_stream_url(username, quality='best'):
    """
    Get the stream URL for a given Twitch username.

    Args:
        username (str): Twitch username
        quality (str): Stream quality (default: 'best')

    Returns:
        str: URL of the stream or None if stream is not available
    """
    try:
        # Construct the Twitch URL
        url = f"https://www.twitch.tv/{username}"
        logger.info(f"Getting stream URL for: {url}")

        # Create a Streamlink session with ad-blocking options
        session = streamlink.Streamlink()

        # Set options to work around ads and "preparing your stream" messages
        session.set_option("twitch-disable-ads", True)
        session.set_option("twitch-low-latency", True)
        session.set_option("stream-timeout", 60)
        session.set_option("retry-streams", 3)  # Retry getting streams up to 3 times
        session.set_option("retry-open", 3)     # Retry opening the stream up to 3 times

        # Try to get available streams
        logger.info("Getting available streams...")
        streams = session.streams(url)

        if not streams:
            logger.warning(f"No streams available for {username}")
            return None

        # Choose the desired quality or fall back to best available
        stream_quality = quality
        available_qualities = list(streams.keys())
        logger.info(f"Available qualities: {available_qualities}")

        if stream_quality not in streams:
            logger.info(f"Quality '{quality}' not available, using best quality")
            stream_quality = 'best'

        # Get the stream URL
        return streams[stream_quality].url

    except Exception as e:
        logger.error(f"Error getting stream URL: {e}")
        return None

def capture_frame_from_stream(username, quality='1080p60', max_retries=5, retry_delay=3, frames_to_skip=5):
    """
    Capture a single frame from a Twitch stream.

    Args:
        username (str): Twitch username
        quality (str): Stream quality (default: '1080p60')
        max_retries (int): Maximum number of retries to get past ads or "preparing" screens
        retry_delay (int): Seconds to wait between retries
        frames_to_skip (int): Number of frames to skip before capturing, helps avoid ads

    Returns:
        str: Path to the saved frame or None if capture failed
    """
    try:
        # Create a unique filename for this user's frame
        frames_dir = TEMP_DIR / "frames"
        frames_dir.mkdir(exist_ok=True)

        # Try multiple times to get a frame that isn't an ad or "preparing" screen
        for retry in range(max_retries):
            frame_path = frames_dir / f"{username}_{int(time.time())}.jpg"

            # Get the stream URL
            stream_url = get_stream_url(username, quality)
            if not stream_url:
                logger.error(f"Could not get stream URL for {username}")
                time.sleep(retry_delay)
                continue

            # Open the stream with OpenCV
            logger.info(f"Opening stream: {stream_url}")
            capture = cv2.VideoCapture(stream_url)

            # Set the frame rate to 5fps to avoid overwhelming the system
            capture.set(cv2.CAP_PROP_FPS, 5)

            if not capture.isOpened():
                logger.error(f"Failed to open stream: {stream_url}")
                time.sleep(retry_delay)
                continue

            # Skip initial frames to avoid ads (using 5fps, so 5th frame is at 1 second)
            logger.info(f"Skipping {frames_to_skip} initial frames to avoid ads")
            for i in range(frames_to_skip):
                skip_success, _ = capture.read()
                if not skip_success:
                    logger.warning(f"Failed to skip frame {i+1}/{frames_to_skip}")
                    time.sleep(0.2)  # Shorter wait time for 5fps
                else:
                    logger.debug(f"Skipped frame {i+1}/{frames_to_skip}")
                    # Wait 1/5 second between frames to maintain 5fps
                    time.sleep(0.2)

            # Try to read a frame with timeout
            max_attempts = 30
            for attempt in range(max_attempts):
                success, frame = capture.read()
                if success:
                    # Save the frame
                    cv2.imwrite(str(frame_path), frame)
                    logger.info(f"Frame captured and saved to {frame_path}")

                    # Check if the frame is likely an ad or "preparing" screen
                    if is_preparing_screen(frame):
                        logger.warning("Detected 'preparing your stream' screen, retrying...")
                        time.sleep(retry_delay)
                        # Continue to the next retry
                        break
                    else:
                        # Release the capture and return the path
                        capture.release()
                        return str(frame_path)

                logger.warning(f"Failed to read frame, attempt {attempt+1}/{max_attempts}")
                time.sleep(0.2)  # Wait 1/5 second to maintain 5fps

            # Release the capture before the next retry
            capture.release()
            logger.info(f"Retrying capture, attempt {retry+1}/{max_retries}")
            time.sleep(retry_delay)

        # If we got here, we failed to capture a usable frame after all retries
        logger.error(f"Failed to capture usable frame after {max_retries} retries")
        return None

    except Exception as e:
        logger.error(f"Error capturing frame: {e}")
        return None

def is_preparing_screen(frame):
    """
    Check if the frame contains a "preparing your stream" message or is an ad.

    Uses a combination of image analysis and OCR (if available) to detect
    Twitch's loading/ad screens.

    Args:
        frame: The OpenCV frame to check

    Returns:
        bool: True if the frame appears to be a loading/ad screen, False otherwise
    """
    try:
        # First perform basic image analysis
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Check for mostly dark or uniform images (common in "preparing" screens)
        mean_val = np.mean(gray)
        std_val = np.std(gray)

        # Most "preparing" screens are either very dark or have low variation
        if mean_val < 30 or std_val < 25:
            logger.info(f"Detected possible ad/preparing screen (dark/uniform): mean={mean_val:.1f}, std={std_val:.1f}")
            return True

        # Save the debug image if needed
        debug_frames_dir = TEMP_DIR / "debug_frames"
        debug_frames_dir.mkdir(exist_ok=True)
        debug_path = debug_frames_dir / f"screen_check_{int(time.time())}.jpg"
        cv2.imwrite(str(debug_path), frame)

        # If pytesseract is available, perform OCR to detect specific text
        if TESSERACT_AVAILABLE:
            # Use pytesseract to extract text from the image
            try:
                # Process the image to improve OCR accuracy
                # Increase contrast and apply thresholding for better text detection
                enhanced = cv2.convertScaleAbs(frame, alpha=1.5, beta=0)
                _, thresh = cv2.threshold(cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY),
                                         150, 255, cv2.THRESH_BINARY)

                # Save the processed image for OCR
                processed_path = debug_frames_dir / f"ocr_processed_{int(time.time())}.jpg"
                cv2.imwrite(str(processed_path), thresh)

                # Extract text from the image
                text = pytesseract.image_to_string(thresh)

                # Log the extracted text for debugging
                logger.debug(f"OCR extracted text: {text}")

                # Look for common phrases in Twitch's "preparing" and ad screens
                preparing_phrases = [
                    "preparing your stream",
                    "preparing",
                    "stream will begin",
                    "about to begin",
                    "starting soon",
                    "ad break",
                    "advertisement"
                ]

                # Check if any of the phrases are in the extracted text
                for phrase in preparing_phrases:
                    if phrase.lower() in text.lower():
                        logger.info(f"OCR detected '{phrase}' text in frame")
                        return True

            except Exception as ocr_err:
                logger.warning(f"Error during OCR processing: {ocr_err}")

        # Add additional check for Twitch's purple colors (common in their branded screens)
        # Convert to HSV for better color detection
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

        # Define range for Twitch purple color
        lower_purple = np.array([120, 50, 50])
        upper_purple = np.array([150, 255, 255])

        # Create a mask for the purple color
        purple_mask = cv2.inRange(hsv, lower_purple, upper_purple)

        # Calculate the percentage of purple pixels
        purple_percent = np.count_nonzero(purple_mask) / (frame.shape[0] * frame.shape[1]) * 100

        # If there's a significant amount of Twitch purple, it might be a branded screen
        if purple_percent > 15:
            logger.info(f"Detected significant Twitch purple color: {purple_percent:.1f}%")
            return True

        # If we get here, the frame is probably not a "preparing" screen
        return False
    except Exception as e:
        logger.error(f"Error checking frame type: {e}")
        return False

def capture_multiple_frames(username, quality='1080p60', num_frames=3, interval=2, max_retries=5, frames_to_skip=5):
    """
    Capture multiple frames from a Twitch stream.

    Args:
        username (str): Twitch username
        quality (str): Stream quality (default: '1080p60')
        num_frames (int): Number of frames to capture
        interval (int): Interval between frames in seconds
        max_retries (int): Maximum retries per frame to get past ads/preparing screens
        frames_to_skip (int): Number of frames to skip before capturing, helps avoid ads

    Returns:
        list: Paths to the saved frames or empty list if capture failed
    """
    try:
        # Create a unique session ID for this capture
        session_id = int(time.time())
        frames_dir = TEMP_DIR / "frames"
        frames_dir.mkdir(exist_ok=True)

        # Get the stream URL with ad-blocking options
        stream_url = get_stream_url(username, quality)
        if not stream_url:
            logger.error(f"Could not get stream URL for {username}")
            return []

        # Open the stream with OpenCV
        logger.info(f"Opening stream: {stream_url}")
        capture = cv2.VideoCapture(stream_url)

        # Set the frame rate to 5fps
        capture.set(cv2.CAP_PROP_FPS, 5)

        if not capture.isOpened():
            logger.error(f"Failed to open stream: {stream_url}")
            return []

        # Skip initial frames to avoid ads (using 5fps, so 5th frame is at 1 second)
        logger.info(f"Skipping {frames_to_skip} initial frames to avoid ads")
        for i in range(frames_to_skip):
            skip_success, _ = capture.read()
            if not skip_success:
                logger.warning(f"Failed to skip frame {i+1}/{frames_to_skip}")
                time.sleep(0.2)  # Shorter wait time for 5fps
            else:
                logger.debug(f"Skipped frame {i+1}/{frames_to_skip}")
                # Wait 1/5 second between frames to maintain 5fps
                time.sleep(0.2)

        frame_paths = []
        retries_left = max_retries

        # Capture multiple frames
        for i in range(num_frames):
            # Continue trying until we get a valid frame or run out of retries
            while retries_left > 0:
                # Try to read a frame with timeout
                max_attempts = 10
                for attempt in range(max_attempts):
                    success, frame = capture.read()
                    if success:
                        # Save the frame
                        frame_path = frames_dir / f"{username}_{session_id}_frame_{i}.jpg"
                        cv2.imwrite(str(frame_path), frame)

                        # Check if it's a "preparing" screen
                        if is_preparing_screen(frame):
                            logger.warning(f"Frame {i+1} appears to be a 'preparing' screen, retrying...")
                            retries_left -= 1
                            time.sleep(0.5)  # Wait before retrying
                            break
                        else:
                            # Valid frame captured
                            logger.info(f"Frame {i+1}/{num_frames} captured and saved to {frame_path}")
                            frame_paths.append(str(frame_path))
                            retries_left = max_retries  # Reset retries for next frame
                            break

                    logger.warning(f"Failed to read frame {i+1}, attempt {attempt+1}/{max_attempts}")
                    time.sleep(0.2)  # Wait 1/5 second to maintain 5fps

                # If we got a valid frame, break out of the retry loop
                if len(frame_paths) == i + 1:
                    break

                # If we've used all retries, give up on this frame
                if retries_left == 0:
                    logger.error(f"Failed to capture valid frame {i+1} after all retries")
                    break

            # Wait for the next frame if we're not at the last one
            # If interval is set to 2, need to wait 2*5 = 10 frames at 5fps
            if i < num_frames - 1 and len(frame_paths) == i + 1:
                num_frames_to_wait = interval * 5
                logger.info(f"Waiting {interval} seconds ({num_frames_to_wait} frames at 5fps) before next capture")
                for _ in range(num_frames_to_wait):
                    # Read and discard frames to maintain timing
                    capture.read()
                    time.sleep(0.2)  # Wait 1/5 second to maintain 5fps

        # Release the capture
        capture.release()

        if not frame_paths:
            logger.error(f"Failed to capture any frames")
            return []

        logger.info(f"Successfully captured {len(frame_paths)} frames")
        return frame_paths

    except Exception as e:
        logger.error(f"Error capturing frames: {e}")
        return []
