#!/usr/bin/env python3
"""
Twitch Clip Processor

This script processes a Twitch clip to extract player names and ranks from
a game lobby screen.
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime
from pathlib import Path
from tqdm import tqdm

# Import our modules
from clip_utils import extract_clip_id, get_clip_details, download_clip, extract_frames
from image_processing import process_frame
from dota_hero_detection import process_frames_for_heroes

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create temp directory
TEMP_DIR = Path("temp")
TEMP_DIR.mkdir(exist_ok=True)

# Default clip URL from the user's query
DEFAULT_CLIP_URL = "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi"

def process_frames_for_player_cards(frame_paths):
    """
    Process frames to find player cards and extract data.

    Args:
        frame_paths: List of paths to frame images

    Returns:
        list: Processed frame data
    """
    processed_frames = []

    # Log the number of frames we're going to process
    logger.info(f"Starting to process {len(frame_paths)} frames for player cards")

    for i, frame_path in enumerate(tqdm(frame_paths, desc="Processing frames")):
        logger.debug(f"Processing frame {i+1}/{len(frame_paths)}...")

        processed_frame = process_frame(frame_path, i)
        processed_frames.append(processed_frame)

        # Log match score for each frame to track detection quality
        match_score = processed_frame.get("match_score", 0)
        has_players = processed_frame.get("players") and len(processed_frame.get("players", [])) > 0
        logger.debug(f"Frame {i+1} - match score: {match_score:.4f}, players found: {len(processed_frame.get('players', []))}")

        # If we found a good match with player cards, we can stop processing
        if (match_score > 0.7 and has_players):
            logger.info(f"Found player cards at frame {i+1} with match score {match_score:.4f}")
            break

    # Log summary of processed frames
    good_frames = [f for f in processed_frames if f.get("match_score", 0) > 0.3]
    frames_with_players = [f for f in processed_frames if f.get("players") and len(f.get("players", [])) > 0]
    logger.info(f"Frames processed: {len(processed_frames)}, frames with good match: {len(good_frames)}, frames with players: {len(frames_with_players)}")

    # If we didn't find any frames with players, log the best match scores
    if not frames_with_players and processed_frames:
        best_matches = sorted(processed_frames, key=lambda x: x.get("match_score", 0), reverse=True)[:5]
        logger.info(f"Best match scores (no players found): {[f'{i+1}: {f.get('match_score', 0):.4f}' for i, f in enumerate(best_matches)]}")

    return processed_frames

def get_best_player_cards_frame(processed_frames):
    """
    Get the best matching frame with player cards.

    Args:
        processed_frames: List of processed frame data

    Returns:
        dict: Best frame data or None if no good match
    """
    # Sort by match score (descending)
    sorted_frames = sorted(processed_frames, key=lambda x: x.get("match_score", 0), reverse=True)

    logger.debug(f"Looking for best frame among {len(sorted_frames)} processed frames")

    # Return the frame with highest match score that has player data
    for i, frame in enumerate(sorted_frames):
        match_score = frame.get("match_score", 0)
        has_players = frame.get("players") and len(frame.get("players", [])) > 0
        logger.debug(f"Checking frame {i+1} with match score {match_score:.4f}, has {len(frame.get('players', []))} players")

        if has_players:
            logger.info(f"Selected best frame with match score {match_score:.4f} containing {len(frame.get('players', []))} players")
            return frame

    logger.warning("No frames with player data found")
    return None

def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="Process a Twitch clip to extract player info")
    parser.add_argument("clip_url", nargs="?", default=DEFAULT_CLIP_URL,
                       help=f"URL of the Twitch clip (default: {DEFAULT_CLIP_URL})")
    parser.add_argument("--frame-interval", type=float, default=0.5,
                       help="Interval between frames in seconds (default: 0.5)")
    parser.add_argument("--debug", action="store_true",
                       help="Enable debug logging")
    parser.add_argument("--save-frames", action="store_true",
                       help="Keep extracted frames after processing")
    parser.add_argument("--output", "-o", default="results.json",
                       help="Output file path (default: results.json)")
    parser.add_argument("--detect-heroes", action="store_true",
                       help="Detect Dota 2 heroes in the clip")
    parser.add_argument("--heroes-only", action="store_true",
                       help="Only detect heroes, skip player card detection")
    parser.add_argument("--left-crop", type=int, default=205,
                       help="Left crop value in pixels for hero detection (default: 205)")
    parser.add_argument("--right-crop", type=int, default=205,
                       help="Right crop value in pixels for hero detection (default: 205)")

    return parser.parse_args()

def main():
    """Main function."""
    # Parse command-line arguments
    args = parse_args()

    # Set log level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        os.environ["DEBUG_IMAGES"] = "1"

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

        results = {
            "timestamp": datetime.now().isoformat(),
            "clip_url": clip_url
        }

        # Process frames to find heroes if requested
        if args.detect_heroes or args.heroes_only:
            logger.info("Processing frames to find Dota 2 heroes...")
            logger.info(f"Using crop values: left={args.left_crop}px, right={args.right_crop}px")

            # Set crop values as environment variables for the hero detection module
            os.environ["DOTA_LEFT_CROP"] = str(args.left_crop)
            os.environ["DOTA_RIGHT_CROP"] = str(args.right_crop)

            heroes_result = process_frames_for_heroes(frame_paths)

            if heroes_result:
                results["heroes"] = heroes_result

                print("\nIdentified Heroes:")
                print("-----------------")

                for hero in heroes_result:
                    team = hero["team"]
                    pos = hero["position"] + 1
                    name = hero["hero_localized_name"]
                    score = hero["match_score"]
                    print(f"{team} #{pos}: {name} (confidence: {score:.2f})")
            else:
                logger.warning("No heroes identified in the clip")
                print("No heroes identified in the clip.")

        # Skip player card detection if heroes_only is specified
        if not args.heroes_only:
            # Process frames to find player cards
            logger.info("Processing frames to find player cards...")
            processed_frames = process_frames_for_player_cards(frame_paths)

            # Get the best matching frame
            best_frame = get_best_player_cards_frame(processed_frames)

            # Add player info to results if found
            if best_frame and best_frame.get("players"):
                players = best_frame["players"]
                results["players"] = players

                print("\nPlayer Information:")
                print("------------------")

                for i, player in enumerate(players):
                    rank_text = f" - Rank: {player['rank']}" if player.get("rank") else ""
                    print(f"Player {i+1}: {player['name']}{rank_text}")
            else:
                logger.warning("No player cards found in the clip")
                print("No player cards found in the clip.")

        # We're keeping frames regardless of the save_frames flag now
        if args.save_frames:
            logger.info("Keeping extracted frames as requested")
        else:
            # Even if save_frames is false, we'll still keep them for potential reuse
            logger.info("Keeping extracted frames for potential reuse in future runs")

        # Save the results to a JSON file
        with open(args.output, "w") as f:
            json.dump(results, f, indent=2)

        logger.info(f"Results saved to: {args.output}")

        # Return success if we found either heroes or players
        if "heroes" in results or "players" in results:
            return 0
        else:
            return 1

    except Exception as e:
        logger.error(f"Error processing clip: {e}", exc_info=True)
        print(f"Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
