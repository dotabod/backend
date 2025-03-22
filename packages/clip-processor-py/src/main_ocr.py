#!/usr/bin/env python3
"""
Twitch Clip Processor - Direct OCR Version

This script processes a Twitch clip to extract player names and ranks directly using OCR
without relying on complex card detection logic.
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime
from pathlib import Path
from tqdm import tqdm
import cv2
import pytesseract
import re
from PIL import Image
import numpy as np

# Import our modules
from clip_utils import extract_clip_id, get_clip_details, download_clip, extract_frames
from player_extractor import process_frame_for_players  # Import our player extractor

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create temp directory
TEMP_DIR = Path("temp")
TEMP_DIR.mkdir(exist_ok=True)

# Debug directory for OCR results
OCR_DEBUG_DIR = TEMP_DIR / "ocr_debug"
OCR_DEBUG_DIR.mkdir(exist_ok=True, parents=True)

# Default clip URL from the user's query
DEFAULT_CLIP_URL = "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi"

def save_debug_image(image, name, additional_info=""):
    """Save an image for debugging purposes."""
    if not os.environ.get("DEBUG_IMAGES", "").lower() in ("1", "true", "yes"):
        return None

    filepath = OCR_DEBUG_DIR / f"{name}.jpg"

    # Add text annotation with additional info if provided
    if additional_info:
        # Make a copy to avoid modifying original
        image_copy = image.copy()
        cv2.putText(image_copy, additional_info, (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        image = image_copy

    cv2.imwrite(str(filepath), image)
    logger.debug(f"Saved debug image: {filepath}")
    return str(filepath)

def preprocess_frame(image):
    """Preprocess a frame for OCR."""
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    save_debug_image(gray, "gray")

    # Apply CLAHE for better contrast
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    save_debug_image(enhanced, "enhanced")

    # Apply thresholding
    _, binary = cv2.threshold(enhanced, 150, 255, cv2.THRESH_BINARY)
    save_debug_image(binary, "binary")

    # Apply morphological operations to clean up noise
    kernel = np.ones((2,2), np.uint8)
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    save_debug_image(cleaned, "cleaned")

    return gray, enhanced, binary, cleaned

def extract_text_from_frame(image_path):
    """
    Extract all text from a frame using OCR.

    Args:
        image_path: Path to the frame image

    Returns:
        dict: Contains extracted text and processing results
    """
    logger.debug(f"Extracting text from frame: {image_path}")

    # Load the image
    image = cv2.imread(image_path)
    if image is None:
        logger.error(f"Failed to load image: {image_path}")
        return {"success": False, "text": "", "score": 0}

    # Save original for debugging
    save_debug_image(image, "original")

    # Preprocess the image
    gray, enhanced, binary, cleaned = preprocess_frame(image)

    # Use our player extractor to try to extract players from the top bar
    players = process_frame_for_players(image)

    # Calculate a score based on the number of players found
    player_score = len(players) * 10

    # Detect if this frame likely contains a player list using traditional method
    has_player_list = check_for_player_list(enhanced)

    # Convert to PIL Image for OCR
    pil_enhanced = Image.fromarray(enhanced)
    pil_binary = Image.fromarray(binary)

    # Try different OCR approaches
    text_results = []

    # Regular OCR
    text_enhanced = pytesseract.image_to_string(pil_enhanced)
    text_results.append(("Enhanced", text_enhanced))

    # Binary OCR
    text_binary = pytesseract.image_to_string(pil_binary)
    text_results.append(("Binary", text_binary))

    # OCR with page segmentation mode 4 (single column of text)
    text_col = pytesseract.image_to_string(pil_enhanced, config='--psm 4')
    text_results.append(("Column", text_col))

    # OCR with page segmentation mode 6 (single block of text)
    text_block = pytesseract.image_to_string(pil_enhanced, config='--psm 6')
    text_results.append(("Block", text_block))

    # Combine text results
    all_text = "\n".join([text for _, text in text_results])

    # Score the frame based on likely player names using traditional method
    traditional_score = score_frame_for_players(all_text)

    # Combine scores, preferring the player extractor score if it found players
    score = max(player_score, traditional_score)

    # Save a debug image with the combined text
    debug_text = f"Score: {score}, Players found: {len(players)}, Has player list: {has_player_list}"
    save_debug_image(image, "text_results", debug_text)

    # If we didn't get any players from the top bar extractor, try the traditional method
    if not players:
        traditional_players = extract_players_from_text(all_text, traditional_score)
        if traditional_players:
            logger.info(f"Using traditional player extraction: found {len(traditional_players)} players")
            players = traditional_players

    return {
        "success": True,
        "text": all_text,
        "score": score,
        "has_player_list": has_player_list,
        "text_results": text_results,
        "players": players
    }

def check_for_player_list(image):
    """Check if the image likely contains a player list using image analysis."""

    # Check for horizontal lines that might indicate a list
    edges = cv2.Canny(image, 50, 150, apertureSize=3)
    save_debug_image(edges, "edges")

    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=100, minLineLength=100, maxLineGap=10)

    horizontal_lines = 0
    if lines is not None:
        # Draw lines for debugging
        line_image = np.zeros_like(image)

        for line in lines:
            x1, y1, x2, y2 = line[0]
            # Check if line is more horizontal than vertical
            if abs(x2 - x1) > abs(y2 - y1):
                horizontal_lines += 1
                cv2.line(line_image, (x1, y1), (x2, y2), 255, 2)

        save_debug_image(line_image, "horizontal_lines")

    # Look for text-like contours in expected regions
    _, thresh = cv2.threshold(image, 150, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    text_like_contours = 0
    debug_image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if 10 < w < 200 and 5 < h < 30:  # Typical text dimensions
            text_like_contours += 1
            cv2.rectangle(debug_image, (x, y), (x + w, y + h), (0, 0, 255), 2)

    save_debug_image(debug_image, "text_contours", f"Text contours: {text_like_contours}")

    # Return true if we have enough horizontal lines and text contours
    return horizontal_lines >= 3 and text_like_contours >= 10

def score_frame_for_players(text):
    """Score a frame's text for likely player content."""
    score = 0

    # Check for player name patterns
    name_pattern = r'\b[A-Z][a-zA-Z]{2,}\b'  # Capitalized words of 3+ chars
    names = re.findall(name_pattern, text)
    score += len(names) * 2

    # Check for rank patterns
    rank_pattern = r'\b\d{1,3}(?:,\d{3})+\b'  # Numbers with commas
    ranks = re.findall(rank_pattern, text)
    score += len(ranks) * 3

    # Check for common words in player lists
    common_words = ["player", "rank", "score", "points", "level", "team"]
    for word in common_words:
        if word.lower() in text.lower():
            score += 5

    # Check for multiple lines of text (potential list)
    lines = [line for line in text.split('\n') if line.strip()]
    if len(lines) >= 3:
        score += 10

    # Check for consecutive lines with similar patterns
    pattern_matches = 0
    for i in range(1, len(lines)):
        if len(lines[i-1]) > 0 and len(lines[i]) > 0:
            # Check if both lines have similar structure
            if abs(len(lines[i-1]) - len(lines[i])) < 10:
                pattern_matches += 1

    score += pattern_matches * 3

    return score

def extract_players_from_text(text, score):
    """Extract player data from OCR text."""
    if score < 10:
        # Not likely to be a player list
        return []

    players = []

    # Extract name-rank pairs
    # Look for patterns like "PlayerName 1,234" or "PlayerName - 1,234"
    pattern = r'([A-Za-z][A-Za-z0-9_]{2,})\s*(?:-\s*)?(\d{1,3}(?:,\d{3})*)'
    matches = re.findall(pattern, text)

    # Convert matches to player objects
    for i, (name, rank) in enumerate(matches):
        players.append({
            "position": i + 1,
            "name": name.strip(),
            "rank": rank.strip().replace(',', '')
        })

    return players

def process_frames_for_players(frame_paths):
    """
    Process multiple frames to extract player information.

    Args:
        frame_paths: List of paths to frame images

    Returns:
        List of dictionaries with frame analysis results
    """
    logger.info(f"Processing {len(frame_paths)} frames for player information")

    results = []

    # Process each frame
    for frame_path in tqdm(frame_paths, desc="Analyzing frames"):
        frame_result = extract_text_from_frame(frame_path)

        if frame_result["success"]:
            frame_result["frame_path"] = frame_path
            results.append(frame_result)

    logger.info(f"Completed processing {len(results)} frames")
    return results

def get_best_player_frame(processed_frames):
    """
    Find the frame with the best player information.

    Args:
        processed_frames: List of frame processing results

    Returns:
        The frame with the highest score for player information
    """
    if not processed_frames:
        logger.warning("No processed frames to select from")
        return None

    # Sort frames by score (descending)
    sorted_frames = sorted(processed_frames, key=lambda x: x["score"], reverse=True)

    # Get the highest scoring frame
    best_frame = sorted_frames[0]
    logger.info(f"Best player frame has score {best_frame['score']} with {len(best_frame['players'])} players")

    # Log the top 3 frames for debugging
    for i, frame in enumerate(sorted_frames[:3]):
        logger.debug(f"Frame {i+1}: Score {frame['score']}, Players: {len(frame['players'])}")

    return best_frame

def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Process a Twitch clip for player information using OCR")
    parser.add_argument("--clip-url", default=DEFAULT_CLIP_URL, help="URL of the Twitch clip to process")
    parser.add_argument("--frames-dir", help="Directory containing pre-extracted frames (skips clip download)")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    parser.add_argument("--debug-images", action="store_true", help="Save debug images")

    return parser.parse_args()

def main():
    """Main function."""
    args = parse_args()

    # Configure logging level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Enable debug image saving if requested
    if args.debug_images:
        os.environ["DEBUG_IMAGES"] = "1"

    # Process existing frames if provided
    if args.frames_dir:
        frames_dir = Path(args.frames_dir)
        if not frames_dir.exists():
            logger.error(f"Frames directory not found: {frames_dir}")
            return 1

        # Get all jpg files in the directory
        frame_paths = sorted(list(frames_dir.glob("*.jpg")))
        logger.info(f"Found {len(frame_paths)} pre-extracted frames in {frames_dir}")

        if not frame_paths:
            logger.error(f"No frame images found in {frames_dir}")
            return 1
    else:
        # Extract clip ID from URL
        clip_id = extract_clip_id(args.clip_url)
        if not clip_id:
            logger.error(f"Could not extract clip ID from URL: {args.clip_url}")
            return 1

        logger.info(f"Processing clip with ID: {clip_id}")

        # Get clip details
        clip_details = get_clip_details(clip_id)
        if not clip_details:
            logger.error(f"Could not retrieve clip details for ID: {clip_id}")
            return 1

        logger.info(f"Clip title: {clip_details.get('title', 'Unknown')}")

        # Download the clip
        clip_path = download_clip(clip_id)
        if not clip_path:
            logger.error(f"Failed to download clip with ID: {clip_id}")
            return 1

        logger.info(f"Clip downloaded to: {clip_path}")

        # Extract frames from the clip
        frame_paths = extract_frames(clip_path)
        if not frame_paths:
            logger.error(f"Failed to extract frames from clip: {clip_path}")
            return 1

        logger.info(f"Extracted {len(frame_paths)} frames from clip")

    # Process frames for player information
    processed_frames = process_frames_for_players(frame_paths)

    # Get the best frame with player information
    best_frame = get_best_player_frame(processed_frames)

    if not best_frame:
        logger.error("Failed to find a good frame with player information")
        return 1

    # Copy the best frame for reference
    best_frame_path = Path(best_frame["frame_path"])
    best_frame_copy = OCR_DEBUG_DIR / "best_player_frame.jpg"
    import shutil
    shutil.copy(best_frame_path, best_frame_copy)
    logger.info(f"Best player frame saved to: {best_frame_copy}")

    # Prepare final results
    players = best_frame["players"]

    # Save results to JSON
    results = {
        "timestamp": datetime.now().isoformat(),
        "clip_url": args.clip_url,
        "players": players
    }

    # Save to file
    output_file = TEMP_DIR / "results.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    logger.info(f"Results saved to: {output_file}")
    logger.info(f"Found {len(players)} players")

    # Print player information
    for player in players:
        position = player.get("position", "?")
        name = player.get("name", "Unknown")
        rank = player.get("rank", "N/A")
        logger.info(f"Player {position}: {name}, Rank: {rank}")

    return 0

if __name__ == "__main__":
    sys.exit(main())
