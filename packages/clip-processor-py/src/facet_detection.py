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

def save_debug_image(image, name_prefix, additional_info=""):
    """Save a debug image to the debug directory."""
    try:
        debug_dir = Path("debug") / "facets"
        debug_dir.mkdir(parents=True, exist_ok=True)

        # Add timestamp to filename to avoid overwrites
        filename = f"{name_prefix}.png"
        if additional_info:
            filename = f"{name_prefix}_{additional_info}.png"

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

            # Resize to standard size if needed
            if gray.shape != (FACET_SIZE, FACET_SIZE):
                gray = cv2.resize(gray, (FACET_SIZE, FACET_SIZE))

            # Store the template
            facet_name = icon_file.stem
            # levels_adjusted = adjust_levels(gray, 80, 220, 3.0)
            templates[facet_name] = gray

            if debug:
                logger.debug(f"Loaded facet template: {facet_name} (shape: {gray.shape})")
                save_debug_image(gray, "template", facet_name)
                # save_debug_image(levels_adjusted, "template_levels_adjusted", facet_name)

        except Exception as e:
            logger.error(f"Error loading facet icon {icon_file}: {e}")
            continue

    logger.info(f"Loaded {len(templates)} facet templates")
    return templates

def extract_facet_region(hero_portrait, team, debug=False):
    """
    Extract the region containing the facet icon from a hero portrait.

    Args:
        hero_portrait: The hero portrait image
        team: 'Radiant' or 'Dire'
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
            save_debug_image(hero_portrait, "portrait", team)

        # Calculate facet region coordinates
        if team == 'Radiant':
            # Top left corner
            x = FACET_SIDE_MARGIN
            y = FACET_TOP_MARGIN
        else:  # Dire
            # Top right corner
            x = width - FACET_SIZE - FACET_SIDE_MARGIN
            y = FACET_TOP_MARGIN

        if debug:
            logger.debug(f"Facet region coordinates: x={x}, y={y}, size={FACET_SIZE}")
            # Draw rectangle on debug image
            debug_image = hero_portrait.copy()
            cv2.rectangle(debug_image, (x, y), (x + FACET_SIZE, y + FACET_SIZE), (0, 255, 0), 1)
            save_debug_image(debug_image, "facet_region", f"{team}_marked")

        # Extract the region
        facet_region = hero_portrait[y:y+FACET_SIZE, x:x+FACET_SIZE]

        # Extract the white icon from any background
        # First convert to grayscale if it's a color image
        if len(facet_region.shape) == 3:
            facet_region = cv2.cvtColor(facet_region, cv2.COLOR_BGR2GRAY)

        # Apply threshold to isolate the white icon
        # Adjust threshold value as needed (higher value = only very bright pixels)
        _, facet_region = cv2.threshold(facet_region, 180, 255, cv2.THRESH_BINARY)

        # Apply levels adjustment to ensure white icon on black background
        facet_region = adjust_levels(facet_region, 200, 255, 1.0)

        if debug:
            save_debug_image(facet_region, "facet_region", f"{team}_extracted")

        return facet_region

    except Exception as e:
        logger.error(f"Error extracting facet region: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

def match_facet_template(facet_region, template, threshold=0.2, debug=False):
    """
    Match a facet template against a region using template matching.

    Args:
        facet_region: The extracted facet region
        template: The template to match against
        threshold: Minimum match score threshold
        debug: Enable debug mode for additional logging and image saving

    Returns:
        float: Match score between 0 and 1
    """
    try:
        # Perform template matching with the bordered template
        result = cv2.matchTemplate(facet_region, template, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(result)

        if debug:
            logger.debug(f"Template matching score: {max_val:.4f} (threshold: {threshold})")
            # Create a visualization of the match
            debug_image = cv2.cvtColor(facet_region, cv2.COLOR_GRAY2BGR)
            cv2.putText(debug_image, f"Score: {max_val:.4f}", (2, 20),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
            save_debug_image(debug_image, "template_match", f"score_{max_val:.4f}")
            save_debug_image(template, "template_before_matching", f"template")

        return max_val

    except Exception as e:
        logger.error(f"Error matching facet template: {e}")
        return 0.0

def detect_hero_facet(hero_portrait, team, hero_abilities, templates, debug=False):
    """
    Detect which facet a hero has chosen based on their portrait.

    Args:
        hero_portrait: The hero portrait image
        team: 'Radiant' or 'Dire'
        hero_abilities: The hero's abilities data containing facet information
        templates: Dictionary of facet templates
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

        if debug:
            logger.debug(f"Starting facet detection for {team} team hero")
            logger.debug(f"Hero abilities keys: {hero_abilities.keys()}")
            if 'facets' in hero_abilities:
                logger.debug(f"Available facets: {[f.get('name', 'unknown') for f in hero_abilities.get('facets', [])]}")

        # Extract the facet region
        facet_region = extract_facet_region(hero_portrait, team, debug)
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

        for facet in facets:
            icon_name = facet.get('icon')
            if not icon_name or icon_name not in templates:
                if debug:
                    logger.debug(f"Skipping facet {facet.get('name', 'unknown')} - template not found")
                continue

            logger.debug(f"Matching facet {icon_name} (shape: {facet_region.shape})")
            template = templates[icon_name]
            save_debug_image(template, "template_before_matching", icon_name)
            score = match_facet_template(facet_region, template, debug=debug)

            if debug:
                logger.debug(f"Facet {icon_name} match score: {score:.4f}")

            if score > best_score:
                best_score = score
                best_match = facet

        # Return the best match if it exceeds threshold
        if best_match and best_score >= 0.2:
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

        if not os.path.exists(abilities_file):
            logger.error(f"Hero abilities file not found: {abilities_file}")
            return None

        # Load the hero abilities data
        with open(abilities_file, 'r', encoding='utf-8') as f:
            hero_abilities = json.load(f)

        if debug:
            logger.debug(f"Loaded hero abilities for {len(hero_abilities)} heroes")

        # Common name transformations for more reliable matching
        hero_name_lower = hero_name.lower()
        hero_name_underscore = hero_name_lower.replace(' ', '_')

        # Try different name formats to find a match
        hero_internal_name = None

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
            if debug:
                logger.debug(f"Processing hero: {hero.get('hero', 'unknown')} at position {hero.get('position', 'unknown')}")

            # Skip if we don't have the portrait image
            if 'portrait_image' not in hero:
                if debug:
                    logger.debug("Skipping hero - no portrait image available")
                continue

            # Skip if we don't have abilities data
            if 'abilities' not in hero:
                if debug:
                    logger.debug("Skipping hero - no abilities data available")
                continue

            # Detect facet
            facet = detect_hero_facet(
                hero['portrait_image'],
                team,
                hero['abilities'],
                templates,
                debug=debug
            )

            if facet:
                hero['facet'] = facet
                if debug:
                    logger.debug(f"Added facet to hero: {facet}")

        return heroes

    except Exception as e:
        logger.error(f"Error processing team facets: {e}")
        return heroes
