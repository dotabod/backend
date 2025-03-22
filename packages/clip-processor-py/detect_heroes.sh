#!/bin/bash
# Simple script to run hero detection on a Twitch clip

# Activate virtual environment if it exists
if [ -d "venv" ]; then
  source venv/bin/activate
fi

# Check if a clip URL was provided
if [ -z "$1" ]; then
  echo "Usage: $0 <clip_url> [options]"
  echo "Example: $0 https://clips.twitch.tv/ExampleClip [--debug]"
  echo "Options:"
  echo "  --debug                Enable debug mode with image saving"
  echo "  --output, -o FILE      Set output file (default: hero_results.json)"
  echo "  --frame-interval N     Set interval between frames in seconds (default: 0.5)"
  echo "  --left-crop N          Set left crop value in pixels (default: 205)"
  echo "  --right-crop N         Set right crop value in pixels (default: 205)"
  echo "  --no-crop              Disable cropping (equivalent to --left-crop 0 --right-crop 0)"
  exit 1
fi

CLIP_URL="$1"
shift # Remove the first argument

# Default options
DEBUG=""
OUTPUT="hero_results.json"
FRAME_INTERVAL="0.5" # Use a smaller default interval (0.5s) to get more frames
LEFT_CROP="205"      # Default left crop
RIGHT_CROP="205"     # Default right crop

# Parse additional options
while [[ $# -gt 0 ]]; do
  case "$1" in
  --debug)
    DEBUG="--debug"
    shift
    ;;
  --output | -o)
    OUTPUT="$2"
    shift 2
    ;;
  --frame-interval)
    FRAME_INTERVAL="$2"
    shift 2
    ;;
  --left-crop)
    LEFT_CROP="$2"
    shift 2
    ;;
  --right-crop)
    RIGHT_CROP="$2"
    shift 2
    ;;
  --no-crop)
    LEFT_CROP="0"
    RIGHT_CROP="0"
    shift
    ;;
  *)
    echo "Unknown option: $1"
    exit 1
    ;;
  esac
done

# Display crop settings
if [ "$LEFT_CROP" != "0" ] || [ "$RIGHT_CROP" != "0" ]; then
  echo "Using crop values: left=$LEFT_CROP px, right=$RIGHT_CROP px"
else
  echo "Cropping disabled"
fi

# Enable debug mode
if [ ! -z "$DEBUG" ]; then
  export DEBUG_IMAGES=1
  echo "Debug mode enabled - debug images will be saved to temp/debug/"
fi

# Run the script with heroes-only mode
echo "Detecting heroes in clip: $CLIP_URL"
echo "Using frame interval: ${FRAME_INTERVAL}s"
python src/main.py "$CLIP_URL" --heroes-only --frame-interval "$FRAME_INTERVAL" --output "$OUTPUT" --left-crop "$LEFT_CROP" --right-crop "$RIGHT_CROP" $DEBUG

# Check if successful
if [ $? -eq 0 ]; then
  echo "Hero detection complete. Results saved to $OUTPUT"
  # If jq is installed, display a formatted version of the results
  if command -v jq &>/dev/null; then
    echo "Results summary:"
    jq '.heroes | sort_by(.team, .position) | .[] | "\(.team) #\(.position+1): \(.hero_localized_name) (\(.match_score | tostring | .[0:4]))"' "$OUTPUT" -r
  else
    echo "Install jq for prettier output: brew install jq"
  fi
else
  echo "Hero detection failed. No heroes found in the clip."

  # If debug mode is on and it failed, suggest trying different settings
  if [ ! -z "$DEBUG" ]; then
    echo ""
    echo "TIPS for troubleshooting:"
    echo "1. Try using a smaller frame interval for short clips:"
    echo "   $0 $CLIP_URL --frame-interval 0.2 $DEBUG"
    echo "2. Try with different crop values:"
    echo "   $0 $CLIP_URL --left-crop 100 --right-crop 100 $DEBUG"
    echo "3. Try disabling cropping entirely:"
    echo "   $0 $CLIP_URL --no-crop $DEBUG"
  fi

  exit 1
fi
