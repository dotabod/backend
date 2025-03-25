#!/bin/bash
# Simple test script to verify streamlink and frame capture functionality

# Set script directory
SCRIPT_DIR=$(dirname "$(readlink -f "$0" 2>/dev/null || readlink "$0" 2>/dev/null || echo "$0")")
cd "$SCRIPT_DIR" || exit

# Activate the virtual environment if it exists
if [ -d "venv" ]; then
  source venv/bin/activate
fi

# Check if username is provided
if [ $# -lt 1 ]; then
  echo "Usage: $0 <twitch_username>"
  echo "Example: $0 arteezy"
  exit 1
fi

# Check if streamlink is available
if ! python -c "import streamlink" &>/dev/null; then
  echo "Error: streamlink module is not installed or not found."
  echo "Please run './install-deps.sh' to install all dependencies."
  exit 1
fi

USERNAME="$1"

# Create a simple test script
cat >test_capture.py <<'EOF'
import sys
import os
from pathlib import Path

# Add the src directory to the path
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
sys.path.append(str(src_dir))

# Import stream utilities
try:
    from src.stream_utils import capture_frame_from_stream
except ImportError:
    try:
        from stream_utils import capture_frame_from_stream
    except ImportError:
        print("Error: Could not import stream_utils. Make sure the file exists in the src directory.")
        sys.exit(1)

def test_capture():
    if len(sys.argv) < 2:
        print("Usage: python test_capture.py <twitch_username>")
        sys.exit(1)

    username = sys.argv[1]
    print(f"Attempting to capture a frame from {username}'s stream...")

    try:
        frame_path = capture_frame_from_stream(username)
        if frame_path:
            print(f"✓ Success! Frame captured and saved to: {frame_path}")
            print(f"  You can view it with: open {frame_path}")
        else:
            print("✗ Failed to capture a frame from the stream")
    except Exception as e:
        print(f"✗ Error during capture: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_capture()
EOF

# Run the test
echo "Testing stream frame capture for $USERNAME..."
python test_capture.py "$USERNAME"

# Cleanup
rm test_capture.py
