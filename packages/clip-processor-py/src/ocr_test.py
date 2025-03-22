#!/usr/bin/env python3
"""
Simple OCR test script for frames

This script performs OCR directly on frames without the complexity of card detection
to help diagnose why text extraction is failing.
"""

import os
import sys
import cv2
import pytesseract
import argparse
import logging
from pathlib import Path
from PIL import Image
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create debug directory
DEBUG_DIR = Path("temp/debug_ocr")
DEBUG_DIR.mkdir(exist_ok=True, parents=True)

def save_debug_image(image, name, directory=DEBUG_DIR):
    """Save an image for debugging purposes."""
    filepath = directory / f"{name}.jpg"
    cv2.imwrite(str(filepath), image)
    logger.info(f"Saved debug image: {filepath}")
    return filepath

def enhance_for_ocr(image):
    """Enhance an image for better OCR results."""
    # Convert to grayscale if needed
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    # Apply CLAHE for better contrast
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)

    # Apply thresholding
    _, binary = cv2.threshold(enhanced, 150, 255, cv2.THRESH_BINARY)

    return gray, enhanced, binary

def process_frame_with_ocr(image_path):
    """Process a frame with OCR and save debug images."""
    # Load the image
    logger.info(f"Processing image: {image_path}")
    original = cv2.imread(str(image_path))

    if original is None:
        logger.error(f"Failed to load image: {image_path}")
        return None

    # Save the original
    save_debug_image(original, "original")

    # Enhance for OCR
    gray, enhanced, binary = enhance_for_ocr(original)
    save_debug_image(gray, "gray")
    save_debug_image(enhanced, "enhanced")
    save_debug_image(binary, "binary")

    # Try different preprocessing methods for better results
    inverted = cv2.bitwise_not(binary)
    save_debug_image(inverted, "inverted")

    # Resize for better OCR (upscale by 2x)
    upscaled = cv2.resize(binary, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    save_debug_image(upscaled, "upscaled")

    # Process the image with different OCR configurations
    results = []

    # Regular OCR on enhanced image
    pil_enhanced = Image.fromarray(enhanced)
    text_enhanced = pytesseract.image_to_string(pil_enhanced)
    results.append(("Enhanced", text_enhanced))

    # OCR on binary image
    pil_binary = Image.fromarray(binary)
    text_binary = pytesseract.image_to_string(pil_binary)
    results.append(("Binary", text_binary))

    # OCR on inverted image
    pil_inverted = Image.fromarray(inverted)
    text_inverted = pytesseract.image_to_string(pil_inverted)
    results.append(("Inverted", text_inverted))

    # OCR on upscaled image
    pil_upscaled = Image.fromarray(upscaled)
    text_upscaled = pytesseract.image_to_string(pil_upscaled)
    results.append(("Upscaled", text_upscaled))

    # Try different tesseract configurations
    psm_configs = [
        ("Single Line", "--psm 7"),
        ("Single Word", "--psm 8"),
        ("Single Char", "--psm 10"),
        ("Sparse Text", "--psm 11"),
        ("Auto", "--psm 3")
    ]

    for name, config in psm_configs:
        text = pytesseract.image_to_string(pil_binary, config=config)
        results.append((f"PSM {name}", text))

    # Create a visual result with text overlays
    results_image = np.zeros((len(results) * 50 + 100, 800, 3), dtype=np.uint8)
    cv2.putText(results_image, f"OCR Results for {Path(image_path).name}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

    for i, (method, text) in enumerate(results):
        y_pos = 80 + i * 50
        cv2.putText(results_image, f"{method}: {text.strip()[:60]}", (10, y_pos),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 1)

    save_debug_image(results_image, "ocr_results")

    # Return the results
    return results

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description="Test OCR on frames")
    parser.add_argument("image_path", help="Path to the image or directory to process")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")

    args = parser.parse_args()

    # Set log level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Check if path is a directory or file
    path = Path(args.image_path)

    if path.is_dir():
        # Process all jpg files in directory
        image_files = list(path.glob("*.jpg"))
        logger.info(f"Found {len(image_files)} images to process")

        for image_file in image_files:
            process_frame_with_ocr(image_file)
    else:
        # Process single file
        process_frame_with_ocr(path)

    logger.info(f"OCR processing complete. Results saved to {DEBUG_DIR}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
