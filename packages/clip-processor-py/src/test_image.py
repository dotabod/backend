#!/usr/bin/env python3
"""
Test Image Processing

This script tests the image processing logic on a single image file,
which can be useful for testing accuracy without downloading clips.
"""

import os
import sys
import json
import logging
import argparse
from pathlib import Path

from image_processing import process_frame

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="Test image processing on a single image")
    parser.add_argument("image_path", help="Path to the image file to process")
    parser.add_argument("--reference", "-r", help="Path to a reference image for template matching")
    parser.add_argument("--output", "-o", default="image_results.json",
                       help="Output file path (default: image_results.json)")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")

    return parser.parse_args()

def main():
    """Main function."""
    args = parse_args()

    # Set log level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Check if the image exists
    image_path = Path(args.image_path)
    if not image_path.exists():
        logger.error(f"Image file not found: {image_path}")
        return 1

    # Check reference image if provided
    reference_path = None
    if args.reference:
        reference_path = Path(args.reference)
        if not reference_path.exists():
            logger.warning(f"Reference image not found: {reference_path}")
            reference_path = None

    try:
        logger.info(f"Processing image: {image_path}")

        # Process the image
        result = process_frame(str(image_path), 0, reference_path=reference_path)

        # Display results
        if result.get("players"):
            players = result["players"]

            print("\nPlayer Information:")
            print("------------------")

            for i, player in enumerate(players):
                rank_text = f" - Rank: {player['rank']}" if player.get("rank") else ""
                print(f"Player {i+1}: {player['name']}{rank_text}")

            # Save the results to a JSON file
            with open(args.output, "w") as f:
                json.dump(result, f, indent=2)

            logger.info(f"Results saved to: {args.output}")
            return 0
        else:
            logger.warning("No player cards found in the image")
            print("No player cards found in the image.")

            # Save the empty results for debugging
            with open(args.output, "w") as f:
                json.dump(result, f, indent=2)

            return 1

    except Exception as e:
        logger.error(f"Error processing image: {e}", exc_info=True)
        print(f"Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
