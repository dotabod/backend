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
            self.timings[label] = {'starts': [], 'stops': [], 'totals': [], 'stopped': False}
        else:
            # Reset the stopped flag when starting a new timer
            self.timings[label]['stopped'] = False
        self.timings[label]['starts'].append(time.time())

    def stop(self, label):
        if label in self.timings and len(self.timings[label]['starts']) > len(self.timings[label]['stops']) and not self.timings[label]['stopped']:
            start_time = self.timings[label]['starts'][-1]
            stop_time = time.time()
            duration = stop_time - start_time
            self.timings[label]['stops'].append(stop_time)
            self.timings[label]['totals'].append(duration)
            self.timings[label]['stopped'] = True
            return duration
        elif label in self.timings and self.timings[label]['stopped'] and len(self.timings[label]['totals']) > 0:
            # If already stopped, just return the last duration
            return self.timings[label]['totals'][-1]
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
FRAMES_DIR = TEMP_DIR / "frames"
FRAMES_DIR.mkdir(exist_ok=True)
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
# Cache file for precomputed templates
TEMPLATES_CACHE_FILE = HEROES_DIR / "templates_cache.npz"

# Global variable to store loaded heroes data for singleton pattern
_LOADED_HEROES_DATA = None

# Global variable to store loaded facet templates
_LOADED_FACET_TEMPLATES = None

def save_debug_image(image, name_prefix, additional_info=""):
    """Save an image for debugging purposes."""
    if os.environ.get("DEBUG_IMAGES", "").lower() in ("1", "true", "yes"):
        # Generate a unique filename
        filename = f"{name_prefix}.jpg"
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
    """
    Load hero data from heroes.json file and precompute templates.

    Uses a singleton pattern to ensure data is only loaded once per process.
    """
    global _LOADED_HEROES_DATA

    # If data is already loaded, return it (singleton pattern)
    if _LOADED_HEROES_DATA is not None:
        logger.debug("Using already loaded heroes data from memory")
        return _LOADED_HEROES_DATA

    if not HEROES_FILE.exists():
        logger.error(f"Heroes data file not found: {HEROES_FILE}")
        logger.info("Please run dota_heroes.py to download hero data first")
        return None

    try:
        with open(HEROES_FILE, 'r') as f:
            heroes_data = json.load(f)

        # Check if cache file exists
        if TEMPLATES_CACHE_FILE.exists():
            logger.info(f"Loading precomputed templates from cache: {TEMPLATES_CACHE_FILE}")
            performance_timer.start('load_cached_templates')

            # Load the cached templates
            cached_data = np.load(str(TEMPLATES_CACHE_FILE), allow_pickle=True)
            templates_dict = cached_data['templates'].item()

            # Apply cached templates to hero data
            templates_loaded = 0
            for hero in heroes_data:
                for variant in hero.get('variants', []):
                    template_path = variant.get('image_path')
                    cache_key = str(template_path)

                    if cache_key in templates_dict:
                        variant['cached_template'] = templates_dict[cache_key]
                        templates_loaded += 1
                    else:
                        variant['cached_template'] = None

            logger.debug(f"Loaded {templates_loaded} cached templates from disk")
            performance_timer.stop('load_cached_templates')

            # Store in the singleton
            _LOADED_HEROES_DATA = heroes_data
            return heroes_data

        # If no cache exists, precompute and save to cache
        logger.info(f"Precomputing templates for {len(heroes_data)} heroes...")
        performance_timer.start('load_heroes_data')
        templates_loaded = 0
        templates_dict = {}

        for hero in heroes_data:
            for variant in hero.get('variants', []):
                template_path = Path(variant.get('image_path'))
                if template_path.exists():
                    template = load_image(template_path)
                    if template is not None:
                        # Apply crop and resize once
                        template_cropped = crop_hero_portrait(template, debug=False)
                        cached_template = cv2.resize(template_cropped, (128, 72))
                        variant['cached_template'] = cached_template

                        # Save to templates dict for caching
                        templates_dict[str(template_path)] = cached_template
                        templates_loaded += 1
                    else:
                        variant['cached_template'] = None
                else:
                    variant['cached_template'] = None

        # Save templates to cache file
        logger.info(f"Saving {templates_loaded} precomputed templates to cache file")
        np.savez(str(TEMPLATES_CACHE_FILE), templates=templates_dict)

        logger.debug(f"Loaded and cached {templates_loaded} templates from {len(heroes_data)} heroes")
        performance_timer.stop('load_heroes_data')

        # Store in the singleton
        _LOADED_HEROES_DATA = heroes_data
        return heroes_data
    except Exception as e:
        logger.error(f"Error loading heroes data: {e}")
        traceback.print_exc()
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
        ref_y_start = 51  # Start a bit higher to ensure we catch the banner
        ref_banner_height = 15  # Taller to ensure we include the entire banner
        ref_banner_width = HERO_WIDTH - 35 # Full hero width to start with
        ref_x_start = x_start + 25  # Start from left edge of hero portrait

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

        refined_crop = initial_area

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
    # Remove this duplicate timer start since we now time this function from the caller
    # performance_timer.start('get_top_hero_matches')
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
        # Remove this since we've removed the corresponding start timer
        # performance_timer.stop('get_top_hero_matches')
        pass

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

def extract_player_name(top_bar, center_x, team, position, debug=False):
    """
    Extract the player name from the bottom portion of a hero portrait.

    Args:
        top_bar: The top bar image containing all heroes
        center_x: X-coordinate of the center of the frame
        team: "Radiant" or "Dire"
        position: Position index (0-4)
        debug: Whether to save debug images

    Returns:
        string: The extracted player name or None if not found
    """
    try:
        # Get dimensions of the input image
        height, width = top_bar.shape[:2]

        # Get player name area coordinates
        x_start, player_y_start, player_width, player_height = get_player_name_area_coordinates(
            top_bar, center_x, team, position)

        # Get the player name area
        player_area = top_bar[player_y_start:player_y_start+player_height,
                             x_start:x_start+player_width]

        if debug:
            save_debug_image(player_area, f"{team.lower()}_pos{position+1}_player_area")

        # Try to extract text if Tesseract is available
        player_name = None
        if TESSERACT_AVAILABLE:
            try:
                # Convert to grayscale for better OCR
                gray = cv2.cvtColor(player_area, cv2.COLOR_BGR2GRAY)

                # Apply a less aggressive levels adjustment to preserve 'o' characters
                # Using more conservative values to avoid 'o' looking like 'a'
                levels_adjusted = adjust_levels(gray, 80, 220, 3.0)

                # Apply threshold with a higher value to better separate text
                _, thresh = cv2.threshold(levels_adjusted, 150, 255, cv2.THRESH_BINARY_INV)

                # Apply morphological operations to clean up the text
                kernel = np.ones((1, 1), np.uint8)
                thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

                if debug:
                    save_debug_image(levels_adjusted, f"{team.lower()}_pos{position+1}_player_levels")
                    save_debug_image(thresh, f"{team.lower()}_pos{position+1}_player_thresh")
                # Configure tesseract for player names
                # Use --oem 3 for LSTM neural net mode and --psm 7 for single line of text
                # First try with English only
                eng_config = r'--oem 3 --psm 7 -l eng'

                # Get English OCR results with confidence data
                eng_data = pytesseract.image_to_data(thresh, config=eng_config, output_type=pytesseract.Output.DICT)

                # Check if any text was detected in English
                eng_confidences = [conf for conf, text in zip(eng_data['conf'], eng_data['text']) if text.strip()]

                # Calculate average confidence for English if we have results
                eng_avg_confidence = 0
                if eng_confidences:
                    eng_avg_confidence = sum(eng_confidences) / len(eng_confidences)
                    # Join all text parts that have confidence
                    player_name = ' '.join([text for conf, text in
                                          zip(eng_data['conf'], eng_data['text'])
                                          if text.strip() and conf > 0]).strip()

                    logger.debug(f"English OCR confidence: {eng_avg_confidence:.2f}")

                # Only try Russian if English confidence is low (below 60%)
                if not eng_confidences or eng_avg_confidence < 60:
                    logger.debug("Low English confidence, trying Russian")
                    rus_config = r'--oem 3 --psm 7 -l rus'
                    rus_data = pytesseract.image_to_data(thresh, config=rus_config, output_type=pytesseract.Output.DICT)

                    # Check if any text was detected in Russian
                    rus_confidences = [conf for conf, text in zip(rus_data['conf'], rus_data['text']) if text.strip()]

                    if rus_confidences:
                        rus_avg_confidence = sum(rus_confidences) / len(rus_confidences)
                        rus_text = ' '.join([text for conf, text in
                                           zip(rus_data['conf'], rus_data['text'])
                                           if text.strip() and conf > 0]).strip()

                        logger.debug(f"Russian OCR confidence: {rus_avg_confidence:.2f}")

                        # Use Russian result if it has higher confidence
                        if not eng_confidences or rus_avg_confidence > eng_avg_confidence:
                            player_name = rus_text
                            logger.debug("Selected Russian text due to higher confidence")

                # If we still don't have a player name, try with both languages as fallback
                if not player_name:
                    fallback_config = r'--oem 3 --psm 7 -l eng+rus'
                    player_name = pytesseract.image_to_string(thresh, config=fallback_config).strip()
                    logger.debug("Using fallback OCR with both languages")

                # Clean up player name
                if player_name:
                    # Remove special characters and normalize
                    player_name = re.sub(r'[^\w\s\-\.]', '', player_name).strip()

                    # If name is very short or very long, it might be an error
                    if len(player_name) < 2 or len(player_name) > 20:
                        logger.warning(f"Suspicious player name length: '{player_name}' ({len(player_name)} chars)")
                        # if len(player_name) < 2:
                            # player_name = None
            except Exception as e:
                logger.error(f"Error extracting player name with OCR: {e}")
                player_name = None

        return player_name
    except Exception as e:
        logger.error(f"Error extracting player name for {team} position {position+1}: {e}")
        return None

def get_player_name_area_coordinates(top_bar, center_x, team, position):
    """
    Helper function to calculate the coordinates for player name area.
    This is used by both extract_player_name and annotate_player_name_areas.

    Args:
        top_bar: The top bar image containing all heroes
        center_x: X-coordinate of the center of the frame
        team: "Radiant" or "Dire"
        position: Position index (0-4)

    Returns:
        tuple: (x_start, y_start, width, height) for player name area
    """
    # Get dimensions of the input image
    height, width = top_bar.shape[:2]
    # Calculate the position of the hero
    if team == "Radiant":
        # Radiant heroes are on the left side
        x_start = center_x - CLOCK_LEFT_EXTEND - (5-position) * (HERO_WIDTH + HERO_GAP) + SKEW_ANGLE_DEGREES
        # Account for skew in Radiant side
        skew_offset = int(HERO_ACTUAL_HEIGHT * math.tan(math.radians(SKEW_ANGLE_DEGREES)))
        x_start += skew_offset // 2  # Adjust for skew to center the name under the portrait
    else:  # Dire
        # Dire heroes are on the right side
        x_start = center_x + CLOCK_RIGHT_EXTEND + position * (HERO_WIDTH + HERO_GAP) - SKEW_ANGLE_DEGREES
        # Account for skew in Dire side
        skew_offset = int(HERO_ACTUAL_HEIGHT * math.tan(math.radians(SKEW_ANGLE_DEGREES)))
        x_start -= skew_offset // 2  # Adjust for skew to center the name under the portrait

    # Define the player name location relative to the hero portrait
    # Player name is in the bottom part of the hero portrait section
    player_y_start = HERO_TOP_PADDING + HERO_ACTUAL_HEIGHT + 5  # Start below the hero portrait
    player_height = 26   # Reasonable height for player name
    player_width = HERO_WIDTH  # Slightly narrower than hero width to account for spacing

    # Make sure we're within bounds
    if x_start < 0:
        logger.warning("Player name x position is negative, adjusting")
        x_start = 0

    if x_start + player_width > width:
        logger.warning("Player name extends beyond frame width, adjusting")
        player_width = width - x_start

    if player_y_start + player_height > height:
        logger.warning("Player name extends beyond frame height, adjusting")
        player_height = height - player_y_start

    return x_start, player_y_start, player_width, player_height

def annotate_player_name_areas(top_bar, center_x, debug=False):
    """
    Create an annotated version of the top bar with 1px outlines around each player name area.

    Args:
        top_bar: The top bar image containing all heroes
        center_x: X-coordinate of the center of the frame
        debug: Whether to save debug images

    Returns:
        Annotated image with player name areas outlined
    """
    try:
        # Start with the existing hero bar
        visualization = top_bar.copy()

        # Draw outlines for both teams
        for team in ["Radiant", "Dire"]:
            for position in range(5):
                # Get player name area coordinates
                x_start, player_y_start, player_width, player_height = get_player_name_area_coordinates(
                    top_bar, center_x, team, position)

                # Draw 1px outline around the player name area
                color = (0, 255, 0) if team == "Radiant" else (0, 0, 255)  # Green for Radiant, Red for Dire
                cv2.rectangle(visualization,
                             (x_start, player_y_start),
                             (x_start + player_width, player_y_start + player_height),
                             color, 1)  # 1px outline

                # Add text label
                cv2.putText(visualization, f"{team[0]}{position+1} Player",
                           (x_start, player_y_start - 5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

        # Save the visualization
        if debug:
            save_debug_image(visualization, "top_bar_player_name_areas_outlined", "Player name areas outlined with 1px border")

        return visualization
    except Exception as e:
        logger.error(f"Error creating player name area annotation: {e}")
        return top_bar

def extract_team_captains_from_frame(frame_path, debug=False):
    """Extract team captain names from the best frame's hero top bar.

    Captains are defined as the first (left-most) player for Radiant and
    the first (right-most) player for Dire in the hero top bar.

    Returns a dict like { 'Radiant': name_or_None, 'Dire': name_or_None }.
    """
    try:
        frame = load_image(frame_path)
        if frame is None:
            logger.warning(f"Could not load frame for captain extraction: {frame_path}")
            return {}

        success, top_bar, center_x = extract_hero_bar(frame, debug=debug)
        if not success or top_bar is None:
            logger.warning("Could not extract top bar for captain extraction")
            return {}

        captains = {}
        if TESSERACT_AVAILABLE:
            # Radiant captain at position 0
            captains['Radiant'] = extract_player_name(top_bar, center_x, 'Radiant', 0, debug=debug)
            # Dire captain at position 0
            captains['Dire'] = extract_player_name(top_bar, center_x, 'Dire', 0, debug=debug)
        else:
            logger.debug("Tesseract unavailable; cannot OCR captain names")

        return captains
    except Exception as e:
        logger.error(f"Error extracting team captains: {e}")
        return {}

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

        # Create the annotated version with rank areas outlined
        if debug:
            performance_timer.start('annotate_rank_areas')
            annotated_top_bar = annotate_rank_areas(top_bar, center_x, debug=debug)
            performance_timer.stop('annotate_rank_areas')
            save_debug_image(annotated_top_bar, "top_bar_annotated_with_ranks")

            # Create annotated version with player name areas outlined
            performance_timer.start('annotate_player_name_areas')
            annotated_player_names = annotate_player_name_areas(top_bar, center_x, debug=debug)
            performance_timer.stop('annotate_player_name_areas')
            save_debug_image(annotated_player_names, "top_bar_annotated_with_player_names")

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

        # Store rank banners and text for each position when in debug mode
        rank_data = {}

        for team, position, hero_icon in hero_icons:
            # Only extract rank banner once during debugging, not twice
            if debug and os.environ.get("EXTRACT_RANK_BANNERS", "").lower() in ("1", "true", "yes"):
                performance_timer.start('crop_rank_banner')
                rank_banner = crop_rank_banner(top_bar, center_x, team, position, debug=debug)
                performance_timer.stop('crop_rank_banner')

                if rank_banner is not None:
                    logger.debug(f"Rank banner extracted for {team} position {position+1}, size: {rank_banner.shape[:2]}")

                    # Store the data for later use to avoid duplicate calls
                    position_key = f"{team}_{position}"
                    rank_data[position_key] = {
                        'banner': rank_banner,
                        'shape': rank_banner.shape[:2],
                        'rank_number': None,
                        'rank_text': None
                    }

                    # Extract rank text using OCR if available
                    if TESSERACT_AVAILABLE:
                        performance_timer.start('extract_rank_text')
                        rank_number, rank_text = extract_rank_text(rank_banner, debug=debug)
                        performance_timer.stop('extract_rank_text')

                        if rank_number:
                            logger.debug(f"Rank detected for {team} position {position+1}: {rank_number}")
                            rank_data[position_key]['rank_number'] = rank_number
                            rank_data[position_key]['rank_text'] = rank_text

            # Get top matches for this hero position, not just the best match
            performance_timer.start('get_top_hero_matches')
            hero_matches = get_top_hero_matches(hero_icon, heroes_data, debug=debug)
            performance_timer.stop('get_top_hero_matches')

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

        # Extract and store player names and rank banners for the final identified heroes
        if TESSERACT_AVAILABLE:
            for hero in identified_heroes:
                team = hero['team']
                position = hero['position']

                # Extract player name for this hero position
                performance_timer.start('extract_player_name')
                player_name = extract_player_name(top_bar, center_x, team, position, debug=debug)
                performance_timer.stop('extract_player_name')

                if player_name:
                    # Store the player name
                    hero['player_name'] = player_name
                    logger.debug(f"Player name detected for {team} position {position+1}: {player_name}")

                # Check if we already have rank data for this position (from debug mode)
                position_key = f"{team}_{position}"
                if debug and os.environ.get("EXTRACT_RANK_BANNERS", "").lower() in ("1", "true", "yes") and position_key in rank_data:
                    # Use the stored rank data
                    hero['rank_banner_shape'] = rank_data[position_key]['shape']
                    if rank_data[position_key]['rank_number'] is not None:
                        hero['rank'] = rank_data[position_key]['rank_number']
                        hero['rank_text'] = rank_data[position_key]['rank_text']

                    # Save a debug image with the hero name for easier identification
                    rank_info = f"_rank{hero.get('rank', 'unknown')}" if 'rank' in hero else ""
                    save_debug_image(rank_data[position_key]['banner'],
                                    f"{team.lower()}_pos{position+1}_{hero['hero_localized_name'].replace(' ', '_')}{rank_info}_rank_banner")

                # Extract rank banner for this hero position, only if we haven't already done it in debug mode
                elif os.environ.get("EXTRACT_RANK_BANNERS", "").lower() in ("1", "true", "yes"):
                    performance_timer.start('crop_rank_banner')
                    rank_banner = crop_rank_banner(top_bar, center_x, team, position, debug=False)
                    performance_timer.stop('crop_rank_banner')

                    if rank_banner is not None:
                        # Store the shape of the rank banner
                        hero['rank_banner_shape'] = rank_banner.shape[:2]

                        # Extract rank number using OCR if available
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

        # After identifying heroes and extracting player names, try to detect facets
        load_facet_templates_singleton()
        if _LOADED_FACET_TEMPLATES:
            performance_timer.start('detect_facets')
            logger.info("Detecting facets on heroes")

            # Store hero icons for facet detection
            hero_icons_map = {}
            for team, position, hero_icon in hero_icons:
                hero_icons_map[(team, position)] = hero_icon

            # First try Radiant team's first hero
            radiant_heroes = [h for h in identified_heroes if h['team'] == 'Radiant']
            if radiant_heroes:
                first_radiant = radiant_heroes[0]
                logger.info(f"First Radiant hero: {first_radiant}")

                # Get the hero icon for this hero
                radiant_portrait = hero_icons_map.get((first_radiant['team'], first_radiant['position']))
                if radiant_portrait is None:
                    logger.warning(f"No portrait image found for {first_radiant['team']} position {first_radiant['position']}")

                # Get abilities from hero_abilities.json
                abilities = get_hero_abilities(first_radiant['hero_localized_name'], debug=debug)
                logger.info(f"Abilities structure keys: {list(abilities.keys()) if abilities else None}")

                if abilities and radiant_portrait is not None:
                    # Save debug image of the portrait
                    if debug:
                        save_debug_image(radiant_portrait, f"{first_radiant['team'].lower()}_pos{first_radiant['position']}_portrait")

                        # Also save each facet template if available
                        if 'facets' in abilities:
                            for i, facet in enumerate(abilities['facets']):
                                icon_name = facet.get('icon')
                                if icon_name and icon_name in _LOADED_FACET_TEMPLATES:
                                    template = _LOADED_FACET_TEMPLATES[icon_name]
                                    save_debug_image(template, f"template_{first_radiant['hero_localized_name']}_{i}", icon_name)

                    facet = detect_hero_facet(
                        radiant_portrait,
                        'Radiant',
                        abilities,
                        _LOADED_FACET_TEMPLATES,
                        debug=debug
                    )

                    if facet:
                        logger.info(f"Found facet on Radiant hero: {facet}")
                        first_radiant['facet'] = facet
                        logger.info("Found facets on Radiant team, processing all Radiant heroes")

                        # Process all Radiant heroes
                        for hero in radiant_heroes:
                            if hero != first_radiant:  # Skip the first hero which already has a facet
                                portrait = hero_icons_map.get((hero['team'], hero['position']))
                                if portrait is not None:
                                    abilities = get_hero_abilities(hero['hero_localized_name'], debug=debug)
                                    if abilities:
                                        hero_facet = detect_hero_facet(
                                            portrait,
                                            'Radiant',
                                            abilities,
                                            _LOADED_FACET_TEMPLATES,
                                            debug=debug
                                        )
                                        if hero_facet:
                                            hero['facet'] = hero_facet
                                            logger.info(f"Added facet to {hero['team']} hero {hero['position']}: {hero_facet}")
                    else:
                        logger.info("No facets found on Radiant team, trying Dire team")
                        # Try Dire team if no facets found on Radiant
                        dire_heroes = [h for h in identified_heroes if h['team'] == 'Dire']
                        if dire_heroes:
                            first_dire = dire_heroes[0]
                            logger.info(f"First Dire hero: {first_dire}")

                            # Get the hero icon for this hero
                            dire_portrait = hero_icons_map.get((first_dire['team'], first_dire['position']))
                            if dire_portrait is None:
                                logger.warning(f"No portrait image found for {first_dire['team']} position {first_dire['position']}")

                            abilities = get_hero_abilities(first_dire['hero_localized_name'], debug=debug)
                            logger.info(f"Abilities structure keys: {list(abilities.keys()) if abilities else None}")

                            if abilities and dire_portrait is not None:
                                # Save debug image of the portrait
                                if debug:
                                    save_debug_image(dire_portrait, f"{first_dire['team'].lower()}_pos{first_dire['position']}_portrait")

                                    # Also save each facet template if available
                                    if 'facets' in abilities:
                                        for i, facet in enumerate(abilities['facets']):
                                            icon_name = facet.get('icon')
                                            if icon_name and icon_name in _LOADED_FACET_TEMPLATES:
                                                template = _LOADED_FACET_TEMPLATES[icon_name]
                                                save_debug_image(template, f"template_{first_dire['hero_localized_name']}_{i}", icon_name)

                                facet = detect_hero_facet(
                                    dire_portrait,
                                    'Dire',
                                    abilities,
                                    _LOADED_FACET_TEMPLATES,
                                    debug=debug
                                )

                                if facet:
                                    logger.info(f"Found facet on Dire hero: {facet}")
                                    first_dire['facet'] = facet
                                    logger.info("Found facets on Dire team, processing all Dire heroes")

                                    # Process all Dire heroes
                                    for hero in dire_heroes:
                                        if hero != first_dire:  # Skip the first hero which already has a facet
                                            portrait = hero_icons_map.get((hero['team'], hero['position']))
                                            if portrait is not None:
                                                abilities = get_hero_abilities(hero['hero_localized_name'], debug=debug)
                                                if abilities:
                                                    hero_facet = detect_hero_facet(
                                                        portrait,
                                                        'Dire',
                                                        abilities,
                                                        _LOADED_FACET_TEMPLATES,
                                                        debug=debug
                                                    )
                                                    if hero_facet:
                                                        hero['facet'] = hero_facet
                                                        logger.info(f"Added facet to {hero['team']} hero {hero['position']}: {hero_facet}")

            performance_timer.stop('detect_facets')

        # Sort by team and position
        identified_heroes.sort(key=lambda h: (h['team'] == 'Dire', h['position']))

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
        tuple: (heroes, best_frame_info)
            - heroes: List of identified heroes from the best frame
            - best_frame_info: Dictionary containing the best frame details:
                - frame_index: Index of the best frame in frame_paths
                - frame_path: Path to the best frame
                - match_score: Color bar match score (0.0 to 1.0)
                - detected_colors: Dictionary of detected colors for each team and position
    """
    performance_timer.start('process_all_frames')

    logger.info(f"Analyzing {len(frame_paths)} frames for hero color bars (scanning from last to first)")

    # Find the frame with the best color bar matches
    best_color_match_score = 0.0
    best_color_frame_index = -1
    best_color_frame_path = None
    best_detected_colors = {}
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
            best_detected_colors = detected_colors
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
            logger.error(f"No good color match found, best score was only {best_color_match_score:.2f} in frame {best_color_frame_index+1}")
            # Stop timing for all frames
            total_duration = performance_timer.stop('process_all_frames')
            logger.info(f"Processing failed due to insufficient color match score (required >= 0.7)")
            return [], {'frame_index': best_color_frame_index, 'frame_path': best_color_frame_path, 'match_score': best_color_match_score, 'detected_colors': best_detected_colors}

    # Process only the best frame for hero identification
    logger.info(f"Processing frame #{best_color_frame_index+1}: {best_color_frame_path} with color match score {best_color_match_score:.2f}")

    # Process the selected frame
    performance_timer.start('process_best_frame')
    heroes = process_frame_for_heroes(best_color_frame_path, debug=debug)
    performance_timer.stop('process_best_frame')

    # Create a dictionary with information about the best frame
    best_frame_info = {
        'frame_index': best_color_frame_index,
        'frame_path': best_color_frame_path,
        'match_score': best_color_match_score,
        'detected_colors': best_detected_colors
    }

    # Stop timing for all frames
    total_duration = performance_timer.stop('process_all_frames')
    logger.info(f"All frames processed in {total_duration:.3f} seconds, {len(heroes)} heroes identified")

    return heroes, best_frame_info

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
        # Convert to grayscale for OCR
        gray = cv2.cvtColor(rank_banner, cv2.COLOR_BGR2GRAY)

        # Apply more aggressive levels adjustment with Photoshop-like parameters for better contrast
        # Using more aggressive values to enhance text visibility
        levels_adjusted = adjust_levels(gray, 80, 220, 3.0)

        # Save preprocessed images if debug is enabled
        if debug:
            save_debug_image(gray, "rank_banner_gray")
            save_debug_image(levels_adjusted, "rank_banner_levels_adjusted")

        # Configure pytesseract to focus on digits and rank text
        # Using a more restrictive whitelist and PSM 7 (single line of text)
        # This helps avoid picking up random artifacts or noise as numbers
        # OEM 3 is for LSTM mode, which is better for text recognition
        # PSM 7 is for single line of text
        # tessedit_char_whitelist is for the characters we want to recognize
        # tessedit_char_blacklist is for the characters we don't want to recognize
        custom_config = r'--oem 3 --psm 7 -c tessedit_char_whitelist="RankАНГ0123456789 " -c tessedit_char_blacklist=":;,./\|"'

        # Try OCR on the levels-adjusted image
        text = pytesseract.image_to_string(levels_adjusted, config=custom_config).strip()

        # Clean up the text by removing any unexpected characters that might have slipped through
        text = re.sub(r'[^RankАНГ0-9 ]', '', text)

        # If no text found, try on the original grayscale image
        if not text:
            text = pytesseract.image_to_string(gray, config=custom_config).strip()

        # Extract all digits from the text using regex
        digits = re.findall(r'\d+', text)

        # Handle rank number extraction
        rank_number = None
        if digits:
            # Check if the text contains "Rank" - if so, we're dealing with English text
            # In English, digits won't be space-separated, so take the first group
            if "Rank" in text:
                raw_number = int(digits[0])
                # Apply max rank validation (5,000)
                while raw_number > 5000 and len(str(raw_number)) > 1:
                    # If over 5000, remove the last digit
                    digit_str = str(raw_number)[:-1]
                    raw_number = int(digit_str)
                    logger.debug(f"Removed last digit from rank number, new value: {raw_number}")

                # If we still have a number over 5000 (unlikely), cap it
                if raw_number > 5000:
                    raw_number = 5000
                    logger.debug(f"Capping rank number to maximum value: {raw_number}")

                rank_number = raw_number
            else:
                # Non-English text - digits might be space-separated
                if len(digits) == 1:
                    # Case 1: Single sequence of digits
                    raw_number = int(digits[0])
                    # Check if number exceeds max rank (5,000)
                    while raw_number > 5000 and len(str(raw_number)) > 1:
                        # If over 5000, remove the last digit
                        digit_str = str(raw_number)[:-1]
                        raw_number = int(digit_str)
                        logger.debug(f"Removed last digit from rank number, new value: {raw_number}")

                    # If we still have a number over 5000 (unlikely), cap it
                    if raw_number > 5000:
                        raw_number = 5000
                        logger.debug(f"Capping rank number to maximum value: {raw_number}")

                    rank_number = raw_number
                else:
                    # Case 2: Space-separated digits (e.g., "2 499")
                    # Find if there's a pattern like "number + spaces + number" that suggests one large number
                    matches = re.finditer(r'\b(\d+)(?:\s+(\d+))+\b', text)
                    joined_numbers = []

                    for match in matches:
                        # Join all the numbers in this match
                        full_match = match.group(0)
                        # Extract just the digits and join them
                        joined = ''.join(re.findall(r'\d+', full_match))
                        joined_numbers.append(joined)

                    if joined_numbers:
                        # Use the first joined number
                        raw_number = int(joined_numbers[0])

                        # Apply max rank validation (5,000)
                        while raw_number > 5000 and len(str(raw_number)) > 1:
                            # If over 5000, remove the last digit
                            digit_str = str(raw_number)[:-1]
                            raw_number = int(digit_str)
                            logger.debug(f"Removed last digit from joined rank number, new value: {raw_number}")

                        # If we still have a number over 5000 (unlikely), cap it
                        if raw_number > 5000:
                            raw_number = 5000
                            logger.debug(f"Capping rank number to maximum value: {raw_number}")

                        rank_number = raw_number
                    else:
                        # Fallback: If we couldn't find a clear pattern, use the first number
                        raw_number = int(digits[0])

                        # Apply max rank validation for the first number
                        while raw_number > 5000 and len(str(raw_number)) > 1:
                            # If over 5000, remove the last digit
                            digit_str = str(raw_number)[:-1]
                            raw_number = int(digit_str)
                            logger.debug(f"Removed last digit from rank number, new value: {raw_number}")

                        # If we still have a number over 5000 (unlikely), cap it
                        if raw_number > 5000:
                            raw_number = 5000
                            logger.debug(f"Capping rank number to maximum value: {raw_number}")

                        rank_number = raw_number

        if debug:
            # More detailed debug output
            logger.debug(f"OCR extracted text: '{text}', digits found: {digits}")
            if "Rank" in text:
                logger.debug(f"English text detected, using first digit group: {rank_number}")
            elif len(digits) > 1:
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

def load_facet_templates_singleton():
    """Load facet templates using singleton pattern."""
    global _LOADED_FACET_TEMPLATES
    if _LOADED_FACET_TEMPLATES is None:
        _LOADED_FACET_TEMPLATES = load_facet_templates()
    return _LOADED_FACET_TEMPLATES

def _compute_draft_name_boxes(frame_width, frame_height):
    """Compute draft name bounding boxes with optional scaling.

    Uses user-provided constraints and scales them to the current frame size.
    Environment overrides supported:
      DRAFT_Y_START, DRAFT_Y_END, DRAFT_X_START_1, DRAFT_GAP,
      DRAFT_NUM_NAMES, DRAFT_NAME_WIDTH, DRAFT_BASE_WIDTH, DRAFT_BASE_HEIGHT
    """
    # Default constraints (assumed for 1920x1080 sources unless overridden)
    BASE_W = int(os.environ.get("DRAFT_BASE_WIDTH", 1920))
    BASE_H = int(os.environ.get("DRAFT_BASE_HEIGHT", 1080))

    Y_START = int(os.environ.get("DRAFT_Y_START", 480))
    Y_END = int(os.environ.get("DRAFT_Y_END", 515))
    X_START_1 = int(os.environ.get("DRAFT_X_START_1", 125))
    GAP = int(os.environ.get("DRAFT_GAP", 10))
    NUM_NAMES = int(os.environ.get("DRAFT_NUM_NAMES", 8))
    NAME_WIDTH = int(os.environ.get("DRAFT_NAME_WIDTH", 200))  # Replace with actual width if known

    # Scale to current frame resolution
    scale_x = frame_width / float(BASE_W)
    scale_y = frame_height / float(BASE_H)

    y_start = int(round(Y_START * scale_y))
    y_end = int(round(Y_END * scale_y))
    x_start = int(round(X_START_1 * scale_x))
    gap = int(round(GAP * scale_x))
    name_w = int(round(NAME_WIDTH * scale_x))

    boxes = []
    cur_x = x_start
    for _ in range(NUM_NAMES):
        x1 = cur_x
        x2 = cur_x + name_w
        boxes.append((x1, y_start, x2, y_end))
        cur_x = x2 + gap
    return boxes


def _ocr_text_from_region(img_bgr, lang="eng+rus", debug_name=None):
    """Run OCR on a small region using conservative preprocessing.

    Returns tuple (text, avg_confidence). If OCR unavailable, returns (None, 0).
    """
    if not TESSERACT_AVAILABLE:
        return None, 0.0

    try:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        # Levels adjustment and thresholding; try both polarities and pick best
        levels = adjust_levels(gray, 80, 220, 3.0)

        variants = []
        for inv in (False, True):
            if inv:
                _, thr = cv2.threshold(levels, 150, 255, cv2.THRESH_BINARY_INV)
            else:
                _, thr = cv2.threshold(levels, 150, 255, cv2.THRESH_BINARY)
            kernel = np.ones((1, 1), np.uint8)
            thr = cv2.morphologyEx(thr, cv2.MORPH_OPEN, kernel)

            data = pytesseract.image_to_data(
                thr, config=r"--oem 3 --psm 7", lang=lang, output_type=pytesseract.Output.DICT
            )
            texts = [t for t in data.get('text', []) if t and t.strip()]
            confs = [c for t, c in zip(data.get('text', []), data.get('conf', [])) if t and t.strip() and c > 0]
            text_joined = " ".join(texts).strip()
            avg_conf = (sum(confs) / len(confs)) if confs else 0.0
            variants.append((text_joined, avg_conf, thr))

        # Choose the variant with higher confidence and non-empty text
        variants.sort(key=lambda x: (x[1], len(x[0])), reverse=True)
        best_text, best_conf, best_img = variants[0]

        if os.environ.get("DEBUG_IMAGES", "").lower() in ("1", "true", "yes") and debug_name:
            dbg_img = best_img if len(best_img.shape) == 3 else cv2.cvtColor(best_img, cv2.COLOR_GRAY2BGR)
            save_debug_image(
                dbg_img,
                f"draft_ocr_{debug_name}",
                f"text='{(best_text or '').strip()[:24]}', conf={best_conf:.1f}"
            )

        # Clean up text: allow word chars, space, hyphen, dot
        if best_text:
            cleaned = re.sub(r"[^\w\s\-.]", "", best_text).strip()
        else:
            cleaned = ""

        return cleaned if cleaned else None, float(best_conf)
    except Exception as e:
        logger.debug(f"Draft OCR error: {e}")
        return None, 0.0


def isFrameDraft(frame):
    """Check if the given frame is a draft screen by OCR'ing fixed name lanes.

    Heuristic: detect readable names in a row of NUM_NAMES boxes. If at least
    half of the boxes yield plausible text, consider it a draft screen.
    Coordinates are scaled from a 1920x1080 baseline unless overridden.
    """
    logger.info("Checking if frame is a draft screen")

    try:
        h, w = frame.shape[:2]

        # Compute boxes per provided constraints
        boxes = _compute_draft_name_boxes(w, h)

        # Extract text from each box
        extracted = []
        for idx, (x1, y1, x2, y2) in enumerate(boxes):
            # Clamp to bounds
            x1c, y1c = max(0, x1), max(0, y1)
            x2c, y2c = min(w, x2), min(h, y2)
            if x2c <= x1c or y2c <= y1c:
                extracted.append((None, 0.0))
                continue
            roi = frame[y1c:y2c, x1c:x2c]
            text, conf = _ocr_text_from_region(roi, lang="eng+rus", debug_name=f"box{idx+1}")
            extracted.append((text, conf))

        # Optional debug visualization
        vis = frame.copy()
        detected_count = 0
        for idx, (x1, y1, x2, y2) in enumerate(boxes):
            text, conf = extracted[idx]
            ok = bool(text) and len(text) >= 2 and re.search(r"[A-Za-zА-Яа-я]", text)
            detected_count += 1 if ok else 0
            color = (0, 200, 0) if ok else (0, 0, 200)
            cv2.rectangle(vis, (x1, y1), (x2, y2), color, 1)
            label = f"{idx+1}:{(text or '').strip()[:18]} ({conf:.0f})"
            cv2.putText(vis, label, (x1, max(0, y1-5)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

            # Save individual ROI with annotation
            x1c, y1c = max(0, x1), max(0, y1)
            x2c, y2c = min(w, x2), min(h, y2)
            if x2c > x1c and y2c > y1c:
                roi = frame[y1c:y2c, x1c:x2c]
                save_debug_image(roi, f"draft_name_box_{idx+1}", f"{text or 'None'} (conf {conf:.1f})")

        save_debug_image(vis, "draft_name_boxes", f"Detected {detected_count}/{len(boxes)}")

        # Evaluate heuristic: count plausible names
        def plausible(s):
            if not s:
                return False
            # At least 2 chars and contains a letter
            if len(s) < 2:
                return False
            return bool(re.search(r"[A-Za-zА-Яа-я]", s))

        names = [t for (t, c) in extracted if plausible(t)]

        # Require minimum number of detected names
        min_required = max(3, len(boxes) // 2)  # at least half, but not less than 3
        is_draft = len(names) >= min_required

        logger.info(names)

        if is_draft:
            logger.info(f"Draft likely: detected {len(names)}/{len(boxes)} names")
        else:
            logger.debug(f"Draft unlikely: detected {len(names)}/{len(boxes)} names")

        return is_draft
    except Exception as e:
        logger.error(f"Error during draft detection: {e}")
        return False

def processDraft(frame, debug=False):
    """Process the draft screen frame and extract team captains.

    Uses the existing top-bar player name extraction to read captains:
    - Radiant captain at position 0
    - Dire captain at position 0

    Returns a dict with 'is_draft': True and 'captains'.
    """
    logger.info("Processing draft screen: extracting team captains")

    result = { 'is_draft': True, 'captains': {'Radiant': None, 'Dire': None} }

    try:
        success, top_bar, center_x = extract_hero_bar(frame, debug=debug)
        if not success or top_bar is None:
            logger.warning("Could not extract hero top bar on draft frame")
            return result

        # Optionally annotate areas for debugging
        if debug:
            annotated = annotate_player_name_areas(top_bar, center_x, debug=debug)
            save_debug_image(annotated, "draft_top_bar_player_areas", "Player name areas on draft screen")

        # Extract captains using existing OCR routine
        if TESSERACT_AVAILABLE:
            rad = extract_player_name(top_bar, center_x, 'Radiant', 0, debug=debug)
            dire = extract_player_name(top_bar, center_x, 'Dire', 0, debug=debug)
            result['captains']['Radiant'] = rad
            result['captains']['Dire'] = dire
        else:
            logger.warning("pytesseract not available; cannot OCR captain names on draft")

        # Also extract draft-phase lane names from the fixed name strip
        try:
            h, w = frame.shape[:2]
            boxes = _compute_draft_name_boxes(w, h)
            lane_names = []
            for idx, (x1, y1, x2, y2) in enumerate(boxes):
                x1c, y1c = max(0, x1), max(0, y1)
                x2c, y2c = min(w, x2), min(h, y2)
                if x2c <= x1c or y2c <= y1c:
                    lane_names.append(None)
                    continue
                roi = frame[y1c:y2c, x1c:x2c]
                name, conf = _ocr_text_from_region(roi, lang="eng+rus", debug_name=f"draftlane_box{idx+1}")
                # Keep None if not plausible
                if name and len(name) >= 2 and re.search(r"[A-Za-zА-Яа-я]", name):
                    lane_names.append(name)
                else:
                    lane_names.append(None)

            result['draft_lane_names'] = lane_names

            # Compose draft player order: [RadiantCaptain, DireCaptain, lane_names...]
            draft_order = [result['captains']['Radiant'], result['captains']['Dire']] + lane_names
            # Pad or trim to exactly 10 entries
            draft_order = (draft_order + [None] * 10)[:10]
            result['draft_player_order'] = draft_order
        except Exception as e:
            logger.debug(f"Error extracting draft lane names: {e}")

        return result
    except Exception as e:
        logger.error(f"Error processing draft frame: {e}")
        return result

def process_media(media_source, source_type="clip", debug=False, min_score=0.4, debug_templates=False, show_timings=False, num_frames=3, only_draft=False):
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
        logger.info("Debug mode enabled")
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

        frame = load_image(frame_paths[0])
        if frame is None:
            logger.error(f"Could not load frame: {frame_paths[0]}")
            return None

        # If explicitly handling draft-only endpoint, run draft detection here
        if only_draft:
            if isFrameDraft(frame):
                logger.info("Draft frame confirmed; extracting captains and draft lane names")
                draft_result = processDraft(frame, debug=debug)
                draft_result['source_type'] = source_type
                draft_result['source'] = media_source
                return draft_result
            else:
                logger.info("Not a draft frame according to detector")
                return { 'is_draft': False, 'source_type': source_type, 'source': media_source }

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

            # Extract team captains from the best frame
            captains = extract_team_captains_from_frame(best_frame_path, debug=debug)

            # Format the result as a dictionary
            result = {
                'heroes': heroes,
                'players': players,
                'captains': captains,
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

def process_clip_url(clip_url, debug=False, min_score=0.4, debug_templates=False, show_timings=False, only_draft=False):
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
                        debug_templates=debug_templates, show_timings=show_timings, only_draft=only_draft)

def process_stream_username(username, debug=False, min_score=0.4, debug_templates=False, show_timings=False, num_frames=3, only_draft=False):
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
                         debug_templates=debug_templates, show_timings=show_timings, num_frames=num_frames, only_draft=only_draft)

def annotate_rank_areas(top_bar, center_x, debug=False):
    """
    Create an annotated version of the top bar with 1px outlines around each rank banner area.

    Args:
        top_bar: The top bar image containing all heroes
        center_x: X-coordinate of the center of the frame
        debug: Whether to save debug images

    Returns:
        Annotated image with rank areas outlined
    """
    try:
        # Start with the existing hero bar from extract_hero_bar function
        visualization = top_bar.copy()
        height, width = visualization.shape[:2]

        # Calculate skew offset based on height
        skew_offset = int(np.tan(np.radians(SKEW_ANGLE_DEGREES)) * HERO_ACTUAL_HEIGHT)

        # Draw outlines for both teams
        for team in ["Radiant", "Dire"]:
            for position in range(5):
                # Calculate hero position
                if team == "Radiant":
                    # Radiant heroes are on the left side
                    x_start = center_x - CLOCK_LEFT_EXTEND - (5-position) * (HERO_WIDTH + HERO_GAP)
                else:  # Dire
                    # Dire heroes are on the right side
                    x_start = center_x + CLOCK_RIGHT_EXTEND + position * (HERO_WIDTH + HERO_GAP) - 10

                # Define the rank banner location (from crop_rank_banner function)
                ref_y_start = 50  # Start a bit higher to ensure we catch the banner
                ref_banner_height = 15  # Taller to ensure we include the entire banner
                ref_banner_width = HERO_WIDTH - 35  # Full hero width to start with
                ref_x_start = x_start + 25  # Start from left edge of hero portrait

                # Make sure we're within bounds
                if ref_x_start < 0:
                    ref_x_start = 0

                if ref_x_start + ref_banner_width > width:
                    ref_banner_width = width - ref_x_start

                if ref_y_start + ref_banner_height > height:
                    ref_banner_height = height - ref_y_start

                # Draw 1px outline around the rank banner area
                color = (0, 255, 0) if team == "Radiant" else (0, 0, 255)  # Green for Radiant, Red for Dire
                cv2.rectangle(visualization,
                             (ref_x_start, ref_y_start),
                             (ref_x_start + ref_banner_width, ref_y_start + ref_banner_height),
                             color, 1)  # 1px outline

                # Add text label
                cv2.putText(visualization, f"{team[0]}{position+1} Rank",
                           (ref_x_start, ref_y_start - 5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

        # Save the visualization
        if debug:
            save_debug_image(visualization, "top_bar_rank_areas_outlined", "Rank banner areas outlined with 1px border")

        return visualization
    except Exception as e:
        logger.error(f"Error creating rank area annotation: {e}")
        return top_bar

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
