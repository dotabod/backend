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
"""

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

# Import our modules if available
try:
    from clip_utils import get_clip_details, download_clip, extract_frames
except ImportError:
    # For standalone usage
    print("Warning: clip_utils module not found, standalone mode only")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants and directories
TEMP_DIR = Path("temp")
TEMP_DIR.mkdir(exist_ok=True)
DEBUG_DIR = Path("temp/debug")
DEBUG_DIR.mkdir(exist_ok=True, parents=True)
ASSETS_DIR = Path("assets")
ASSETS_DIR.mkdir(exist_ok=True)
HEROES_DIR = ASSETS_DIR / "dota_heroes"
HEROES_DIR.mkdir(exist_ok=True)

# Exact dimensions for hero portraits in the top bar
# Updated values based on frontend code
HERO_WIDTH = 108  # pixels (was 122)
HERO_HEIGHT = 72  # pixels (was 72)
HERO_TOTAL_HEIGHT = 118  # Total height including player name and role
HERO_TOP_PADDING = 6  # pixels to crop from top (color indicator bar)
HERO_ACTUAL_HEIGHT = HERO_HEIGHT - HERO_TOP_PADDING  # 67px - actual visible hero portrait
# Bottom part (131 - 73 = 58px) contains player name and selected role

# Gap between heroes (from frontend code)
HERO_GAP = 15  # pixels

# Clock dimensions (from frontend code)
CLOCK_WIDTH = 273  # pixels (was 265)
CLOCK_HEIGHT = 131  # pixels

# Mapping of known heroes
HEROES_FILE = HEROES_DIR / "hero_data.json"

def save_debug_image(image, name_prefix, additional_info=""):
    """Save an image for debugging purposes."""
    if os.environ.get("DEBUG_IMAGES", "").lower() in ("1", "true", "yes"):
        # Generate a unique filename
        unique_id = str(uuid.uuid4())[:8]
        filename = f"{name_prefix}_{unique_id}.jpg"
        filepath = DEBUG_DIR / filename

        # Add text annotation with additional info if provided
        if additional_info:
            # Make a copy to avoid modifying original
            image_copy = image.copy()
            cv2.putText(image_copy, additional_info, (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            image = image_copy

        # Save the image - use IMWRITE_JPEG_QUALITY to avoid PNG profile warnings
        cv2.imwrite(str(filepath), image, [cv2.IMWRITE_JPEG_QUALITY, 95])
        logger.debug(f"Saved debug image: {filepath}")
        return str(filepath)
    return None

def load_image(image_path):
    """
    Load an image while handling any color profile issues.

    Args:
        image_path: Path to the image file

    Returns:
        The loaded image or None if loading failed
    """
    try:
        # Read the image with IMREAD_IGNORE_ORIENTATION | IMREAD_COLOR
        # This helps avoid issues with color profiles
        image = cv2.imread(str(image_path), cv2.IMREAD_IGNORE_ORIENTATION | cv2.IMREAD_COLOR)
        if image is None:
            logger.warning(f"Could not load image: {image_path}")
        return image
    except Exception as e:
        logger.error(f"Error loading image {image_path}: {e}")
        return None

def load_heroes_data():
    """Load hero data from heroes.json file."""
    if not HEROES_FILE.exists():
        logger.error(f"Heroes data file not found: {HEROES_FILE}")
        logger.info("Please run dota_heroes.py to download hero data first")
        return None

    try:
        with open(HEROES_FILE, 'r') as f:
            heroes_data = json.load(f)
        logger.debug(f"Loaded {len(heroes_data)} heroes from {HEROES_FILE}")
        return heroes_data
    except Exception as e:
        logger.error(f"Error loading heroes data: {e}")
        return None

def extract_hero_bar(frame, debug=False):
    """
    Extract the hero bar from the top of the screen.

    This function crops out the section containing hero portraits in the top bar,
    using the exact measurements provided.

    Args:
        frame: The full frame image
        debug: Whether to save debug images

    Returns:
        tuple: (success, cropped_image, center_x)
    """
    try:
        # Get frame dimensions
        height, width = frame.shape[:2]
        logger.debug(f"Frame dimensions: {width}x{height}")

        # Find the center of the frame
        center_x = width // 2
        logger.debug(f"Center point: {center_x}")

        # The top bar usually starts at the top of the screen
        top_offset = 0

        # Height of the hero bar
        bar_height = HERO_TOTAL_HEIGHT

        # Check if frame is large enough
        if width < 5*(HERO_WIDTH+HERO_GAP) + CLOCK_WIDTH + 5*(HERO_WIDTH+HERO_GAP) or height < bar_height:
            logger.warning(f"Frame too small: {width}x{height}, need at least {5*(HERO_WIDTH+HERO_GAP) + CLOCK_WIDTH + 5*(HERO_WIDTH+HERO_GAP)}x{bar_height}")
            return False, None, center_x

        # Extract full top bar for visualization
        if debug:
            top_bar = frame[top_offset:top_offset+bar_height, 0:width]
            save_debug_image(top_bar, "top_bar_full")

            # Draw lines to visualize hero positions
            visualization = top_bar.copy()
            # Draw center line
            cv2.line(visualization, (center_x, 0), (center_x, bar_height), (0, 255, 255), 2)

            # Draw radiant hero boundaries with gaps
            for i in range(5):
                x = center_x - CLOCK_WIDTH//2 - (5-i) * (HERO_WIDTH + HERO_GAP)
                cv2.rectangle(visualization,
                             (x, 0),
                             (x + HERO_WIDTH, bar_height),
                             (0, 255, 0), 2)
                cv2.putText(visualization, f"R{i+1}", (x + 5, 25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

            # Draw dire hero boundaries with gaps
            for i in range(5):
                x = center_x + CLOCK_WIDTH//2 + i * (HERO_WIDTH + HERO_GAP)
                cv2.rectangle(visualization,
                             (x, 0),
                             (x + HERO_WIDTH, bar_height),
                             (0, 0, 255), 2)
                cv2.putText(visualization, f"D{i+1}", (x + 5, 25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

            # Draw clock boundaries
            cv2.rectangle(visualization,
                         (center_x - CLOCK_WIDTH//2, 0),
                         (center_x + CLOCK_WIDTH//2, bar_height),
                         (255, 255, 0), 2)

            # Draw hero portrait cropping boundaries
            for i in range(5):
                # Radiant heroes
                x = center_x - CLOCK_WIDTH//2 - (5-i) * (HERO_WIDTH + HERO_GAP)
                # Draw top padding line
                cv2.line(visualization, (x, HERO_TOP_PADDING), (x + HERO_WIDTH, HERO_TOP_PADDING), (255, 0, 255), 1)
                # Draw bottom of hero portrait
                cv2.line(visualization, (x, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT),
                        (x + HERO_WIDTH, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT), (255, 0, 255), 1)

                # Dire heroes
                x = center_x + CLOCK_WIDTH//2 + i * (HERO_WIDTH + HERO_GAP)
                # Draw top padding line
                cv2.line(visualization, (x, HERO_TOP_PADDING), (x + HERO_WIDTH, HERO_TOP_PADDING), (255, 0, 255), 1)
                # Draw bottom of hero portrait
                cv2.line(visualization, (x, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT),
                        (x + HERO_WIDTH, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT), (255, 0, 255), 1)

            # Add text to indicate the gap between heroes
            x_radiant = center_x - CLOCK_WIDTH//2 - 3 * (HERO_WIDTH + HERO_GAP)
            cv2.putText(visualization, f"Gap: {HERO_GAP}px", (x_radiant + HERO_WIDTH, bar_height - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

            # Add text to show dimensions
            cv2.putText(visualization, f"Hero: {HERO_WIDTH}x{HERO_HEIGHT}px", (10, bar_height - 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
            cv2.putText(visualization, f"Clock: {CLOCK_WIDTH}px", (center_x - 50, bar_height - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

            save_debug_image(visualization, "top_bar_annotated")

        # Success
        return True, frame[top_offset:top_offset+bar_height, 0:width], center_x
    except Exception as e:
        logger.error(f"Error extracting hero bar: {e}")
        return False, None, 0

def extract_hero_icons(top_bar, center_x, debug=False):
    """
    Extract individual hero icons from the top bar.

    The extraction process:
    1. Identifies the position of each hero slot in the top bar
    2. For each slot, crops out just the hero portrait area:
       - Skips the first 6px (color indicator bar at top)
       - Takes only the next 67px of height (actual hero portrait)
       - Does not include the bottom 58px (player name and role)

    Args:
        top_bar: Cropped top bar image
        center_x: X-coordinate of the center of the frame
        debug: Whether to save debug images

    Returns:
        list: List of (team, position, icon_image) tuples
    """
    try:
        hero_icons = []

        # Extract Radiant heroes (left side, 5 heroes)
        for i in range(5):
            # Calculate position based on center and hero width
            x_start = center_x - CLOCK_WIDTH//2 - (5-i) * (HERO_WIDTH + HERO_GAP)
            x_end = x_start + HERO_WIDTH

            # Crop the hero icon - only take the actual hero portrait, not player name/role
            # Skip the first HERO_TOP_PADDING pixels (color indicator)
            hero_icon = top_bar[HERO_TOP_PADDING:HERO_TOP_PADDING+HERO_ACTUAL_HEIGHT, x_start:x_end]

            # Check if we have a valid crop
            if hero_icon.size == 0:
                logger.warning(f"Invalid crop for Radiant hero {i+1}")
                continue

            # Save for debugging
            if debug:
                # Save the full selection and cropped portrait
                full_selection = top_bar[0:HERO_TOTAL_HEIGHT, x_start:x_end]
                save_debug_image(full_selection, f"radiant_hero_{i+1}_full")
                save_debug_image(hero_icon, f"radiant_hero_{i+1}_portrait")

            # Add to list: (team, position, icon)
            hero_icons.append(("Radiant", i, hero_icon))

        # Extract Dire heroes (right side, 5 heroes)
        for i in range(5):
            # Calculate position based on center and hero width
            x_start = center_x + CLOCK_WIDTH//2 + i * (HERO_WIDTH + HERO_GAP)
            x_end = x_start + HERO_WIDTH

            # Crop the hero icon - only take the actual hero portrait, not player name/role
            # Skip the first HERO_TOP_PADDING pixels (color indicator)
            hero_icon = top_bar[HERO_TOP_PADDING:HERO_TOP_PADDING+HERO_ACTUAL_HEIGHT, x_start:x_end]

            # Check if we have a valid crop
            if hero_icon.size == 0:
                logger.warning(f"Invalid crop for Dire hero {i+1}")
                continue

            # Save for debugging
            if debug:
                # Save the full selection and cropped portrait
                full_selection = top_bar[0:HERO_TOTAL_HEIGHT, x_start:x_end]
                save_debug_image(full_selection, f"dire_hero_{i+1}_full")
                save_debug_image(hero_icon, f"dire_hero_{i+1}_portrait")

            # Add to list: (team, position, icon)
            hero_icons.append(("Dire", i, hero_icon))

        logger.debug(f"Extracted {len(hero_icons)} hero icons")
        return hero_icons
    except Exception as e:
        logger.error(f"Error extracting hero icons: {e}")
        return []

def identify_hero(hero_icon, heroes_data, min_score=0.4, debug=False):
    """
    Identify a hero using template matching.

    Compares the hero icon against all hero templates and returns the best match.
    Always checks all heroes to find the most confident match.

    Args:
        hero_icon: Image of the hero icon (cropped to just the hero portrait without color bar)
        heroes_data: Dictionary of hero data
        min_score: Minimum match score to consider a match
        debug: Whether to save debug images

    Returns:
        dict: Hero data and match score, or None if no match above min_score
    """
    try:
        if not heroes_data:
            logger.error("No heroes data available")
            return None

        # Resize to a standard size for comparison
        hero_icon_resized = cv2.resize(hero_icon, (256, 144))

        # Save for debugging if needed
        if debug:
            save_debug_image(hero_icon_resized, "hero_icon_standardized")

        best_match = None
        best_score = 0
        all_matches = []

        # Compare with each hero template
        for hero in heroes_data:
            hero_id = hero.get('id')
            hero_name = hero.get('name')

            # Load the hero template
            template_path = HEROES_DIR / f"{hero_id}.png"
            if not template_path.exists():
                logger.debug(f"Template not found for hero {hero_id}: {template_path}")
                continue

            # Load and resize the template using our custom function to avoid iCCP warnings
            template = load_image(template_path)
            if template is None:
                logger.warning(f"Could not load template: {template_path}")
                continue

            # Resize to match our hero icon
            template_resized = cv2.resize(template, (256, 144))

            # Perform template matching
            # Convert to grayscale for better matching
            gray_icon = cv2.cvtColor(hero_icon_resized, cv2.COLOR_BGR2GRAY)
            gray_template = cv2.cvtColor(template_resized, cv2.COLOR_BGR2GRAY)

            # Use multiple methods and combine scores
            methods = [cv2.TM_CCOEFF_NORMED, cv2.TM_CCORR_NORMED]
            scores = []

            for method in methods:
                result = cv2.matchTemplate(gray_icon, gray_template, method)
                _, score, _, _ = cv2.minMaxLoc(result)
                scores.append(score)

            # Average score
            avg_score = sum(scores) / len(scores)

            # Add to list of all matches
            match_info = {
                'hero_id': hero_id,
                'hero_name': hero_name,
                'hero_localized_name': hero.get('localized_name', hero_name),
                'match_score': avg_score
            }
            all_matches.append(match_info)

            # Keep the best match
            if avg_score > best_score:
                best_score = avg_score
                best_match = match_info

            # Save comparison for debugging
            if debug and avg_score > 0.4:
                comparison = np.hstack((hero_icon_resized, template_resized))
                save_debug_image(comparison, f"hero_match_{hero_id}",
                                f"{hero.get('localized_name', '')}: {avg_score:.3f}")

        # Sort all matches by score for debugging
        all_matches.sort(key=lambda x: x['match_score'], reverse=True)

        # Log top 3 matches for debugging
        if all_matches and len(all_matches) >= 3:
            top_matches = all_matches[:3]
            logger.debug(f"Top 3 matches: " +
                       ", ".join([f"{m['hero_localized_name']} ({m['match_score']:.3f})" for m in top_matches]))

        # Return the best match if it's above the threshold
        if best_match and best_match['match_score'] >= min_score:
            logger.debug(f"Best match: {best_match['hero_localized_name']} with score {best_match['match_score']:.3f}")
            return best_match
        else:
            if best_match:
                logger.debug(f"Best match below threshold: {best_match['hero_localized_name']} with score {best_match['match_score']:.3f}")
            return None
    except Exception as e:
        logger.error(f"Error identifying hero: {e}")
        return None

def process_frame_for_heroes(frame_path, debug=False):
    """
    Process a single frame to identify heroes.

    Args:
        frame_path: Path to the frame image
        debug: Whether to save debug images

    Returns:
        list: List of identified heroes with confidence scores
    """
    try:
        # Load the frame using our custom function to avoid iCCP warnings
        frame = load_image(frame_path)
        if frame is None:
            logger.error(f"Could not load frame: {frame_path}")
            return []

        # Load heroes data
        heroes_data = load_heroes_data()
        if not heroes_data:
            logger.error("Could not load heroes data")
            return []

        # Extract the hero bar
        success, top_bar, center_x = extract_hero_bar(frame, debug=debug)
        if not success or top_bar is None:
            logger.warning(f"Could not extract hero bar from frame: {frame_path}")
            return []

        # Extract hero icons
        hero_icons = extract_hero_icons(top_bar, center_x, debug=debug)
        if not hero_icons:
            logger.warning(f"No hero icons extracted from frame: {frame_path}")
            return []

        # Identify each hero
        identified_heroes = []

        for team, position, hero_icon in hero_icons:
            hero_data = identify_hero(hero_icon, heroes_data, debug=debug)
            if hero_data:
                # Add team and position information
                hero_data['team'] = team
                hero_data['position'] = position
                identified_heroes.append(hero_data)
                logger.debug(f"Identified {team} hero at position {position+1}: "
                           f"{hero_data['hero_localized_name']} (confidence: {hero_data['match_score']:.3f})")
            else:
                logger.debug(f"Could not identify {team} hero at position {position+1}")

        logger.info(f"Identified {len(identified_heroes)} heroes in frame")

        # Sort by team and position
        identified_heroes.sort(key=lambda h: (h['team'], h['position']))

        return identified_heroes
    except Exception as e:
        logger.error(f"Error processing frame for heroes: {e}")
        return []

def process_frames_for_heroes(frame_paths, debug=False):
    """
    Process multiple frames to identify heroes.

    Processes all provided frames and returns heroes from the frame with the most identified heroes.

    Args:
        frame_paths: List of paths to frame images
        debug: Whether to save debug images

    Returns:
        list: List of identified heroes from the best frame
    """
    all_results = []
    best_frame_count = 0
    best_frame_heroes = []
    best_frame_index = -1
    best_frame_path = None

    logger.info(f"Processing {len(frame_paths)} frames for heroes")

    for i, frame_path in enumerate(tqdm(frame_paths, desc="Processing frames for heroes")):
        logger.debug(f"Processing frame {i+1}/{len(frame_paths)}: {frame_path}")

        # Process the frame
        heroes = process_frame_for_heroes(frame_path, debug=debug)

        # Keep track of the frame with the most heroes
        if len(heroes) > best_frame_count:
            best_frame_count = len(heroes)
            best_frame_heroes = heroes
            best_frame_index = i
            best_frame_path = frame_path
            logger.debug(f"New best frame: {i+1} with {best_frame_count} heroes")

            # If we found all 10 heroes, we can stop
            if best_frame_count == 10:
                logger.info(f"Found all 10 heroes in frame {i+1}")
                break

        # Keep track of all results
        all_results.append({
            'frame_index': i,
            'frame_path': frame_path,
            'heroes': heroes
        })

    # Return the best frame's heroes
    logger.info(f"Best frame (#{best_frame_index+1}: {best_frame_path}) has {best_frame_count} heroes")

    # Print a summary of identified heroes with confidence scores
    if best_frame_heroes:
        logger.info("Hero detection summary:")
        for hero in best_frame_heroes:
            team = hero['team']
            pos = hero['position'] + 1
            name = hero['hero_localized_name']
            score = hero['match_score']
            logger.info(f"  {team} #{pos}: {name} (confidence: {score:.3f})")

    return best_frame_heroes

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description="Detect Dota 2 heroes in a Twitch clip")
    parser.add_argument("clip_url", nargs="?",
                      help="URL of the Twitch clip (required for downloading)")
    parser.add_argument("--frame-path", help="Path to a single frame to process")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    parser.add_argument("--output", "-o", default="heroes.json",
                      help="Output file path (default: heroes.json)")
    parser.add_argument("--min-score", type=float, default=0.4,
                      help="Minimum match score (0.0-1.0) to consider a hero identified (default: 0.4)")

    args = parser.parse_args()

    # Set debug level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        os.environ["DEBUG_IMAGES"] = "1"

    try:
        # Process a single frame if provided
        if args.frame_path:
            logger.info(f"Processing single frame: {args.frame_path}")
            heroes = process_frame_for_heroes(args.frame_path, debug=args.debug)

            if heroes:
                # Sort by team and position
                heroes.sort(key=lambda h: (h['team'] == 'Dire', h['position']))

                with open(args.output, 'w') as f:
                    json.dump(heroes, f, indent=2)
                logger.info(f"Saved {len(heroes)} heroes to {args.output}")

                # Print results with confidence scores
                print(f"\nIdentified {len(heroes)} heroes:")
                for hero in heroes:
                    team = hero['team']
                    pos = hero['position'] + 1
                    name = hero['hero_localized_name']
                    score = hero['match_score']
                    confidence_indicator = "*" * int(score * 10)  # Visual indicator of confidence
                    print(f"{team} #{pos}: {name} (confidence: {score:.2f}) {confidence_indicator}")

                return 0
            else:
                logger.warning("No heroes identified in the frame")
                print("No heroes identified in the frame.")
                return 1

        # Process a clip if URL is provided
        elif args.clip_url:
            logger.info(f"Processing clip: {args.clip_url}")

            # Check if clip_utils is available
            if 'get_clip_details' not in globals():
                logger.error("clip_utils module not available")
                print("Error: clip_utils module not available")
                return 1

            # Get clip details
            clip_details = get_clip_details(args.clip_url)
            logger.info("Clip details retrieved")

            # Download the clip
            clip_path = download_clip(clip_details)
            logger.info(f"Clip downloaded to: {clip_path}")

            # Extract frames
            frame_paths = extract_frames(clip_path, frame_interval=0.5)
            logger.info(f"Extracted {len(frame_paths)} frames")

            # Use only the last 5 frames
            if len(frame_paths) > 5:
                frame_paths = frame_paths[-5:]
                logger.info(f"Using only the last 5 frames: {len(frame_paths)} frames")

            # Process frames for heroes
            heroes = process_frames_for_heroes(frame_paths, debug=args.debug)

            if heroes:
                # Sort by team and position
                heroes.sort(key=lambda h: (h['team'] == 'Dire', h['position']))

                with open(args.output, 'w') as f:
                    json.dump(heroes, f, indent=2)
                logger.info(f"Saved {len(heroes)} heroes to {args.output}")

                # Print results with confidence scores
                print(f"\nIdentified {len(heroes)} heroes:")
                for hero in heroes:
                    team = hero['team']
                    pos = hero['position'] + 1
                    name = hero['hero_localized_name']
                    score = hero['match_score']
                    confidence_indicator = "*" * int(score * 10)  # Visual indicator of confidence
                    print(f"{team} #{pos}: {name} (confidence: {score:.2f}) {confidence_indicator}")

                return 0
            else:
                logger.warning("No heroes identified in the clip")
                print("No heroes identified in the clip.")
                return 1
        else:
            logger.error("Either --frame-path or clip_url must be provided")
            parser.print_help()
            return 1
    except Exception as e:
        logger.error(f"Error in main function: {e}", exc_info=True)
        print(f"Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
