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

def extract_frames(video_path, output_dir, fps=1.0, max_frames=None, debug=False):
    """
    Extract frames from a video file.

    Args:
        video_path: Path to the video file
        output_dir: Directory to save the extracted frames
        fps: Frames per second to extract
        max_frames: Maximum number of frames to extract
        debug: Whether to print debug messages

    Returns:
        list: List of extracted frame paths
    """
    try:
        # Create output directory if it doesn't exist
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Get the video file name without extension
        video_name = Path(video_path).stem

        # Open the video file
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            logger.error(f"Could not open video file: {video_path}")
            return []

        # Get video properties
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        video_fps = cap.get(cv2.CAP_PROP_FPS)

        # Log video details
        logger.info(f"Video: {video_path}")
        logger.info(f"Total frames: {total_frames}")
        logger.info(f"Video FPS: {video_fps}")
        logger.info(f"Target extract FPS: {fps}")

        # Calculate the frame step based on the requested FPS
        frame_step = int(video_fps / fps)

        # Limit the number of frames if requested
        if max_frames:
            frame_limit = min(total_frames, max_frames * frame_step)
        else:
            frame_limit = total_frames

        # Extract frames
        extracted_frames = []
        frame_count = 0
        with tqdm(total=frame_limit//frame_step, desc="Extracting frames", disable=not debug) as pbar:
            while frame_count < frame_limit:
                # Set the position in the video
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_count)

                # Read the frame
                ret, frame = cap.read()
                if not ret:
                    logger.warning(f"Failed to read frame at position {frame_count}")
                    break

                # Generate filename for the frame
                timestamp = frame_count / video_fps
                formatted_timestamp = format_timestamp(timestamp)
                frame_filename = f"{video_name}_{formatted_timestamp}.jpg"  # Use jpg extension
                frame_path = output_dir / frame_filename

                # Save the frame with high quality JPEG to avoid PNG profile warnings
                cv2.imwrite(str(frame_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 100])

                # Add to the list of extracted frames
                extracted_frames.append(frame_path)

                # Move to the next frame based on the frame step
                frame_count += frame_step

                # Update progress bar
                pbar.update(1)

        # Release the video capture
        cap.release()

        logger.info(f"Extracted {len(extracted_frames)} frames from {video_path}")
        return extracted_frames
    except Exception as e:
        logger.error(f"Error extracting frames: {e}")
        return []
