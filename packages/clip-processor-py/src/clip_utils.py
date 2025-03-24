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
