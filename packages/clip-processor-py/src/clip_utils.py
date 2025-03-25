import os
import re
import requests
import tempfile
from pathlib import Path
from bs4 import BeautifulSoup
import logging
from tqdm import tqdm
import json
from urllib.parse import quote
import cv2
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create temp directory
TEMP_DIR = Path("temp")
TEMP_DIR.mkdir(exist_ok=True)

def extract_clip_id(url):
    """Extract the clip ID from a Twitch clip URL."""
    # Expected format: clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi
    regex = r"clips\.twitch\.tv\/([^\/\s\-]+)(?:\-([^\/\s]+))?"
    match = re.search(regex, url)

    if not match:
        raise ValueError(f"Could not extract clip ID from URL: {url}")

    # Return the slug (first part) or the full ID if the second part exists
    if match.group(2):
        return f"{match.group(1)}-{match.group(2)}"
    return match.group(1)

def get_clip_details(url):
    """Get clip details and download URL using Twitch's API."""
    clip_id = extract_clip_id(url)

    try:
        # First request: Get clip token and video qualities
        headers = {
            "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko",  # Public client ID used by web client
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

        # GraphQL query for clip info, similar to TwitchDownloader
        gql_query = {
            "query": """
            query($slug: ID!) {
                clip(slug: $slug) {
                    playbackAccessToken(params: {platform: "web", playerType: "site", playerBackend: "mediaplayer"}) {
                        signature
                        value
                    }
                    videoQualities {
                        frameRate
                        quality
                        sourceURL
                    }
                    title
                    durationSeconds
                    broadcaster {
                        displayName
                    }
                    createdAt
                }
            }
            """,
            "variables": {
                "slug": clip_id
            }
        }

        logger.info(f"Sending GQL request for clip: {clip_id}")
        response = requests.post(
            "https://gql.twitch.tv/gql",
            headers=headers,
            json=gql_query
        )
        response.raise_for_status()

        # Parse response
        data = response.json()
        logger.debug(f"API response: {json.dumps(data, indent=2)}")

        clip_data = data.get("data", {}).get("clip")

        if not clip_data:
            logger.error(f"Clip data not found in response: {json.dumps(data, indent=2)}")
            raise ValueError(f"Clip not found or inaccessible: {clip_id}")

        # Check if we have playback token and video qualities
        if not clip_data.get("playbackAccessToken") or not clip_data.get("videoQualities"):
            logger.error(f"Missing playback token or qualities: {json.dumps(clip_data, indent=2)}")
            raise ValueError(f"Could not obtain playback token or video qualities for clip: {clip_id}")

        # Store all available qualities for reference
        available_qualities = [q["quality"] for q in clip_data["videoQualities"]]
        logger.info(f"Available qualities: {available_qualities}")

        # Try to find 1080p quality if available, otherwise use the best available quality
        best_quality = clip_data["videoQualities"][0]  # Default to highest quality
        # Always use the highest quality available (which is the first in the list)
        # The videoQualities array is already sorted by quality in descending order
        best_quality = clip_data["videoQualities"][0]
        logger.info(f"Selected highest available quality: {best_quality['quality']}p")

        logger.info(f"Selected quality: {best_quality['quality']}p")

        # Construct the download URL with signature and token
        token = clip_data["playbackAccessToken"]
        download_url = f"{best_quality['sourceURL']}?sig={token['signature']}&token={quote(token['value'])}"

        return {
            'id': clip_id,
            'url': url,
            'download_url': download_url,
            'duration': clip_data.get('durationSeconds'),
            'title': clip_data.get('title'),
            'broadcaster': clip_data.get('broadcaster', {}).get('displayName'),
            'created_at': clip_data.get('createdAt'),
            'qualities': clip_data['videoQualities'],
            'selected_quality': best_quality['quality'],  # Store the selected quality
            'available_qualities': available_qualities    # Store all available qualities
        }
    except Exception as e:
        logger.error(f"Error getting clip details using API: {e}")
        raise

def download_clip(clip_details):
    """Download the clip using the download URL."""
    if not clip_details.get('download_url'):
        raise ValueError("No download URL available")

    clip_id = clip_details['id']
    output_path = TEMP_DIR / f"{clip_id}.mp4"

    # Check if the file already exists in temp directory
    if output_path.exists():
        logger.info(f"Clip already exists at {output_path}, skipping download")
        return str(output_path)

    try:
        logger.info(f"Downloading clip to {output_path}")

        # Stream download with progress bar
        response = requests.get(clip_details['download_url'], stream=True)
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))
        block_size = 1024  # 1 Kibibyte

        with open(output_path, 'wb') as f, tqdm(
            desc="Downloading",
            total=total_size,
            unit='iB',
            unit_scale=True,
            unit_divisor=1024,
        ) as bar:
            for data in response.iter_content(block_size):
                size = f.write(data)
                bar.update(size)

        return str(output_path)
    except Exception as e:
        logger.error(f"Error downloading clip: {e}")
        raise

def extract_frames(video_path, clip_details=None, start_time=0, end_time=None, frame_interval=1):
    """
    Extract frames from the video starting from the end and working backwards.
    Uses OpenCV directly instead of MoviePy for better compatibility with Twitch clips.
    Will reuse existing frames if they've already been extracted.
    Resizes frames to 1080p if the video quality is different to ensure hero detection works properly.

    Args:
        video_path: Path to the video file
        clip_details: Dictionary containing clip details, including 'selected_quality'
        start_time: Start time in seconds
        end_time: End time in seconds (if None, uses video duration)
        frame_interval: Interval between frames in seconds

    Returns:
        List of paths to extracted frames
    """
    try:
        # Create frames directory
        frames_dir = TEMP_DIR / "frames"
        frames_dir.mkdir(exist_ok=True)

        # Get clip ID from video path to create a unique prefix for this clip's frames
        video_file = Path(video_path).name
        clip_id = video_file.split('.')[0]  # Remove extension
        frame_prefix = f"{clip_id}_frame_"

        # Check if frames for this clip already exist
        existing_frames = sorted(list(frames_dir.glob(f"{clip_id}_frame_*.jpg")))

        if existing_frames:
            logger.info(f"Found {len(existing_frames)} existing frames for this clip, reusing them")
            return [str(frame) for frame in existing_frames]

        # Open the video file
        logger.info(f"Opening video file with OpenCV: {video_path}")
        cap = cv2.VideoCapture(video_path)

        if not cap.isOpened():
            raise ValueError(f"Could not open video file: {video_path}")

        # Get video properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps if fps > 0 else 0

        # Get current video dimensions
        orig_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        orig_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Determine if resizing is needed
        need_resize = False
        target_width, target_height = 1920, 1080  # 1080p resolution

        if clip_details and 'selected_quality' in clip_details:
            selected_quality = clip_details['selected_quality']
            logger.info(f"Original video quality: {selected_quality}p")

            # Check if we need to resize based on selected quality
            if selected_quality != "1080":
                need_resize = True
                logger.info(f"Frames will be resized from {orig_width}x{orig_height} to {target_width}x{target_height}")

        logger.info(f"Video properties: FPS={fps}, Frames={frame_count}, Resolution={orig_width}x{orig_height}, Duration={duration:.2f}s")

        # If end_time is not specified, use the video duration
        if end_time is None:
            end_time = duration

        # Generate frame timestamps (working backwards)
        timestamps = []
        current_time = min(end_time, duration)
        while current_time >= start_time:
            timestamps.append(current_time)
            current_time -= frame_interval

        # Sort timestamps in ascending order for sequential reading
        timestamps.sort()

        # Extract frames
        frame_paths = []
        logger.info(f"Extracting {len(timestamps)} frames")

        with tqdm(total=len(timestamps), desc="Extracting frames") as progress_bar:
            for i, timestamp in enumerate(timestamps):
                # Convert timestamp to frame index
                frame_idx = int(timestamp * fps)

                # Set the video capture to the desired frame
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)

                # Read the frame
                ret, frame = cap.read()

                if not ret:
                    logger.warning(f"Could not read frame at timestamp {timestamp}s (frame {frame_idx})")
                    continue

                # Resize frame to 1080p if needed
                if need_resize and frame is not None:
                    frame = cv2.resize(frame, (target_width, target_height), interpolation=cv2.INTER_LANCZOS4)

                # Save the frame as an image with clip ID prefix
                frame_path = frames_dir / f"{frame_prefix}{i:05d}.jpg"
                cv2.imwrite(str(frame_path), frame)

                # Verify that the frame was actually saved
                if not frame_path.exists():
                    logger.warning(f"Failed to save frame at {frame_path}")
                    continue

                # Verify the saved file is a valid image file with non-zero size
                if frame_path.stat().st_size == 0:
                    logger.warning(f"Frame file at {frame_path} has zero size")
                    continue

                frame_paths.append(str(frame_path))
                progress_bar.update(1)

        # Release the video capture
        cap.release()

        # Final verification - make sure we actually extracted some frames
        if not frame_paths:
            logger.error("No frames were successfully extracted")
            # Check if frames directory exists and is accessible
            if not frames_dir.exists():
                logger.error(f"Frames directory {frames_dir} does not exist")
            elif not os.access(str(frames_dir), os.W_OK):
                logger.error(f"No write permission for frames directory {frames_dir}")
            # List contents of temp directory to help diagnose issues
            logger.info(f"Contents of temp directory: {os.listdir(TEMP_DIR)}")

        else:
            logger.info(f"Successfully extracted {len(frame_paths)} frames to {frames_dir}")

        return frame_paths
    except Exception as e:
        logger.error(f"Error extracting frames: {e}")
        raise

def download_single_frame(clip_details, timestamp=None):
    """
    Download and extract a single frame from a Twitch clip without downloading the entire clip.
    Uses HTTP Range requests to efficiently fetch a small portion of the video.

    Args:
        clip_details: Dictionary containing clip details from get_clip_details()
        timestamp: Time in seconds to extract the frame from (default: 80% through the clip)

    Returns:
        Path to the extracted frame image
    """
    if not clip_details.get('download_url'):
        raise ValueError("No download URL available")

    clip_id = clip_details['id']

    # Create frames directory
    frames_dir = TEMP_DIR / "frames"
    frames_dir.mkdir(exist_ok=True)

    # Define output path for the frame
    frame_path = frames_dir / f"{clip_id}_single_frame.jpg"

    # Check if we already have this frame
    if frame_path.exists():
        logger.info(f"Frame already exists at {frame_path}, reusing it")
        return str(frame_path)

    # If timestamp not specified, use a frame 80% through the clip duration
    # This is more likely to capture the game interface fully loaded
    if timestamp is None:
        if clip_details.get('duration'):
            timestamp = clip_details['duration'] * 0.8  # Use 80% through the clip instead of the middle
            logger.info(f"No timestamp specified, using 80% through clip: {timestamp:.2f}s")
        else:
            timestamp = 25  # Higher default if duration unknown (most Twitch clips are ~30s)
            logger.info(f"No timestamp or duration specified, using default: {timestamp}s")

    logger.info(f"Fetching single frame at timestamp {timestamp}s from clip {clip_id}")

    try:
        # Create a temporary file for the video segment
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as temp_file:
            temp_path = temp_file.name

        # More aggressive approach to minimize download size:
        # 1. Download a small header portion (to get metadata)
        # 2. Then download a small chunk around our target timestamp

        # Step 1: Download just enough to get the MP4 header (typically within first 1MB)
        header_size = 1024 * 1024  # 1MB should be enough for most MP4 headers

        # First, try to get just the MP4 header
        headers = {
            'Range': f'bytes=0-{header_size-1}',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }

        logger.info(f"Downloading MP4 header (first {header_size} bytes)")
        response = requests.get(clip_details['download_url'], headers=headers, stream=True)

        # Check if we got a partial content response
        if response.status_code != 206:
            logger.warning(f"Server doesn't support range requests (status: {response.status_code}). Falling back to alternative method.")
            # Fall back to downloading a larger chunk from the beginning
            header_size = 5 * 1024 * 1024  # 5MB
            headers = {
                'Range': f'bytes=0-{header_size-1}',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            response = requests.get(clip_details['download_url'], headers=headers, stream=True)

        # Write header portion to temp file
        with open(temp_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        # Open the file to check if we have enough data to get video info
        cap = cv2.VideoCapture(temp_path)
        if not cap.isOpened():
            logger.warning("Couldn't open video with header only, downloading more data")
            cap.release()

            # If we couldn't open with just the header, download a bit more
            # Try downloading 25% of estimated file size based on duration
            if clip_details.get('duration'):
                # Use a more conservative estimate: 500KB per second of HD video
                estimated_bytes_per_second = 500 * 1024  # 500KB per second (conservative estimate)
                estimated_total = int(clip_details['duration'] * estimated_bytes_per_second)
                download_size = min(estimated_total // 4, 20 * 1024 * 1024)  # 25% of total or max 20MB
            else:
                download_size = 10 * 1024 * 1024  # 10MB if duration unknown

            headers = {
                'Range': f'bytes=0-{download_size-1}',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }

            logger.info(f"Downloading larger portion of video: {download_size / (1024*1024):.1f}MB")
            response = requests.get(clip_details['download_url'], headers=headers, stream=True)

            with open(temp_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            # Try opening again
            cap = cv2.VideoCapture(temp_path)

            if not cap.isOpened():
                logger.warning("Still couldn't open video, attempting one final approach")
                cap.release()

                # Last resort: try a direct seek approach
                # This works for some streaming formats where the moov atom is at the end
                # Get a chunk at the beginning and a chunk around our target time

                # First chunk: first 2MB
                first_chunk_size = 2 * 1024 * 1024

                # Second chunk: 2MB around the target timestamp
                if clip_details.get('duration'):
                    # Estimate byte position based on timestamp and duration
                    estimated_bytes_per_second = 500 * 1024  # Conservative estimate
                    total_estimated_size = clip_details['duration'] * estimated_bytes_per_second

                    # Calculate position as percentage of total size
                    position_ratio = timestamp / clip_details['duration']
                    estimated_byte_pos = int(total_estimated_size * position_ratio)

                    # Get 1MB before and 1MB after the estimated position
                    chunk_start = max(first_chunk_size, estimated_byte_pos - (1024 * 1024))
                    chunk_end = chunk_start + (2 * 1024 * 1024)
                else:
                    # If duration unknown, just get bytes 5MB-7MB as second chunk
                    chunk_start = 5 * 1024 * 1024
                    chunk_end = 7 * 1024 * 1024

                # Download first chunk
                headers = {
                    'Range': f'bytes=0-{first_chunk_size-1}',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }

                logger.info(f"Trying multi-chunk approach: first chunk 0-{first_chunk_size-1} bytes")
                response = requests.get(clip_details['download_url'], headers=headers, stream=True)

                with open(temp_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)

                # Download second chunk and append to the same file
                headers = {
                    'Range': f'bytes={chunk_start}-{chunk_end-1}',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }

                logger.info(f"Downloading second chunk {chunk_start}-{chunk_end-1} bytes")
                response = requests.get(clip_details['download_url'], headers=headers, stream=True)

                with open(temp_path, 'ab') as f:  # Append to the file
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)

                # Try opening again
                cap = cv2.VideoCapture(temp_path)

                if not cap.isOpened():
                    # If all approaches fail, fall back to downloading the whole clip
                    logger.warning("All optimized download approaches failed. Falling back to downloading the entire clip.")
                    full_download = True
                else:
                    full_download = False
            else:
                full_download = False
        else:
            # Check if we can actually read a frame with just the header
            ret, _ = cap.read()
            if not ret:
                # If we can't read a frame, we need more data
                logger.info("Header downloaded but can't read frames yet, downloading frame data")
                cap.release()

                # Get FPS from the clip details or guess
                target_fps = 30  # Default assumption
                if clip_details.get('qualities'):
                    # Look for frameRate in the selected quality
                    for quality in clip_details['qualities']:
                        if str(quality.get('quality')) == str(clip_details.get('selected_quality')):
                            if quality.get('frameRate'):
                                target_fps = quality.get('frameRate')

                # More aggressive: download a small window around our target frame
                # Calculate byte offsets for the target frame
                estimated_bytes_per_second = 500 * 1024  # More conservative: 500KB per second

                if clip_details.get('duration'):
                    # Calculate position as percentage of total size
                    position_ratio = timestamp / clip_details['duration']
                    total_estimated_size = clip_details['duration'] * estimated_bytes_per_second
                    target_byte_pos = int(total_estimated_size * position_ratio)

                    # Get ~3 seconds worth of data around target (1.5s before, 1.5s after)
                    bytes_per_frame = estimated_bytes_per_second / target_fps
                    frame_window = int(target_fps * 3)  # 3 seconds worth of frames
                    byte_window = int(bytes_per_frame * frame_window)

                    # Ensure we don't go below header size when calculating start position
                    start_pos = max(header_size, target_byte_pos - (byte_window // 2))
                    end_pos = start_pos + byte_window

                    logger.info(f"Downloading frame data from bytes {start_pos} to {end_pos} (estimated ~3s of video)")

                    headers = {
                        'Range': f'bytes={start_pos}-{end_pos}',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }

                    response = requests.get(clip_details['download_url'], headers=headers, stream=True)

                    with open(temp_path, 'ab') as f:  # Append to the file with the header
                        for chunk in response.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)

                    # Try opening again
                    cap = cv2.VideoCapture(temp_path)
                    if not cap.isOpened() or not cap.read()[0]:
                        # If still can't read, fall back to downloading larger portion
                        logger.warning("Still couldn't read frames with targeted chunk download, getting larger portion")
                        cap.release()

                        # Download 25% of the video
                        download_size = min(total_estimated_size // 4, 20 * 1024 * 1024)  # 25% of total or max 20MB
                        headers = {
                            'Range': f'bytes=0-{download_size}',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        }

                        logger.info(f"Downloading 25% of video: {download_size / (1024*1024):.1f}MB")
                        response = requests.get(clip_details['download_url'], headers=headers, stream=True)

                        with open(temp_path, 'wb') as f:  # Overwrite with a fresh download
                            for chunk in response.iter_content(chunk_size=8192):
                                if chunk:
                                    f.write(chunk)

                        cap = cv2.VideoCapture(temp_path)
                        full_download = not (cap.isOpened() and cap.read()[0])
                    else:
                        full_download = False
                else:
                    # If duration unknown, just download a bit more
                    download_size = 10 * 1024 * 1024  # 10MB
                    headers = {
                        'Range': f'bytes=0-{download_size}',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }

                    logger.info(f"Duration unknown, downloading {download_size / (1024*1024):.1f}MB")
                    response = requests.get(clip_details['download_url'], headers=headers, stream=True)

                    with open(temp_path, 'wb') as f:  # Overwrite with a fresh download
                        for chunk in response.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)

                    cap = cv2.VideoCapture(temp_path)
                    full_download = not (cap.isOpened() and cap.read()[0])
            else:
                cap.release()  # Release and reopen after we know it works
                cap = cv2.VideoCapture(temp_path)
                full_download = False

        # If we need to download the full clip as a last resort
        if full_download:
            logger.warning("Optimized approaches failed. Downloading entire clip as last resort.")
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}

            logger.info("Downloading the entire clip")
            response = requests.get(clip_details['download_url'], headers=headers, stream=True)
            response.raise_for_status()

            with open(temp_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            cap = cv2.VideoCapture(temp_path)
            if not cap.isOpened():
                raise ValueError(f"Could not open video file even after downloading the entire clip: {temp_path}")

        # Get video properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        orig_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        orig_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_duration = frame_count / fps if fps > 0 else 0

        logger.info(f"Video properties: FPS={fps}, Frames={frame_count}, Duration={actual_duration:.2f}s, Resolution={orig_width}x{orig_height}")

        # Calculate the frame index based on timestamp and actual duration
        # If timestamp exceeds actual_duration, cap it to available frame count
        effective_timestamp = min(timestamp, actual_duration * 0.95) if actual_duration > 0 else timestamp
        frame_idx = int(effective_timestamp * fps) if fps > 0 else 0
        frame_idx = min(frame_idx, frame_count - 1)

        # Set video position and extract frame
        logger.info(f"Seeking to frame {frame_idx} (timestamp {effective_timestamp}s)")
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()

        if not ret:
            # If seeking to exact frame fails, try getting a frame near the beginning
            logger.warning(f"Could not read frame at position {frame_idx}, trying alternate frames")

            # Try a few different frames, starting with earlier frames
            test_positions = [10, 30, frame_count // 2, frame_count // 4]
            for pos in test_positions:
                cap.set(cv2.CAP_PROP_POS_FRAMES, pos)
                ret, frame = cap.read()
                if ret:
                    logger.info(f"Successfully read frame at position {pos}")
                    break

            if not ret:
                raise ValueError(f"Could not read any frames from the video")

        # Resize frame to 1080p if needed
        target_width, target_height = 1920, 1080
        if orig_width != target_width or orig_height != target_height:
            frame = cv2.resize(frame, (target_width, target_height), interpolation=cv2.INTER_LANCZOS4)

        # Save the frame
        cv2.imwrite(str(frame_path), frame)

        # Clean up
        cap.release()
        try:
            os.unlink(temp_path)
        except Exception as e:
            logger.warning(f"Failed to delete temporary file {temp_path}: {e}")

        # Verify the frame was saved successfully
        if not frame_path.exists() or frame_path.stat().st_size == 0:
            raise ValueError(f"Failed to save frame to {frame_path}")

        logger.info(f"Successfully extracted single frame to {frame_path}")
        return str(frame_path)

    except Exception as e:
        logger.error(f"Error extracting single frame: {e}")
        # Clean up temporary file if it exists
        try:
            if 'temp_path' in locals() and os.path.exists(temp_path):
                os.unlink(temp_path)
        except:
            pass
        raise
