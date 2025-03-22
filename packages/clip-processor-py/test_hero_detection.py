#!/usr/bin/env python3
"""
Test Hero Detection

This script processes a single image to test Dota 2 hero detection.
"""

import os
import sys
import json
import logging
import argparse
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="Test Dota 2 hero detection on a single image")
    parser.add_argument("image_path", help="Path to the image to test")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging and image saving")
    parser.add_argument("--output", "-o", default="heroes.json", help="Output file path (default: heroes.json)")
    return parser.parse_args()

def main():
    """Main function."""
    args = parse_args()

    # Set debug level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        os.environ["DEBUG_IMAGES"] = "1"

    try:
        image_path = Path(args.image_path)

        # Check if image exists
        if not image_path.exists():
            logger.error(f"Image file not found: {image_path}")
            return 1

        # Import hero detection module
        try:
            from dota_hero_detection import process_frame_for_heroes
        except ImportError:
            logger.error("Failed to import hero detection module")
            print("Error: Hero detection module not available. Make sure it's properly installed.")
            return 1

        logger.info(f"Processing image: {image_path}")

        # Process the image
        heroes = process_frame_for_heroes(str(image_path), debug=args.debug)

        if heroes:
            # Save results
            with open(args.output, 'w') as f:
                json.dump(heroes, f, indent=2)
            logger.info(f"Results saved to {args.output}")

            # Print results
            print(f"\nIdentified {len(heroes)} heroes:")
            print("-" * (19 + len(str(len(heroes)))))

            for hero in heroes:
                team = hero["team"]
                pos = hero["position"] + 1
                name = hero["hero_localized_name"]
                score = hero["match_score"]
                print(f"{team} #{pos}: {name} (confidence: {score:.2f})")

            return 0
        else:
            logger.warning("No heroes identified in the image")
            print("No heroes identified in the image.")
            return 1

    except Exception as e:
        logger.error(f"Error processing image: {e}", exc_info=True)
        print(f"Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
