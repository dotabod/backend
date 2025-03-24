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

# Import pytesseract for OCR
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    print("Warning: pytesseract not installed, OCR for rank detection will be disabled")
    print("Install with: pip install pytesseract")
    print("You also need to install Tesseract OCR: https://github.com/tesseract-ocr/tesseract")

# Import our modules if available
try:
    from clip_utils import get_clip_details, download_clip, extract_frames
except ImportError:
    # For standalone usage
    print("Warning: clip_utils module not found, standalone mode only")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Define expected colors for each hero position
expected_colors = {
    "Radiant": {
        0: "#1778F8",  # Radiant position 1
        1: "#14FFB6",  # Radiant position 2
        2: "#BE02C9",  # Radiant position 3
        3: "#F6FE0C",  # Radiant position 4
        4: "#EC4000"   # Radiant position 5
    },
    "Dire": {
        0: "#F15AC0",  # Dire position 1
        1: "#9DC609",  # Dire position 2
        2: "#26F0FC",  # Dire position 3
        3: "#04A100",  # Dire position 4
        4: "#A66208"   # Dire position 5
    }
}

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

def clear_debug_directory():
    """Clear the debug directory of all files."""
    if DEBUG_DIR.exists():
        logger.info(f"Clearing debug directory: {DEBUG_DIR}")
        # Remove all files but keep the directory
        for file_path in DEBUG_DIR.glob("*"):
            if file_path.is_file():
                try:
                    file_path.unlink()
                except Exception as e:
                    logger.warning(f"Failed to delete {file_path}: {e}")
    else:
        logger.info(f"Creating debug directory: {DEBUG_DIR}")
        DEBUG_DIR.mkdir(exist_ok=True, parents=True)

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
    """Load hero data from heroes.json file and precompute templates."""
    if not HEROES_FILE.exists():
        logger.error(f"Heroes data file not found: {HEROES_FILE}")
        logger.info("Please run dota_heroes.py to download hero data first")
        return None

    try:
        with open(HEROES_FILE, 'r') as f:
            heroes_data = json.load(f)

        # Precompute and cache templates
        logger.info(f"Precomputing templates for {len(heroes_data)} heroes...")
        templates_loaded = 0

        for hero in heroes_data:
            for variant in hero.get('variants', []):
                template_path = Path(variant.get('image_path'))
                if template_path.exists():
                    template = load_image(template_path)
                    if template is not None:
                        # Apply crop and resize once
                        template_cropped = crop_hero_portrait(template, debug=False)
                        variant['cached_template'] = cv2.resize(template_cropped, (128, 72))
                        templates_loaded += 1
                    else:
                        variant['cached_template'] = None
                else:
                    variant['cached_template'] = None

        logger.debug(f"Loaded and cached {templates_loaded} templates from {len(heroes_data)} heroes")
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

            # Save for debugging
            if debug:
                # Save the mask, masked crop, and final hero icon
                save_debug_image(cropped_hero, f"radiant_hero_{i+1}_skewed")

                # Draw the skewed quadrilateral on the original image for visualization
                vis_image = top_bar.copy()
                cv2.polylines(vis_image, [points], True, (0, 255, 0), 2)
                save_debug_image(vis_image, f"radiant_hero_{i+1}_outline")

            # Add to list: (team, position, icon)
            hero_icons.append(("Radiant", i, cropped_hero))

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

            # Save for debugging
            if debug:
                # Save the mask, masked crop, and final hero icon
                save_debug_image(cropped_hero, f"dire_hero_{i+1}_skewed")

                # Draw the skewed quadrilateral on the original image for visualization
                vis_image = top_bar.copy()
                cv2.polylines(vis_image, [points], True, (0, 0, 255), 2)
                save_debug_image(vis_image, f"dire_hero_{i+1}_outline")

            # Add to list: (team, position, icon)
            hero_icons.append(("Dire", i, cropped_hero))

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

def crop_rank_banner(top_bar, center_x, team, position, debug=False):
    """
    Extract the rank banner for a specific hero position from the top bar.

    The rank banner:
    - Contains rank information like "Rank 17"
    - Has a dark purple background color #482634 that fades to transparent at edges
    - Has text in brownish color #9B7B77
    - Is located in the bottom area of the hero portrait section
    - Has varying length but is contained within the hero portrait width

    Args:
        top_bar: The top bar image containing all heroes
        center_x: X-coordinate of the center of the frame
        team: "Radiant" or "Dire"
        position: Position index (0-4)
        debug: Whether to save debug images

    Returns:
        The cropped rank banner section
    """
    try:
        # Get dimensions of the input image
        height, width = top_bar.shape[:2]

        # Calculate the position of the hero
        if team == "Radiant":
            # Radiant heroes are on the left side
            x_start = center_x - CLOCK_LEFT_EXTEND - (5-position) * (HERO_WIDTH + HERO_GAP)
        else:  # Dire
            # Dire heroes are on the right side
            x_start = center_x + CLOCK_RIGHT_EXTEND + position * (HERO_WIDTH + HERO_GAP) - 10

        # Define the rank banner location relative to the hero portrait
        # We'll use a larger area first, then refine using color detection
        ref_y_start = 50  # Start a bit higher to ensure we catch the banner
        ref_banner_height = 25  # Taller to ensure we include the entire banner
        ref_banner_width = HERO_WIDTH  # Full hero width to start with
        ref_x_start = x_start  # Start from left edge of hero portrait

        # Make sure we're within bounds
        if ref_x_start < 0:
            logger.warning("Rank banner x position is negative, adjusting")
            ref_x_start = 0

        if ref_x_start + ref_banner_width > width:
            logger.warning("Rank banner extends beyond frame width, adjusting")
            ref_banner_width = width - ref_x_start

        if ref_y_start + ref_banner_height > height:
            logger.warning("Rank banner extends beyond frame height, adjusting")
            ref_banner_height = height - ref_y_start

        # Get initial area that should contain the rank banner
        initial_area = top_bar[ref_y_start:ref_y_start+ref_banner_height,
                              ref_x_start:ref_x_start+ref_banner_width]

        if debug:
            save_debug_image(initial_area, f"{team.lower()}_pos{position+1}_initial_area")

        # Now let's use color detection to refine and find the actual banner area
        # Convert to HSV for better color detection
        hsv = cv2.cvtColor(initial_area, cv2.COLOR_BGR2HSV)

        # Define the color range for the dark purple background (#482634)
        bg_rgb = (72, 38, 52)  # RGB for #482634
        bg_hsv = cv2.cvtColor(np.uint8([[bg_rgb]]), cv2.COLOR_RGB2HSV)[0][0]
        # Create range with tolerance (wider tolerance to catch faded areas)
        bg_lower = np.array([max(0, bg_hsv[0] - 20), 40, 20])
        bg_upper = np.array([min(180, bg_hsv[0] + 20), 255, 120])

        # Create a mask for the banner background
        bg_mask = cv2.inRange(hsv, bg_lower, bg_upper)

        # Clean up the mask with morphological operations
        kernel = np.ones((3, 3), np.uint8)
        bg_mask = cv2.morphologyEx(bg_mask, cv2.MORPH_CLOSE, kernel)

        if debug:
            save_debug_image(bg_mask, f"{team.lower()}_pos{position+1}_bg_mask")

        # Find contours in the mask
        contours, _ = cv2.findContours(bg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # If we found contours, use the largest one to refine our crop
        refined_crop = initial_area
        if contours:
            # Find largest contour (which should be the banner)
            largest_contour = max(contours, key=cv2.contourArea)
            x, y, w, h = cv2.boundingRect(largest_contour)

            # Only use the refined crop if it's reasonably sized
            min_width = 40  # Minimum reasonable width for a rank banner
            min_height = 10  # Minimum reasonable height

            if w >= min_width and h >= min_height:
                # Add a small margin around the detected contour
                margin = 3
                x_with_margin = max(0, x - margin)
                y_with_margin = max(0, y - margin)
                w_with_margin = min(initial_area.shape[1] - x_with_margin, w + 2*margin)
                h_with_margin = min(initial_area.shape[0] - y_with_margin, h + 2*margin)

                # Create refined crop
                refined_crop = initial_area[y_with_margin:y_with_margin+h_with_margin,
                                          x_with_margin:x_with_margin+w_with_margin]

                if debug:
                    # Draw the contour and bounding box on a copy of the initial area
                    contour_vis = initial_area.copy()
                    cv2.drawContours(contour_vis, [largest_contour], 0, (0, 255, 0), 2)
                    cv2.rectangle(contour_vis, (x, y), (x+w, y+h), (0, 0, 255), 2)
                    save_debug_image(contour_vis, f"{team.lower()}_pos{position+1}_contour")
                    save_debug_image(refined_crop, f"{team.lower()}_pos{position+1}_refined_crop")

        # Save debug image if needed
        if debug:
            # Create a visualization of the crop area on the full top bar
            vis_image = top_bar.copy()
            cv2.rectangle(vis_image, (ref_x_start, ref_y_start),
                         (ref_x_start + ref_banner_width, ref_y_start + ref_banner_height),
                         (0, 0, 255), 2)  # Red for initial area
            save_debug_image(vis_image, f"{team.lower()}_pos{position+1}_rank_banner_area",
                           f"Initial rank banner area: {ref_x_start},{ref_y_start} {ref_banner_width}x{ref_banner_height}")

        return refined_crop
    except Exception as e:
        logger.error(f"Error cropping rank banner for {team} position {position+1}: {e}")
        return None

def get_top_hero_matches(hero_icon, heroes_data, top_n=5, min_score=0.4, debug=False):
    """
    Get top N hero matches for a hero icon instead of just the best match.

    Args:
        hero_icon: The hero icon image
        heroes_data: Hero data dictionary
        top_n: Number of top matches to return
        min_score: Minimum match score threshold
        debug: Whether to save debug images

    Returns:
        list: List of top N hero matches with scores above threshold
    """
    performance_timer.start('get_top_hero_matches')
    try:
        if not heroes_data:
            logger.error("No heroes data available")
            return []

        # Crop the hero portrait to focus on the more distinctive part
        performance_timer.start('crop_hero_portrait')
        cropped_hero = crop_hero_portrait(hero_icon, debug=debug)
        performance_timer.stop('crop_hero_portrait')

        # No need to extract rank banner here - we'll do it separately

        # Resize to a standard size for comparison
        performance_timer.start('resize_hero')
        hero_icon_resized = cv2.resize(cropped_hero, (128, 72))
        performance_timer.stop('resize_hero')

        # Apply slight blur to reduce noise in the source image
        # This is controlled by an environment variable
        if os.environ.get("APPLY_BLUR", "").lower() in ("1", "true", "yes"):
            hero_icon_resized = cv2.GaussianBlur(hero_icon_resized, (5, 5), 0)
            if debug:
                save_debug_image(hero_icon_resized, "hero_icon_blurred")

        # Save for debugging if needed
        if debug:
            save_debug_image(hero_icon_resized, "hero_icon_standardized")

        # Setup for parallel processing
        performance_timer.start('template_matching_total')

        # Check if we should add borders to templates
        add_border = os.environ.get("ADD_BORDER", "").lower() in ("1", "true", "yes")
        border_size = 20 if add_border else 0  # pixels on each side

        # Prepare tasks for parallel execution
        tasks = []
        for hero in heroes_data:
            hero_id = hero.get('id')
            hero_name = hero.get('name')
            hero_localized_name = hero.get('localized_name')

            for variant in hero.get('variants', []):
                variant_name = variant.get('variant')
                template = variant.get('cached_template')

                # Only add to task list if template exists
                if template is not None:
                    # Apply the same blur to the template if enabled
                    if os.environ.get("APPLY_BLUR", "").lower() in ("1", "true", "yes"):
                        template = cv2.GaussianBlur(template, (5, 5), 0)

                    # Create a version of the template to use based on options
                    template_to_use = template

                    # Add a border around the template to allow for "sliding window" matching if enabled
                    if add_border:
                        template_to_use = cv2.copyMakeBorder(
                            template,
                            border_size, border_size, border_size, border_size,
                            cv2.BORDER_CONSTANT,
                            value=[0, 0, 0]  # Black border
                        )

                    tasks.append((
                        hero_icon_resized,
                        template_to_use,  # Use appropriate template (with or without border)
                        hero,
                        variant_name,
                        hero_id,
                        hero_name,
                        hero_localized_name,
                        border_size  # Pass border size for match_template function
                    ))

        # Use ThreadPoolExecutor to parallelize template matching
        max_workers = min(os.cpu_count() or 4, 4)
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            matches = list(executor.map(match_template, tasks))

        performance_timer.stop('template_matching_total')

        # Filter out any zero scores and scores below threshold
        valid_matches = [m for m in matches if m['match_score'] >= min_score]

        if not valid_matches:
            return []

        # Sort matches by score descending and take top N
        top_matches = sorted(valid_matches, key=lambda x: x['match_score'], reverse=True)[:top_n]

        # Debug: Create a visual comparison of the input hero with the top matches
        if debug or os.environ.get("DEBUG_TEMPLATE_MATCHES", "").lower() in ("1", "true", "yes"):
            # Get input hero and top templates side by side
            match_count = min(5, len(top_matches))  # Show at most 5 matches

            # Create a combined image showing the source hero and top matches
            # Each match gets its own row with 3 images: source, template, diff
            # Each image is 128x72, so each row is 3*128 wide and 72 tall
            # Allow for some padding between images
            pad = 10
            text_height = 30
            row_height = 72 + text_height + pad
            width = 128 * 3 + pad * 4  # 3 images per row with padding
            height = row_height * match_count + pad

            combined = np.ones((height, width, 3), dtype=np.uint8) * 255  # White background

            for i, match in enumerate(top_matches[:match_count]):
                # Calculate position for this row
                y_offset = i * row_height + pad

                # Draw the source hero icon
                x1, y1 = pad, y_offset
                combined[y1:y1+72, x1:x1+128] = hero_icon_resized

                # Get the template from the match
                for hero in heroes_data:
                    if hero.get('id') == match['hero_id']:
                        for variant in hero.get('variants', []):
                            if variant.get('variant') == match['variant']:
                                template = variant.get('cached_template')
                                if template is not None:
                                    # Draw the template
                                    x2, y2 = x1 + 128 + pad, y_offset
                                    combined[y2:y2+72, x2:x2+128] = template

                                    # Create a colored diff image
                                    x3, y3 = x2 + 128 + pad, y_offset
                                    # Create a colorized diff highlighting differences
                                    diff = cv2.absdiff(hero_icon_resized, template)
                                    # Make it more visible by scaling
                                    diff = cv2.multiply(diff, 2)
                                    combined[y3:y3+72, x3:x3+128] = diff

                                    break

                # Add text labels
                font = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = 0.5
                font_thickness = 1
                font_color = (0, 0, 0)  # Black text

                # Label for source
                cv2.putText(combined, "Source", (x1, y1+72+20),
                            font, font_scale, font_color, font_thickness)

                # Label for template
                template_text = f"{match['hero_localized_name']} ({match['variant']})"
                cv2.putText(combined, template_text, (x2, y2+72+20),
                            font, font_scale, font_color, font_thickness)

                # Label for template with match score
                score_text = f"Match score: {match['match_score']:.3f}"
                cv2.putText(combined, score_text, (x2, y2+72+40),
                            font, font_scale, font_color, font_thickness)

                # Label for diff
                cv2.putText(combined, "Difference", (x3, y3+72+20),
                            font, font_scale, font_color, font_thickness)

            # Save the combined image
            # Include team and position in filename if available
            team_pos = ""
            if len(top_matches) > 0 and 'team' in top_matches[0] and 'position' in top_matches[0]:
                team = top_matches[0]['team']
                pos = top_matches[0]['position'] + 1
                team_pos = f"{team}_pos{pos}_"

            # Create unique name including the top match
            top_match = top_matches[0] if top_matches else {'hero_localized_name': 'unknown', 'variant': 'unknown'}
            save_debug_image(combined, f"template_match_{team_pos}{top_match['hero_localized_name']}_{top_match['variant']}".replace(" ", "_"))

        # Log top matches for debugging
        if debug:
            logger.debug(f"Top {len(top_matches)} matches: " +
                       ", ".join([f"{m['hero_localized_name']} ({m['variant']}): {m['match_score']:.3f}"
                                 for m in top_matches]))

        return top_matches
    except Exception as e:
        logger.error(f"Error getting top hero matches: {e}")
        return []
    finally:
        performance_timer.stop('get_top_hero_matches')

def match_template(args):
    """Worker function for parallel template matching"""
    if len(args) == 8:
        hero_icon, template_with_border, hero, variant_name, hero_id, hero_name, hero_localized_name, border_size = args
        template = template_with_border  # Use the bordered template
    else:
        hero_icon, template, hero, variant_name, hero_id, hero_name, hero_localized_name = args
        border_size = 0

    # Skip if template is None
    if template is None:
        return {'match_score': 0}

    # Perform template matching with the bordered template
    if border_size > 0:
        # When using a bordered template, search for the smaller hero_icon inside the larger template_with_border
        # This allows the algorithm to find the optimal position of the hero within the bordered area
        result = cv2.matchTemplate(template, hero_icon, cv2.TM_CCORR_NORMED)
        _, score, _, _ = cv2.minMaxLoc(result)
    else:
        # Legacy path for backward compatibility - search template in hero_icon
        result = cv2.matchTemplate(hero_icon, template, cv2.TM_CCORR_NORMED)
        _, score, _, _ = cv2.minMaxLoc(result)

    return {
        'hero_id': hero_id,
        'hero_name': hero_name,
        'hero_localized_name': hero_localized_name,
        'variant': variant_name,
        'match_score': score
    }

def resolve_hero_duplicates(hero_candidates, debug=False):
    """
    Resolve duplicate hero matches across all positions.

    This function ensures each hero appears only once by:
    1. Starting with the highest confidence matches
    2. If a duplicate is found, using the next best match for the position with lower confidence
    3. Repeating until all positions have unique heroes or run out of candidates

    Args:
        hero_candidates: List of lists, where each inner list contains match candidates for a position
        debug: Whether to output debug information

    Returns:
        list: List of identified heroes with no duplicates
    """
    # Flatten positions for processing
    positions = []
    for i, candidates in enumerate(hero_candidates):
        if candidates:  # Skip empty positions
            team = candidates[0]['team']
            pos = candidates[0]['position']
            # Store (index, team, position, candidates)
            positions.append((i, team, pos, candidates))

    # Sort positions by the confidence of their best match (descending)
    positions.sort(key=lambda x: x[3][0]['match_score'] if x[3] else 0, reverse=True)

    # Keep track of assigned heroes to avoid duplicates
    assigned_heroes = set()
    resolved_heroes = []

    # Track which positions had to use alternate matches
    alternates_used = []

    # Process positions in order of confidence
    for idx, team, pos, candidates in positions:
        if not candidates:
            continue

        # Try to find a non-duplicate hero for this position
        for candidate_idx, candidate in enumerate(candidates):
            hero_key = f"{candidate['hero_id']}_{candidate['variant']}"

            if hero_key not in assigned_heroes:
                # Found a unique hero, use it
                resolved_heroes.append(candidate)
                assigned_heroes.add(hero_key)

                # Log if we had to use an alternate match
                if candidate_idx > 0:
                    prev_match = candidates[0]
                    logger.info(f"Used alternate match for {team} position {pos+1}: "
                               f"{candidate['hero_localized_name']} ({candidate['variant']}) "
                               f"with score {candidate['match_score']:.3f} instead of "
                               f"{prev_match['hero_localized_name']} ({prev_match['variant']}) "
                               f"with score {prev_match['match_score']:.3f}")

                    alternates_used.append({
                        'team': team,
                        'position': pos,
                        'used': {
                            'hero': candidate['hero_localized_name'],
                            'variant': candidate['variant'],
                            'score': candidate['match_score']
                        },
                        'instead_of': {
                            'hero': prev_match['hero_localized_name'],
                            'variant': prev_match['variant'],
                            'score': prev_match['match_score']
                        }
                    })
                break
        else:
            # If we couldn't find a unique hero, log the issue
            logger.warning(f"Could not find a unique hero for {team} position {pos+1}")

    # Log summary of alternate matches used
    if alternates_used and debug:
        logger.debug(f"Used {len(alternates_used)} alternate matches to resolve duplicates:")
        for alt in alternates_used:
            logger.debug(f"  {alt['team']} pos {alt['position']+1}: "
                       f"{alt['used']['hero']} ({alt['used']['score']:.3f}) "
                       f"instead of {alt['instead_of']['hero']} ({alt['instead_of']['score']:.3f})")

    return resolved_heroes

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

        # Identify each hero with top matches
        performance_timer.start('identify_all_heroes')

        # Store all candidates for each position
        hero_candidates = []

        for team, position, hero_icon in hero_icons:
            # Extract rank banner for this hero position if debug is enabled
            if debug and os.environ.get("EXTRACT_RANK_BANNERS", "").lower() in ("1", "true", "yes"):
                performance_timer.start('crop_rank_banner')
                rank_banner = crop_rank_banner(top_bar, center_x, team, position, debug=True)
                performance_timer.stop('crop_rank_banner')
                if rank_banner is not None:
                    logger.debug(f"Rank banner extracted for {team} position {position+1}, size: {rank_banner.shape[:2]}")

                    # Extract rank text using OCR if available
                    if TESSERACT_AVAILABLE:
                        performance_timer.start('extract_rank_text')
                        rank_number, rank_text = extract_rank_text(rank_banner, debug=True)
                        performance_timer.stop('extract_rank_text')
                        if rank_number:
                            logger.debug(f"Rank detected for {team} position {position+1}: {rank_number}")

            # Get top matches for this hero position, not just the best match
            performance_timer.start('get_top_matches')
            hero_matches = get_top_hero_matches(hero_icon, heroes_data, debug=debug)
            performance_timer.stop('get_top_matches')

            if hero_matches:
                # Add team and position information to all candidates
                for match in hero_matches:
                    match['team'] = team
                    match['position'] = position

                # Store candidate matches for this position
                hero_candidates.append(hero_matches)
                logger.debug(f"Found {len(hero_matches)} potential matches for {team} hero at position {position+1}")
                logger.debug(f"Top match: {hero_matches[0]['hero_localized_name']} ({hero_matches[0]['variant']}) "
                           f"(confidence: {hero_matches[0]['match_score']:.3f})")
            else:
                logger.debug(f"Could not identify {team} hero at position {position+1}")
                # Add empty list as placeholder
                hero_candidates.append([])

        # Resolve duplicates to ensure each hero appears only once
        identified_heroes = resolve_hero_duplicates(hero_candidates, debug=debug)

        # Extract and store rank banners for the final identified heroes
        if os.environ.get("EXTRACT_RANK_BANNERS", "").lower() in ("1", "true", "yes"):
            for hero in identified_heroes:
                team = hero['team']
                position = hero['position']

                # Extract rank banner for this hero position
                performance_timer.start('crop_rank_banner')
                rank_banner = crop_rank_banner(top_bar, center_x, team, position, debug=False)
                performance_timer.stop('crop_rank_banner')

                if rank_banner is not None:
                    # Store the shape of the rank banner
                    hero['rank_banner_shape'] = rank_banner.shape[:2]

                    # Extract rank number using OCR if available
                    if TESSERACT_AVAILABLE:
                        performance_timer.start('extract_rank_text')
                        rank_number, rank_text = extract_rank_text(rank_banner, debug=debug)
                        performance_timer.stop('extract_rank_text')

                        # Store the rank information
                        if rank_number is not None:
                            hero['rank'] = rank_number
                            hero['rank_text'] = rank_text

                    # Save a debug image with the hero name for easier identification
                    if debug:
                        rank_info = f"_rank{hero.get('rank', 'unknown')}" if 'rank' in hero else ""
                        save_debug_image(rank_banner, f"{team.lower()}_pos{position+1}_{hero['hero_localized_name'].replace(' ', '_')}{rank_info}_rank_banner")

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

def detect_hero_color_bars(frame_path, expected_colors, debug=False):
    """
    Detect hero color bars in the top padding section of hero portraits.

    This function checks if a frame contains the expected color bars for all heroes.
    The color bars are located in the top 6px of each hero portrait.

    Args:
        frame_path: Path to the frame image
        expected_colors: Dictionary of expected colors for each team and position
        debug: Whether to save debug images

    Returns:
        tuple: (match_score, detected_colors)
            - match_score: Float between 0.0 and 1.0 indicating how well this frame matches expected colors
            - detected_colors: Dictionary of detected colors for each team and position
    """
    performance_timer.start('detect_hero_color_bars')
    try:
        # Load the frame
        frame = load_image(frame_path)
        if frame is None:
            logger.error(f"Could not load frame: {frame_path}")
            return 0.0, {}

        # Extract the hero bar
        success, top_bar, center_x = extract_hero_bar(frame, debug=debug)
        if not success or top_bar is None:
            logger.warning(f"Could not extract hero bar from frame: {frame_path}")
            return 0.0, {}

        # Extract positions for hero color bars (similar to extract_hero_icons but we only need the top padding area)
        height, width = top_bar.shape[:2]
        detected_colors = {
            "Radiant": {},
            "Dire": {}
        }

        # Calculate skew offset based on height (we're only looking at the top so skew is minimal)
        skew_offset = int(np.tan(np.radians(SKEW_ANGLE_DEGREES)) * HERO_TOP_PADDING)

        # Create a visualization image if in debug mode
        if debug:
            visualization = top_bar.copy()
            cv2.line(visualization, (center_x, 0), (center_x, height), (0, 255, 255), 2)

        # Check Radiant heroes (left side, 5 heroes)
        matches = 0
        total_positions = 10  # 5 Radiant + 5 Dire
        color_similarities = []

        for i in range(5):
            # Calculate position based on center and hero width
            x_start = center_x - CLOCK_LEFT_EXTEND - (5-i) * (HERO_WIDTH + HERO_GAP)

            # Extract the color bar area (top padding only)
            color_bar = top_bar[0:HERO_TOP_PADDING, x_start:x_start+HERO_WIDTH]

            # Skip if empty
            if color_bar.size == 0:
                continue

            # Find the dominant color in the center of the color bar
            # We take a small region in the middle to avoid gradient edges
            mid_width = HERO_WIDTH // 2
            mid_section = color_bar[:, mid_width-10:mid_width+10]

            # Get the average color in BGR format
            avg_color = cv2.mean(mid_section)[:3]
            # Convert BGR to RGB for comparison with expected colors
            avg_color_rgb = (int(avg_color[2]), int(avg_color[1]), int(avg_color[0]))

            # Store the detected color
            detected_colors["Radiant"][i] = avg_color_rgb

            # Check if this color is close to the expected color for this position
            expected_color_hex = expected_colors["Radiant"][i]
            # Convert hex to RGB
            expected_color_rgb = tuple(int(expected_color_hex.lstrip('#')[j:j+2], 16) for j in (0, 2, 4))

            # Calculate color similarity (Euclidean distance)
            color_distance = sum((a - b) ** 2 for a, b in zip(avg_color_rgb, expected_color_rgb)) ** 0.5
            max_distance = 442  # Max possible distance in RGB space is sqrt(255^2 * 3)
            color_similarity = 1.0 - (color_distance / max_distance)
            color_similarities.append(color_similarity)

            # Use a higher threshold for what counts as a match (0.8 instead of 0.7)
            if color_similarity > 0.8:
                matches += 1

            # Draw rectangle in debug mode
            if debug:
                # Draw rectangle for the color bar area
                cv2.rectangle(visualization, (x_start, 0), (x_start+HERO_WIDTH, HERO_TOP_PADDING),
                             (int(avg_color[0]), int(avg_color[1]), int(avg_color[2])), -1)
                # Add color info text
                cv2.putText(visualization, f"R{i+1}: {avg_color_rgb}", (x_start, HERO_TOP_PADDING+15),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
                # Add similarity score
                cv2.putText(visualization, f"{color_similarity:.2f}", (x_start, HERO_TOP_PADDING+30),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
                # Indicate if it's a match or not
                cv2.putText(visualization, "✓" if color_similarity > 0.8 else "✗",
                          (x_start + HERO_WIDTH - 15, HERO_TOP_PADDING+30),
                          cv2.FONT_HERSHEY_SIMPLEX, 0.4,
                          (0, 255, 0) if color_similarity > 0.8 else (0, 0, 255), 1)

        # Check Dire heroes (right side, 5 heroes)
        for i in range(5):
            # Calculate position based on center and hero width
            x_start = center_x + CLOCK_RIGHT_EXTEND + i * (HERO_WIDTH + HERO_GAP)

            # Extract the color bar area (top padding only)
            color_bar = top_bar[0:HERO_TOP_PADDING, x_start:x_start+HERO_WIDTH]

            # Skip if empty
            if color_bar.size == 0:
                continue

            # Find the dominant color in the center of the color bar
            # We take a small region in the middle to avoid gradient edges
            mid_width = HERO_WIDTH // 2
            mid_section = color_bar[:, mid_width-10:mid_width+10]

            # Get the average color in BGR format
            avg_color = cv2.mean(mid_section)[:3]
            # Convert BGR to RGB for comparison with expected colors
            avg_color_rgb = (int(avg_color[2]), int(avg_color[1]), int(avg_color[0]))

            # Store the detected color
            detected_colors["Dire"][i] = avg_color_rgb

            # Check if this color is close to the expected color for this position
            expected_color_hex = expected_colors["Dire"][i]
            # Convert hex to RGB
            expected_color_rgb = tuple(int(expected_color_hex.lstrip('#')[j:j+2], 16) for j in (0, 2, 4))

            # Calculate color similarity (Euclidean distance)
            color_distance = sum((a - b) ** 2 for a, b in zip(avg_color_rgb, expected_color_rgb)) ** 0.5
            max_distance = 442  # Max possible distance in RGB space is sqrt(255^2 * 3)
            color_similarity = 1.0 - (color_distance / max_distance)
            color_similarities.append(color_similarity)

            # Use a higher threshold for what counts as a match (0.8 instead of 0.7)
            if color_similarity > 0.8:
                matches += 1

            # Draw rectangle in debug mode
            if debug:
                # Draw rectangle for the color bar area
                cv2.rectangle(visualization, (x_start, 0), (x_start+HERO_WIDTH, HERO_TOP_PADDING),
                             (int(avg_color[0]), int(avg_color[1]), int(avg_color[2])), -1)
                # Add color info text
                cv2.putText(visualization, f"D{i+1}: {avg_color_rgb}", (x_start, HERO_TOP_PADDING+15),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
                # Add similarity score
                cv2.putText(visualization, f"{color_similarity:.2f}", (x_start, HERO_TOP_PADDING+30),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
                # Indicate if it's a match or not
                cv2.putText(visualization, "✓" if color_similarity > 0.8 else "✗",
                          (x_start + HERO_WIDTH - 15, HERO_TOP_PADDING+30),
                          cv2.FONT_HERSHEY_SIMPLEX, 0.4,
                          (0, 255, 0) if color_similarity > 0.8 else (0, 0, 255), 1)

        # Save the visualization
        if debug:
            save_debug_image(visualization, "hero_color_bars", f"Match score: {matches}/{total_positions}")

        # Add color similarities to the detected colors output for debugging
        detected_colors["color_similarities"] = {i: float(color_similarities[i]) for i in range(len(color_similarities))}
        detected_colors["average_similarity"] = float(sum(color_similarities) / len(color_similarities)) if color_similarities else 0

        # Calculate overall match score
        match_score = matches / total_positions
        logger.debug(f"Frame {frame_path} color bar match score: {match_score:.2f} ({matches}/{total_positions} matches)")

        return match_score, detected_colors
    except Exception as e:
        logger.error(f"Error detecting hero color bars: {e}")
        return 0.0, {}
    finally:
        performance_timer.stop('detect_hero_color_bars')

def process_frames_for_heroes(frame_paths, debug=False):
    """
    Process multiple frames to identify heroes.

    Scans frames in reverse order (last to first) to find a frame with
    a perfect match for hero color bars (10/10 matches), then processes
    only that frame for hero identification.

    Args:
        frame_paths: List of paths to frame images
        debug: Whether to save debug images

    Returns:
        list: List of identified heroes from the best frame
    """
    performance_timer.start('process_all_frames')

    logger.info(f"Analyzing {len(frame_paths)} frames for hero color bars (scanning from last to first)")

    # Find the frame with the best color bar matches
    best_color_match_score = 0.0
    best_color_frame_index = -1
    best_color_frame_path = None
    perfect_match_found = False

    # Reverse the frame paths to start from the end
    reversed_frames = list(enumerate(frame_paths))
    reversed_frames.reverse()

    for i, frame_path in tqdm(reversed_frames, desc="Finding frame with best color bars (last to first)"):
        logger.debug(f"Analyzing color bars in frame {i+1}/{len(frame_paths)}: {frame_path}")

        # Check color bars in this frame
        performance_timer.start(f'color_bars_{i+1}')
        match_score, detected_colors = detect_hero_color_bars(frame_path, expected_colors, debug=(debug and len(frame_paths)-i < 3))
        performance_timer.stop(f'color_bars_{i+1}')

        # Keep track of the frame with the best color match
        if match_score > best_color_match_score:
            best_color_match_score = match_score
            best_color_frame_index = i
            best_color_frame_path = frame_path
            logger.debug(f"New best color match: frame {i+1} with score {best_color_match_score:.2f}")

            # If we found a perfect match (10/10), we can stop
            if match_score == 1.0:
                logger.info(f"Found perfect color match (10/10) in frame {i+1}")
                perfect_match_found = True
                break

    # If we didn't find a perfect match, check if we have a reasonably good match
    if not perfect_match_found:
        if best_color_match_score >= 0.7:  # At least 7/10 matches
            logger.warning(f"No perfect match found, using best match with score {best_color_match_score:.2f} (frame {best_color_frame_index+1})")
        else:
            logger.warning(f"No good color match found, best score was only {best_color_match_score:.2f} in frame {best_color_frame_index+1}")
            # Use the last frame as a fallback
            best_color_frame_index = len(frame_paths) - 1
            best_color_frame_path = frame_paths[best_color_frame_index]
            logger.info(f"Falling back to last frame: {best_color_frame_path}")

    # Process only the best frame for hero identification
    logger.info(f"Processing frame #{best_color_frame_index+1}: {best_color_frame_path} with color match score {best_color_match_score:.2f}")

    # Process the selected frame
    performance_timer.start('process_best_frame')
    heroes = process_frame_for_heroes(best_color_frame_path, debug=debug)
    performance_timer.stop('process_best_frame')

    # Print a summary of identified heroes with confidence scores
    if heroes:
        logger.info("Hero detection summary:")
        for hero in heroes:
            team = hero['team']
            pos = hero['position'] + 1
            name = hero['hero_localized_name']
            variant = hero['variant']
            score = hero['match_score']
            logger.info(f"  {team} #{pos}: {name} ({variant}) (confidence: {score:.2f})")
    else:
        logger.warning(f"No heroes identified in best frame")

    # Stop the timer and log the total time
    duration = performance_timer.stop('process_all_frames')
    logger.info(f"All frames processed in {duration:.3f} seconds")

    return heroes

def adjust_levels(image, black_point, white_point, gamma):
    """
    Apply a levels adjustment to an image similar to Photoshop's Levels filter.

    Args:
        image: The input image
        black_point: Input black point (0-255)
        white_point: Input white point (0-255)
        gamma: Gamma correction value

    Returns:
        The adjusted image
    """
    # Convert to float for processing
    img_float = image.astype(np.float32)

    # Scale the image pixel values from the range [black_point, white_point] to [0, 255]
    adjusted = np.clip((img_float - black_point) * (255.0 / (white_point - black_point)), 0, 255)

    # Apply gamma correction
    adjusted = (adjusted / 255.0) ** (1.0 / gamma) * 255

    # Ensure the pixel values are properly scaled
    adjusted = np.clip(adjusted, 0, 255).astype(np.uint8)

    return adjusted

def extract_rank_text(rank_banner, debug=False):
    """
    Extract the rank number from a rank banner using OCR.

    Uses color thresholding to isolate:
    - Banner background (dark purple #482634 with varying shades)
    - Rank text (brownish #9B7B77 with small variances)

    This makes extraction more accurate by focusing on the specific colors.

    Handles various text formats including:
    - "Rank 123" - Standard format
    - "Ранг 123" - Russian format
    - "Rank 2 499" - Space-separated digits (e.g., 2,499)

    Args:
        rank_banner: The cropped rank banner image containing "Rank X" text
        debug: Whether to save debug images

    Returns:
        tuple: (rank_number, full_rank_text)
            - rank_number: Extracted numerical rank (int) or None if not found
            - full_rank_text: Full text extracted from the banner
    """
    if not TESSERACT_AVAILABLE:
        return None, "OCR not available (pytesseract not installed)"

    try:
        # Convert to HSV for better color thresholding
        hsv = cv2.cvtColor(rank_banner, cv2.COLOR_BGR2HSV)

        # Define color ranges
        # Dark purple background (#482634)
        bg_rgb = (72, 38, 52)  # RGB for #482634
        bg_hsv = cv2.cvtColor(np.uint8([[bg_rgb]]), cv2.COLOR_RGB2HSV)[0][0]
        # Create range with tolerance
        bg_lower = np.array([max(0, bg_hsv[0] - 15), 50, 20])
        bg_upper = np.array([min(180, bg_hsv[0] + 15), 255, 100])

        # Brownish text color (#9B7B77)
        text_rgb = (155, 123, 119)  # RGB for #9B7B77
        text_hsv = cv2.cvtColor(np.uint8([[text_rgb]]), cv2.COLOR_RGB2HSV)[0][0]
        # Create range with tolerance
        text_lower = np.array([max(0, text_hsv[0] - 15), 20, 100])
        text_upper = np.array([min(180, text_hsv[0] + 15), 100, 200])

        # Create masks
        bg_mask = cv2.inRange(hsv, bg_lower, bg_upper)
        text_mask = cv2.inRange(hsv, text_lower, text_upper)

        # Apply the background mask to the original image to isolate the banner
        banner_region = cv2.bitwise_and(rank_banner, rank_banner, mask=bg_mask)

        # Apply the text mask to isolate text
        text_region = cv2.bitwise_and(rank_banner, rank_banner, mask=text_mask)

        # Convert to grayscale for OCR
        gray = cv2.cvtColor(rank_banner, cv2.COLOR_BGR2GRAY)

        # Apply levels adjustment with Photoshop-like parameters for better contrast
        # These values were provided: black_point=81, white_point=189, gamma=4.17
        levels_adjusted = adjust_levels(gray, 81, 189, 4.17)

        # Also create a combined binary image that emphasizes the text
        # This increases contrast between text and background
        combined_binary = cv2.bitwise_not(text_mask)

        # Save preprocessed images if debug is enabled
        if debug:
            save_debug_image(gray, "rank_banner_gray")
            save_debug_image(levels_adjusted, "rank_banner_levels_adjusted")
            save_debug_image(bg_mask, "rank_banner_bg_mask")
            save_debug_image(text_mask, "rank_banner_text_mask")
            save_debug_image(banner_region, "rank_banner_bg_region")
            save_debug_image(text_region, "rank_banner_text_region")
            save_debug_image(combined_binary, "rank_banner_combined_binary")

        # Configure pytesseract to focus on digits, regardless of language
        # We're using a permissive whitelist that includes digits and common text formats
        custom_config = r'--oem 3 --psm 6 -c tessedit_char_whitelist="Rank0123456789 абвгдеёжзийклмнопрстуфхцчшщъыьэюя"'

        # Try OCR on the levels-adjusted image first (likely to have best results)
        text = pytesseract.image_to_string(levels_adjusted, config=custom_config).strip()

        # If no text found, try on the text mask
        if not text:
            text = pytesseract.image_to_string(combined_binary, config=custom_config).strip()

        # If still no text, try on the grayscale image
        if not text:
            text = pytesseract.image_to_string(gray, config=custom_config).strip()

        # If still no text, try on the original image
        if not text:
            text = pytesseract.image_to_string(rank_banner, config=custom_config).strip()

        # Extract all digits from the text using regex
        digits = re.findall(r'\d+', text)

        # Handle two primary cases for rank numbers:
        rank_number = None
        if digits:
            if len(digits) == 1:
                # Case 1: Single sequence of digits (e.g., "Rank 3854")
                raw_number = int(digits[0])
                # Check if number exceeds max rank (5,000)
                if raw_number > 5000:
                    # If more than 4 digits, drop the furthest digit on the right
                    # This handles OCR errors where noise is added as extra digits
                    digit_str = digits[0]
                    if len(digit_str) > 4:
                        # Truncate to the leftmost 4 digits
                        digit_str = digit_str[:4]
                        raw_number = int(digit_str)

                    # If still over 5000, cap at 5000
                    if raw_number > 5000:
                        rank_number = 5000
                        logger.debug(f"Capped rank number from {raw_number} to 5000 (max allowed)")
                    else:
                        rank_number = raw_number
                else:
                    rank_number = raw_number
            else:
                # Case 2: Space-separated digits (e.g., "Rank 2 499")
                # First attempt: Try to join all adjacent numbers if they appear to be part of the same number
                # Check if digits come right after each other in the text with only spaces between

                # Find if there's a pattern like "word + number + spaces + number" that suggests one large number
                # This regex checks for word boundaries and spaces between numbers
                matches = re.finditer(r'\b(\d+)(?:\s+(\d+))+\b', text)
                joined_numbers = []

                for match in matches:
                    # Join all the numbers in this match
                    full_match = match.group(0)
                    # Extract just the digits and join them
                    joined = ''.join(re.findall(r'\d+', full_match))
                    joined_numbers.append(joined)

                if joined_numbers:
                    # Use the first joined number (usually there's only one rank per banner)
                    raw_number = int(joined_numbers[0])

                    # Apply max rank validation (5,000)
                    if raw_number > 5000:
                        # If more than 4 digits, truncate to leftmost 4
                        digit_str = joined_numbers[0]
                        if len(digit_str) > 4:
                            digit_str = digit_str[:4]
                            raw_number = int(digit_str)

                        # If still over 5000, cap at 5000
                        if raw_number > 5000:
                            rank_number = 5000
                            logger.debug(f"Capped joined rank number from {raw_number} to 5000 (max allowed)")
                        else:
                            rank_number = raw_number
                    else:
                        rank_number = raw_number
                else:
                    # Fallback: If we couldn't find a clear pattern, use the first number as is
                    # This handles the "Rank 3 3854" case by taking just the 3
                    raw_number = int(digits[0])

                    # Apply max rank validation for the first number
                    if raw_number > 5000:
                        digit_str = digits[0]
                        if len(digit_str) > 4:
                            digit_str = digit_str[:4]
                            raw_number = int(digit_str)

                        if raw_number > 5000:
                            rank_number = 5000
                        else:
                            rank_number = raw_number
                    else:
                        rank_number = raw_number

                    # But if the first number is very small (1-9) and the second is larger,
                    # the larger one might be the actual rank
                    if len(digits) > 1 and len(digits[0]) == 1 and len(digits[1]) > 2:
                        # First digit is single digit, second is 3+ digits, use the second one
                        raw_number = int(digits[1])

                        # Apply max rank validation for the second number
                        if raw_number > 5000:
                            digit_str = digits[1]
                            if len(digit_str) > 4:
                                digit_str = digit_str[:4]
                                raw_number = int(digit_str)

                            if raw_number > 5000:
                                rank_number = 5000
                                logger.debug(f"Capped second digit rank from {raw_number} to 5000 (max allowed)")
                            else:
                                rank_number = raw_number
                        else:
                            rank_number = raw_number

        if debug:
            # More detailed debug output
            logger.debug(f"OCR extracted text: '{text}', digits found: {digits}")
            if len(digits) > 1:
                logger.debug(f"Multiple digits detected, determined rank: {rank_number}")
            else:
                logger.debug(f"Single digit sequence detected: {rank_number}")

            # Annotate the image with the extracted text
            annotated = rank_banner.copy()
            cv2.putText(annotated, f"OCR: {text}", (5, 15),
                      cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
            if rank_number:
                cv2.putText(annotated, f"Rank: {rank_number}", (5, 30),
                          cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
            save_debug_image(annotated, "rank_banner_ocr_result")

            # Also save an annotated version of the levels-adjusted image
            annotated_levels = cv2.cvtColor(levels_adjusted, cv2.COLOR_GRAY2BGR)
            cv2.putText(annotated_levels, f"OCR: {text}", (5, 15),
                      cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
            if rank_number:
                cv2.putText(annotated_levels, f"Rank: {rank_number}", (5, 30),
                          cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
            save_debug_image(annotated_levels, "rank_banner_levels_adjusted_result")

        return rank_number, text
    except Exception as e:
        logger.error(f"Error extracting rank text with OCR: {e}")
        return None, f"OCR error: {str(e)}"

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
    parser.add_argument("--debug-templates", action="store_true",
                      help="Save debug images of template matching results")
    parser.add_argument("--show-timings", action="store_true",
                      help="Show detailed performance timing information")
    parser.add_argument("--extract-rank-banners", action="store_true",
                      help="Extract rank banners from hero portraits (containing rank numbers)")
    parser.add_argument("--ocr-ranks", action="store_true",
                      help="Use OCR to extract rank numbers from rank banners")
    parser.add_argument("--keep-debug", action="store_true",
                      help="Don't clear debug directory between runs")

    args = parser.parse_args()

    os.environ["ADD_BORDER"] = "1"
    os.environ["APPLY_BLUR"] = "1"

    # Set debug level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        os.environ["DEBUG_IMAGES"] = "1"

        # Clear debug directory at the start of the run, unless --keep-debug is specified
        if not args.keep_debug:
            clear_debug_directory()

    # Enable template matching debug images if requested
    if args.debug_templates:
        os.environ["DEBUG_TEMPLATE_MATCHES"] = "1"
        logger.info("Template matching debug images enabled")

        # Also clear debug directory for template debugging, unless --keep-debug is specified
        if not args.debug and not args.keep_debug:
            clear_debug_directory()

    # Enable rank banner extraction if requested
    if args.extract_rank_banners:
        os.environ["EXTRACT_RANK_BANNERS"] = "1"
        logger.info("Rank banner extraction enabled")

    # Enable OCR for rank detection if requested
    if args.ocr_ranks:
        if TESSERACT_AVAILABLE:
            os.environ["OCR_RANKS"] = "1"
            logger.info("OCR for rank detection enabled")
        else:
            logger.warning("OCR for rank detection requested but pytesseract is not available")
            print("Warning: OCR for rank detection requested but pytesseract is not available")
            print("Install with: pip install pytesseract")
            print("You also need to install Tesseract OCR: https://github.com/tesseract-ocr/tesseract")

    try:
        # Process a clip if URL is provided
        if args.clip_url:
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
            frame_paths = extract_frames(clip_path, frame_interval=10)
            performance_timer.stop('extract_frames')
            logger.info(f"Extracted {len(frame_paths)} frames")

            # Use all frames for color bar detection
            logger.info(f"Analyzing all frames for hero color bars")

            # Process frames for heroes using our new approach
            performance_timer.start('process_frames')
            heroes = process_frames_for_heroes(frame_paths, debug=args.debug)
            processing_time = performance_timer.stop('process_frames')

            if heroes:
                # Get the best color match information from the best frame
                best_frame_index = -1
                best_frame_path = None
                best_match_score = 0.0
                detected_colors = {}

                # Find the frame with the best color match score (scanning from last to first)
                reversed_frame_indices = list(range(len(frame_paths)))
                reversed_frame_indices.reverse()

                for i in reversed_frame_indices:
                    frame_path = frame_paths[i]
                    match_score, colors = detect_hero_color_bars(frame_path, expected_colors, debug=False)
                    if match_score > best_match_score:
                        best_match_score = match_score
                        best_frame_index = i
                        best_frame_path = frame_path
                        detected_colors = colors
                        # If we found a perfect match, stop
                        if match_score == 1.0:
                            logger.info(f"Found perfect color match (10/10) in frame {i+1}")
                            break

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

                    if args.debug:
                        logger.info("Rank banner debug images saved with prefix 'rank_banner_'")

                # Add timing data and color information to output
                heroes_output = {
                    'heroes': heroes,
                    'color_match_score': best_match_score,
                    'detected_colors': detected_colors,
                    'best_frame_index': best_frame_index,
                    'best_frame_path': str(best_frame_path),
                    'rank_banners_extracted': rank_banners_extracted,
                    'timing': {
                        'total_processing_time': processing_time,
                        'detailed_timings': performance_timer.get_summary() if args.show_timings else None
                    }
                }

                with open(args.output, 'w') as f:
                    json.dump(heroes_output, f, indent=2)
                logger.info(f"Saved {len(heroes)} heroes to {args.output}")

                # Print results with confidence scores
                print(f"\nIdentified {len(heroes)} heroes in {processing_time:.3f} seconds:")
                print(f"Color bar match score: {best_match_score:.2f} (frame {best_frame_index+1})")
                for hero in heroes:
                    team = hero['team']
                    pos = hero['position'] + 1
                    name = hero['hero_localized_name']
                    variant = hero['variant']
                    score = hero['match_score']

                    # Add rank information if available
                    rank_info = ""
                    if 'rank' in hero:
                        rank_info = f" (Rank {hero['rank']})"
                    elif 'rank_banner_shape' in hero:
                        rank_info = " (with rank banner)"

                    confidence_indicator = "*" * int(score * 10)  # Visual indicator of confidence
                    print(f"{team} #{pos}: {name} ({variant}) (confidence: {score:.2f}){rank_info}")

                # Print information about debug images if enabled
                if args.debug_templates or args.debug:
                    print(f"\nDebug images saved to: {DEBUG_DIR}")
                    print("Template match comparison images are prefixed with 'template_match_'")
                    if rank_banners_extracted:
                        print("Rank banner images are prefixed with 'rank_banner_'")

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
