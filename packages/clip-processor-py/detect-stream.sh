#!/bin/bash
# Script to detect Dota 2 heroes from a live Twitch stream

# Set script directory
SCRIPT_DIR=$(dirname "$(readlink -f "$0" 2>/dev/null || readlink "$0" 2>/dev/null || echo "$0")")
cd "$SCRIPT_DIR" || exit

# Activate the virtual environment if it exists
if [ -d "venv" ]; then
  source venv/bin/activate
fi

# Check if username is provided
if [ $# -lt 1 ]; then
  echo "Usage: $0 <twitch_username> [frames] [output_file]"
  echo "Example: $0 dendi 5 heroes.json"
  exit 1
fi

# Check if streamlink is available
if ! python -c "import streamlink" &>/dev/null; then
  echo "Error: streamlink module is not installed or not found."
  echo "Would you like to install the dependencies now? (y/n)"
  read -r INSTALL
  if [[ "$INSTALL" =~ ^[Yy]$ ]]; then
    # Run the dependency installer
    ./install-deps.sh

    # Exit if installation failed
    if ! python -c "import streamlink" &>/dev/null; then
      echo "Error: Failed to install streamlink. Please install it manually."
      exit 1
    fi
  else
    echo "Please install streamlink before running this script."
    echo "You can run './install-deps.sh' to install all dependencies."
    exit 1
  fi
fi

# Get the username
USERNAME="$1"

# Get number of frames to capture (default: 3)
FRAMES=3
if [ $# -gt 1 ]; then
  FRAMES="$2"
fi

# Get the output file (default: heroes.json)
OUTPUT="heroes.json"
if [ $# -gt 2 ]; then
  OUTPUT="$3"
fi

# Run the script with stream detection enabled
echo "Detecting heroes from Twitch stream: $USERNAME (using $FRAMES frames)"
python src/dota_hero_detection.py --stream "$USERNAME" --frames "$FRAMES" --debug --output "$OUTPUT"

# Print result location
if [ $? -eq 0 ]; then
  echo "Results saved to $OUTPUT"
  echo "To view: cat $OUTPUT"
fi
