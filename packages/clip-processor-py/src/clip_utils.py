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

        # Select the best quality (first in the list, as TwitchDownloader sorts by quality)
        best_quality = clip_data["videoQualities"][0]

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
            'qualities': clip_data['videoQualities']
        }
    except Exception as e:
        logger.error(f"Error getting clip details using API: {e}")

        # Fallback to HTML scraping method if API fails
        logger.info("Trying fallback method using HTML scraping...")
        try:
            return get_clip_details_fallback(url, clip_id)
        except Exception as fallback_error:
            logger.error(f"Fallback method also failed: {fallback_error}")
            raise

def get_clip_details_fallback(url, clip_id):
    """Fallback method to get clip details from HTML page."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    logger.info(f"Making HTTP request to: https://clips.twitch.tv/{clip_id}")
    response = requests.get(f"https://clips.twitch.tv/{clip_id}", headers=headers)
    response.raise_for_status()

    # Log response size for debugging
    logger.info(f"Response status: {response.status_code}, size: {len(response.text)} bytes")

    # Parse HTML
    soup = BeautifulSoup(response.text, 'html.parser')

    # Find the video URL meta tag
    meta_tag = soup.find('meta', property='og:video:secure_url')

    if not meta_tag or not meta_tag.get('content'):
        logger.info("Trying alternative meta tag")
        meta_tag = soup.find('meta', property='og:video')

    if not meta_tag or not meta_tag.get('content'):
        # Log some page details for debugging
        meta_tags = soup.find_all('meta')
        logger.debug(f"Available meta tags: {[{tag.get('property', tag.get('name', 'unknown')): tag.get('content', 'no-content')} for tag in meta_tags]}")

        # Try another approach - look for video tags or JSON data
        scripts = soup.find_all('script', type='application/json')
        if scripts:
            logger.info(f"Found {len(scripts)} JSON scripts in page, trying to find video URL")
            for script in scripts:
                try:
                    json_data = json.loads(script.string)
                    logger.debug(f"Script content: {json.dumps(json_data, indent=2)[:500]}...")
                    # Look for video URLs in the JSON
                    # Implementation depends on Twitch's specific JSON structure
                except Exception as json_error:
                    logger.debug(f"Error parsing JSON: {json_error}")

        raise ValueError("Could not find clip download URL in the page")

    download_url = meta_tag['content']
    logger.info(f"Found download URL: {download_url}")

    # Find duration if available
    duration_tag = soup.find('meta', property='video:duration')
    duration = float(duration_tag['content']) if duration_tag and duration_tag.get('content') else None

    # Get title if available
    title_tag = soup.find('meta', property='og:title')
    title = title_tag['content'] if title_tag and title_tag.get('content') else None

    return {
        'id': clip_id,
        'url': url,
        'download_url': download_url,
        'duration': duration,
        'title': title
    }

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

def extract_frames(video_path, start_time=0, end_time=None, frame_interval=1):
    """
    Extract frames from the video starting from the end and working backwards.
    Uses OpenCV directly instead of MoviePy for better compatibility with Twitch clips.
    Will reuse existing frames if they've already been extracted.

    Args:
        video_path: Path to the video file
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

        logger.info(f"Video properties: FPS={fps}, Frames={frame_count}, Duration={duration:.2f}s")

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
