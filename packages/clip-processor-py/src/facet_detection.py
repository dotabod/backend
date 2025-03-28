"""
Dota 2 Hero Facet Detection

This module provides functionality to detect hero facets from the top bar hero portraits.
"""

import json
import os
import cv2
import numpy as np
import logging
from pathlib import Path
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants for facet detection
FACET_SIZE = 24  # Size of facet icon in pixels
FACET_TOP_MARGIN = 0  # Distance from top of portrait to facet icon
FACET_SIDE_MARGIN = 0  # Distance from side of portrait to facet icon

def save_debug_image(image, name_prefix, additional_info="", hero_name=None, facet_name=None):
    """Save a debug image to the debug directory."""
    try:
        debug_dir = Path("debug") / "facets"
        debug_dir.mkdir(parents=True, exist_ok=True)

        # Sanitize names for filenames
        def sanitize_name(name):
            if name:
                # Replace spaces and special characters with underscores
                return str(name).replace(" ", "_").replace("'", "").replace(":", "_")
            return name

        # Sanitize the names for use in filenames
        safe_hero_name = sanitize_name(hero_name)
        safe_facet_name = sanitize_name(facet_name)
        safe_additional_info = sanitize_name(additional_info)

        # Add timestamp to filename to avoid overwrites
        filename = f"{name_prefix}.png"

        # Add hero name and facet name to filename if provided
        if safe_hero_name and safe_facet_name:
            filename = f"{name_prefix}_{safe_hero_name}_{safe_facet_name}.png"
        elif safe_hero_name:
            filename = f"{name_prefix}_{safe_hero_name}.png"
        elif safe_facet_name:
            filename = f"{name_prefix}_{safe_facet_name}.png"
        elif safe_additional_info:
            filename = f"{name_prefix}_{safe_additional_info}.png"

        filepath = debug_dir / filename
        cv2.imwrite(str(filepath), image)
        logger.debug(f"Saved debug image: {filepath}")
        return filepath
    except Exception as e:
        logger.error(f"Error saving debug image {name_prefix}: {e}")
        return None

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

def load_facet_templates(debug=False):
    """
    Load all facet icon templates from the facet_icons directory.

    Args:
        debug: Enable debug mode for additional logging and image saving

    Returns:
        dict: Mapping of facet names to their template images
    """
    assets_dir = Path("assets") / "dota_heroes"
    facets_dir = assets_dir / "facet_icons"

    if not facets_dir.exists():
        logger.error(f"Facet icons directory not found: {facets_dir}")
        return {}

    templates = {}
    for icon_file in facets_dir.glob("*.png"):
        try:
            # Load the icon and convert to grayscale
            icon = cv2.imread(str(icon_file))
            if icon is None:
                logger.warning(f"Could not load facet icon: {icon_file}")
                continue

            # Convert to grayscale
            gray = cv2.cvtColor(icon, cv2.COLOR_BGR2GRAY)

            # Apply thresholding to get binary image
            _, binary = cv2.threshold(gray, 128, 255, cv2.THRESH_BINARY)

            # Resize to standard size if needed
            if binary.shape != (FACET_SIZE, FACET_SIZE):
                binary = cv2.resize(binary, (FACET_SIZE, FACET_SIZE))

            # Store the template
            facet_name = icon_file.stem
            templates[facet_name] = binary

            if debug:
                logger.debug(f"Loaded facet template: {facet_name} (shape: {binary.shape})")
                save_debug_image(gray, "template_gray", facet_name=facet_name)
                save_debug_image(binary, "template", facet_name=facet_name)

        except Exception as e:
            logger.error(f"Error loading facet icon {icon_file}: {e}")
            continue

    logger.info(f"Loaded {len(templates)} facet templates")
    return templates

def extract_facet_region(hero_portrait, team, hero_name=None, debug=False):
    """
    Extract the region containing the facet icon from a hero portrait.

    Args:
        hero_portrait: The hero portrait image
        team: 'Radiant' or 'Dire'
        hero_name: The name of the hero for debug images
        debug: Enable debug mode for additional logging and image saving

    Returns:
        The extracted facet region or None if extraction fails
    """
    try:
        if hero_portrait is None:
            logger.error("Cannot extract facet region: hero_portrait is None")
            return None

        height, width = hero_portrait.shape[:2]

        if debug:
            logger.debug(f"Extracting facet region for {team} team (portrait size: {width}x{height})")
            # Save the original portrait
            save_debug_image(hero_portrait, "portrait", team, hero_name=hero_name)

        # Update the facet size to be slightly larger to ensure we capture the entire icon
        # We'll keep the constant FACET_SIZE for template matching, but use a larger extraction size
        extraction_size = FACET_SIZE + 4  # Add padding to ensure we capture the full icon

        # Calculate facet region coordinates
        # For Radiant, facets are typically in the top-left
        # For Dire, facets are typically in the top-right
        if team == 'Radiant':
            # Top left corner
            x = FACET_SIDE_MARGIN
            y = FACET_TOP_MARGIN
        else:  # Dire
            # Top right corner
            x = width - extraction_size - FACET_SIDE_MARGIN
            y = FACET_TOP_MARGIN

        # Ensure we don't go out of bounds
        x = max(0, x)
        y = max(0, y)
        extraction_size = min(extraction_size, width - x, height - y)

        if debug:
            logger.debug(f"Facet region coordinates: x={x}, y={y}, size={extraction_size}")
            # Draw rectangle on debug image
            debug_image = hero_portrait.copy()
            cv2.rectangle(debug_image, (x, y), (x + extraction_size, y + extraction_size), (0, 255, 0), 1)
            save_debug_image(debug_image, "facet_region", f"{team}_marked", hero_name=hero_name)

        # Extract the region
        facet_region = hero_portrait[y:y+extraction_size, x:x+extraction_size]

        # Extract the white icon from any background
        # First convert to grayscale if it's a color image
        if len(facet_region.shape) == 3:
            facet_region = cv2.cvtColor(facet_region, cv2.COLOR_BGR2GRAY)

        # Try multiple threshold values to improve detection
        # Save the original grayscale for debug
        if debug:
            save_debug_image(facet_region, "facet_region", f"{team}_grayscale", hero_name=hero_name)

        # Apply a lower threshold to capture more of the icon
        _, facet_region_binary = cv2.threshold(facet_region, 130, 255, cv2.THRESH_BINARY)

        # Apply an adaptive threshold as an alternative
        facet_region_adaptive = cv2.adaptiveThreshold(
            facet_region, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 11, 2
        )

        if debug:
            save_debug_image(facet_region_binary, "facet_region", f"{team}_binary_thresh", hero_name=hero_name)
            save_debug_image(facet_region_adaptive, "facet_region", f"{team}_adaptive_thresh", hero_name=hero_name)

        # Apply a more moderate levels adjustment
        facet_region = adjust_levels(facet_region_binary, 100, 255, 1.0)

        # Resize back to standard FACET_SIZE if needed
        if facet_region.shape[0] != FACET_SIZE or facet_region.shape[1] != FACET_SIZE:
            facet_region = cv2.resize(facet_region, (FACET_SIZE, FACET_SIZE))

        if debug:
            save_debug_image(facet_region, "facet_region", f"{team}_extracted", hero_name=hero_name)

        return facet_region

    except Exception as e:
        logger.error(f"Error extracting facet region: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

def match_facet_template(facet_region, template, hero_name=None, facet_name=None, threshold=0.2, debug=False):
    """
    Match a facet template against a region using template matching.

    Args:
        facet_region: The extracted facet region
        template: The template to match against
        hero_name: The name of the hero for debug images
        facet_name: The name of the facet for debug images
        threshold: Minimum match score threshold
        debug: Enable debug mode for additional logging and image saving

    Returns:
        float: Match score between 0 and 1
    """
    try:
        # Make sure template size matches facet region size
        if template.shape != facet_region.shape:
            template = cv2.resize(template, (facet_region.shape[1], facet_region.shape[0]))

        # Try multiple matching methods
        methods = [
            (cv2.TM_CCOEFF_NORMED, "CCOEFF_NORMED"),
            (cv2.TM_CCORR_NORMED, "CCORR_NORMED")
        ]

        best_score = -1.0
        best_method = ""

        # First try direct template matching
        for method, method_name in methods:
            # Perform template matching
            result = cv2.matchTemplate(facet_region, template, method)
            _, score, _, _ = cv2.minMaxLoc(result)

            if score > best_score:
                best_score = score
                best_method = method_name

        # If direct matching score is low, try with different sizes
        if best_score < 0.2:
            # Try scaling the template down to account for padding in the facet region
            for scale in [0.8, 0.7, 0.6, 0.5]:
                # Calculate new dimensions
                new_width = int(template.shape[1] * scale)
                new_height = int(template.shape[0] * scale)

                # Skip if dimensions become too small
                if new_width < 10 or new_height < 10:
                    continue

                # Resize the template
                resized_template = cv2.resize(template, (new_width, new_height))

                # Create a blank canvas matching the facet region size
                padded_template = np.zeros_like(facet_region)

                # Calculate centering offsets
                x_offset = (facet_region.shape[1] - new_width) // 2
                y_offset = (facet_region.shape[0] - new_height) // 2

                # Place the resized template in the center of the canvas
                padded_template[y_offset:y_offset+new_height, x_offset:x_offset+new_width] = resized_template

                if debug:
                    save_debug_image(padded_template, f"template_scaled_{scale}", hero_name=hero_name, facet_name=facet_name)

                # Try matching with the padded template
                for method, method_name in methods:
                    result = cv2.matchTemplate(facet_region, padded_template, method)
                    _, score, _, _ = cv2.minMaxLoc(result)

                    if score > best_score:
                        best_score = score
                        best_method = f"{method_name}_scale_{scale}"

        if debug:
            logger.debug(f"Template matching best score: {best_score:.4f} (method: {best_method}, threshold: {threshold})")
            # Create a visualization of the match
            debug_image = cv2.cvtColor(facet_region, cv2.COLOR_GRAY2BGR)
            cv2.putText(debug_image, f"Score: {best_score:.4f}", (2, 20),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
            save_debug_image(debug_image, "template_match", hero_name=hero_name, facet_name=facet_name)
            save_debug_image(template, "template_before_matching", hero_name=hero_name, facet_name=facet_name)

        return best_score

    except Exception as e:
        logger.error(f"Error matching facet template: {e}")
        return 0.0

def detect_hero_facet(hero_portrait, team, hero_abilities, templates, hero_name=None, debug=False):
    """
    Detect which facet a hero has chosen based on their portrait.

    Args:
        hero_portrait: The hero portrait image
        team: 'Radiant' or 'Dire'
        hero_abilities: The hero's abilities data containing facet information
        templates: Dictionary of facet templates
        hero_name: The name of the hero for debug images
        debug: Enable debug mode for additional logging and image saving

    Returns:
        dict: Detected facet information or None if no facet detected
    """
    try:
        if hero_portrait is None:
            logger.error("Cannot detect hero facet: hero_portrait is None")
            return None

        if not hero_abilities:
            logger.warning("Cannot detect hero facet: hero_abilities is None or empty")
            return None

        if not templates:
            logger.warning("Cannot detect hero facet: facet templates are empty")
            return None

        if hero_name is None:
            # Try to get the hero name from abilities data if not provided
            hero_name = hero_abilities.get('hero_localized_name', 'unknown')

        if debug:
            logger.debug(f"Starting facet detection for {team} team hero {hero_name}")
            logger.debug(f"Hero abilities keys: {hero_abilities.keys()}")
            if 'facets' in hero_abilities:
                logger.debug(f"Available facets: {[f.get('name', 'unknown') for f in hero_abilities.get('facets', [])]}")

        # Extract the facet region
        facet_region = extract_facet_region(hero_portrait, team, hero_name=hero_name, debug=debug)
        if facet_region is None:
            logger.warning("Failed to extract facet region")
            return None

        # Get the hero's possible facets
        facets = hero_abilities.get('facets', [])
        if not facets:
            logger.debug("No facets available for this hero")
            return None

        # Try to match each possible facet
        best_match = None
        best_score = 0.0

        # First try matching just the hero-specific facets
        for facet in facets:
            icon_name = facet.get('icon')
            facet_display_name = facet.get('name', 'unknown')

            if not icon_name or icon_name not in templates:
                if debug:
                    logger.debug(f"Skipping facet {facet_display_name} - template not found")
                continue

            logger.debug(f"Matching facet {icon_name} (shape: {facet_region.shape})")
            template = templates[icon_name]
            save_debug_image(template, "template_before_matching", facet_name=icon_name, hero_name=hero_name)
            score = match_facet_template(facet_region, template, hero_name=hero_name, facet_name=icon_name, debug=debug)

            if debug:
                logger.debug(f"Facet {icon_name} match score: {score:.4f}")

            if score > best_score:
                best_score = score
                best_match = facet

        # If no good match found with hero-specific facets, try generic facets
        # Lower this threshold for trying generic facets
        if best_score < 0.15:
            # Try generic facets that might be used by multiple heroes
            generic_facet_keywords = ['damage', 'slow', 'armor', 'vision', 'speed', 'illusion']

            for keyword in generic_facet_keywords:
                for template_name, template in templates.items():
                    if keyword in template_name.lower():
                        if debug:
                            logger.debug(f"Trying generic facet template: {template_name}")

                        score = match_facet_template(facet_region, template, hero_name=hero_name, facet_name=template_name, debug=debug)

                        if debug:
                            logger.debug(f"Generic facet {template_name} match score: {score:.4f}")

                        if score > best_score:
                            best_score = score
                            # Create a generic facet entry
                            best_match = {
                                'name': template_name,
                                'title': template_name.replace('_', ' ').title(),
                                'icon': template_name
                            }

        # Lower the threshold to improve detection rate
        threshold = 0.12

        # Return the best match if it exceeds threshold
        if best_match and best_score >= threshold:
            result = {
                'name': best_match.get('name', 'unknown'),
                'title': best_match.get('title', 'Unknown Facet'),
                'icon': best_match.get('icon', 'unknown'),
                'confidence': best_score
            }
            if debug:
                logger.debug(f"Detected facet: {result}")
            return result

        if debug:
            logger.debug("No facet detected with confidence above threshold")
        return None

    except Exception as e:
        logger.error(f"Error detecting hero facet: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

def get_hero_abilities(hero_name, debug=False):
    """
    Get the abilities data for a hero from hero_abilities.json.

    Args:
        hero_name (str): The localized name of the hero
        debug (bool): Enable debug output
    Returns:
        dict: Hero abilities data or None if not found
    """
    try:
        if not hero_name:
            logger.error("Cannot get hero abilities: hero_name is None or empty")
            return None

        # Get the path to the hero_abilities.json file
        script_dir = os.path.dirname(os.path.abspath(__file__))
        assets_dir = os.path.join(os.path.dirname(script_dir), 'assets', 'dota_heroes')
        abilities_file = os.path.join(assets_dir, 'hero_abilities.json')
        hero_data_file = os.path.join(assets_dir, 'hero_data.json')

        if not os.path.exists(abilities_file):
            logger.error(f"Hero abilities file not found: {abilities_file}")
            return None

        if not os.path.exists(hero_data_file):
            logger.error(f"Hero data file not found: {hero_data_file}")
            return None

        # Load the hero abilities data
        with open(abilities_file, 'r', encoding='utf-8') as f:
            hero_abilities = json.load(f)

        # Load hero data to map localized names to internal names
        with open(hero_data_file, 'r', encoding='utf-8') as f:
            hero_data = json.load(f)

        if debug:
            logger.debug(f"Loaded hero abilities for {len(hero_abilities)} heroes")
            logger.debug(f"Loaded hero data for {len(hero_data)} heroes")

        # Common name transformations for more reliable matching
        hero_name_lower = hero_name.lower()

        # First try to find the internal name from hero_data.json
        hero_internal_name = None

        # Look through hero_data to find the matching localized name
        for hero in hero_data:
            if hero.get('localized_name', '').lower() == hero_name_lower:
                hero_internal_name = hero.get('name')
                if debug:
                    logger.debug(f"Found internal name '{hero_internal_name}' for '{hero_name}' in hero_data.json")
                break

        # If we found the internal name in hero_data, use it directly
        if hero_internal_name and hero_internal_name in hero_abilities:
            abilities_data = hero_abilities[hero_internal_name]

            # Add hero's localized and internal name to the abilities data
            abilities_data['hero_localized_name'] = hero_name
            abilities_data['hero_internal_name'] = hero_internal_name

            if debug:
                logger.debug(f"Found abilities data using internal name: {hero_internal_name}")

            # Check if we need to enhance the data structure with facets
            if 'facets' not in abilities_data:
                # Try to find facets in the abilities structure
                facets = []
                for ability_key, ability_data in abilities_data.items():
                    if isinstance(ability_data, dict) and 'facets' in ability_data:
                        facets.extend(ability_data['facets'])

                if facets:
                    abilities_data['facets'] = facets
                    if debug:
                        logger.debug(f"Added {len(facets)} facets from abilities structure")

            if debug:
                logger.debug(f"Hero abilities structure: {list(abilities_data.keys())}")
                if 'facets' in abilities_data:
                    logger.debug(f"Found {len(abilities_data['facets'])} facets for hero {hero_name}")

            return abilities_data

        # If we didn't find it by internal name, try the old fallback methods
        hero_name_underscore = hero_name_lower.replace(' ', '_')

        # First, try direct match with npc_dota_hero_ prefix
        direct_match = f"npc_dota_hero_{hero_name_underscore}"
        if direct_match in hero_abilities:
            hero_internal_name = direct_match
            if debug:
                logger.debug(f"Found direct match for hero: {hero_internal_name}")
        else:
            # Try matching by converting internal names to localized format
            for key in hero_abilities.keys():
                # Skip if it doesn't start with npc_dota_hero_
                if not key.startswith("npc_dota_hero_"):
                    continue

                # Extract the hero name part
                key_name = key.replace("npc_dota_hero_", "")
                key_name_spaces = key_name.replace("_", " ")

                if key_name == hero_name_underscore or key_name_spaces.lower() == hero_name_lower:
                    hero_internal_name = key
                    if debug:
                        logger.debug(f"Found match for hero: {hero_internal_name}")
                    break

        if hero_internal_name:
            abilities_data = hero_abilities[hero_internal_name]

            # Add hero's localized and internal name to the abilities data
            abilities_data['hero_localized_name'] = hero_name
            abilities_data['hero_internal_name'] = hero_internal_name

            # Check if we need to enhance the data structure with facets
            if 'facets' not in abilities_data:
                # Try to find facets in the abilities structure
                facets = []
                for ability_key, ability_data in abilities_data.items():
                    if isinstance(ability_data, dict) and 'facets' in ability_data:
                        facets.extend(ability_data['facets'])

                if facets:
                    abilities_data['facets'] = facets
                    if debug:
                        logger.debug(f"Added {len(facets)} facets from abilities structure")

            if debug:
                logger.debug(f"Hero abilities structure: {list(abilities_data.keys())}")
                if 'facets' in abilities_data:
                    logger.debug(f"Found {len(abilities_data['facets'])} facets for hero {hero_name}")

            return abilities_data
        else:
            logger.warning(f"Hero abilities not found for: {hero_name}")
            if debug:
                # Print a few example keys to help debug
                sample_keys = list(hero_abilities.keys())[:5]
                logger.debug(f"Sample hero internal names: {sample_keys}")
            return None

    except Exception as e:
        logger.error(f"Error getting hero abilities: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None


def process_team_facets(heroes, team, templates, debug=False):
    """
    Process facets for all heroes on a team once we know they have facets visible.

    Args:
        heroes: List of detected heroes
        team: 'Radiant' or 'Dire'
        templates: Dictionary of facet templates
        debug: Enable debug mode for additional logging and image saving

    Returns:
        list: Updated heroes with facet information
    """
    try:
        # Get all heroes for this team
        team_heroes = [h for h in heroes if h['team'] == team]

        if debug:
            logger.debug(f"Processing facets for {team} team ({len(team_heroes)} heroes)")

        for hero in team_heroes:
            hero_name = hero.get('hero_localized_name', 'unknown')

            if debug:
                logger.debug(f"Processing hero: {hero_name} at position {hero.get('position', 'unknown')}")

            # Skip if we don't have the portrait image
            if 'portrait_image' not in hero:
                if debug:
                    logger.debug(f"Skipping hero {hero_name} - no portrait image available")
                continue

            # Skip if we don't have abilities data
            if 'abilities' not in hero:
                if debug:
                    logger.debug(f"Skipping hero {hero_name} - no abilities data available")
                continue

            # Add hero name to abilities data for debug images
            if 'abilities' in hero:
                hero['abilities']['hero_name'] = hero_name

            # Detect facet
            facet = detect_hero_facet(
                hero['portrait_image'],
                team,
                hero['abilities'],
                templates,
                hero_name=hero_name,  # Explicitly pass hero_name to detect_hero_facet
                debug=debug
            )

            if facet:
                hero['facet'] = facet
                if debug:
                    logger.debug(f"Added facet to hero {hero_name}: {facet}")

        return heroes

    except Exception as e:
        logger.error(f"Error processing team facets: {e}")
        return heroes
