#!/bin/bash

# Stream Processor Service Launcher
# This script helps to start and manage the stream processor service

# Directory paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/src"
CONFIG_DIR="$SCRIPT_DIR/config"
LOGS_DIR="$SCRIPT_DIR/logs"
TEMP_DIR="$SCRIPT_DIR/temp"

# Create necessary directories
mkdir -p "$CONFIG_DIR" "$LOGS_DIR" "$TEMP_DIR"

# Set Python path
export PYTHONPATH="$SCRIPT_DIR:$PYTHONPATH"

# Default settings
HOST="0.0.0.0"
PORT=5000
INTERVAL=3
MAX_CONCURRENT=100
QUALITY="720p"
STREAMS_FILE=""
DEBUG=0
API_PID=""

# Function to show usage
function show_usage {
  echo "Usage: $0 [options]"
  echo "Options:"
  echo "  -h, --host HOST           Host to bind to (default: $HOST)"
  echo "  -p, --port PORT           Port to bind to (default: $PORT)"
  echo "  -i, --interval SECONDS    Seconds between frame captures (default: $INTERVAL)"
  echo "  -m, --max-concurrent NUM  Maximum concurrent streams (default: $MAX_CONCURRENT)"
  echo "  -q, --quality QUALITY     Stream quality (default: $QUALITY)"
  echo "  -f, --streams-file FILE   Path to file containing usernames (one per line)"
  echo "  -d, --debug               Enable debug mode"
  echo "  --help                    Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 -i 5                   # Capture frames every 5 seconds"
  echo "  $0 -f streamers.txt       # Load streamers from a file"
  echo "  $0 -q 480p                # Use lower quality to save bandwidth"
  echo ""
}

# Function to clean up and terminate
function cleanup {
  echo "Shutting down Stream Processor API..."
  if [ -n "$API_PID" ]; then
    kill $API_PID 2>/dev/null
  fi
  exit 0
}

# Function to check and install system dependencies
function check_system_dependencies {
  # Check if we're on a Debian/Ubuntu system
  if command -v apt-get &>/dev/null; then
    # Check for required OpenCV system libraries
    if ! ldconfig -p | grep -q libGL.so.1; then
      echo "Installing OpenCV system dependencies..."
      sudo apt-get update
      sudo apt-get install -y libgl1-mesa-glx libglib2.0-0 libsm6 libxrender1 libxext6
    fi
  # Check if we're on a RHEL/Fedora system
  elif command -v yum &>/dev/null; then
    if ! ldconfig -p | grep -q libGL.so.1; then
      echo "Installing OpenCV system dependencies..."
      sudo yum install -y mesa-libGL.x86_64 mesa-libGL.i686
    fi
  fi
}

# Set up trap to catch signals
trap cleanup SIGINT SIGTERM SIGHUP EXIT

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
  -h | --host)
    HOST="$2"
    shift 2
    ;;
  -p | --port)
    PORT="$2"
    shift 2
    ;;
  -i | --interval)
    INTERVAL="$2"
    shift 2
    ;;
  -m | --max-concurrent)
    MAX_CONCURRENT="$2"
    shift 2
    ;;
  -q | --quality)
    QUALITY="$2"
    shift 2
    ;;
  -f | --streams-file)
    STREAMS_FILE="$2"
    shift 2
    ;;
  -d | --debug)
    DEBUG=1
    shift
    ;;
  --help)
    show_usage
    exit 0
    ;;
  *)
    echo "Unknown option: $1"
    show_usage
    exit 1
    ;;
  esac
done

# Check for virtual environment
if [ -d "$SCRIPT_DIR/venv" ]; then
  echo "Activating virtual environment..."
  source "$SCRIPT_DIR/venv/bin/activate"
fi

# Check and install system dependencies
check_system_dependencies

# Make sure required packages are installed
if ! python3 -c "import flask, waitress, streamlink, cv2" &>/dev/null; then
  echo "Installing required packages..."
  pip install -r "$SCRIPT_DIR/requirements.txt"
fi

# Create initial configuration if needed
if [ ! -f "$CONFIG_DIR/stream_processor.json" ]; then
  echo "Creating initial configuration..."
  mkdir -p "$CONFIG_DIR"
  cat >"$CONFIG_DIR/stream_processor.json" <<EOF
{
    "capture_interval": $INTERVAL,
    "max_concurrent": $MAX_CONCURRENT,
    "quality": "$QUALITY",
    "streams": {}
}
EOF
fi

# Check for streams file and load it into configuration
if [ -n "$STREAMS_FILE" ] && [ -f "$STREAMS_FILE" ]; then
  echo "Processing streams file: $STREAMS_FILE"

  # Create a temporary list of streams for API request
  TEMP_JSON=$(mktemp)
  echo '{"streams":[' >"$TEMP_JSON"

  # Read streams from file and add to JSON
  FIRST=true
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    if [ -z "$line" ] || [[ "$line" == \#* ]]; then
      continue
    fi

    # Remove leading/trailing whitespace
    username=$(echo "$line" | xargs)

    # Skip if empty after trimming
    if [ -z "$username" ]; then
      continue
    fi

    # Add comma if not first entry
    if [ "$FIRST" = false ]; then
      echo "," >>"$TEMP_JSON"
    else
      FIRST=false
    fi

    # Add username to JSON
    echo "\"$username\"" >>"$TEMP_JSON"

  done <"$STREAMS_FILE"

  # Close JSON array
  echo ']}' >>"$TEMP_JSON"

  # Start API server first
  echo "Starting Stream Processor API..."
  (cd "$SRC_DIR" && python3 stream_api.py --host "$HOST" --port "$PORT" $([ "$DEBUG" -eq 1 ] && echo "--debug")) &
  API_PID=$!

  # Give it a moment to start
  sleep 3

  # Add streams via API
  echo "Adding streams from file..."
  curl -s -X POST -H "Content-Type: application/json" -d @"$TEMP_JSON" "http://localhost:$PORT/api/streams/bulk"

  # Cleanup
  rm "$TEMP_JSON"

  # Keep the API server running
  echo ""
  echo "Stream Processor running on http://$HOST:$PORT"
  echo "Press Ctrl+C to exit"
  wait $API_PID
else
  # Start API server
  echo "Starting Stream Processor API..."
  (cd "$SRC_DIR" && python3 stream_api.py --host "$HOST" --port "$PORT" $([ "$DEBUG" -eq 1 ] && echo "--debug")) &
  API_PID=$!

  echo ""
  echo "Stream Processor running on http://$HOST:$PORT"
  echo "Press Ctrl+C to exit"
  wait $API_PID
fi
