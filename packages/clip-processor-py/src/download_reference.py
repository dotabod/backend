#!/usr/bin/env python3
"""
Download Reference Image

This script downloads an image of player cards to use as a reference for template matching.
"""

import os
import sys
import logging
import argparse
import requests
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
ASSETS_DIR = Path("assets")
ASSETS_DIR.mkdir(exist_ok=True)
REFERENCE_IMAGE_PATH = ASSETS_DIR / "reference.png"

# URL to an example of the player cards display (user would replace this with a valid URL)
DEFAULT_REFERENCE_URL = "https://i.imgur.com/BZmAOVO.png"

def download_image(url, output_path):
    """
    Download an image from a URL.

    Args:
        url: URL of the image
        output_path: Path to save the image

    Returns:
        bool: True if successful, False otherwise
    """
    try:
        logger.info(f"Downloading image from {url}")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

        response = requests.get(url, headers=headers, stream=True)
        response.raise_for_status()

        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        logger.info(f"Image saved to {output_path}")
        return True

    except Exception as e:
        logger.error(f"Error downloading image: {e}")
        return False

def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="Download a reference image of player cards")
    parser.add_argument("url", nargs="?", default=DEFAULT_REFERENCE_URL,
                       help=f"URL of the image to download (default: {DEFAULT_REFERENCE_URL})")
    parser.add_argument("--output", "-o", default=str(REFERENCE_IMAGE_PATH),
                       help=f"Output file path (default: {REFERENCE_IMAGE_PATH})")

    return parser.parse_args()

def main():
    """Main function."""
    args = parse_args()

    # If the default URL is being used, warn the user
    if args.url == DEFAULT_REFERENCE_URL:
        logger.warning("Using the default URL, which is just a placeholder. Please provide a real URL to a player cards image.")
        logger.info("Example: python download_reference.py https://example.com/player_cards.png")

        # Create a note file
        note_path = ASSETS_DIR / "README.txt"
        with open(note_path, 'w') as f:
            f.write("""
To use template matching, place a reference image of the player cards dashboard here and name it "reference.png".

You can download a reference image with:
python src/download_reference.py URL_TO_PLAYER_CARDS_IMAGE

The reference image should clearly show the player cards layout similar to the example in the documentation.
            """.strip())

        logger.info(f"Created note file at {note_path}")
        return 1

    # Download the image
    success = download_image(args.url, args.output)

    if success:
        logger.info("Reference image downloaded successfully")
        return 0
    else:
        logger.error("Failed to download reference image")
        return 1

if __name__ == "__main__":
    sys.exit(main())
