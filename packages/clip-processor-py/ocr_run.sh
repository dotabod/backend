#!/bin/bash

# This script runs the OCR-based version of the clip processor with debug output

# Create the OCR debug directory if it doesn't exist
mkdir -p temp/ocr_debug

# Clean up old debug images to avoid clutter
echo "Cleaning up old debug images..."
rm -f temp/ocr_debug/*.jpg

# Activate the virtual environment
source venv/bin/activate

# Run the OCR-based script with debug images and logging
echo "Running OCR-based clip processor..."
python src/main_ocr.py --debug --debug-images "$@"

echo ""
echo "Debug images have been saved to temp/ocr_debug directory"
echo "Check the debug images to see OCR results for each frame"
