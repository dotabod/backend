#!/bin/bash

# Script to download Dota 2 hero images for detection

# Activate virtual environment
if [ -d "venv" ]; then
  echo "Activating virtual environment..."
  source venv/bin/activate
else
  echo "No virtual environment found, continuing without activation."
  echo "This may fail if dependencies are not installed globally."
fi

# Create assets directory if it doesn't exist
mkdir -p assets/heroes

# Run the hero downloader script with proper arguments
echo "Downloading Dota 2 hero images..."

# Check if --force flag is provided
if [ "$1" == "--force" ]; then
  echo "Forcing update of existing hero images..."
  python src/dota_heroes.py --force
else
  python src/dota_heroes.py
fi

echo ""
echo "Hero download complete!"
echo "Hero images are stored in assets/heroes/"
echo ""
echo "To process a clip with hero detection:"
echo "python src/main.py \"YOUR_CLIP_URL\" --detect-heroes"
echo ""
