#!/usr/bin/env python3
"""
Dota 2 Hero Detection

This module processes frames from a Twitch clip to identify Dota 2 heroes
in the top bar of the game interface using template matching.

Hero portrait layout in Dota 2:
- Total selection height: 131px
- Actual hero portrait height: 73px
- Top color indicator height: 6px
- True hero portrait area: 67px (after removing color bar)
- Bottom area (58px): Contains player name and selected role
- Hero width: 115px
- Gap between heroes: 7px
- Clock width: 276px

The dimensions are derived from HubSpot's frontend code to ensure accurate detection.

Template Matching Optimizations:
- Border Addition: Adding a black border around reference templates creates a
  "sliding window" effect, allowing the algorithm to find better alignment between
  the source image and template even when they are nominally the same size. This can
  improve match scores by finding the optimal position within the bordered area.
  Enabled with --add-border flag.

- Gaussian Blur: Applying a slight blur to both source and template images reduces
  noise and can improve matching for images with compression artifacts or streaming
  quality issues. The blur smooths out small differences that might otherwise reduce
  match scores. Enabled with --apply-blur flag.
"""

import math
import os
import sys
import json
import logging
import argparse
from pathlib import Path
import cv2
import numpy as np
from tqdm import tqdm
import requests
import uuid
import time
import re
from concurrent.futures import ThreadPoolExecutor
import traceback
from detection.image_processing import (
    clear_debug_directory, save_debug_image, load_image, load_heroes_data, 
    load_facet_templates_singleton, extract_hero_bar, extract_hero_icons, 
    match_template, get_top_hero_matches, resolve_hero_duplicates, 
    extract_player_name, get_player_name_area_coordinates, 
    annotate_player_name_areas, process_frame_for_heroes, 
    detect_hero_color_bars, process_frames_for_heroes, adjust_levels, 
    extract_rank_text, annotate_rank_areas, performance_timer, expected_colors, 
    TESSERACT_AVAILABLE, TEMP_DIR)

try:
    from clip_utils import get_clip_details, download_clip, download_single_frame, extract_frames
    from stream_utils import capture_multiple_frames
except ImportError as e:
    # For standalone usage
    try:
        from .clip_utils import get_clip_details, download_clip, download_single_frame, extract_frames
        from .stream_utils import capture_multiple_frames
    except ImportError as rel_e:
        print(f"Warning: clip_utils module not found, standalone mode only. Error: {e}, Relative import error: {rel_e}")
        import sys
        print(f"System path: {sys.path}")
        print(f"PYTHONPATH: {os.environ.get('PYTHONPATH', 'Not set')}")

# Import facet detection module
try:
    from .facet_detection import load_facet_templates, process_team_facets, detect_hero_facet, get_hero_abilities
except ImportError:
    from facet_detection import load_facet_templates, process_team_facets, detect_hero_facet, get_hero_abilities

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def process_media(media_source, source_type="clip", debug=False, min_score=0.4, debug_templates=False, show_timings=False, num_frames=3):
    """Process a clip URL or stream username and return the hero detection results.

    Args:
        media_source (str): URL of the Twitch clip or Twitch username
        source_type (str): Type of media source ("clip" or "stream")
        debug (bool): Enable debug mode
        min_score (float): Minimum score threshold
        debug_templates (bool): Enable template debugging
        show_timings (bool): Show timing information
        num_frames (int): Number of frames to capture from the stream (only used for streams)

    Returns:
        dict: Detection results or None if processing failed
    """
    # Start the overall timing
    performance_timer.start('total_execution')

    os.environ["ADD_BORDER"] = "1"
    os.environ["APPLY_BLUR"] = "1"

    # Set debug level
    if debug:
        logging.getLogger().setLevel(logging.DEBUG)
        os.environ["DEBUG_IMAGES"] = "1"

        # Clear debug directory at the start of the run
        clear_debug_directory()

    # Enable template matching debug images if requested
    if debug_templates:
        os.environ["DEBUG_TEMPLATE_MATCHES"] = "1"
        logger.info("Template matching debug images enabled")

        # Also clear debug directory for template debugging
        if not debug:
            clear_debug_directory()

    # Enable rank banner extraction if requested
    os.environ["EXTRACT_RANK_BANNERS"] = "1"
    os.environ["OCR_RANKS"] = "1"
    os.environ["EXTRACT_PLAYERS"] = "1"

    # Log OCR availability
    if TESSERACT_AVAILABLE:
        logger.info("OCR for rank detection enabled")
    else:
        logger.warning("OCR for rank detection requested but pytesseract is not available")
        if debug:
            print("Warning: OCR for rank detection requested but pytesseract is not available")
            print("Install with: pip install pytesseract")
            print("You also need to install Tesseract OCR: https://github.com/tesseract-ocr/tesseract")

    try:
        frame_paths = []

        if source_type == "clip":
            clip_url = media_source
            logger.info(f"Processing clip: {clip_url}")

            # Check if clip_utils is available
            if 'get_clip_details' not in globals():
                logger.error("clip_utils module not available")
                if debug:
                    print("Error: clip_utils module not available")
                return None

            # Get clip details
            performance_timer.start('get_clip_details')
            clip_details = get_clip_details(clip_url)
            performance_timer.stop('get_clip_details')
            logger.info("Clip details retrieved")

            # Ensure frames directory exists
            frames_dir = TEMP_DIR / "frames"
            frames_dir.mkdir(exist_ok=True)

            # Instead of downloading the entire clip and extracting frames
            performance_timer.start('download_clip')
            frame_path = download_single_frame(clip_details)
            frame_paths.append(frame_path)
            performance_timer.stop('download_clip')
            # You can also specify a timestamp (in seconds)
            # frame_path = download_single_frame(clip_details, timestamp=10)  # frame at 10 seconds

            # Extract frames
            # Download the clip
            # performance_timer.start('download_clip')
            # clip_path = download_clip(clip_details)
            # logger.info(f"Clip downloaded to: {clip_path}")
            # frame_paths = extract_frames(clip_path, clip_details=clip_details, frame_interval=10)
            # performance_timer.stop('download_clip')
            logger.info(f"Extracted {len(frame_paths)} frames")

        elif source_type == "stream":
            username = media_source
            logger.info(f"Processing stream for user: {username}")

            # Check if capture_multiple_frames is available in the global scope
            capture_frames_func = None
            if 'capture_multiple_frames' in globals():
                capture_frames_func = globals()['capture_multiple_frames']

            # If not found in globals, try importing it
            if not capture_frames_func:
                try:
                    # Try direct import first
                    import sys
                    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
                    from stream_utils import capture_multiple_frames
                    capture_frames_func = capture_multiple_frames
                except ImportError:
                    try:
                        # Try relative import
                        from .stream_utils import capture_multiple_frames
                        capture_frames_func = capture_multiple_frames
                    except ImportError:
                        logger.error("stream_utils module not available")
                        if debug:
                            print("Error: stream_utils module not available")
                            print("Make sure stream_utils.py is in the same directory as dota_hero_detection.py")
                        return None

            # Ensure frames directory exists
            frames_dir = TEMP_DIR / "frames"
            frames_dir.mkdir(exist_ok=True)

            # Capture frames from the stream
            performance_timer.start('capture_frames')
            frame_paths = capture_frames_func(username, num_frames=num_frames)
            performance_timer.stop('capture_frames')

            if not frame_paths:
                logger.error(f"Failed to capture frames from stream: {username}")
                return None

            logger.info(f"Captured {len(frame_paths)} frames from stream")

        # Use all frames for color bar detection and hero identification
        logger.info(f"Analyzing all frames for hero color bars")

        # Process frames for heroes using our approach
        performance_timer.start('process_frames')
        heroes, best_frame_info = process_frames_for_heroes(frame_paths, debug=debug)
        processing_time = performance_timer.stop('process_frames')

        if heroes:
            # Get the best frame information from process_frames_for_heroes
            best_frame_index = best_frame_info['frame_index']
            best_frame_path = best_frame_info['frame_path']
            best_match_score = best_frame_info['match_score']
            detected_colors = best_frame_info['detected_colors']

            # Log the best match results
            if best_match_score == 1.0:
                logger.info(f"Using frame {best_frame_index+1} with perfect color match (10/10)")
            elif best_match_score >= 0.7:
                logger.info(f"Using frame {best_frame_index+1} with partial color match ({int(best_match_score*10)}/10)")
            else:
                logger.warning(f"Best frame only has {int(best_match_score*10)}/10 color matches, results may be unreliable")

            # Sort by team and position
            heroes.sort(key=lambda h: (h['team'] == 'Dire', h['position']))

            # Check if rank banners were extracted
            rank_banners_extracted = any('rank_banner_shape' in hero for hero in heroes)
            if rank_banners_extracted:
                logger.info("Rank banners extracted from hero portraits")

                # Check if ranks were detected with OCR
                ranks_detected = any('rank' in hero for hero in heroes)
                if ranks_detected:
                    logger.info(f"Rank numbers detected for {sum(1 for h in heroes if 'rank' in h)}/{len(heroes)} heroes")

                if debug:
                    logger.info("Rank banner debug images saved with prefix 'rank_banner_'")

            # Check if player names were extracted
            player_names_extracted = any('player_name' in hero for hero in heroes)
            if player_names_extracted:
                logger.info(f"Player names detected for {sum(1 for h in heroes if 'player_name' in h)}/{len(heroes)} heroes")

            # Create a more accessible players structure
            players = []
            for hero in heroes:
                player = {
                    'position': hero['position'] + 1,  # 1-indexed position for users
                    'team': hero['team'],
                    'hero': hero['hero_localized_name'],
                    'hero_id': hero['hero_id']
                }

                # Add rank information if available
                if 'rank' in hero:
                    player['rank'] = hero['rank']

                # Add player name if available
                if 'player_name' in hero:
                    player['player_name'] = hero['player_name']

                # Add facet information if available
                if 'facet' in hero and 'name' in hero['facet']:
                    player['facet'] = hero['facet']['name']

                players.append(player)

            # Format the result as a dictionary
            result = {
                'heroes': heroes,
                'players': players,
                'color_match_score': best_match_score,
                'color_match_percentage': f"{int(best_match_score*100)}%",
                'processing_time': f"{processing_time:.2f}s",
                'frame_count': len(frame_paths),
                'best_frame_index': best_frame_index,
                'source_type': source_type,
                'source': media_source,
                'best_frame_info': best_frame_info
            }

            # Add detected colors for debugging
            if debug:
                result['detected_colors'] = detected_colors

            # Add performance metrics if requested
            if show_timings:
                total_time = performance_timer.stop('total_execution')
                result['total_execution_time'] = f"{total_time:.2f}s"
                result['performance_metrics'] = performance_timer.get_summary()

            return result
        else:
            logger.error("No heroes identified in any frames")
            return None
    except Exception as e:
        logger.error(f"Error processing media: {e}")
        traceback.print_exc()
        return None
    finally:
        # Make sure to stop the timer if not already stopped
        if 'total_execution' in performance_timer.timings and not performance_timer.timings['total_execution']['stopped']:
            performance_timer.stop('total_execution')

def process_clip_url(clip_url, debug=False, min_score=0.4, debug_templates=False, show_timings=False):
    """Process a clip URL and return the hero detection results.

    Args:
        clip_url (str): URL of the Twitch clip
        debug (bool): Enable debug mode
        min_score (float): Minimum score threshold
        debug_templates (bool): Enable template debugging
        show_timings (bool): Show timing information

    Returns:
        dict: Detection results or None if processing failed
    """
    return process_media(clip_url, source_type="clip", debug=debug, min_score=min_score,
                        debug_templates=debug_templates, show_timings=show_timings)

def process_stream_username(username, debug=False, min_score=0.4, debug_templates=False, show_timings=False, num_frames=3):
    """Process a Twitch stream by username and return the hero detection results.

    Args:
        username (str): Twitch username
        debug (bool): Enable debug mode
        min_score (float): Minimum score threshold
        debug_templates (bool): Enable template debugging
        show_timings (bool): Show timing information
        num_frames (int): Number of frames to capture from the stream

    Returns:
        dict: Detection results or None if processing failed
    """
    return process_media(username, source_type="stream", debug=debug, min_score=min_score,
                        debug_templates=debug_templates, show_timings=show_timings, num_frames=num_frames)

def main():
    """Main function."""
    # Start the overall timing
    performance_timer.start('total_execution')

    try:
        parser = argparse.ArgumentParser(description="Detect Dota 2 heroes in a Twitch clip or stream")
        parser.add_argument("clip_url", nargs="?",
                          help="URL of the Twitch clip (required if --stream not provided)")
        parser.add_argument("--stream", help="Twitch username for live stream capture")
        parser.add_argument("--frames", type=int, default=3,
                          help="Number of frames to capture from the stream (default: 3)")
        parser.add_argument("--frame-path", help="Path to a single frame to process")
        parser.add_argument("--debug", action="store_true", help="Enable debug mode")
        parser.add_argument("--output", "-o", default="heroes.json",
                          help="Output file path (default: heroes.json)")
        parser.add_argument("--min-score", type=float, default=0.4,
                          help="Minimum match score (0.0-1.0) to consider a hero identified (default: 0.4)")
        parser.add_argument("--debug-templates", action="store_true",
                          help="Save debug images of template matching results")
        parser.add_argument("--show-timings", action="store_true",
                          help="Show detailed performance timing information")
        parser.add_argument("--keep-debug", action="store_true",
                          help="Don't clear debug directory between runs")
        parser.add_argument("--json-only", action="store_true",
                          help="Only output JSON with no additional text (for API use)")

        args = parser.parse_args()

        # Process a live stream if username is provided
        if args.stream:
            result = process_stream_username(
                username=args.stream,
                debug=args.debug,
                min_score=args.min_score,
                debug_templates=args.debug_templates,
                show_timings=args.show_timings,
                num_frames=args.frames
            )

            if result:
                # If json-only flag is set, just print the JSON output
                if args.json_only:
                    print(json.dumps(result, indent=2))
                elif args.debug:
                    # Debug output is already handled in process_stream_username
                    pass

                # Save to file if output is specified
                if not args.output == "heroes.json" or not args.json_only:
                    with open(args.output, 'w') as f:
                        json.dump(result, f, indent=2)
                    if args.debug:
                        logger.info(f"Saved hero data to {args.output}")

                return 0
            else:
                return 1
        # Process a single frame if path is provided
        elif args.frame_path:
            result = process_frame_for_heroes(
                frame_path=args.frame_path,
                debug=args.debug
            )

            if result:
                # Format the result for output
                output_data = {
                    "heroes": result,
                    "processing_time": f"{performance_timer.get_elapsed('total_execution'):.2f}s",
                    "source_type": "frame",
                    "source": args.frame_path
                }

                # If json-only flag is set, just print the JSON output
                if args.json_only:
                    print(json.dumps(output_data, indent=2))
                elif args.debug:
                    logger.info(f"Processed frame: {args.frame_path}")

                # Save to file if output is specified
                if not args.output == "heroes.json" or not args.json_only:
                    with open(args.output, 'w') as f:
                        json.dump(output_data, f, indent=2)
                    if args.debug:
                        logger.info(f"Saved hero data to {args.output}")

                return 0
            else:
                logger.error(f"Failed to process frame: {args.frame_path}")
                return 1
        # Process a clip if URL is provided
        elif args.clip_url:
            result = process_clip_url(
                clip_url=args.clip_url,
                debug=args.debug,
                min_score=args.min_score,
                debug_templates=args.debug_templates,
                show_timings=args.show_timings
            )

            if result:
                # If json-only flag is set, just print the JSON output
                if args.json_only:
                    print(json.dumps(result, indent=2))
                elif args.debug:
                    # Debug output is already handled in process_clip_url
                    pass

                # Save to file if output is specified
                if not args.output == "heroes.json" or not args.json_only:
                    with open(args.output, 'w') as f:
                        json.dump(result, f, indent=2)
                    if args.debug:
                        logger.info(f"Saved hero data to {args.output}")

                return 0
            else:
                return 1
        else:
            logger.error("Either --frame-path, --stream, or clip_url must be provided")
            parser.print_help()
            return 1
    finally:
        # Always stop the timer at the end
        if 'total_execution' in performance_timer.timings and not performance_timer.timings['total_execution']['stopped']:
            total_time = performance_timer.stop('total_execution')
            logger.info(f"Total execution time: {total_time:.3f} seconds")

if __name__ == "__main__":
    sys.exit(main())
