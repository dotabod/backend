import cv2
import numpy as np
import pytesseract
import os
import re
import logging
from pathlib import Path
from PIL import Image
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
ASSETS_DIR = Path("assets")
ASSETS_DIR.mkdir(exist_ok=True)
REFERENCE_IMAGE_PATH = ASSETS_DIR / "reference.png"

# Create debug directory
DEBUG_DIR = Path("temp/debug")
DEBUG_DIR.mkdir(exist_ok=True, parents=True)

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

# Save the reference image from the first matching frame if needed
def save_reference_image(image_path):
    """Save a reference image for future template matching."""
    if not REFERENCE_IMAGE_PATH.exists():
        logger.info(f"Saving reference image to {REFERENCE_IMAGE_PATH}")
        import shutil
        shutil.copy(image_path, REFERENCE_IMAGE_PATH)
        logger.debug(f"Reference image saved successfully from {image_path}")

def detect_player_cards_dashboard(image_path, reference_path=None):
    """
    Detect if the image contains the player cards dashboard.

    Args:
        image_path: Path to the image to check
        reference_path: Path to the reference image (if None, uses default)

    Returns:
        dict: Contains match score and image if it's a dashboard
    """
    try:
        logger.debug(f"Detecting player cards dashboard in: {image_path}")

        # Load the current image
        current_image = cv2.imread(image_path)

        if current_image is None:
            logger.error(f"Failed to load image: {image_path}")
            return {"match_score": 0, "image": None}

        logger.debug(f"Image loaded successfully, dimensions: {current_image.shape}")

        # If we don't have a reference image yet, use a simple heuristic approach
        if not REFERENCE_IMAGE_PATH.exists():
            logger.debug("No reference image found, using heuristic approach")

            # Convert to grayscale for better processing
            gray = cv2.cvtColor(current_image, cv2.COLOR_BGR2GRAY)

            # Check for brightness patterns typical in the card layout
            brightness_score = np.mean(gray)
            std_dev = np.std(gray)
            logger.debug(f"Image brightness: {brightness_score:.2f}, std dev: {std_dev:.2f}")

            # Save the grayscale image for debugging
            save_debug_image(gray, "gray", f"brightness={brightness_score:.2f}, std={std_dev:.2f}")

            # Perform text detection to see if there are regions with text
            has_text_regions, debug_image = check_for_text_regions(current_image, return_debug_image=True)
            logger.debug(f"Text regions detected: {has_text_regions}")

            # Save the debug image showing text regions
            if debug_image is not None:
                save_debug_image(debug_image, "text_regions", f"has_text={has_text_regions}")

            # Combine heuristics
            match_score = 0.5 if has_text_regions else 0.1
            logger.debug(f"Heuristic match score: {match_score:.2f}")

            # Save this as our reference if it looks promising
            if match_score > 0.5:
                logger.debug("Match score is promising, saving as reference image")
                save_reference_image(image_path)
                # Also save a copy to debug folder
                save_debug_image(current_image, "reference_candidate", f"score={match_score:.2f}")

            return {
                "match_score": match_score,
                "image": current_image if match_score > 0.3 else None
            }

        # If we have a reference image, use template matching
        reference_path = reference_path or str(REFERENCE_IMAGE_PATH)
        logger.debug(f"Using reference image for template matching: {reference_path}")

        reference_image = cv2.imread(reference_path)

        if reference_image is None:
            logger.warning(f"Reference image not found at {reference_path}")
            return {"match_score": 0, "image": None}

        logger.debug(f"Reference image loaded, dimensions: {reference_image.shape}")

        # Resize images to comparable dimensions
        current_resized = cv2.resize(current_image, (800, 450))
        reference_resized = cv2.resize(reference_image, (800, 450))
        logger.debug("Images resized to 800x450 for comparison")

        # Save side-by-side comparison for debugging
        comparison = np.hstack((current_resized, reference_resized))
        save_debug_image(comparison, "comparison", "Current | Reference")

        # Convert to grayscale for better template matching
        current_gray = cv2.cvtColor(current_resized, cv2.COLOR_BGR2GRAY)
        reference_gray = cv2.cvtColor(reference_resized, cv2.COLOR_BGR2GRAY)

        # Perform template matching
        logger.debug("Performing template matching...")
        result = cv2.matchTemplate(current_gray, reference_gray, cv2.TM_CCOEFF_NORMED)
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)
        logger.debug(f"Template matching result - min: {min_val:.4f}, max: {max_val:.4f}")

        # max_val is our match score (0-1)
        match_score = max_val
        logger.debug(f"Final match score: {match_score:.4f}")

        # Visualize the match location
        if match_score > 0.3:
            # Draw rectangle showing best match
            match_vis = current_resized.copy()
            top_left = max_loc
            h, w = reference_gray.shape
            bottom_right = (top_left[0] + w, top_left[1] + h)
            cv2.rectangle(match_vis, top_left, bottom_right, (0, 255, 0), 2)
            save_debug_image(match_vis, "match_location", f"score={match_score:.4f}")

        return {
            "match_score": match_score,
            "image": current_image if match_score > 0.3 else None
        }
    except Exception as e:
        logger.error(f"Error detecting player cards dashboard: {e}")
        return {"match_score": 0, "image": None}

def check_for_text_regions(image, return_debug_image=False):
    """Basic check for text regions in the image."""
    try:
        logger.debug("Checking for text regions in image")

        debug_image = None
        if return_debug_image:
            debug_image = image.copy()

        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Apply some basic text detection logic
        _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY_INV)
        logger.debug("Applied threshold to image for text detection")

        # Save threshold image for debugging
        save_debug_image(thresh, "threshold")

        # Find contours that might be text
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        logger.debug(f"Found {len(contours)} contours in thresholded image")

        # Filter contours that are likely to be text
        text_like_contours = 0

        # If debug image requested, draw contours on it
        if return_debug_image:
            cv2.drawContours(debug_image, contours, -1, (0, 255, 0), 1)

        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if 10 < w < 100 and 5 < h < 30:  # Typical text dimensions
                text_like_contours += 1
                logger.debug(f"Text-like contour at ({x}, {y}), size: {w}x{h}")

                # Draw rectangle around text-like contours in debug image
                if return_debug_image:
                    cv2.rectangle(debug_image, (x, y), (x + w, y + h), (0, 0, 255), 2)

        # If we have several text-like regions, it might be the dashboard
        logger.debug(f"Found {text_like_contours} text-like contours")

        if return_debug_image:
            # Add text with contour count
            cv2.putText(debug_image, f"Text contours: {text_like_contours}", (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 2)
            return text_like_contours > 10, debug_image
        else:
            return text_like_contours > 10
    except Exception as e:
        logger.error(f"Error in check_for_text_regions: {e}")
        if return_debug_image:
            return False, None
        return False

def extract_player_card_regions(image):
    """
    Extract individual player card regions from the dashboard image.

    Args:
        image: The dashboard image

    Returns:
        list: List of image regions (one per player card)
    """
    try:
        logger.debug("Extracting player card regions from dashboard image")

        # Save the input image for debugging
        save_debug_image(image, "dashboard_input")

        # Get image dimensions
        height, width = image.shape[:2]
        logger.debug(f"Dashboard image dimensions: {width}x{height}")

        # Estimate card positions based on the example image
        # Cards appear to be arranged in a horizontal row
        card_width = width // 9  # Assuming about 9-10 cards
        card_height = height // 3
        logger.debug(f"Estimated card dimensions: {card_width}x{card_height}")

        # The row of cards is approximately in the middle of the image
        top_offset = height // 2 - card_height // 2
        logger.debug(f"Vertical offset for card row: {top_offset}")

        # Create a visualization of the card grid
        grid_vis = image.copy()
        for i in range(9):
            x_start = i * card_width
            y_start = top_offset
            cv2.rectangle(grid_vis, (x_start, y_start),
                         (x_start + card_width, y_start + card_height),
                         (0, 255, 0), 2)
            cv2.putText(grid_vis, f"{i+1}", (x_start + 10, y_start + 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        save_debug_image(grid_vis, "card_grid")

        # Extract card regions
        card_regions = []

        # Loop through expected card positions
        for i in range(9):  # Allow for slightly fewer cards to be safe
            x_start = i * card_width
            y_start = top_offset

            logger.debug(f"Extracting card {i+1} at position ({x_start}, {y_start})")

            # Extract the region
            card_region = image[y_start:y_start+card_height, x_start:x_start+card_width]

            # Verify we got a valid region
            if card_region.size == 0:
                logger.warning(f"Card region {i+1} has zero size")
                continue

            logger.debug(f"Card {i+1} extracted, dimensions: {card_region.shape}")

            # Save card image for debugging
            save_debug_image(card_region, f"card_{i+1}")

            # Add to our list
            card_regions.append(card_region)

        logger.debug(f"Extracted {len(card_regions)} card regions")
        return card_regions
    except Exception as e:
        logger.error(f"Error extracting player card regions: {e}")
        return []

def extract_player_name(card_region):
    """
    Extract the player name from a card region using OCR.

    Args:
        card_region: Image of the player card

    Returns:
        str: Player name
    """
    try:
        logger.debug("Extracting player name from card region")

        # Focus on the bottom part of the card (where names are typically shown)
        height, width = card_region.shape[:2]
        name_region = card_region[height//2:height, 0:width]
        logger.debug(f"Name region dimensions: {name_region.shape}")

        # Save the name region for debugging
        save_debug_image(name_region, "name_region")

        # Preprocess for better OCR
        # Convert to grayscale
        gray = cv2.cvtColor(name_region, cv2.COLOR_BGR2GRAY)

        # Increase contrast
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        logger.debug("Applied CLAHE for contrast enhancement")

        # Save enhanced image for debugging
        save_debug_image(enhanced, "name_enhanced")

        # Threshold to get black text on white background
        _, binary = cv2.threshold(enhanced, 150, 255, cv2.THRESH_BINARY)
        logger.debug("Applied threshold to isolate text")

        # Save binary image for debugging
        save_debug_image(binary, "name_binary")

        # Convert to PIL Image for Tesseract
        pil_image = Image.fromarray(binary)

        # Perform OCR
        logger.debug("Performing OCR with Tesseract")
        text = pytesseract.image_to_string(pil_image, config='--psm 7')

        # Clean the text
        cleaned_text = text.strip()
        logger.debug(f"OCR result: '{cleaned_text}'")

        # Create a visualization with the OCR result
        result_vis = name_region.copy()
        cv2.putText(result_vis, f"OCR: '{cleaned_text}'", (10, name_region.shape[0] - 10),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        save_debug_image(result_vis, "name_ocr_result")

        return cleaned_text
    except Exception as e:
        logger.error(f"Error extracting player name: {e}")
        return ""

def extract_player_rank(card_region):
    """
    Extract the player rank from a card region using OCR.

    Args:
        card_region: Image of the player card

    Returns:
        str: Player rank (formatted number) or None if not found
    """
    try:
        logger.debug("Extracting player rank from card region")

        # Focus on the top part of the card (where ranks are typically shown)
        height, width = card_region.shape[:2]
        rank_region = card_region[0:height//3, 0:width]
        logger.debug(f"Rank region dimensions: {rank_region.shape}")

        # Save the rank region for debugging
        save_debug_image(rank_region, "rank_region")

        # Preprocess for better OCR
        # Convert to grayscale
        gray = cv2.cvtColor(rank_region, cv2.COLOR_BGR2GRAY)

        # Increase contrast
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        logger.debug("Applied CLAHE for contrast enhancement")

        # Save enhanced image for debugging
        save_debug_image(enhanced, "rank_enhanced")

        # Threshold to get black text on white background
        _, binary = cv2.threshold(enhanced, 150, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
        logger.debug("Applied Otsu's thresholding to isolate text")

        # Save binary image for debugging
        save_debug_image(binary, "rank_binary")

        # Convert to PIL Image for Tesseract
        pil_image = Image.fromarray(binary)

        # Perform OCR with special config for numbers
        logger.debug("Performing OCR with Tesseract (optimized for numbers)")
        text = pytesseract.image_to_string(pil_image, config='--psm 7 -c tessedit_char_whitelist=0123456789,.')

        # Clean the text and extract number format (e.g., "4,127")
        cleaned_text = text.strip()
        logger.debug(f"OCR result: '{cleaned_text}'")

        rank_match = re.search(r'(\d{1,3}(,\d{3})+)', cleaned_text)

        # Create a visualization with the OCR result
        result_vis = rank_region.copy()
        result_text = f"OCR: '{cleaned_text}'"
        if rank_match:
            result_text += f" Match: {rank_match.group(1)}"
        cv2.putText(result_vis, result_text, (10, rank_region.shape[0] - 10),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        save_debug_image(result_vis, "rank_ocr_result")

        if rank_match:
            logger.debug(f"Matched rank format: {rank_match.group(1)}")
            return rank_match.group(1)
        else:
            logger.debug("No rank format matched in OCR result")
            return None
    except Exception as e:
        logger.error(f"Error extracting player rank: {e}")
        return None

def process_frame(image_path, timestamp, reference_path=None):
    """
    Process a single frame to extract player data.

    Args:
        image_path: Path to the frame image
        timestamp: Frame timestamp
        reference_path: Path to reference image (optional)

    Returns:
        dict: Processed frame data with match score and player info
    """
    try:
        logger.debug(f"Processing frame at {image_path}, timestamp: {timestamp}")

        # Detect if the frame contains the player cards dashboard
        detection_result = detect_player_cards_dashboard(image_path, reference_path)
        match_score = detection_result["match_score"]
        image = detection_result["image"]

        logger.debug(f"Dashboard detection result: match_score={match_score:.4f}")

        # If match score is low, this frame doesn't contain player cards
        if match_score < 0.3 or image is None:
            logger.debug(f"Match score {match_score:.4f} below threshold (0.3), skipping frame")
            return {"timestamp": timestamp, "match_score": match_score}

        # Extract player card regions
        logger.debug("Frame appears to contain player cards, extracting regions")
        card_regions = extract_player_card_regions(image)

        # Extract player data from each card region
        players = []
        logger.debug(f"Processing {len(card_regions)} player card regions")

        for i, card_region in enumerate(card_regions):
            logger.debug(f"Processing player card {i+1}")
            name = extract_player_name(card_region)
            rank = extract_player_rank(card_region)

            logger.debug(f"Player {i+1} - Name: '{name}', Rank: {rank}")

            if name:
                players.append({
                    "name": name,
                    "rank": rank,
                    "position": i + 1
                })
            else:
                logger.debug(f"Skipping player {i+1} - no name extracted")

        logger.debug(f"Frame processing complete, found {len(players)} players")
        return {
            "timestamp": timestamp,
            "match_score": match_score,
            "players": players
        }
    except Exception as e:
        logger.error(f"Error processing frame: {e}")
        return {"timestamp": timestamp, "match_score": 0}
