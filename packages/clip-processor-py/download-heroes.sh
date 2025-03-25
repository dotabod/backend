#!/bin/bash
# Shell script to download hero reference images

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install requirements if needed
if ! pip show clip-processor &>/dev/null; then
  echo "Installing dependencies..."
  pip install --index-url https://pypi.org/simple/ -e .
fi

# Create necessary directories
mkdir -p assets

# Download hero reference images
echo "Downloading hero reference images..."
python -m src.dota_heroes

echo "Hero reference images downloaded successfully!"
