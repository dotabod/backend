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

    # Detect if this frame likely contains a player list
    # Check for text blocks in expected positions
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

    # Score the frame based on likely player names
    score = score_frame_for_players(all_text)

    # Save a debug image with the combined text
    debug_text = f"Score: {score}, Has player list: {has_player_list}"
    save_debug_image(image, "text_results", debug_text)

    # Extract players from the text
    players = extract_players_from_text(all_text, score)

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
    pattern = r'([A-Za-z][A-Za-z0-9_]{2,})\s*(?:-\s*)?(\d{1,3}(?:,\d{3})+)'
    matches = re.findall(pattern, text)

    # Convert matches to player objects
    for i, (name, rank) in enumerate(matches):
        players.append({
            "name": name.strip(),
            "rank": rank.strip(),
            "position": i + 1
        })

    # If no matches with the strict pattern, try a more lenient approach
    if not players:
        # Extract lines that might contain player info
        lines = [line.strip() for line in text.split('\n') if line.strip()]

        for i, line in enumerate(lines):
            # Look for a name (capitalized word of 3+ chars)
            name_match = re.search(r'\b[A-Z][a-zA-Z]{2,}\b', line)

            if name_match:
                name = name_match.group(0)

                # Look for a rank in the same line
                rank_match = re.search(r'\b\d{1,3}(?:,\d{3})+\b', line)
                rank = rank_match.group(0) if rank_match else None

                players.append({
                    "name": name,
                    "rank": rank,
                    "position": i + 1
                })

    logger.debug(f"Extracted {len(players)} players from text")
    return players

def process_frames_for_players(frame_paths):
    """
    Process frames to find player data using direct OCR.

    Args:
        frame_paths: List of paths to frame images

    Returns:
        list: Processed frame data
    """
    processed_frames = []
    logger.info(f"Processing {len(frame_paths)} frames for player data using OCR")

    # Process frames in order
    for i, frame_path in enumerate(tqdm(frame_paths, desc="Processing frames")):
        logger.debug(f"Processing frame {i+1}/{len(frame_paths)}...")

        # Extract text from the frame
        result = extract_text_from_frame(frame_path)
        result["frame_index"] = i
        result["path"] = frame_path
        processed_frames.append(result)

        # Log the result
        player_count = len(result.get("players", []))
        logger.debug(f"Frame {i+1}: Score={result.get('score', 0)}, Players={player_count}")

        # If we found a good match with several players, we can stop
        if result.get("score", 0) > 30 and player_count >= 5:
            logger.info(f"Found high-quality player list at frame {i+1}")
            break

    # Log summary statistics
    good_frames = [f for f in processed_frames if f.get("score", 0) > 20]
    frames_with_players = [f for f in processed_frames if len(f.get("players", [])) > 0]
    logger.info(f"Frames processed: {len(processed_frames)}, good frames: {len(good_frames)}, frames with players: {len(frames_with_players)}")

    return processed_frames

def get_best_player_frame(processed_frames):
    """
    Get the best frame with player data.

    Args:
        processed_frames: List of processed frame data

    Returns:
        dict: Best frame data or None if no good match
    """
    # Score frames by number of players and text quality
    for frame in processed_frames:
        # Calculate a combined score
        player_count = len(frame.get("players", []))
        text_score = frame.get("score", 0)

        # Combined score favors more players and higher text quality
        frame["combined_score"] = player_count * 10 + text_score

    # Sort by combined score (descending)
    sorted_frames = sorted(processed_frames, key=lambda x: x.get("combined_score", 0), reverse=True)

    # Return the best frame if it has players
    for frame in sorted_frames:
        if frame.get("players") and len(frame.get("players", [])) > 0:
            score = frame.get("combined_score", 0)
            player_count = len(frame.get("players", []))
            logger.info(f"Selected best frame with score {score} containing {player_count} players")
            return frame

    logger.warning("No frames with player data found")
    return None

def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="Process a Twitch clip to extract player info using OCR")
    parser.add_argument("clip_url", nargs="?", default=DEFAULT_CLIP_URL,
                       help=f"URL of the Twitch clip (default: {DEFAULT_CLIP_URL})")
    parser.add_argument("--frame-interval", type=float, default=0.5,
                       help="Interval between frames in seconds (default: 0.5)")
    parser.add_argument("--debug", action="store_true",
                       help="Enable debug logging")
    parser.add_argument("--debug-images", action="store_true",
                       help="Save debug images during processing")
    parser.add_argument("--output", "-o", default="results.json",
                       help="Output file path (default: results.json)")

    return parser.parse_args()

def main():
    """Main function."""
    # Parse command-line arguments
    args = parse_args()

    # Set log level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Enable debug image saving if requested
    if args.debug_images:
        os.environ["DEBUG_IMAGES"] = "true"

    try:
        # Get the clip URL
        clip_url = args.clip_url
        logger.info(f"Processing clip: {clip_url}")

        # Get clip details
        clip_details = get_clip_details(clip_url)
        logger.info("Clip details retrieved")

        # Download the clip
        clip_path = download_clip(clip_details)
        logger.info(f"Clip downloaded to: {clip_path}")

        # Extract frames (we'll extract frames at regular intervals)
        logger.info("Extracting frames from clip...")
        frame_paths = extract_frames(
            clip_path,
            start_time=0,
            end_time=None,  # Use full duration
            frame_interval=args.frame_interval
        )
        logger.info(f"Extracted {len(frame_paths)} frames")

        # Process frames to find player data using OCR
        logger.info("Processing frames for player data using OCR...")
        processed_frames = process_frames_for_players(frame_paths)

        # Get the best frame with player data
        best_frame = get_best_player_frame(processed_frames)

        # Display and save results
        if best_frame and best_frame.get("players"):
            players = best_frame["players"]

            print("\nPlayer Information:")
            print("------------------")

            for i, player in enumerate(players):
                rank_text = f" - Rank: {player['rank']}" if player.get("rank") else ""
                print(f"Player {i+1}: {player['name']}{rank_text}")

            # Save the results to a JSON file
            results = {
                "timestamp": datetime.now().isoformat(),
                "clip_url": clip_url,
                "players": players,
                "frame_index": best_frame.get("frame_index"),
                "frame_path": best_frame.get("path"),
                "score": best_frame.get("score")
            }

            with open(args.output, "w") as f:
                json.dump(results, f, indent=2)

            logger.info(f"Results saved to: {args.output}")

            return 0
        else:
            logger.warning("No player data found in the clip")
            print("No player data found in the clip.")
            return 1

    except Exception as e:
        logger.error(f"Error processing clip: {e}", exc_info=True)
        print(f"Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
