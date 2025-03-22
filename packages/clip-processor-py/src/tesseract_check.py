#!/usr/bin/env python3
"""
Simple script to check if Tesseract OCR is properly installed and functioning.
"""

import sys
import subprocess
import pytesseract
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import os
import cv2
from pathlib import Path

# Create test directory
TEST_DIR = Path("temp/tesseract_test")
TEST_DIR.mkdir(exist_ok=True, parents=True)

def check_tesseract_version():
    """Check if Tesseract is installed and get its version."""
    try:
        version = pytesseract.get_tesseract_version()
        print(f"✅ Tesseract is installed. Version: {version}")
        return True
    except Exception as e:
        print(f"❌ Error getting Tesseract version: {e}")
        return False

def run_shell_command(command):
    """Run a shell command and return output."""
    try:
        result = subprocess.run(command, shell=True, check=True,
                               capture_output=True, text=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"❌ Command failed: {e}")
        print(f"Error output: {e.stderr}")
        return None

def check_tesseract_path():
    """Check the Tesseract executable path."""
    try:
        # Try to get path from pytesseract
        path = pytesseract.pytesseract.tesseract_cmd
        print(f"Tesseract path from pytesseract: {path}")

        # Check if file exists
        if os.path.isfile(path):
            print(f"✅ Tesseract executable exists at: {path}")
        else:
            print(f"❌ Tesseract executable not found at: {path}")

        # Try to find tesseract with 'which' command
        which_result = run_shell_command("which tesseract")
        if which_result:
            print(f"✅ Tesseract found in PATH: {which_result}")

        return True
    except Exception as e:
        print(f"❌ Error checking Tesseract path: {e}")
        return False

def create_test_image():
    """Create a test image with text to check OCR."""
    # Create a new image with white background
    width, height = 400, 200
    image = Image.new('RGB', (width, height), color='white')
    draw = ImageDraw.Draw(image)

    # Try to use a font
    try:
        font = ImageFont.truetype("Arial", 24)
    except IOError:
        font = ImageFont.load_default()

    # Draw some text
    draw.text((50, 50), "Testing Tesseract OCR", fill='black', font=font)
    draw.text((50, 100), "Player1 Rank: 1,234", fill='black', font=font)

    # Save the image
    test_image_path = TEST_DIR / "test_image.png"
    image.save(test_image_path)
    print(f"Created test image at: {test_image_path}")

    return test_image_path

def test_ocr_on_image(image_path):
    """Test OCR on the given image."""
    try:
        # Open the image with PIL
        image = Image.open(image_path)

        # Perform OCR
        text = pytesseract.image_to_string(image)

        # Print the results
        print("\nOCR Results:")
        print("-" * 40)
        print(text)
        print("-" * 40)

        # Check if the text contains expected words
        expected_words = ["Testing", "Tesseract", "OCR", "Player1", "Rank"]
        found_words = [word for word in expected_words if word in text]

        if len(found_words) > 0:
            print(f"✅ Found {len(found_words)}/{len(expected_words)} expected words.")
        else:
            print("❌ No expected words were found in the OCR result.")

        # Try with different configs
        configs = [
            "--psm 3",  # Auto page segmentation
            "--psm 6",  # Assume a single uniform block of text
            "--psm 7",  # Treat the image as a single text line
        ]

        for config in configs:
            text = pytesseract.image_to_string(image, config=config)
            print(f"\nOCR with {config}:")
            print("-" * 40)
            print(text)
            print("-" * 40)

        return True
    except Exception as e:
        print(f"❌ Error testing OCR: {e}")
        return False

def save_supported_languages():
    """Save list of supported OCR languages."""
    try:
        # Get list of supported languages
        langs = pytesseract.get_languages()

        print("\nSupported languages:")
        for lang in langs:
            print(f" - {lang}")

        return True
    except Exception as e:
        print(f"❌ Error getting supported languages: {e}")
        return False

def main():
    print("=" * 60)
    print("TESSERACT OCR DIAGNOSTIC TOOL")
    print("=" * 60)

    # Check tesseract version
    if not check_tesseract_version():
        print("\nTesseract version check failed. Please make sure Tesseract is installed.")
        print("On macOS: brew install tesseract")
        print("On Ubuntu: apt-get install tesseract-ocr")
        return 1

    # Check tesseract path
    check_tesseract_path()

    # Create test image
    test_image_path = create_test_image()

    # Test OCR on the image
    if not test_ocr_on_image(test_image_path):
        print("\nOCR test failed. Please check Tesseract installation.")
        return 1

    # Check supported languages
    save_supported_languages()

    print("\n" + "=" * 60)
    print("TESSERACT OCR CHECK COMPLETE")
    print("=" * 60)

    return 0

if __name__ == "__main__":
    sys.exit(main())
