#!/usr/bin/env python3
"""
Dota 2 Player Name Detection

This module extracts player names from the Dota 2 game interface,
specifically from the text below each hero portrait in the top bar.

Player name layout in Dota 2:
- Player names start at 84px from the top of the hero section
- The text height is approximately 16px tall
- Text spans the width of the hero portrait (108px)
- Sometimes text can bleed into the gap between heroes
- Long names may be truncated with "..." at the end

This module builds on the hero detection capabilities from dota_hero_detection.py
to extract the player names associated with each hero.

Prerequisites:
- Tesseract OCR must be installed on your system:
  - For macOS: `brew install tesseract`
  - For Ubuntu/Debian: `apt-get install tesseract-ocr`
  - For Windows: Download installer from https://github.com/UB-Mannheim/tesseract/wiki
- Make sure Tesseract is in your PATH or set the TESSERACT_CMD environment variable:
  - Example: `export TESSERACT_CMD=/usr/local/bin/tesseract`

Usage:
1. Process a single frame:
   python dota_player_names.py frame.jpg --debug

2. Process a clip:
   python dota_player_names.py https://clips.twitch.tv/example

3. Combine with hero detection results:
   python dota_player_names.py frame.jpg --heroes-data heroes.json --debug

The module uses Tesseract OCR to recognize player names, with various
image preprocessing techniques to improve recognition accuracy.
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
import uuid
import time

# Check for pytesseract and provide helpful error if missing
try:
    import pytesseract
    # Check if tesseract path is set or set it from environment variable
    if not hasattr(pytesseract, 'tesseract_cmd') or not pytesseract.tesseract_cmd:
        tesseract_cmd = os.environ.get('TESSERACT_CMD')
        if tesseract_cmd:
            pytesseract.tesseract_cmd = tesseract_cmd
except ImportError:
    print("Error: pytesseract module is required for OCR")
    print("Please install it with: pip install pytesseract")
    print("\nAdditionally, make sure Tesseract OCR is installed on your system:")
    print("- For macOS: brew install tesseract")
    print("- For Ubuntu/Debian: apt-get install tesseract-ocr")
    print("- For Windows: Download installer from https://github.com/UB-Mannheim/tesseract/wiki")
    sys.exit(1)

# Import our modules
try:
    from dota_hero_detection import (
        load_image, save_debug_image, extract_hero_bar,
        performance_timer, HERO_WIDTH, HERO_GAP, HERO_TOP_PADDING,
        HERO_ACTUAL_HEIGHT, HERO_TOTAL_HEIGHT, CLOCK_LEFT_EXTEND,
        CLOCK_RIGHT_EXTEND, SKEW_ANGLE_DEGREES, DEBUG_DIR
    )
except ImportError:
    # For standalone usage
    print("Warning: dota_hero_detection module not found, standalone mode only")
    # Define constants directly if needed
    HERO_WIDTH = 108  # pixels
    HERO_GAP = 15  # pixels
    HERO_TOP_PADDING = 6  # pixels to crop from top (color indicator bar)
    HERO_ACTUAL_HEIGHT = 66  # actual visible hero portrait
    HERO_TOTAL_HEIGHT = 118  # Total height including player name and role
    SKEW_ANGLE_DEGREES = 9  # degrees
    CLOCK_LEFT_EXTEND = 134  # pixels
    CLOCK_RIGHT_EXTEND = 148  # pixels
    DEBUG_DIR = Path("temp/debug")
    # Create the debug directory if it doesn't exist
    DEBUG_DIR.mkdir(exist_ok=True, parents=True)

    # Define minimal performance_timer class to avoid errors
    class PerformanceTimer:
        def __init__(self):
            self.timings = {}

        def start(self, label):
            pass

        def stop(self, label):
            return 0

    performance_timer = PerformanceTimer()

    # Minimal implementations of required functions
    def save_debug_image(image, name_prefix, additional_info=""):
        if os.environ.get("DEBUG_IMAGES", "").lower() in ("1", "true", "yes"):
            os.makedirs(DEBUG_DIR, exist_ok=True)
            filename = f"{name_prefix}.jpg"
            filepath = DEBUG_DIR / filename
            cv2.imwrite(str(filepath), image)
            return str(filepath)
        return None

    def load_image(image_path):
        try:
            image = cv2.imread(str(image_path))
            return image
        except Exception as e:
            print(f"Error loading image {image_path}: {e}")
            return None

    def extract_hero_bar(frame, debug=False):
        """
        Basic implementation of hero bar extraction for standalone mode.
        This is a simplified version of the function in dota_hero_detection.py.

        Args:
            frame: The frame image
            debug: Whether to save debug images

        Returns:
            tuple: (success, top_bar, center_x)
        """
        try:
            # Get frame dimensions
            height, width = frame.shape[:2]

            # Find the center of the frame
            center_x = width // 2

            # The top bar usually starts at the top of the screen
            top_offset = 0

            # Height of the hero bar
            bar_height = HERO_TOTAL_HEIGHT

            # Extract top bar
            top_bar = frame[top_offset:top_offset+bar_height, 0:width]

            if debug:
                save_debug_image(top_bar, "top_bar_standalone")

                # Add visualizations
                vis = top_bar.copy()
                # Draw center line
                cv2.line(vis, (center_x, 0), (center_x, bar_height), (0, 255, 255), 2)

                # Draw radiant hero positions
                for i in range(5):
                    x = center_x - CLOCK_LEFT_EXTEND - (5-i) * (HERO_WIDTH + HERO_GAP)
                    cv2.rectangle(vis, (x, 0), (x + HERO_WIDTH, bar_height), (0, 255, 0), 2)
                    cv2.putText(vis, f"R{i+1}", (x + 5, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

                # Draw dire hero positions
                for i in range(5):
                    x = center_x + CLOCK_RIGHT_EXTEND + i * (HERO_WIDTH + HERO_GAP)
                    cv2.rectangle(vis, (x, 0), (x + HERO_WIDTH, bar_height), (0, 0, 255), 2)
                    cv2.putText(vis, f"D{i+1}", (x + 5, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

                save_debug_image(vis, "top_bar_annotations_standalone")

            return True, top_bar, center_x
        except Exception as e:
            print(f"Error extracting hero bar: {e}")
            return False, None, 0

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Define player name area dimensions
PLAYER_NAME_START_Y = 82  # Starting y-position from top of hero section
PLAYER_NAME_HEIGHT = 18  # Height of player name text area
PLAYER_NAME_PADDING = 5  # Additional padding around the name for OCR
# Allow player name to extend slightly into the gap
PLAYER_NAME_WIDTH_EXTENSION = HERO_GAP // 2

# OCR enhancement options that can be set via environment variables
OCR_CONFIG = {
    'ENHANCE_CONTRAST': os.environ.get("OCR_ENHANCE_CONTRAST", "1").lower() in ("1", "true", "yes"),
    'APPLY_BLUR': os.environ.get("OCR_APPLY_BLUR", "1").lower() in ("1", "true", "yes"),
    'DENOISE': os.environ.get("OCR_DENOISE", "1").lower() in ("1", "true", "yes"),
    'SCALE_FACTOR': int(os.environ.get("OCR_SCALE_FACTOR", "2")),  # Scale up image for better OCR
    'PSM': os.environ.get("OCR_PSM", "7"),  # Page segmentation mode
    'OEM': os.environ.get("OCR_OEM", "3"),  # OCR Engine mode
    'WHITELIST': os.environ.get("OCR_WHITELIST", "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-. ")
}

def preprocess_for_ocr(img, debug=False, name_prefix=None):
    """
    Advanced preprocessing for OCR to improve text recognition in game UI

    Args:
        img: Input image
        debug: Whether to save debug images
        name_prefix: Prefix for debug image names

    Returns:
        Preprocessed image optimized for OCR
    """
    try:
        # Check if image is valid
        if img is None or img.size == 0:
            logger.warning("Invalid image for OCR preprocessing")
            return None

        # Make a copy to avoid modifying the original
        img_copy = img.copy()

        # 1. Scale up the image for better OCR (usually helps with small text)
        if OCR_CONFIG['SCALE_FACTOR'] > 1:
            h, w = img_copy.shape[:2]
            factor = OCR_CONFIG['SCALE_FACTOR']
            img_copy = cv2.resize(img_copy, (w * factor, h * factor), interpolation=cv2.INTER_CUBIC)
            if debug and name_prefix:
                save_debug_image(img_copy, f"{name_prefix}_scaled")

        # 2. Convert to grayscale
        gray = cv2.cvtColor(img_copy, cv2.COLOR_BGR2GRAY)
        if debug and name_prefix:
            save_debug_image(gray, f"{name_prefix}_gray")

        # 3. Apply bilateral filter for edge-preserving noise reduction if denoise is enabled
        if OCR_CONFIG['DENOISE']:
            gray = cv2.bilateralFilter(gray, 5, 75, 75)
            if debug and name_prefix:
                save_debug_image(gray, f"{name_prefix}_denoised")

        # 4. Enhance contrast using CLAHE (Contrast Limited Adaptive Histogram Equalization)
        if OCR_CONFIG['ENHANCE_CONTRAST']:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            gray = clahe.apply(gray)
            if debug and name_prefix:
                save_debug_image(gray, f"{name_prefix}_contrast_enhanced")

        # 5. Apply adaptive thresholding
        thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 11, 2
        )
        if debug and name_prefix:
            save_debug_image(thresh, f"{name_prefix}_threshold")

        # 6. Apply slight blur if enabled
        if OCR_CONFIG['APPLY_BLUR']:
            thresh = cv2.GaussianBlur(thresh, (3, 3), 0)
            if debug and name_prefix:
                save_debug_image(thresh, f"{name_prefix}_blurred")

        # 7. Remove noise with morphological operations
        # First opening to remove small noise
        kernel = np.ones((2, 2), np.uint8)
        morph = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

        # Then dilate to enhance text
        kernel = np.ones((2, 1), np.uint8)  # Use horizontal kernel to connect characters
        morph = cv2.dilate(morph, kernel, iterations=1)

        if debug and name_prefix:
            save_debug_image(morph, f"{name_prefix}_morphology")

        return morph

    except Exception as e:
        logger.error(f"Error in OCR preprocessing: {e}")
        return img  # Return original if preprocessing fails

def get_player_name_with_ocr(name_crop, debug=False, name_prefix=None):
    """
    Extract player name from cropped image using advanced OCR techniques

    Args:
        name_crop: Cropped image containing player name
        debug: Whether to save debug images
        name_prefix: Prefix for debug image names

    Returns:
        Extracted player name as string
    """
    try:
        if name_crop is None or name_crop.size == 0:
            logger.warning("Invalid image crop for OCR")
            return ""

        # Preprocess the image
        preprocessed = preprocess_for_ocr(name_crop, debug=debug, name_prefix=name_prefix)

        if preprocessed is None:
            return ""

        # Configure tesseract
        custom_config = f'--psm {OCR_CONFIG["PSM"]} --oem {OCR_CONFIG["OEM"]}'

        # Add whitelist if specified
        if OCR_CONFIG['WHITELIST']:
            custom_config += f' -c tessedit_char_whitelist="{OCR_CONFIG["WHITELIST"]}"'

        # Perform OCR
        player_name = pytesseract.image_to_string(
            preprocessed, config=custom_config
        ).strip()

        # Clean up the text - remove non-alphanumeric characters except common symbols
        player_name = ''.join(c for c in player_name if c.isalnum() or c in ' .-_[]{}()!@#$%^&*+=')
        player_name = player_name.strip()

        # Remove any suspected truncation artifacts
        if player_name.endswith('...'):
            player_name = player_name[:-3].strip()
        elif player_name.endswith('..'):
            player_name = player_name[:-2].strip()
        elif player_name.endswith('.'):
            # Keep the period if it's not part of an ellipsis (could be name abbreviation)
            if len(player_name) > 1 and player_name[-2] == '.':
                player_name = player_name[:-1].strip()

        return player_name

    except Exception as e:
        logger.error(f"OCR error: {e}")
        return ""

def extract_player_names(frame_path, identified_heroes=None, debug=False):
    """
    Extract player names from a frame containing the Dota 2 hero bar.

    Args:
        frame_path: Path to the frame image
        identified_heroes: Optional list of already identified heroes with team and position
        debug: Whether to save debug images

    Returns:
        list: List of dictionaries containing hero and player name information
    """
    try:
        # Load the frame
        frame = load_image(frame_path)
        if frame is None:
            logger.error(f"Could not load frame: {frame_path}")
            return []

        # Extract the hero bar
        success, top_bar, center_x = extract_hero_bar(frame, debug=debug)
        if not success or top_bar is None:
            logger.warning(f"Could not extract hero bar from frame: {frame_path}")
            return []

        # Get dimensions
        height, width = top_bar.shape[:2]

        # Create a visualization image if debug is enabled
        if debug:
            visualization = top_bar.copy()
            cv2.line(visualization, (center_x, 0), (center_x, height), (0, 255, 255), 2)

        # Calculate skew offset based on height
        skew_offset = int(np.tan(np.radians(SKEW_ANGLE_DEGREES)) * HERO_ACTUAL_HEIGHT)

        # Initialize results
        player_names = []

        # Extract Radiant player names (left side, positions 0-4)
        for i in range(5):
            # Calculate position based on center and hero width with asymmetric clock
            x_start = center_x - CLOCK_LEFT_EXTEND - (5-i) * (HERO_WIDTH + HERO_GAP)

            # For player name, we need to account for skew at the player name position
            # Player names are located below the hero portrait
            player_name_y_start = PLAYER_NAME_START_Y

            # Calculate skew at the player name position
            # The skew increases linearly with distance from the top
            player_skew_offset = int(np.tan(np.radians(SKEW_ANGLE_DEGREES)) * player_name_y_start)

            # Define player name area with skew compensation
            # For Radiant (positive skew), the rectangle moves right as we go down
            player_name_x_start = x_start + player_skew_offset - PLAYER_NAME_PADDING
            player_name_width = HERO_WIDTH + PLAYER_NAME_WIDTH_EXTENSION + (2 * PLAYER_NAME_PADDING)

            # Create a mask for the player name area
            mask = np.zeros((height, width), dtype=np.uint8)

            # Define points for player name area (rectangular, not accounting for skew in the mask)
            # We'll handle skew by adjusting the starting position
            points = np.array([
                [player_name_x_start, player_name_y_start],  # Top-left
                [player_name_x_start + player_name_width, player_name_y_start],  # Top-right
                [player_name_x_start + player_name_width, player_name_y_start + PLAYER_NAME_HEIGHT],  # Bottom-right
                [player_name_x_start, player_name_y_start + PLAYER_NAME_HEIGHT]  # Bottom-left
            ], dtype=np.int32)

            # Fill the polygon
            cv2.fillPoly(mask, [points], 255)

            # Apply mask to the top bar
            temp_image = top_bar.copy()
            masked_name = cv2.bitwise_and(temp_image, temp_image, mask=mask)

            # Crop to the player name area
            name_crop = masked_name[
                player_name_y_start:player_name_y_start + PLAYER_NAME_HEIGHT,
                player_name_x_start:player_name_x_start + player_name_width
            ]

            # Check if we have a valid crop
            if name_crop.size == 0:
                logger.warning(f"Invalid crop for Radiant player {i+1} name")
                player_name = ""
            else:
                # Use enhanced OCR function
                player_name = get_player_name_with_ocr(
                    name_crop,
                    debug=debug,
                    name_prefix=f"radiant_player_{i+1}_name"
                )

            # Save for debugging
            if debug:
                # Draw rectangle on visualization
                cv2.rectangle(
                    visualization,
                    (player_name_x_start, player_name_y_start),
                    (player_name_x_start + player_name_width, player_name_y_start + PLAYER_NAME_HEIGHT),
                    (0, 255, 0), 2
                )

                # Add text with detected name
                cv2.putText(
                    visualization,
                    f"R{i+1}: '{player_name}'",
                    (player_name_x_start, player_name_y_start - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1
                )

                # Save the cropped image
                save_debug_image(name_crop, f"radiant_player_{i+1}_name_crop")

            # Create a result entry
            result = {
                "team": "Radiant",
                "position": i,
                "player_name": player_name
            }

            # Add hero information if available
            if identified_heroes:
                for hero in identified_heroes:
                    if hero['team'] == "Radiant" and hero['position'] == i:
                        result["hero_id"] = hero.get('hero_id')
                        result["hero_name"] = hero.get('hero_name')
                        result["hero_localized_name"] = hero.get('hero_localized_name')
                        break

            player_names.append(result)

        # Extract Dire player names (right side, positions 0-4)
        for i in range(5):
            # Calculate position based on center and hero width with asymmetric clock
            x_start = center_x + CLOCK_RIGHT_EXTEND + i * (HERO_WIDTH + HERO_GAP)

            # For player name, we need to account for negative skew at the player name position
            player_name_y_start = PLAYER_NAME_START_Y

            # Calculate skew at the player name position (negative for Dire)
            player_skew_offset = int(np.tan(np.radians(SKEW_ANGLE_DEGREES)) * player_name_y_start)

            # Define player name area with skew compensation
            # For Dire (negative skew), the rectangle moves left as we go down
            player_name_x_start = x_start - player_skew_offset - PLAYER_NAME_PADDING
            player_name_width = HERO_WIDTH + PLAYER_NAME_WIDTH_EXTENSION + (2 * PLAYER_NAME_PADDING)

            # Create a mask for the player name area
            mask = np.zeros((height, width), dtype=np.uint8)

            # Define points for player name area
            points = np.array([
                [player_name_x_start, player_name_y_start],  # Top-left
                [player_name_x_start + player_name_width, player_name_y_start],  # Top-right
                [player_name_x_start + player_name_width, player_name_y_start + PLAYER_NAME_HEIGHT],  # Bottom-right
                [player_name_x_start, player_name_y_start + PLAYER_NAME_HEIGHT]  # Bottom-left
            ], dtype=np.int32)

            # Fill the polygon
            cv2.fillPoly(mask, [points], 255)

            # Apply mask to the top bar
            temp_image = top_bar.copy()
            masked_name = cv2.bitwise_and(temp_image, temp_image, mask=mask)

            # Crop to the player name area
            name_crop = masked_name[
                player_name_y_start:player_name_y_start + PLAYER_NAME_HEIGHT,
                player_name_x_start:player_name_x_start + player_name_width
            ]

            # Check if we have a valid crop
            if name_crop.size == 0:
                logger.warning(f"Invalid crop for Dire player {i+1} name")
                player_name = ""
            else:
                # Use enhanced OCR function
                player_name = get_player_name_with_ocr(
                    name_crop,
                    debug=debug,
                    name_prefix=f"dire_player_{i+1}_name"
                )

            # Save for debugging
            if debug:
                # Draw rectangle on visualization
                cv2.rectangle(
                    visualization,
                    (player_name_x_start, player_name_y_start),
                    (player_name_x_start + player_name_width, player_name_y_start + PLAYER_NAME_HEIGHT),
                    (0, 0, 255), 2
                )

                # Add text with detected name
                cv2.putText(
                    visualization,
                    f"D{i+1}: '{player_name}'",
                    (player_name_x_start, player_name_y_start - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1
                )

                # Save the cropped image
                save_debug_image(name_crop, f"dire_player_{i+1}_name_crop")

            # Create a result entry
            result = {
                "team": "Dire",
                "position": i,
                "player_name": player_name
            }

            # Add hero information if available
            if identified_heroes:
                for hero in identified_heroes:
                    if hero['team'] == "Dire" and hero['position'] == i:
                        result["hero_id"] = hero.get('hero_id')
                        result["hero_name"] = hero.get('hero_name')
                        result["hero_localized_name"] = hero.get('hero_localized_name')
                        break

            player_names.append(result)

        # Save the visualization
        if debug:
            save_debug_image(visualization, "player_names_detection")

        # Return the player names
        return player_names

    except Exception as e:
        logger.error(f"Error extracting player names: {e}")
        return []

def process_frame_for_player_names(frame_path, heroes_data=None, debug=False):
    """
    Process a single frame to extract player names.

    Args:
        frame_path: Path to the frame image
        heroes_data: Optional already identified heroes data
        debug: Whether to save debug images

    Returns:
        list: Combined data with heroes and player names
    """
    try:
        # Extract player names
        player_names = extract_player_names(frame_path, heroes_data, debug=debug)

        if not player_names:
            logger.warning(f"No player names extracted from frame: {frame_path}")
            return []

        # If heroes data was provided, enrich the player names data
        if heroes_data:
            # Create a combined dataset with hero and player information
            combined_data = []

            for player in player_names:
                team = player["team"]
                position = player["position"]

                # Find the corresponding hero data
                hero_data = next((hero for hero in heroes_data
                                  if hero["team"] == team and hero["position"] == position), None)

                if hero_data:
                    # Create a combined entry
                    entry = {
                        "team": team,
                        "position": position,
                        "player_name": player["player_name"],
                        "hero_id": hero_data.get("hero_id"),
                        "hero_name": hero_data.get("hero_name"),
                        "hero_localized_name": hero_data.get("hero_localized_name"),
                        "match_score": hero_data.get("match_score"),
                        "variant": hero_data.get("variant")
                    }
                    combined_data.append(entry)
                else:
                    # Just add the player data without hero information
                    combined_data.append(player)

            return combined_data
        else:
            # Return just the player names data
            return player_names

    except Exception as e:
        logger.error(f"Error processing frame for player names: {e}")
        return []

def process_multiple_frames_for_player_names(frame_paths, heroes_data=None, debug=False):
    """
    Process multiple frames to get more robust player name recognition.

    This function extracts player names from multiple frames and combines the results
    to get the most likely name for each player position.

    Args:
        frame_paths: List of paths to frame images
        heroes_data: Optional already identified heroes data
        debug: Whether to save debug images

    Returns:
        list: Combined player names data with highest confidence for each position
    """
    logger.info(f"Processing {len(frame_paths)} frames for player names")

    # Dictionary to store all extracted names by team and position
    all_names = {}

    # Process each frame
    for i, frame_path in enumerate(tqdm(frame_paths, desc="Processing frames for player names")):
        # Only enable debug for a few frames to avoid too many debug images
        frame_debug = debug and i < 3

        # Extract player names from this frame
        frame_results = extract_player_names(frame_path, heroes_data, debug=frame_debug)

        # Store results by team and position
        for player in frame_results:
            team = player['team']
            position = player['position']
            name = player['player_name']

            if not name:  # Skip empty names
                continue

            # Create key for this team and position
            key = f"{team}_{position}"
            if key not in all_names:
                all_names[key] = {}

            # Count occurrences of this name
            if name in all_names[key]:
                all_names[key][name] += 1
            else:
                all_names[key][name] = 1

    # Choose the most common name for each position
    final_results = []

    # Get all team and position combinations from the heroes data if available
    positions_to_check = []
    if heroes_data:
        for hero in heroes_data:
            team = hero['team']
            position = hero['position']
            positions_to_check.append((team, position))
    else:
        # Default to all 10 positions if no heroes data
        for team in ["Radiant", "Dire"]:
            for position in range(5):
                positions_to_check.append((team, position))

    # Build final results
    for team, position in positions_to_check:
        key = f"{team}_{position}"

        result = {
            "team": team,
            "position": position,
            "player_name": ""
        }

        # Find the most common name for this position
        if key in all_names and all_names[key]:
            # Sort by count descending
            sorted_names = sorted(all_names[key].items(), key=lambda x: x[1], reverse=True)
            most_common_name = sorted_names[0][0]
            count = sorted_names[0][1]
            total = sum(all_names[key].values())
            confidence = count / total if total > 0 else 0

            # Only use name if it appears in at least 25% of frames
            if confidence >= 0.25:
                result["player_name"] = most_common_name
                result["name_confidence"] = confidence

                # Log all candidates for this position in debug mode
                if debug:
                    logger.debug(f"{team} position {position+1} name candidates:")
                    for name, count in sorted_names:
                        logger.debug(f"  '{name}': {count}/{total} frames ({count/total:.2f})")

        # Add hero information if available
        if heroes_data:
            for hero in heroes_data:
                if hero['team'] == team and hero['position'] == position:
                    result["hero_id"] = hero.get('hero_id')
                    result["hero_name"] = hero.get('hero_name')
                    result["hero_localized_name"] = hero.get('hero_localized_name')
                    result["match_score"] = hero.get('match_score')
                    result["variant"] = hero.get('variant')
                    break

        final_results.append(result)

    # Sort by team and position
    final_results.sort(key=lambda x: (x["team"] == "Dire", x["position"]))

    return final_results

def combine_hero_and_player_data(heroes_data, player_names_data):
    """
    Combine hero detection results with player name data.

    Args:
        heroes_data: List of hero data dictionaries
        player_names_data: List of player name data dictionaries

    Returns:
        dict: Combined data with heroes and player names
    """
    # Create a combined dictionary
    combined_data = {
        "heroes_with_players": []
    }

    # Get all positions
    positions = []
    for hero in heroes_data:
        team = hero['team']
        position = hero['position']
        positions.append((team, position))

    # Create a map of player names by position
    player_names_map = {}
    for player in player_names_data:
        team = player['team']
        position = player['position']
        key = f"{team}_{position}"
        player_names_map[key] = player

    # Combine data for each position
    for team, position in positions:
        key = f"{team}_{position}"

        # Find the hero data
        hero_data = next((hero for hero in heroes_data
                         if hero['team'] == team and hero['position'] == position), None)

        if not hero_data:
            continue

        # Create combined entry starting with hero data
        combined_entry = dict(hero_data)

        # Add player name if available
        if key in player_names_map:
            player_data = player_names_map[key]
            combined_entry['player_name'] = player_data.get('player_name', '')

            # Add confidence if available
            if 'name_confidence' in player_data:
                combined_entry['player_name_confidence'] = player_data['name_confidence']
        else:
            combined_entry['player_name'] = ''

        combined_data['heroes_with_players'].append(combined_entry)

    # Sort by team and position
    combined_data['heroes_with_players'].sort(key=lambda x: (x['team'] == 'Dire', x['position']))

    return combined_data

# Update main function to support clip URLs
def main():
    """Main function."""
    parser = argparse.ArgumentParser(description="Extract player names from Dota 2 hero bar")
    parser.add_argument("input", nargs="?",
                       help="Path to a frame image or a Twitch clip URL")
    parser.add_argument("--frame-path", help="Path to a single frame to process")
    parser.add_argument("--clip-url", help="URL of a Twitch clip to process")
    parser.add_argument("--heroes-data", "-hd", help="Path to heroes data JSON file")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    parser.add_argument("--output", "-o", default="player_names.json",
                      help="Output file path (default: player_names.json)")
    parser.add_argument("--enhance-contrast", action="store_true",
                      help="Enhance contrast for OCR (default: on)")
    parser.add_argument("--no-enhance-contrast", action="store_true",
                      help="Disable contrast enhancement for OCR")
    parser.add_argument("--no-blur", action="store_true",
                      help="Disable blur preprocessing for OCR")
    parser.add_argument("--no-denoise", action="store_true",
                      help="Disable denoising for OCR")
    parser.add_argument("--scale-factor", type=int, default=2,
                      help="Scale factor for OCR (default: 2)")
    parser.add_argument("--psm", type=str, default="7",
                      help="Page segmentation mode for Tesseract (default: 7)")
    parser.add_argument("--whitelist", type=str,
                      help="Character whitelist for OCR")
    parser.add_argument("--max-frames", type=int, default=10,
                      help="Maximum number of frames to process for clip (default: 10)")
    parser.add_argument("--combine", action="store_true",
                      help="Combine player names with hero data when using --heroes-data")

    args = parser.parse_args()

    # Handle input argument
    if args.input:
        if args.input.startswith("http") and ("twitch.tv" in args.input or "clips.twitch.tv" in args.input):
            args.clip_url = args.input
        else:
            args.frame_path = args.input

    # Set debug level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        os.environ["DEBUG_IMAGES"] = "1"

    # Set OCR options based on args
    if args.no_enhance_contrast:
        os.environ["OCR_ENHANCE_CONTRAST"] = "0"
    elif args.enhance_contrast:
        os.environ["OCR_ENHANCE_CONTRAST"] = "1"

    if args.no_blur:
        os.environ["OCR_APPLY_BLUR"] = "0"

    if args.no_denoise:
        os.environ["OCR_DENOISE"] = "0"

    if args.scale_factor:
        os.environ["OCR_SCALE_FACTOR"] = str(args.scale_factor)

    if args.psm:
        os.environ["OCR_PSM"] = args.psm

    if args.whitelist:
        os.environ["OCR_WHITELIST"] = args.whitelist

    # Print OCR configuration when in debug mode
    if args.debug:
        logger.info("OCR Configuration:")
        for key, value in OCR_CONFIG.items():
            logger.info(f"  {key}: {value}")

    try:
        # Load heroes data if provided
        heroes_data = None
        if args.heroes_data:
            try:
                with open(args.heroes_data, 'r') as f:
                    heroes_json = json.load(f)
                    heroes_data = heroes_json.get('heroes', [])
                logger.info(f"Loaded heroes data from {args.heroes_data}")
            except Exception as e:
                logger.error(f"Error loading heroes data: {e}")

        # Process based on input type
        if args.clip_url:
            # Check if clip_utils is available
            try:
                from clip_utils import get_clip_details, download_clip, extract_frames

                # Process the clip
                logger.info(f"Processing clip: {args.clip_url}")

                # Get clip details
                clip_details = get_clip_details(args.clip_url)
                logger.info("Clip details retrieved")

                # Download the clip
                clip_path = download_clip(clip_details)
                logger.info(f"Clip downloaded to: {clip_path}")

                # Extract frames
                frame_paths = extract_frames(clip_path, frame_interval=5)
                logger.info(f"Extracted {len(frame_paths)} frames")

                # Limit number of frames if specified
                if args.max_frames > 0 and len(frame_paths) > args.max_frames:
                    # Choose frames evenly distributed across the clip
                    step = len(frame_paths) // args.max_frames
                    selected_frames = frame_paths[::step][:args.max_frames]
                    logger.info(f"Using {len(selected_frames)} of {len(frame_paths)} frames")
                    frame_paths = selected_frames

                # Process frames for player names
                results = process_multiple_frames_for_player_names(
                    frame_paths, heroes_data, debug=args.debug
                )

            except ImportError:
                logger.error("clip_utils module not available")
                print("Error: clip_utils module not available")
                return 1

        elif args.frame_path:
            # Process a single frame
            logger.info(f"Processing frame: {args.frame_path}")
            results = process_frame_for_player_names(args.frame_path, heroes_data, debug=args.debug)
        else:
            logger.error("No input specified. Please provide a frame path or clip URL.")
            parser.print_help()
            return 1

        if results:
            # Combine with heroes data if requested
            if args.combine and heroes_data:
                logger.info("Combining player names with hero data")
                combined_data = combine_hero_and_player_data(heroes_data, results)

                # Save combined results
                with open(args.output, 'w') as f:
                    json.dump(combined_data, f, indent=2)

                logger.info(f"Saved combined data with {len(combined_data['heroes_with_players'])} heroes/players to {args.output}")

                # Print combined results
                print(f"\nCombined hero and player data for {len(combined_data['heroes_with_players'])} positions:")
                for entry in combined_data['heroes_with_players']:
                    team = entry['team']
                    pos = entry['position'] + 1
                    hero = entry.get('hero_localized_name', 'Unknown')
                    player = entry.get('player_name', '')

                    confidence_str = ""
                    if 'player_name_confidence' in entry:
                        confidence = entry['player_name_confidence']
                        confidence_str = f" (confidence: {confidence:.2f})"

                    print(f"{team} #{pos}: {player}{confidence_str} - {hero}")
            else:
                # Save player names only
                with open(args.output, 'w') as f:
                    json.dump({"player_names": results}, f, indent=2)

                logger.info(f"Saved {len(results)} player names to {args.output}")

                # Print results
                print(f"\nExtracted {len(results)} player names:")
                for player in results:
                    team = player['team']
                    pos = player['position'] + 1
                    name = player['player_name']

                    # Show confidence if available
                    confidence_str = ""
                    if 'name_confidence' in player:
                        confidence = player['name_confidence']
                        confidence_str = f" (confidence: {confidence:.2f})"

                    hero_info = ""
                    if 'hero_localized_name' in player and player['hero_localized_name']:
                        hero_info = f" - {player['hero_localized_name']}"

                    print(f"{team} #{pos}: {name}{confidence_str}{hero_info}")

            # Print information about debug images if enabled
            if args.debug:
                print(f"\nDebug images saved to: {DEBUG_DIR}")

            return 0
        else:
            logger.warning("No player names extracted")
            print("No player names extracted.")
            return 1

    except Exception as e:
        logger.error(f"Error in main function: {e}", exc_info=True)
        print(f"Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
