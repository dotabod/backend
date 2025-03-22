#!/bin/bash

# This script runs the main.py script with debug logging and image saving enabled

# Create the debug directory if it doesn't exist
mkdir -p temp/debug

# Clean up old debug images to avoid clutter
echo "Cleaning up old debug images..."
rm -f temp/debug/*.jpg

# Enable debug image saving
export DEBUG_IMAGES=true

# Run the main script with debug logging
echo "Running clip processor with debug mode enabled..."
source venv/bin/activate
python src/main.py --debug "$@"

echo ""
echo "Debug images have been saved to temp/debug directory"
echo "Check the debug images to see why player card detection might be failing"
