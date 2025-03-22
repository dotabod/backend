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

Hero portrait skew:
- Radiant heroes are skewed at +9 degrees (right tilt)
- Dire heroes are skewed at -9 degrees (left tilt)
- Skew correction is applied to improve template matching accuracy
- Empty spaces created by skew transformation are cropped out

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
HERO_WIDTH = 115  # pixels (was 122)
HERO_HEIGHT = 73  # pixels (was 72)
HERO_TOTAL_HEIGHT = 131  # Total height including player name and role
HERO_TOP_PADDING = 6  # pixels to crop from top (color indicator bar)
HERO_ACTUAL_HEIGHT = HERO_HEIGHT - HERO_TOP_PADDING  # 67px - actual visible hero portrait
# Bottom part (131 - 73 = 58px) contains player name and selected role

# Gap between heroes (from frontend code)
HERO_GAP = 7  # pixels

# Skew angles for hero portraits
RADIANT_SKEW_ANGLE = 9  # degrees
DIRE_SKEW_ANGLE = -9  # degrees

# Clock dimensions (from frontend code)
CLOCK_WIDTH = 276  # pixels (was 265)
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

        # Save the image
        cv2.imwrite(str(filepath), image)
        logger.debug(f"Saved debug image: {filepath}")
        return str(filepath)
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

def apply_skew_correction(image, is_radiant):
    """
    Apply skew correction to hero portraits and crop the empty spaces.

    The skew transformation adds empty space on the sides of the image.
    This function applies the skew correction and then crops the empty space.

    Args:
        image: The hero portrait image
        is_radiant: Boolean indicating if the hero is on Radiant (True) or Dire (False)

    Returns:
        The de-skewed and cropped image
    """
    try:
        # Determine skew angle based on team
        skew_angle = RADIANT_SKEW_ANGLE if is_radiant else DIRE_SKEW_ANGLE

        # Get image dimensions
        height, width = image.shape[:2]

        # Calculate amount of skew in pixels (tangent of angle * height)
        skew_pixels = int(height * np.tan(np.radians(abs(skew_angle))))

        # Add padding to the image to accommodate the skew
        # This prevents cropping of content during transformation
        padding = skew_pixels + 5  # Add a bit extra to be safe
        padded_image = cv2.copyMakeBorder(
            image,
            0, 0,  # top, bottom
            padding, padding,  # left, right
            cv2.BORDER_CONSTANT,
            value=(0, 0, 0)  # black padding
        )

        # Get padded image dimensions
        padded_height, padded_width = padded_image.shape[:2]

        # Create source points for the transformation (the padded image)
        src_points = np.float32([
            [padding, 0],
            [padding + width, 0],
            [padding, height],
            [padding + width, height]
        ])

        # Create destination points for the transformation (applying skew)
        if is_radiant:  # Skewed right
            dst_points = np.float32([
                [padding + skew_pixels, 0],
                [padding + width, 0],
                [padding, height],
                [padding + width - skew_pixels, height]
            ])
        else:  # Skewed left
            dst_points = np.float32([
                [padding, 0],
                [padding + width - skew_pixels, 0],
                [padding + skew_pixels, height],
                [padding + width, height]
            ])

        # Calculate perspective transformation matrix
        transform_matrix = cv2.getPerspectiveTransform(src_points, dst_points)

        # Apply transformation to the padded image
        corrected_padded = cv2.warpPerspective(
            padded_image,
            transform_matrix,
            (padded_width, padded_height)
        )

        # Now crop out the extra padding and the empty space created by skew
        # The amount to crop depends on the skew direction
        if is_radiant:
            # For radiant (skewed right), we need to crop from left at top and right at bottom
            # Calculate crop coordinates
            x1 = padding + skew_pixels  # Left edge at top
            x2 = padding + width  # Right edge at top
            y1 = 0
            y2 = height

            # Create masks for empty spaces
            mask = np.zeros_like(corrected_padded[:,:,0])
            pts = np.array([
                [x1, y1],  # Top-left
                [x2, y1],  # Top-right
                [x2 - skew_pixels, y2],  # Bottom-right
                [x1 - skew_pixels, y2]   # Bottom-left
            ], np.int32).reshape((-1, 1, 2))
            cv2.fillPoly(mask, [pts], 255)

            # Apply mask to get the region of interest
            cropped = cv2.bitwise_and(corrected_padded, corrected_padded, mask=mask)

            # Get bounding box of the mask
            y_indices, x_indices = np.where(mask > 0)
            x_min, x_max = np.min(x_indices), np.max(x_indices)
            y_min, y_max = np.min(y_indices), np.max(y_indices)

            # Crop to the bounding box
            cropped = cropped[y_min:y_max, x_min:x_max]
        else:
            # For dire (skewed left), we need to crop from right at top and left at bottom
            # Calculate crop coordinates
            x1 = padding  # Left edge at top
            x2 = padding + width - skew_pixels  # Right edge at top
            y1 = 0
            y2 = height

            # Create masks for empty spaces
            mask = np.zeros_like(corrected_padded[:,:,0])
            pts = np.array([
                [x1, y1],  # Top-left
                [x2, y1],  # Top-right
                [x2 + skew_pixels, y2],  # Bottom-right
                [x1 + skew_pixels, y2]   # Bottom-left
            ], np.int32).reshape((-1, 1, 2))
            cv2.fillPoly(mask, [pts], 255)

            # Apply mask to get the region of interest
            cropped = cv2.bitwise_and(corrected_padded, corrected_padded, mask=mask)

            # Get bounding box of the mask
            y_indices, x_indices = np.where(mask > 0)
            x_min, x_max = np.min(x_indices), np.max(x_indices)
            y_min, y_max = np.min(y_indices), np.max(y_indices)

            # Crop to the bounding box
            cropped = cropped[y_min:y_max, x_min:x_max]

        # If the cropping failed for some reason, return the original image
        if cropped is None or cropped.size == 0:
            logger.warning("Cropping failed, returning original skewed image")
            return apply_simple_skew(image, is_radiant)

        return cropped
    except Exception as e:
        logger.error(f"Error applying skew correction: {e}")
        # Fall back to simpler skew method
        return apply_simple_skew(image, is_radiant)

def apply_simple_skew(image, is_radiant):
    """
    Apply a simpler skew correction without cropping.
    This is used as a fallback if the more complex method fails.

    Args:
        image: The hero portrait image
        is_radiant: Boolean indicating if the hero is on Radiant (True) or Dire (False)

    Returns:
        The de-skewed image (with empty areas)
    """
    try:
        # Determine skew angle based on team
        skew_angle = RADIANT_SKEW_ANGLE if is_radiant else DIRE_SKEW_ANGLE

        # Get image dimensions
        height, width = image.shape[:2]

        # Calculate amount of skew in pixels (tangent of angle * height)
        skew_pixels = int(height * np.tan(np.radians(abs(skew_angle))))

        # Create source and destination points for the transformation
        src_points = np.float32([[0, 0], [width, 0], [0, height], [width, height]])

        if is_radiant:  # Skewed right
            dst_points = np.float32([[skew_pixels, 0], [width, 0], [0, height], [width-skew_pixels, height]])
        else:  # Skewed left
            dst_points = np.float32([[0, 0], [width-skew_pixels, 0], [skew_pixels, height], [width, height]])

        # Calculate perspective transformation matrix
        transform_matrix = cv2.getPerspectiveTransform(src_points, dst_points)

        # Apply transformation
        corrected_image = cv2.warpPerspective(image, transform_matrix, (width, height))

        return corrected_image
    except Exception as e:
        logger.error(f"Error applying simple skew correction: {e}")
        return image  # Return original image if all correction fails

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

                # Visualize skew angle for Radiant heroes (skewed right)
                # Draw a line showing the skew angle
                skew_pixels = int(bar_height * np.tan(np.radians(abs(RADIANT_SKEW_ANGLE))))
                cv2.line(visualization, (x + skew_pixels, 0), (x, bar_height), (0, 165, 255), 1)
                cv2.putText(visualization, f"{RADIANT_SKEW_ANGLE}°", (x + 5, 45),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 1)

            # Draw dire hero boundaries with gaps
            for i in range(5):
                x = center_x + CLOCK_WIDTH//2 + i * (HERO_WIDTH + HERO_GAP)
                cv2.rectangle(visualization,
                             (x, 0),
                             (x + HERO_WIDTH, bar_height),
                             (0, 0, 255), 2)
                cv2.putText(visualization, f"D{i+1}", (x + 5, 25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

                # Visualize skew angle for Dire heroes (skewed left)
                # Draw a line showing the skew angle
                skew_pixels = int(bar_height * np.tan(np.radians(abs(DIRE_SKEW_ANGLE))))
                cv2.line(visualization, (x, 0), (x + skew_pixels, bar_height), (255, 0, 255), 1)
                cv2.putText(visualization, f"{DIRE_SKEW_ANGLE}°", (x + 5, 45),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 255), 1)

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
    3. Applies skew correction:
       - Radiant portraits are skewed at +9 degrees
       - Dire portraits are skewed at -9 degrees
    4. Crops out empty space created by the skew transformation

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

            # Apply skew correction for Radiant heroes
            corrected_icon = apply_skew_correction(hero_icon, is_radiant=True)

            # Save for debugging
            if debug:
                # Save the full selection, cropped portrait, and corrected portrait
                full_selection = top_bar[0:HERO_TOTAL_HEIGHT, x_start:x_end]
                save_debug_image(full_selection, f"radiant_hero_{i+1}_full")
                save_debug_image(hero_icon, f"radiant_hero_{i+1}_portrait")
                save_debug_image(corrected_icon, f"radiant_hero_{i+1}_corrected")

            # Add to list: (team, position, icon)
            hero_icons.append(("Radiant", i, corrected_icon))

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

            # Apply skew correction for Dire heroes
            corrected_icon = apply_skew_correction(hero_icon, is_radiant=False)

            # Save for debugging
            if debug:
                # Save the full selection, cropped portrait, and corrected portrait
                full_selection = top_bar[0:HERO_TOTAL_HEIGHT, x_start:x_end]
                save_debug_image(full_selection, f"dire_hero_{i+1}_full")
                save_debug_image(hero_icon, f"dire_hero_{i+1}_portrait")
                save_debug_image(corrected_icon, f"dire_hero_{i+1}_corrected")

            # Add to list: (team, position, icon)
            hero_icons.append(("Dire", i, corrected_icon))

        logger.debug(f"Extracted {len(hero_icons)} hero icons")
        return hero_icons
    except Exception as e:
        logger.error(f"Error extracting hero icons: {e}")
        return []

def identify_hero(hero_icon, heroes_data, min_score=0.5, debug=False):
    """
    Identify a hero using template matching.

    Args:
        hero_icon: Image of the hero icon (cropped to just the hero portrait without color bar and with skew correction)
        heroes_data: Dictionary of hero data
        min_score: Minimum match score to consider a match
        debug: Whether to save debug images

    Returns:
        dict: Hero data and match score, or None if no match
    """
    try:
        if not heroes_data:
            logger.error("No heroes data available")
            return None

        # After skew correction, the dimensions may have changed
        # We need to resize to a standard size for comparison
        # Note: We are not checking for HERO_ACTUAL_HEIGHT since skew correction may change dimensions
        # Instead, we directly resize to our standard size for matching
        hero_icon_resized = cv2.resize(hero_icon, (64, 64))

        # Save for debugging if needed
        if debug:
            save_debug_image(hero_icon_resized, "hero_icon_standardized")

        best_match = None
        best_score = 0

        # Compare with each hero template
        for hero in heroes_data:
            hero_id = hero.get('id')
            hero_name = hero.get('name')

            # Load the hero template
            template_path = HEROES_DIR / f"{hero_id}.png"
            if not template_path.exists():
                logger.debug(f"Template not found for hero {hero_id}: {template_path}")
                continue

            # Load and resize the template
            template = cv2.imread(str(template_path))
            if template is None:
                logger.warning(f"Could not load template: {template_path}")
                continue

            # Resize to match our hero icon
            template_resized = cv2.resize(template, (64, 64))

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

            # Keep the best match
            if avg_score > best_score:
                best_score = avg_score
                best_match = {
                    'hero_id': hero_id,
                    'hero_name': hero_name,
                    'hero_localized_name': hero.get('localized_name', hero_name),
                    'match_score': avg_score
                }

            # Save comparison for debugging
            if debug and avg_score > 0.4:
                comparison = np.hstack((hero_icon_resized, template_resized))
                save_debug_image(comparison, f"hero_match_{hero_id}",
                                f"{hero.get('localized_name', '')}: {avg_score:.3f}")

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
        list: List of identified heroes
    """
    try:
        # Load the frame
        frame = cv2.imread(frame_path)
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
                logger.debug(f"Identified {team} hero at position {position+1}: {hero_data['hero_localized_name']}")

        logger.debug(f"Identified {len(identified_heroes)} heroes in frame")
        return identified_heroes
    except Exception as e:
        logger.error(f"Error processing frame for heroes: {e}")
        return []

def process_frames_for_heroes(frame_paths, debug=False):
    """
    Process multiple frames to identify heroes.

    Args:
        frame_paths: List of paths to frame images
        debug: Whether to save debug images

    Returns:
        list: List of identified heroes
    """
    all_results = []
    best_frame_count = 0
    best_frame_heroes = []

    logger.info(f"Processing {len(frame_paths)} frames for heroes")

    for i, frame_path in enumerate(tqdm(frame_paths, desc="Processing frames for heroes")):
        logger.debug(f"Processing frame {i+1}/{len(frame_paths)}: {frame_path}")

        # Process the frame
        heroes = process_frame_for_heroes(frame_path, debug=debug)

        # Keep track of the frame with the most heroes
        if len(heroes) > best_frame_count:
            best_frame_count = len(heroes)
            best_frame_heroes = heroes
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
    logger.info(f"Best frame has {best_frame_count} heroes")
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
                with open(args.output, 'w') as f:
                    json.dump(heroes, f, indent=2)
                logger.info(f"Saved {len(heroes)} heroes to {args.output}")

                # Print results
                print(f"\nIdentified {len(heroes)} heroes:")
                for hero in heroes:
                    team = hero['team']
                    pos = hero['position'] + 1
                    name = hero['hero_localized_name']
                    score = hero['match_score']
                    print(f"{team} #{pos}: {name} (confidence: {score:.2f})")

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
                with open(args.output, 'w') as f:
                    json.dump(heroes, f, indent=2)
                logger.info(f"Saved {len(heroes)} heroes to {args.output}")

                # Print results
                print(f"\nIdentified {len(heroes)} heroes:")
                for hero in heroes:
                    team = hero['team']
                    pos = hero['position'] + 1
                    name = hero['hero_localized_name']
                    score = hero['match_score']
                    print(f"{team} #{pos}: {name} (confidence: {score:.2f})")

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
