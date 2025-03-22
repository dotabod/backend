import cv2
import numpy as np
import logging
import os
from pathlib import Path
from tqdm import tqdm
import json

# Import our modules
from dota_heroes import get_hero_data

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
DEBUG_DIR = Path("temp/debug")
DEBUG_DIR.mkdir(exist_ok=True, parents=True)

def save_debug_image(image, name, additional_info=""):
    """Save a debug image for inspection during development."""
    if os.environ.get("DEBUG_IMAGES", "").lower() in ("1", "true", "yes"):
        # Create a copy to avoid modifying the original
        image_copy = image.copy()

        # Add text annotation if provided
        if additional_info:
            cv2.putText(image_copy, additional_info, (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

        # Save the image
        debug_path = DEBUG_DIR / f"{name}.jpg"
        cv2.imwrite(str(debug_path), image_copy)
        logger.debug(f"Saved debug image: {debug_path}")
        return str(debug_path)
    return None

def detect_topbar_region(frame):
    """
    Detect the region in the frame that contains the hero portraits in the top bar.
    Uses a fixed height approach since the top bar is always at the top of the screen.
    Also crops from left and right sides to focus on the hero portraits area.
    Crop values can be configured via environment variables.
    Returns the region as (x, y, w, h) or None if not found.
    """
    # Get frame dimensions
    frame_height, frame_width = frame.shape[:2]

    # Use a fixed topbar height of approximately 130px, but scale it based on frame height
    topbar_height = min(130, int(frame_height * 0.12))  # Use 12% of screen height but max 130px

    # Get crop values from environment variables or use defaults
    try:
        default_left_crop = 205
        default_right_crop = 205

        left_crop_env = os.environ.get("DOTA_LEFT_CROP")
        right_crop_env = os.environ.get("DOTA_RIGHT_CROP")

        # Parse environment variables if they exist
        left_crop = int(left_crop_env) if left_crop_env is not None else default_left_crop
        right_crop = int(right_crop_env) if right_crop_env is not None else default_right_crop

        # Log the source of the crop values
        if left_crop_env is not None or right_crop_env is not None:
            logger.info(f"Using crop values from environment: left={left_crop}px, right={right_crop}px")
        else:
            logger.info(f"Using default crop values: left={left_crop}px, right={right_crop}px")
    except (ValueError, TypeError) as e:
        # If there's an error parsing, use defaults
        logger.warning(f"Error parsing crop values from environment: {e}, using defaults")
        left_crop = default_left_crop
        right_crop = default_right_crop

    # Calculate the left and right crop values, ensuring we don't crop too much
    # for smaller frames
    left_crop = min(left_crop, int(frame_width * 0.15))   # Use min of configured value or 15% of width
    right_crop = min(right_crop, int(frame_width * 0.15)) # Use min of configured value or 15% of width

    # Make sure we don't crop too much
    if left_crop + right_crop >= frame_width - 400:  # Ensure at least 400px width remains
        # Scale down the crop values proportionally
        scale_factor = (frame_width - 400) / (left_crop + right_crop)
        left_crop = int(left_crop * scale_factor)
        right_crop = int(right_crop * scale_factor)
        logger.info(f"Reduced crop values to {left_crop}px left, {right_crop}px right to maintain minimum width")

    # Extract just the top-center region of the frame
    x = left_crop
    y = 0
    w = frame_width - left_crop - right_crop
    h = topbar_height

    topbar_region = (x, y, w, h)

    # Create debug images to show what we're detecting
    topbar_img = frame[y:y+h, x:x+w].copy()
    save_debug_image(topbar_img, "topbar_fixed", f"Cropped topbar region: {left_crop}px left, {right_crop}px right, {topbar_height}px tall")

    # Draw rectangle on full frame to show the detected region
    frame_with_rect = frame.copy()
    cv2.rectangle(frame_with_rect, (x, y), (x+w, y+h), (0, 255, 0), 2)
    save_debug_image(frame_with_rect, "topbar_fixed_region", f"Topbar region: {topbar_region}")

    logger.info(f"Using fixed topbar region: {topbar_region}")
    return topbar_region

def extract_hero_portraits(frame, topbar_region):
    """
    Extract individual hero portraits from the topbar region.
    Returns a list of (team, portrait_image, position) tuples.
    Team is 0 for Radiant (left) and 1 for Dire (right).
    Position is the order of the hero in the team (0-4).

    The cropped topbar specifically contains just the hero portraits,
    so we can use more precise fixed-grid positions.
    """
    x, y, w, h = topbar_region
    topbar = frame[y:y+h, x:x+w]

    # Save the extracted topbar
    save_debug_image(topbar, "topbar_extracted", "Extracted topbar")

    # Check if the topbar has enough content (not just black)
    gray_topbar = cv2.cvtColor(topbar, cv2.COLOR_BGR2GRAY)
    mean_brightness = cv2.mean(gray_topbar)[0]

    if mean_brightness < 20:  # Very dark, probably no UI visible
        logger.warning(f"Topbar too dark (brightness: {mean_brightness:.1f}), likely no UI visible")
        save_debug_image(gray_topbar, "topbar_too_dark", f"Brightness: {mean_brightness:.1f}")
        return []

    # With the cropped topbar, the hero positions should be more predictable
    # The topbar should now contain exactly the 10 hero portraits

    # Try both contour-based detection and fixed grid extraction
    # First, attempt contour-based approach for more accurate results
    portraits_contour = extract_portraits_using_contours(topbar)

    # If we got at least 8 portraits with contours, use those
    if len(portraits_contour) >= 8:
        return portraits_contour

    # Otherwise, fall back to the fixed grid approach which is more reliable
    # but less accurate for different UI variations
    return extract_portraits_using_fixed_grid(topbar)

def extract_portraits_using_contours(topbar):
    """Extract hero portraits using contour detection."""
    h, w = topbar.shape[:2]
    portraits = []

    # Apply adaptive threshold to help identify hero portraits
    gray_topbar = cv2.cvtColor(topbar, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(gray_topbar, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY, 11, 2)
    save_debug_image(binary, "topbar_adaptive_threshold", "Adaptive threshold applied")

    # Try to dynamically detect the portrait areas by looking for bright regions
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Filter contours to find potential portraits
    portrait_contours = []
    min_area = h * h * 0.04  # Minimum area as a percentage of height squared
    max_area = h * h * 0.9   # Maximum area as a percentage of height squared

    for contour in contours:
        area = cv2.contourArea(contour)
        if min_area < area < max_area:
            x_c, y_c, w_c, h_c = cv2.boundingRect(contour)
            # Check if it's reasonably square (hero portraits are roughly square)
            aspect_ratio = w_c / h_c if h_c > 0 else 0
            if 0.5 < aspect_ratio < 2.0:
                portrait_contours.append((x_c, y_c, w_c, h_c))

    # Draw the contours that meet our criteria
    contour_img = topbar.copy()
    for x_c, y_c, w_c, h_c in portrait_contours:
        cv2.rectangle(contour_img, (x_c, y_c), (x_c+w_c, y_c+h_c), (0, 255, 0), 2)
    save_debug_image(contour_img, "portrait_candidates", f"Found {len(portrait_contours)} candidates")

    # If we found some potential portrait regions with contours, use them
    if len(portrait_contours) >= 5:
        logger.info(f"Using {len(portrait_contours)} detected portrait regions")

        # Sort contours by x-position
        portrait_contours.sort(key=lambda rect: rect[0])

        # Assign team and position based on x-position
        # With the cropped topbar, we expect the first 5 to be Radiant and the last 5 to be Dire
        # We'll divide the contours into two groups based on their x-position
        if len(portrait_contours) <= 10:
            # If we have 10 or fewer contours, assume they are all portraits
            # and divide them evenly between Radiant and Dire
            radiant_contours = portrait_contours[:len(portrait_contours)//2]
            dire_contours = portrait_contours[len(portrait_contours)//2:]
        else:
            # Otherwise, cluster them by x-position to identify the two teams
            # For now, just use the midpoint of the topbar
            middle_x = w // 2
            radiant_contours = [c for c in portrait_contours if c[0] + c[2]//2 < middle_x]
            dire_contours = [c for c in portrait_contours if c[0] + c[2]//2 >= middle_x]

            # Sort each team's contours by x-position
            radiant_contours.sort(key=lambda rect: rect[0])
            dire_contours.sort(key=lambda rect: rect[0])

            # Take at most 5 portraits per team
            radiant_contours = radiant_contours[:5]
            dire_contours = dire_contours[:5]

        # Process Radiant (left team) portraits
        for i, (x_c, y_c, w_c, h_c) in enumerate(radiant_contours):
            # Ensure we don't exceed the maximum position
            position = min(i, 4)

            # Extract the portrait
            portrait = topbar[y_c:y_c+h_c, x_c:x_c+w_c]

            # Validate the portrait
            if portrait.size == 0 or portrait.shape[0] == 0 or portrait.shape[1] == 0:
                logger.warning(f"Invalid portrait dimensions at ({x_c}, {y_c}): {portrait.shape if portrait.size > 0 else 'Empty'}")
                continue

            portraits.append((0, portrait, position))  # 0 for Radiant

            # Save debug image
            save_debug_image(portrait, f"portrait_radiant_{position}", f"Radiant hero {position}")

        # Process Dire (right team) portraits
        for i, (x_c, y_c, w_c, h_c) in enumerate(dire_contours):
            # Ensure we don't exceed the maximum position
            position = min(i, 4)

            # Extract the portrait
            portrait = topbar[y_c:y_c+h_c, x_c:x_c+w_c]

            # Validate the portrait
            if portrait.size == 0 or portrait.shape[0] == 0 or portrait.shape[1] == 0:
                logger.warning(f"Invalid portrait dimensions at ({x_c}, {y_c}): {portrait.shape if portrait.size > 0 else 'Empty'}")
                continue

            portraits.append((1, portrait, position))  # 1 for Dire

            # Save debug image
            save_debug_image(portrait, f"portrait_dire_{position}", f"Dire hero {position}")

        logger.info(f"Extracted {len(portraits)} portraits using contour detection")

    return portraits

def extract_portraits_using_fixed_grid(topbar):
    """Extract hero portraits using a fixed grid approach."""
    h, w = topbar.shape[:2]
    portraits = []

    # Since the topbar is now cropped to contain just the hero portraits area,
    # the spacing between heroes should be more consistent
    # Dota 2 has 5 heroes per team, so 10 total portraits in the cropped topbar

    # Calculate the portrait width and spacing
    # With the margins cropped, the portraits should be evenly spaced
    portrait_width = w // 10

    # Add some buffer to make sure we capture the full portrait
    portrait_buffer = int(portrait_width * 0.1)
    adjusted_portrait_width = portrait_width - portrait_buffer * 2

    # Keep portrait height similar to width for better aspect ratio
    adjusted_portrait_height = min(h - portrait_buffer * 2, adjusted_portrait_width)

    # Extract portraits for both teams
    for team in range(2):  # 0 for Radiant, 1 for Dire
        for position in range(5):
            # Calculate the x-position based on team and position
            # Radiant team (0) is positions 0-4, Dire team (1) is positions 5-9
            grid_position = position + (team * 5)
            portrait_x = grid_position * portrait_width + portrait_buffer

            # Extract the portrait from the topbar
            portrait = topbar[portrait_buffer:portrait_buffer+adjusted_portrait_height,
                              portrait_x:portrait_x+adjusted_portrait_width]

            # Validate the portrait dimensions
            if portrait.size == 0 or portrait.shape[0] == 0 or portrait.shape[1] == 0:
                team_name = "Radiant" if team == 0 else "Dire"
                logger.warning(f"Invalid portrait dimensions for {team_name} hero {position}: {portrait.shape if portrait.size > 0 else 'Empty'}")
                continue

            # Add the portrait to our list
            portraits.append((team, portrait, position))

            # Save debug image
            team_name = "radiant" if team == 0 else "dire"
            save_debug_image(portrait, f"portrait_{team_name}_{position}", f"{team_name.capitalize()} hero {position}")

    logger.info(f"Extracted {len(portraits)} hero portraits using fixed grid")
    return portraits

def identify_heroes(portraits, hero_data):
    """
    Identify heroes in the portraits using template matching.
    Uses multiple preprocessing techniques for better matches.
    Returns a list of dictionaries with hero information and match score.
    """
    results = []

    # Load all hero template images
    hero_templates = []
    for hero in hero_data:
        try:
            template = cv2.imread(hero["image_path"])

            if template is None:
                logger.warning(f"Failed to load hero image: {hero['image_path']}")
                continue

            hero_templates.append({
                "id": hero["id"],
                "name": hero["name"],
                "localized_name": hero["localized_name"],
                "template": template
            })
        except Exception as e:
            logger.error(f"Error loading hero template for {hero['localized_name']}: {e}")

    logger.info(f"Loaded {len(hero_templates)} hero templates for matching")

    # Define preprocessing techniques to try
    preprocessing_techniques = [
        # (name, function)
        ("original", lambda img: img),
        ("gray", lambda img: cv2.cvtColor(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)),
        ("edges", lambda img: cv2.Canny(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 100, 200))
    ]

    # Process each portrait
    for team, portrait, position in tqdm(portraits, desc="Identifying heroes"):
        # Skip if portrait is too small
        if portrait.shape[0] < 10 or portrait.shape[1] < 10:
            logger.warning(f"Portrait too small for matching: {portrait.shape}")
            continue

        # Get portrait dimensions
        h, w = portrait.shape[:2]

        best_match = None
        best_score = 0
        best_technique = ""

        # Save the original portrait for debugging
        team_name = "radiant" if team == 0 else "dire"
        save_debug_image(portrait, f"matching_{team_name}_{position}_original", f"Original portrait")

        # Try different preprocessing techniques
        for tech_name, preprocess_func in preprocessing_techniques:
            try:
                # Preprocess the portrait
                portrait_processed = preprocess_func(portrait)

                # Skip if preprocessing failed
                if portrait_processed is None or portrait_processed.size == 0:
                    continue

                # Save processed portrait for debugging
                save_debug_image(portrait_processed, f"matching_{team_name}_{position}_{tech_name}",
                                f"Processed with {tech_name}")

                # Try to match with each hero template
                for hero in hero_templates:
                    template = hero["template"]

                    # Resize template to match portrait size
                    template_resized = cv2.resize(template, (w, h))

                    # Preprocess the template the same way
                    template_processed = preprocess_func(template_resized)

                    # Skip if preprocessing failed
                    if template_processed is None or template_processed.size == 0:
                        continue

                    # Convert both to grayscale for template matching
                    # If we're using edges, they're already grayscale
                    if tech_name == "edges":
                        # For edge detection, we match binary edge images
                        match_result = cv2.matchTemplate(portrait_processed, template_processed, cv2.TM_CCOEFF_NORMED)
                    else:
                        # For other techniques, convert to grayscale for matching
                        portrait_gray = cv2.cvtColor(portrait_processed, cv2.COLOR_BGR2GRAY)
                        template_gray = cv2.cvtColor(template_processed, cv2.COLOR_BGR2GRAY)

                        # Perform template matching
                        match_result = cv2.matchTemplate(portrait_gray, template_gray, cv2.TM_CCOEFF_NORMED)

                    _, max_score, _, _ = cv2.minMaxLoc(match_result)

                    # Adjust score based on technique - edge detection is less reliable
                    adjusted_score = max_score
                    if tech_name == "edges":
                        adjusted_score = max_score * 0.9  # Edge detection gets a penalty

                    if adjusted_score > best_score:
                        best_score = adjusted_score
                        best_match = hero
                        best_technique = tech_name

            except Exception as e:
                logger.debug(f"Error with technique {tech_name}: {e}")

        # Record the match if one was found
        if best_match and best_score > 0.2:  # Lower threshold to catch more potential matches
            team_name = "Radiant" if team == 0 else "Dire"
            logger.debug(f"{team_name} hero {position+1} matched as {best_match['localized_name']} "
                        f"with score {best_score:.4f} using {best_technique}")

            # Create debug image showing the match
            match_debug = portrait.copy()
            cv2.putText(match_debug, f"{best_match['localized_name']}", (10, 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
            cv2.putText(match_debug, f"Score: {best_score:.2f}", (10, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
            cv2.putText(match_debug, f"Tech: {best_technique}", (10, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
            save_debug_image(match_debug, f"match_{team_name.lower()}_{position}", f"{best_match['localized_name']}")

            # Also save the template for comparison
            template_resized = cv2.resize(best_match["template"], (w, h))
            save_debug_image(template_resized, f"match_{team_name.lower()}_{position}_template",
                           f"Template: {best_match['localized_name']}")

            # Add to results
            results.append({
                "team": team_name,
                "position": position,
                "hero_id": best_match["id"],
                "hero_name": best_match["name"],
                "hero_localized_name": best_match["localized_name"],
                "match_score": float(best_score),
                "match_technique": best_technique
            })

    # Sort results by team and position
    results.sort(key=lambda x: (0 if x["team"] == "Radiant" else 1, x["position"]))

    return results

def process_frame_for_heroes(frame_path):
    """
    Process a frame to identify heroes in the topbar.
    Returns a list of identified heroes or None if processing fails.
    """
    logger.info(f"Processing frame: {frame_path}")

    try:
        # Load the frame
        frame = cv2.imread(str(frame_path))

        if frame is None:
            logger.error(f"Failed to load frame: {frame_path}")
            return None

        # Get frame dimensions for validation
        frame_height, frame_width = frame.shape[:2]

        # Skip very small frames or invalid frames
        if frame_width < 640 or frame_height < 360:
            logger.warning(f"Frame too small: {frame_width}x{frame_height}, skipping")
            return None

        # Save debug copy of the original frame
        save_debug_image(frame, "original_frame", f"Original {frame_width}x{frame_height}")

        # Detect the topbar region with the standard crop values
        topbar_region = detect_topbar_region(frame)
        x, y, w, h = topbar_region

        # Extract hero portraits from the topbar
        portraits = extract_hero_portraits(frame, topbar_region)

        # If we didn't find enough portraits, try different crop configurations
        if not portraits or len(portraits) < 8:  # If less than 8 heroes found
            # First, try different topbar heights
            alternate_heights = [80, 100, 150]
            for alt_height in alternate_heights:
                logger.info(f"Trying alternate topbar height: {alt_height}px")
                # Keep the same x, w values but change the height
                alt_topbar = (x, y, w, alt_height)
                alt_portraits = extract_hero_portraits(frame, alt_topbar)

                # If we found more portraits with this height, use it instead
                if alt_portraits and (not portraits or len(alt_portraits) > len(portraits)):
                    logger.info(f"Found better topbar height: {alt_height}px with {len(alt_portraits)} portraits")
                    portraits = alt_portraits
                    topbar_region = alt_topbar

            # If still not enough portraits, try different crop values
            if len(portraits) < 8:
                # Try a few different crop values
                crop_variations = [
                    (150, 150),  # Less aggressive crop
                    (100, 100),  # Even less aggressive
                    (50, 50),    # Minimal crop
                    (0, 0)       # No crop at all
                ]

                for left_crop, right_crop in crop_variations:
                    logger.info(f"Trying alternate crop values: left={left_crop}px, right={right_crop}px")
                    # Calculate new width with different crop
                    new_x = left_crop
                    new_w = frame_width - left_crop - right_crop
                    # Keep the same height as our best topbar so far
                    _, _, _, best_h = topbar_region
                    alt_topbar = (new_x, y, new_w, best_h)

                    alt_portraits = extract_hero_portraits(frame, alt_topbar)

                    # If we found more portraits with this crop, use it instead
                    if alt_portraits and (not portraits or len(alt_portraits) > len(portraits)):
                        logger.info(f"Found better crop values with {len(alt_portraits)} portraits")
                        portraits = alt_portraits
                        topbar_region = alt_topbar

        if not portraits:
            logger.warning("No hero portraits extracted from topbar")
            return None

        logger.info(f"Processing {len(portraits)} hero portraits")

        # Get hero data for matching
        hero_data = get_hero_data()

        if not hero_data:
            logger.error("No hero data available for matching")
            return None

        # Identify heroes in the portraits
        identified_heroes = identify_heroes(portraits, hero_data)

        # Filter out low-confidence matches
        confident_matches = [hero for hero in identified_heroes if hero["match_score"] > 0.3]

        logger.info(f"Identified {len(confident_matches)} heroes with confidence > 0.3")

        return confident_matches

    except Exception as e:
        logger.error(f"Error processing frame for heroes: {e}")
        return None

def process_frames_for_heroes(frame_paths):
    """
    Process multiple frames to find heroes.
    Returns the result from the frame with the most confident hero matches.
    Prioritizes frames from the middle of the game which are more likely to show the UI.
    """
    best_result = None
    best_count = 0

    # If we have a lot of frames, prioritize frames from the middle
    # The beginning of the game might not have the UI loaded,
    # and the end might have victory screens
    if len(frame_paths) > 5:
        logger.info("Reordering frames to prioritize middle frames")
        # Calculate the middle index
        middle_index = len(frame_paths) // 2

        # Reorder frames to start from the middle and then alternate outward
        reordered_paths = []
        for i in range(len(frame_paths)):
            # Calculate the offset from middle: 0, 1, -1, 2, -2, 3, -3, etc.
            if i % 2 == 0:
                offset = i // 2
            else:
                offset = -((i // 2) + 1)

            # Ensure index is within bounds
            index = middle_index + offset
            if 0 <= index < len(frame_paths):
                reordered_paths.append(frame_paths[index])

        # If for some reason we missed any frames, add them at the end
        missed_frames = set(frame_paths) - set(reordered_paths)
        reordered_paths.extend(missed_frames)

        frame_paths = reordered_paths

    # List of potential hero count thresholds for early stopping
    # If we find a frame with this many heroes, we'll stop
    early_stop_thresholds = [10, 9, 8, 7, 6]

    # Process frames
    for frame_path in tqdm(frame_paths, desc="Processing frames for heroes"):
        result = process_frame_for_heroes(frame_path)

        if result:
            # Count heroes with different confidence levels
            confident_count = len([h for h in result if h["match_score"] > 0.4])

            logger.info(f"Frame {frame_path}: found {len(result)} heroes, {confident_count} with confidence > 0.4")

            # Check for early stopping - if we've found enough heroes
            # or if this frame is better than our previous best
            if confident_count > best_count:
                best_count = confident_count
                best_result = result

                logger.info(f"New best frame with {confident_count} confident hero matches")

                # Check if we should stop early based on the current threshold
                for threshold in early_stop_thresholds:
                    if confident_count >= threshold:
                        logger.info(f"Found {confident_count} heroes with good confidence (threshold {threshold}), stopping early")
                        return best_result

    # If we processed all frames and didn't hit an early stopping condition,
    # return the best result we found
    if best_result:
        logger.info(f"Best frame found {len(best_result)} heroes total, {best_count} with good confidence")
    else:
        logger.warning("No heroes found in any frame")

    return best_result

if __name__ == "__main__":
    import argparse
    from clip_utils import get_clip_details, download_clip, extract_frames

    parser = argparse.ArgumentParser(description="Detect Dota 2 heroes in a Twitch clip")
    parser.add_argument("clip_url", help="URL of the Twitch clip")
    parser.add_argument("--frame-interval", type=float, default=1.0,
                        help="Interval between frames in seconds (default: 1.0)")
    parser.add_argument("--output", "-o", default="hero_results.json",
                        help="Output file path (default: hero_results.json)")
    parser.add_argument("--debug", action="store_true",
                        help="Enable debug mode with image saving")

    args = parser.parse_args()

    if args.debug:
        os.environ["DEBUG_IMAGES"] = "1"
        logging.getLogger().setLevel(logging.DEBUG)

    try:
        # Get clip details
        clip_details = get_clip_details(args.clip_url)

        # Download the clip
        clip_path = download_clip(clip_details)

        # Extract frames
        frame_paths = extract_frames(
            clip_path,
            start_time=0,
            end_time=None,
            frame_interval=args.frame_interval
        )

        # Process frames to identify heroes
        heroes = process_frames_for_heroes(frame_paths)

        if heroes:
            # Display results
            print("\nIdentified Heroes:")
            print("-----------------")

            for hero in heroes:
                team = hero["team"]
                pos = hero["position"] + 1
                name = hero["hero_localized_name"]
                score = hero["match_score"]
                print(f"{team} #{pos}: {name} (confidence: {score:.2f})")

            # Save results to JSON
            results = {
                "clip_url": args.clip_url,
                "heroes": heroes
            }

            with open(args.output, "w") as f:
                json.dump(results, f, indent=2)

            print(f"\nResults saved to {args.output}")

        else:
            print("No heroes identified in the clip")

    except Exception as e:
        logger.error(f"Error: {e}")
        print(f"Error: {e}")
