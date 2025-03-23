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
import time

# Import our modules if available
try:
    from clip_utils import get_clip_details, download_clip, extract_frames
except ImportError:
    # For standalone usage
    print("Warning: clip_utils module not found, standalone mode only")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create performance timer class for measuring execution time
class PerformanceTimer:
    def __init__(self):
        self.timings = {}

    def start(self, label):
        if label not in self.timings:
            self.timings[label] = {'starts': [], 'stops': [], 'totals': []}
        self.timings[label]['starts'].append(time.time())

    def stop(self, label):
        if label in self.timings and len(self.timings[label]['starts']) > len(self.timings[label]['stops']):
            start_time = self.timings[label]['starts'][-1]
            stop_time = time.time()
            duration = stop_time - start_time
            self.timings[label]['stops'].append(stop_time)
            self.timings[label]['totals'].append(duration)
            return duration
        return 0

    def get_summary(self):
        summary = {}
        for label, data in self.timings.items():
            counts = len(data['totals'])
            if counts > 0:
                total_time = sum(data['totals'])
                avg_time = total_time / counts
                summary[label] = {
                    'count': counts,
                    'total': total_time,
                    'avg': avg_time,
                    'max': max(data['totals']) if data['totals'] else 0,
                    'min': min(data['totals']) if data['totals'] else 0
                }
        return summary

# Create global timer
performance_timer = PerformanceTimer()

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

# Skew angle for the gaps between heroes
SKEW_ANGLE_DEGREES = 9  # degrees

# Clock dimensions (from frontend code)
CLOCK_WIDTH = 295  # pixels (was 265)
CLOCK_HEIGHT = 131  # pixels
# Asymmetric clock offsets from center
CLOCK_LEFT_EXTEND = 134  # pixels
CLOCK_RIGHT_EXTEND = 148  # pixels
# Total clock width based on asymmetric extensions
CLOCK_TOTAL_WIDTH = CLOCK_LEFT_EXTEND + CLOCK_RIGHT_EXTEND

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
            return None

        # Apply color profile correction if enabled via environment variable
        if os.environ.get("COLOR_CORRECTION", "").lower() in ("1", "true", "yes"):
            # Convert to LAB color space and back to ensure consistent colors
            # This helps normalize images with different color profiles
            logger.debug(f"Applying color profile correction to {image_path}")
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            image = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

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
        if width < 5*(HERO_WIDTH+HERO_GAP) + CLOCK_TOTAL_WIDTH + 5*(HERO_WIDTH+HERO_GAP) or height < bar_height:
            logger.warning(f"Frame too small: {width}x{height}, need at least {5*(HERO_WIDTH+HERO_GAP) + CLOCK_TOTAL_WIDTH + 5*(HERO_WIDTH+HERO_GAP)}x{bar_height}")
            return False, None, center_x

        # Extract full top bar for visualization
        if debug:
            top_bar = frame[top_offset:top_offset+bar_height, 0:width]
            save_debug_image(top_bar, "top_bar_full")

            # Draw lines to visualize hero positions
            visualization = top_bar.copy()
            # Draw center line
            cv2.line(visualization, (center_x, 0), (center_x, bar_height), (0, 255, 255), 2)

            # Calculate skew offset based on height
            skew_offset = int(np.tan(np.radians(SKEW_ANGLE_DEGREES)) * HERO_ACTUAL_HEIGHT)

            # Draw radiant hero boundaries with skewed gaps
            for i in range(5):
                x = center_x - CLOCK_LEFT_EXTEND - (5-i) * (HERO_WIDTH + HERO_GAP)

                # Draw skewed rectangle for Radiant (positive skew)
                points = np.array([
                    [x, HERO_TOP_PADDING],  # Top-left
                    [x + HERO_WIDTH, HERO_TOP_PADDING],  # Top-right
                    [x + HERO_WIDTH + skew_offset, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT],  # Bottom-right
                    [x + skew_offset, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT]   # Bottom-left
                ], dtype=np.int32)
                cv2.polylines(visualization, [points], True, (0, 255, 0), 2)
                cv2.putText(visualization, f"R{i+1}", (x + 5, 25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

            # Draw dire hero boundaries with skewed gaps
            for i in range(5):
                x = center_x + CLOCK_RIGHT_EXTEND + i * (HERO_WIDTH + HERO_GAP)

                # Draw skewed rectangle for Dire (negative skew)
                points = np.array([
                    [x, HERO_TOP_PADDING],  # Top-left
                    [x + HERO_WIDTH, HERO_TOP_PADDING],  # Top-right
                    [x + HERO_WIDTH - skew_offset, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT],  # Bottom-right
                    [x - skew_offset, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT]   # Bottom-left
                ], dtype=np.int32)
                cv2.polylines(visualization, [points], True, (0, 0, 255), 2)
                cv2.putText(visualization, f"D{i+1}", (x + 5, 25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

            # Draw clock boundaries with asymmetric extents
            cv2.rectangle(visualization,
                         (center_x - CLOCK_LEFT_EXTEND, 0),
                         (center_x + CLOCK_RIGHT_EXTEND, bar_height),
                         (255, 255, 0), 2)

            # Add text to indicate the skew angle
            x_radiant = center_x - CLOCK_LEFT_EXTEND - 3 * (HERO_WIDTH + HERO_GAP)
            cv2.putText(visualization, f"Skew: +{SKEW_ANGLE_DEGREES}°", (x_radiant, bar_height - 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
            x_dire = center_x + CLOCK_RIGHT_EXTEND + 2 * (HERO_WIDTH + HERO_GAP)
            cv2.putText(visualization, f"Skew: -{SKEW_ANGLE_DEGREES}°", (x_dire, bar_height - 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

            # Add text to show dimensions
            cv2.putText(visualization, f"Hero: {HERO_WIDTH}x{HERO_HEIGHT}px", (10, bar_height - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
            cv2.putText(visualization, f"Clock: {CLOCK_TOTAL_WIDTH}px ({CLOCK_LEFT_EXTEND}L/{CLOCK_RIGHT_EXTEND}R)", (center_x - 100, bar_height - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

            save_debug_image(visualization, "top_bar_annotated_skewed")

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
    3. Accounts for the 9-degree skew in the gaps between heroes:
       - Radiant: positive 9-degree skew (left-to-right)
       - Dire: negative 9-degree skew (right-to-left)

    Args:
        top_bar: Cropped top bar image
        center_x: X-coordinate of the center of the frame
        debug: Whether to save debug images

    Returns:
        list: List of (team, position, icon_image) tuples
    """
    try:
        hero_icons = []
        height, width = top_bar.shape[:2]

        # Calculate skew offset based on height
        # tan(9°) ≈ 0.158 * height = pixel offset at bottom
        skew_offset = int(np.tan(np.radians(SKEW_ANGLE_DEGREES)) * HERO_ACTUAL_HEIGHT)
        logger.debug(f"Skew offset at bottom: {skew_offset} pixels for {SKEW_ANGLE_DEGREES} degrees")

        # Extract Radiant heroes (left side, 5 heroes) with positive skew
        for i in range(5):
            # Calculate position based on center and hero width with asymmetric clock
            x_start = center_x - CLOCK_LEFT_EXTEND - (5-i) * (HERO_WIDTH + HERO_GAP)

            # Create a mask for the skewed rectangle
            mask = np.zeros((height, width), dtype=np.uint8)

            # Points for a skewed quadrilateral (positive skew for Radiant)
            # Top-left, top-right, bottom-right, bottom-left
            points = np.array([
                [x_start, HERO_TOP_PADDING],  # Top-left (0° at top)
                [x_start + HERO_WIDTH, HERO_TOP_PADDING],  # Top-right (0° at top)
                [x_start + HERO_WIDTH + skew_offset, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT],  # Bottom-right (9° at bottom)
                [x_start + skew_offset, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT]   # Bottom-left (9° at bottom)
            ], dtype=np.int32)

            # Fill the polygon
            cv2.fillPoly(mask, [points], 255)

            # Create a temporary full-height image to apply the mask
            temp_image = top_bar.copy()
            masked_hero = cv2.bitwise_and(temp_image, temp_image, mask=mask)

            # Find the bounding box of the skewed rectangle
            x_min, y_min = x_start, HERO_TOP_PADDING
            x_max, y_max = x_start + HERO_WIDTH + skew_offset, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT

            # Crop to the bounding box
            cropped_hero = masked_hero[y_min:y_max, x_min:x_max]

            # Check if we have a valid crop
            if cropped_hero.size == 0:
                logger.warning(f"Invalid crop for Radiant hero {i+1}")
                continue

            # Create a clean rectangular hero icon by warping the skewed image
            # Define source points (skewed quadrilateral) and destination points (rectangle)
            src_points = np.array([
                [0, 0],  # Top-left
                [HERO_WIDTH, 0],  # Top-right
                [HERO_WIDTH + skew_offset, HERO_ACTUAL_HEIGHT],  # Bottom-right
                [skew_offset, HERO_ACTUAL_HEIGHT]  # Bottom-left
            ], dtype=np.float32)

            dst_points = np.array([
                [0, 0],  # Top-left
                [HERO_WIDTH, 0],  # Top-right
                [HERO_WIDTH, HERO_ACTUAL_HEIGHT],  # Bottom-right
                [0, HERO_ACTUAL_HEIGHT]  # Bottom-left
            ], dtype=np.float32)

            # Calculate perspective transform
            M = cv2.getPerspectiveTransform(src_points, dst_points)
            hero_icon = cv2.warpPerspective(cropped_hero, M, (HERO_WIDTH, HERO_ACTUAL_HEIGHT))

            # Save for debugging
            if debug:
                # Save the mask, masked crop, and final hero icon
                save_debug_image(mask[y_min:y_max, x_min:x_max], f"radiant_hero_{i+1}_mask")
                save_debug_image(cropped_hero, f"radiant_hero_{i+1}_skewed")
                save_debug_image(hero_icon, f"radiant_hero_{i+1}_portrait")

                # Draw the skewed quadrilateral on the original image for visualization
                vis_image = top_bar.copy()
                cv2.polylines(vis_image, [points], True, (0, 255, 0), 2)
                save_debug_image(vis_image, f"radiant_hero_{i+1}_outline")

            # Add to list: (team, position, icon)
            hero_icons.append(("Radiant", i, hero_icon))

        # Extract Dire heroes (right side, 5 heroes) with negative skew
        for i in range(5):
            # Calculate position based on center and hero width with asymmetric clock
            x_start = center_x + CLOCK_RIGHT_EXTEND + i * (HERO_WIDTH + HERO_GAP)

            # Create a mask for the skewed rectangle
            mask = np.zeros((height, width), dtype=np.uint8)

            # Points for a skewed quadrilateral (negative skew for Dire)
            # Top-left, top-right, bottom-right, bottom-left
            points = np.array([
                [x_start, HERO_TOP_PADDING],  # Top-left (0° at top)
                [x_start + HERO_WIDTH, HERO_TOP_PADDING],  # Top-right (0° at top)
                [x_start + HERO_WIDTH - skew_offset, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT],  # Bottom-right (-9° at bottom)
                [x_start - skew_offset, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT]   # Bottom-left (-9° at bottom)
            ], dtype=np.int32)

            # Fill the polygon
            cv2.fillPoly(mask, [points], 255)

            # Create a temporary full-height image to apply the mask
            temp_image = top_bar.copy()
            masked_hero = cv2.bitwise_and(temp_image, temp_image, mask=mask)

            # Find the bounding box of the skewed rectangle
            x_min, y_min = x_start - skew_offset, HERO_TOP_PADDING
            x_max, y_max = x_start + HERO_WIDTH, HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT

            # Crop to the bounding box
            cropped_hero = masked_hero[y_min:y_max, x_min:x_max]

            # Check if we have a valid crop
            if cropped_hero.size == 0:
                logger.warning(f"Invalid crop for Dire hero {i+1}")
                continue

            # Create a clean rectangular hero icon by warping the skewed image
            # Define source points (skewed quadrilateral) and destination points (rectangle)
            src_points = np.array([
                [skew_offset, 0],  # Top-left
                [skew_offset + HERO_WIDTH, 0],  # Top-right
                [HERO_WIDTH, HERO_ACTUAL_HEIGHT],  # Bottom-right
                [0, HERO_ACTUAL_HEIGHT]  # Bottom-left
            ], dtype=np.float32)

            dst_points = np.array([
                [0, 0],  # Top-left
                [HERO_WIDTH, 0],  # Top-right
                [HERO_WIDTH, HERO_ACTUAL_HEIGHT],  # Bottom-right
                [0, HERO_ACTUAL_HEIGHT]  # Bottom-left
            ], dtype=np.float32)

            # Calculate perspective transform
            M = cv2.getPerspectiveTransform(src_points, dst_points)
            hero_icon = cv2.warpPerspective(cropped_hero, M, (HERO_WIDTH, HERO_ACTUAL_HEIGHT))

            # Save for debugging
            if debug:
                # Save the mask, masked crop, and final hero icon
                save_debug_image(mask[y_min:y_max, x_min:x_max], f"dire_hero_{i+1}_mask")
                save_debug_image(cropped_hero, f"dire_hero_{i+1}_skewed")
                save_debug_image(hero_icon, f"dire_hero_{i+1}_portrait")

                # Draw the skewed quadrilateral on the original image for visualization
                vis_image = top_bar.copy()
                cv2.polylines(vis_image, [points], True, (0, 0, 255), 2)
                save_debug_image(vis_image, f"dire_hero_{i+1}_outline")

            # Add to list: (team, position, icon)
            hero_icons.append(("Dire", i, hero_icon))

        logger.debug(f"Extracted {len(hero_icons)} hero icons with skewed boundaries")
        return hero_icons
    except Exception as e:
        logger.error(f"Error extracting hero icons: {e}")
        return []

def crop_hero_portrait(hero_icon, debug=False):
    """
    Crop a specific section of the hero portrait for more accurate comparison.

    The cropping is done according to specific dimensions scaled to the input image:
    - For standard hero icons (108x66), crop is:
      - Starting point: 26px from the left, 0px from the top
      - Width: 46px
      - Height: 40px
    - For other sizes, the coordinates are scaled proportionally

    This crops out a distinctive part of the hero face for better identification.

    Args:
        hero_icon: The hero icon image to crop
        debug: Whether to save debug images

    Returns:
        The cropped portrait section
    """
    try:
        # Get dimensions of the input image
        height, width = hero_icon.shape[:2]

        # Reference dimensions for the hero icon from the top bar
        reference_width = HERO_WIDTH  # 108px
        reference_height = HERO_ACTUAL_HEIGHT  # 66px (72px - 6px top padding)

        # Define crop coordinates for the reference size
        ref_x_start = 26
        ref_y_start = 0
        ref_crop_width = 46
        ref_crop_height = 40

        # Scale the crop coordinates based on the actual image dimensions
        scale_x = width / reference_width
        scale_y = height / reference_height

        x_start = int(ref_x_start * scale_x)
        y_start = int(ref_y_start * scale_y)
        crop_width = int(ref_crop_width * scale_x)
        crop_height = int(ref_crop_height * scale_y)

        # Make sure the crop is within bounds
        if x_start + crop_width > width or y_start + crop_height > height:
            logger.warning("Crop dimensions exceed hero icon size, adjusting crop")
            crop_width = min(crop_width, width - x_start)
            crop_height = min(crop_height, height - y_start)

        if crop_width <= 0 or crop_height <= 0:
            logger.error("Invalid crop dimensions")
            return hero_icon  # Return the original if we can't crop

        # Perform the crop
        cropped_portrait = hero_icon[y_start:y_start+crop_height, x_start:x_start+crop_width]

        # Save debug image if needed
        if debug:
            # Create a visualization of the crop area
            vis_image = hero_icon.copy()
            cv2.rectangle(vis_image, (x_start, y_start),
                         (x_start + crop_width, y_start + crop_height),
                         (0, 255, 0), 2)
            save_debug_image(vis_image, "hero_crop_area",
                           f"Scaled crop: {x_start},{y_start} {crop_width}x{crop_height} (scale: {scale_x:.2f}x{scale_y:.2f})")
            save_debug_image(cropped_portrait, "hero_cropped_portrait")

        return cropped_portrait
    except Exception as e:
        logger.error(f"Error cropping hero portrait: {e}")
        return hero_icon  # Return the original if there's an error

def identify_hero(hero_icon, heroes_data, min_score=0.4, debug=False):
    """
    Identify a hero using template matching.

    Compares the hero icon against all hero templates (including variants/personas/arcanas)
    and returns the best match.
    Always checks all heroes and their variants to find the most confident match.

    Matching modes:
    - When color correction is enabled, uses multiple color spaces for matching
    - With fast-color mode, uses optimized color matching with fewer channels
    - With hue-only mode, only uses the H channel from HSV color space
    - Otherwise, uses grayscale matching for better performance

    Args:
        hero_icon: Image of the hero icon (cropped to just the hero portrait without color bar)
        heroes_data: Dictionary of hero data
        min_score: Minimum match score to consider a match
        debug: Whether to save debug images

    Returns:
        dict: Hero data and match score, or None if no match above min_score
    """
    performance_timer.start('identify_hero')
    try:
        if not heroes_data:
            logger.error("No heroes data available")
            return None

        # Crop the hero portrait to focus on the more distinctive part
        performance_timer.start('crop_hero_portrait')
        cropped_hero = crop_hero_portrait(hero_icon, debug=debug)
        performance_timer.stop('crop_hero_portrait')

        # Resize to a standard size for comparison
        performance_timer.start('resize_hero')
        hero_icon_resized = cv2.resize(cropped_hero, (256, 144))
        performance_timer.stop('resize_hero')

        # Save for debugging if needed
        if debug:
            save_debug_image(hero_icon_resized, "hero_icon_standardized")

        best_match = None
        best_score = 0
        all_matches = []

        # Check which matching mode to use
        use_color_matching = os.environ.get("COLOR_CORRECTION", "").lower() in ("1", "true", "yes")
        use_fast_color = os.environ.get("FAST_COLOR", "").lower() in ("1", "true", "yes")
        use_hue_only = os.environ.get("HUE_ONLY", "").lower() in ("1", "true", "yes")
        normalize_hue = os.environ.get("NORMALIZE_HUE", "").lower() in ("1", "true", "yes")

        if use_hue_only:
            if normalize_hue:
                logger.debug("Using Hue-only template matching with normalization")
            else:
                logger.debug("Using Hue-only template matching without normalization")
        elif use_fast_color:
            logger.debug("Using fast color template matching (optimized for speed)")
        elif use_color_matching:
            logger.debug("Using full multi-color space template matching")
        else:
            logger.debug("Using grayscale-only template matching for best performance")

        # Track template matching performance
        performance_timer.start('template_matching_total')
        templates_checked = 0

        # Compare with each hero template
        for hero in heroes_data:
            hero_id = hero.get('id')
            hero_name = hero.get('name')
            hero_localized_name = hero.get('localized_name')

            # Check all variants of this hero
            for variant in hero.get('variants', []):
                templates_checked += 1
                variant_name = variant.get('variant')
                template_path = Path(variant.get('image_path'))

                if not template_path.exists():
                    logger.debug(f"Template not found for hero {hero_id} variant {variant_name}: {template_path}")
                    continue

                # Load and resize the template using our custom function to avoid iCCP warnings
                performance_timer.start('load_template')
                template = load_image(template_path)
                performance_timer.stop('load_template')

                if template is None:
                    logger.warning(f"Could not load template: {template_path}")
                    continue

                # Apply the same crop to the template
                performance_timer.start('crop_template')
                template_cropped = crop_hero_portrait(template, debug=False)
                performance_timer.stop('crop_template')

                # Resize to match our hero icon
                performance_timer.start('resize_template')
                template_resized = cv2.resize(template_cropped, (256, 144))
                performance_timer.stop('resize_template')

                # Perform template matching
                performance_timer.start('color_conversion')

                if use_hue_only:
                    # Convert to HSV and extract only the Hue channel
                    hsv_icon = cv2.cvtColor(hero_icon_resized, cv2.COLOR_BGR2HSV)
                    hsv_template = cv2.cvtColor(template_resized, cv2.COLOR_BGR2HSV)

                    # Extract H channel (Hue)
                    hue_icon = hsv_icon[:,:,0]
                    hue_template = hsv_template[:,:,0]

                    # Normalize pixel values to 0-1 if requested
                    if normalize_hue:
                        hue_icon = hue_icon / 180.0  # OpenCV Hue range is 0-180
                        hue_template = hue_template / 180.0

                    # Debug visualization
                    if debug:
                        hue_vis_icon = np.uint8(hue_icon * 255 if normalize_hue else hue_icon)
                        hue_vis_template = np.uint8(hue_template * 255 if normalize_hue else hue_template)
                        save_debug_image(hue_vis_icon, "hue_only_icon",
                                        f"Hue channel {'normalized' if normalize_hue else 'raw'}")
                        save_debug_image(hue_vis_template, "hue_only_template",
                                        f"Hue channel {'normalized' if normalize_hue else 'raw'}")
                elif use_fast_color:
                    # Fast color matching mode - only use key color spaces/channels
                    # Grayscale is always calculated
                    gray_icon = cv2.cvtColor(hero_icon_resized, cv2.COLOR_BGR2GRAY)
                    gray_template = cv2.cvtColor(template_resized, cv2.COLOR_BGR2GRAY)

                    # Only HSV Hue channel which is most distinctive for hero colors
                    hsv_icon = cv2.cvtColor(hero_icon_resized, cv2.COLOR_BGR2HSV)
                    hsv_template = cv2.cvtColor(template_resized, cv2.COLOR_BGR2HSV)
                    # Extract H channel (Hue)
                    hue_icon = hsv_icon[:,:,0]
                    hue_template = hsv_template[:,:,0]

                elif not use_color_matching:
                    # Grayscale matching is used when neither hue-only nor color matching is enabled
                    gray_icon = cv2.cvtColor(hero_icon_resized, cv2.COLOR_BGR2GRAY)
                    gray_template = cv2.cvtColor(template_resized, cv2.COLOR_BGR2GRAY)
                else:
                    # Full color matching mode - prepare all color spaces
                    # Grayscale
                    gray_icon = cv2.cvtColor(hero_icon_resized, cv2.COLOR_BGR2GRAY)
                    gray_template = cv2.cvtColor(template_resized, cv2.COLOR_BGR2GRAY)

                    # HSV
                    hsv_icon = cv2.cvtColor(hero_icon_resized, cv2.COLOR_BGR2HSV)
                    hsv_template = cv2.cvtColor(template_resized, cv2.COLOR_BGR2HSV)

                    # LAB
                    lab_icon = cv2.cvtColor(hero_icon_resized, cv2.COLOR_BGR2LAB)
                    lab_template = cv2.cvtColor(template_resized, cv2.COLOR_BGR2LAB)

                performance_timer.stop('color_conversion')

                # Use multiple methods and combine scores
                methods = [cv2.TM_CCOEFF_NORMED, cv2.TM_CCORR_NORMED]
                scores = []

                performance_timer.start('template_matching')

                if use_hue_only:
                    # Match using only Hue channel
                    for method in methods:
                        result = cv2.matchTemplate(hue_icon, hue_template, method)
                        _, score, _, _ = cv2.minMaxLoc(result)
                        scores.append(score)
                elif use_fast_color:
                    # Fast color matching - use grayscale and hue only
                    # Grayscale (60% weight)
                    for method in methods:
                        result = cv2.matchTemplate(gray_icon, gray_template, method)
                        _, score, _, _ = cv2.minMaxLoc(result)
                        scores.append(score * 0.6)  # Higher weight for grayscale

                    # Hue channel (40% weight)
                    for method in methods:
                        result = cv2.matchTemplate(hue_icon, hue_template, method)
                        _, score, _, _ = cv2.minMaxLoc(result)
                        scores.append(score * 0.4)  # Weight for Hue

                elif not use_color_matching:
                    # Match in grayscale only
                    for method in methods:
                        result = cv2.matchTemplate(gray_icon, gray_template, method)
                        _, score, _, _ = cv2.minMaxLoc(result)
                        scores.append(score)
                else:
                    # Full multi-color space matching
                    # Match in grayscale
                    for method in methods:
                        result = cv2.matchTemplate(gray_icon, gray_template, method)
                        _, score, _, _ = cv2.minMaxLoc(result)
                        scores.append(score * 0.4)  # Weight grayscale matches at 40%

                    # Match in HSV (separate channels for better accuracy)
                    for i in range(3):  # H, S, V channels
                        h_icon = hsv_icon[:,:,i]
                        h_template = hsv_template[:,:,i]
                        for method in methods:
                            result = cv2.matchTemplate(h_icon, h_template, method)
                            _, score, _, _ = cv2.minMaxLoc(result)
                            weight = 0.1 if i == 0 else 0.05  # Weight Hue higher than Saturation and Value
                            scores.append(score * weight)

                    # Match in LAB
                    for i in range(3):  # L, A, B channels
                        l_icon = lab_icon[:,:,i]
                        l_template = lab_template[:,:,i]
                        for method in methods:
                            result = cv2.matchTemplate(l_icon, l_template, method)
                            _, score, _, _ = cv2.minMaxLoc(result)
                            scores.append(score * 0.05)  # Weight each LAB channel at 5%

                    # BGR direct matching (weighted lower as it's more susceptible to lighting changes)
                    for method in methods:
                        for i in range(3):  # B, G, R channels
                            b_icon = hero_icon_resized[:,:,i]
                            b_template = template_resized[:,:,i]
                            result = cv2.matchTemplate(b_icon, b_template, method)
                            _, score, _, _ = cv2.minMaxLoc(result)
                            scores.append(score * 0.05)  # Weight each BGR channel at 5%

                performance_timer.stop('template_matching')

                # Calculate final score based on mode
                if (use_color_matching and not use_hue_only) or use_fast_color:
                    avg_score = sum(scores)  # weighted sum should total 1.0
                else:
                    avg_score = sum(scores) / len(scores)  # simple average for grayscale or hue-only

                # Add to list of all matches
                match_info = {
                    'hero_id': hero_id,
                    'hero_name': hero_name,
                    'hero_localized_name': hero_localized_name,
                    'variant': variant_name,
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
                    save_debug_image(comparison, f"hero_match_{hero_id}_{variant_name}",
                                   f"{hero_localized_name} ({variant_name}): {avg_score:.3f}")

        # Log template matching performance
        performance_timer.stop('template_matching_total')
        logger.debug(f"Checked {templates_checked} hero templates in {performance_timer.timings['template_matching_total']['totals'][-1]:.3f}s")

        # Sort all matches by score for debugging
        all_matches.sort(key=lambda x: x['match_score'], reverse=True)

        # Log top 3 matches for debugging
        if all_matches and len(all_matches) >= 3:
            top_matches = all_matches[:3]
            logger.debug(f"Top 3 matches: " +
                       ", ".join([f"{m['hero_localized_name']} ({m['variant']}): {m['match_score']:.3f}" for m in top_matches]))

        # Return the best match if it's above the threshold
        if best_match and best_match['match_score'] >= min_score:
            logger.debug(f"Best match: {best_match['hero_localized_name']} ({best_match['variant']}) with score {best_match['match_score']:.3f}")
            return best_match
        else:
            if best_match:
                logger.debug(f"Best match below threshold: {best_match['hero_localized_name']} ({best_match['variant']}) with score {best_match['match_score']:.3f}")
            return None
    except Exception as e:
        logger.error(f"Error identifying hero: {e}")
        return None
    finally:
        performance_timer.stop('identify_hero')

def process_frame_for_heroes(frame_path, debug=False):
    """
    Process a single frame to identify heroes.

    Args:
        frame_path: Path to the frame image
        debug: Whether to save debug images

    Returns:
        list: List of identified heroes with confidence scores
    """
    performance_timer.start('process_frame')
    try:
        # Load the frame using our custom function to avoid iCCP warnings
        performance_timer.start('load_frame')
        frame = load_image(frame_path)
        performance_timer.stop('load_frame')

        if frame is None:
            logger.error(f"Could not load frame: {frame_path}")
            return []

        # Load heroes data
        performance_timer.start('load_heroes_data')
        heroes_data = load_heroes_data()
        performance_timer.stop('load_heroes_data')

        if not heroes_data:
            logger.error("Could not load heroes data")
            return []

        # Extract the hero bar
        performance_timer.start('extract_hero_bar')
        success, top_bar, center_x = extract_hero_bar(frame, debug=debug)
        performance_timer.stop('extract_hero_bar')

        if not success or top_bar is None:
            logger.warning(f"Could not extract hero bar from frame: {frame_path}")
            return []

        # Extract hero icons
        performance_timer.start('extract_hero_icons')
        hero_icons = extract_hero_icons(top_bar, center_x, debug=debug)
        performance_timer.stop('extract_hero_icons')

        if not hero_icons:
            logger.warning(f"No hero icons extracted from frame: {frame_path}")
            return []

        # Identify each hero
        identified_heroes = []

        performance_timer.start('identify_all_heroes')
        for team, position, hero_icon in hero_icons:
            hero_data = identify_hero(hero_icon, heroes_data, debug=debug)
            if hero_data:
                # Add team and position information
                hero_data['team'] = team
                hero_data['position'] = position
                identified_heroes.append(hero_data)
                logger.debug(f"Identified {team} hero at position {position+1}: "
                           f"{hero_data['hero_localized_name']} ({hero_data['variant']}) "
                           f"(confidence: {hero_data['match_score']:.3f})")
            else:
                logger.debug(f"Could not identify {team} hero at position {position+1}")
        performance_timer.stop('identify_all_heroes')

        logger.info(f"Identified {len(identified_heroes)} heroes in frame")

        # Sort by team and position
        identified_heroes.sort(key=lambda h: (h['team'], h['position']))

        return identified_heroes
    except Exception as e:
        logger.error(f"Error processing frame for heroes: {e}")
        return []
    finally:
        duration = performance_timer.stop('process_frame')
        logger.info(f"Frame processing completed in {duration:.3f} seconds")

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
    performance_timer.start('process_all_frames')
    all_results = []
    best_frame_count = 0
    best_frame_heroes = []
    best_frame_index = -1
    best_frame_path = None

    logger.info(f"Processing {len(frame_paths)} frames for heroes")

    for i, frame_path in enumerate(tqdm(frame_paths, desc="Processing frames for heroes")):
        logger.debug(f"Processing frame {i+1}/{len(frame_paths)}: {frame_path}")

        # Process the frame
        performance_timer.start(f'frame_{i+1}')
        heroes = process_frame_for_heroes(frame_path, debug=debug)
        performance_timer.stop(f'frame_{i+1}')

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
            variant = hero['variant']
            score = hero['match_score']
            confidence_indicator = "*" * int(score * 10)  # Visual indicator of confidence
            logger.info(f"  {team} #{pos}: {name} ({variant}) (confidence: {score:.2f})")

    # Stop the timer and log the total time
    duration = performance_timer.stop('process_all_frames')
    logger.info(f"All frames processed in {duration:.3f} seconds")

    return best_frame_heroes

def main():
    """Main function."""
    # Start the overall timing
    performance_timer.start('total_execution')

    parser = argparse.ArgumentParser(description="Detect Dota 2 heroes in a Twitch clip")
    parser.add_argument("clip_url", nargs="?",
                      help="URL of the Twitch clip (required for downloading)")
    parser.add_argument("--frame-path", help="Path to a single frame to process")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    parser.add_argument("--output", "-o", default="heroes.json",
                      help="Output file path (default: heroes.json)")
    parser.add_argument("--min-score", type=float, default=0.4,
                      help="Minimum match score (0.0-1.0) to consider a hero identified (default: 0.4)")
    parser.add_argument("--color-correction", action="store_true",
                      help="Enable color profile correction for more accurate matching")
    parser.add_argument("--fast-color", action="store_true",
                      help="Use optimized color matching (faster than full color, more accurate than grayscale)")
    parser.add_argument("--hue-only", action="store_true",
                      help="Use only Hue channel from HSV for template matching")
    parser.add_argument("--normalize-hue", action="store_true",
                      help="Normalize Hue values to 0-1 range (only applies with --hue-only)")
    parser.add_argument("--show-timings", action="store_true",
                      help="Show detailed performance timing information")

    args = parser.parse_args()

    # Set debug level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        os.environ["DEBUG_IMAGES"] = "1"

    # Set matching mode flags
    matching_mode = "grayscale"

    # Hue-only mode takes precedence if specified
    if args.hue_only:
        os.environ["HUE_ONLY"] = "1"
        matching_mode = "hue-only"

        if args.normalize_hue:
            os.environ["NORMALIZE_HUE"] = "1"
            matching_mode += " (normalized)"
            logger.info("Using Hue-only template matching with normalization")
        else:
            logger.info("Using Hue-only template matching without normalization")

    # Fast-color mode takes precedence over full color correction
    elif args.fast_color:
        os.environ["FAST_COLOR"] = "1"
        matching_mode = "fast-color"
        logger.info("Using fast color matching (optimized for speed and accuracy)")

    # Otherwise, use color correction if specified
    elif args.color_correction:
        os.environ["COLOR_CORRECTION"] = "1"
        matching_mode = "multi-color space"
        logger.info("Color profile correction enabled - using multi-color space matching")
    else:
        logger.info("Using grayscale-only matching for best performance")

    try:
        # Process a single frame if provided
        if args.frame_path:
            logger.info(f"Processing single frame: {args.frame_path}")
            performance_timer.start('process_single_frame')
            heroes = process_frame_for_heroes(args.frame_path, debug=args.debug)
            processing_time = performance_timer.stop('process_single_frame')

            if heroes:
                # Sort by team and position
                heroes.sort(key=lambda h: (h['team'] == 'Dire', h['position']))

                # Add timing data to output
                heroes_output = {
                    'heroes': heroes,
                    'timing': {
                        'total_processing_time': processing_time,
                        'matching_mode': matching_mode,
                        'detailed_timings': performance_timer.get_summary() if args.show_timings else None
                    }
                }

                with open(args.output, 'w') as f:
                    json.dump(heroes_output, f, indent=2)
                logger.info(f"Saved {len(heroes)} heroes to {args.output}")

                # Print results with confidence scores
                print(f"\nIdentified {len(heroes)} heroes in {processing_time:.3f} seconds using {matching_mode} matching:")
                for hero in heroes:
                    team = hero['team']
                    pos = hero['position'] + 1
                    name = hero['hero_localized_name']
                    variant = hero['variant']
                    score = hero['match_score']
                    confidence_indicator = "*" * int(score * 10)  # Visual indicator of confidence
                    print(f"{team} #{pos}: {name} ({variant}) (confidence: {score:.2f})")

                # Print detailed timing information if requested
                if args.show_timings:
                    print("\nPerformance Timing Summary:")
                    for label, stats in performance_timer.get_summary().items():
                        print(f"  {label}: {stats['count']} calls, {stats['total']:.3f}s total, {stats['avg']:.3f}s avg")

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
            performance_timer.start('get_clip_details')
            clip_details = get_clip_details(args.clip_url)
            performance_timer.stop('get_clip_details')
            logger.info("Clip details retrieved")

            # Download the clip
            performance_timer.start('download_clip')
            clip_path = download_clip(clip_details)
            performance_timer.stop('download_clip')
            logger.info(f"Clip downloaded to: {clip_path}")

            # Extract frames
            performance_timer.start('extract_frames')
            frame_paths = extract_frames(clip_path, frame_interval=0.5)
            performance_timer.stop('extract_frames')
            logger.info(f"Extracted {len(frame_paths)} frames")

            # Use only the last 5 frames
            if len(frame_paths) > 5:
                frame_paths = frame_paths[-5:]
                logger.info(f"Using only the last 5 frames: {len(frame_paths)} frames")

            # Process frames for heroes
            performance_timer.start('process_frames')
            heroes = process_frames_for_heroes(frame_paths, debug=args.debug)
            processing_time = performance_timer.stop('process_frames')

            if heroes:
                # Sort by team and position
                heroes.sort(key=lambda h: (h['team'] == 'Dire', h['position']))

                # Add timing data to output
                heroes_output = {
                    'heroes': heroes,
                    'timing': {
                        'total_processing_time': processing_time,
                        'matching_mode': matching_mode,
                        'detailed_timings': performance_timer.get_summary() if args.show_timings else None
                    }
                }

                with open(args.output, 'w') as f:
                    json.dump(heroes_output, f, indent=2)
                logger.info(f"Saved {len(heroes)} heroes to {args.output}")

                # Print results with confidence scores
                print(f"\nIdentified {len(heroes)} heroes in {processing_time:.3f} seconds using {matching_mode} matching:")
                for hero in heroes:
                    team = hero['team']
                    pos = hero['position'] + 1
                    name = hero['hero_localized_name']
                    variant = hero['variant']
                    score = hero['match_score']
                    confidence_indicator = "*" * int(score * 10)  # Visual indicator of confidence
                    print(f"{team} #{pos}: {name} ({variant}) (confidence: {score:.2f})")

                # Print detailed timing information if requested
                if args.show_timings:
                    print("\nPerformance Timing Summary:")
                    for label, stats in sorted(performance_timer.get_summary().items()):
                        print(f"  {label}: {stats['count']} calls, {stats['total']:.3f}s total, {stats['avg']:.3f}s avg")

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
    finally:
        # Log total execution time
        total_time = performance_timer.stop('total_execution')
        logger.info(f"Total execution time: {total_time:.3f} seconds")

if __name__ == "__main__":
    sys.exit(main())
