#!/bin/bash
# Install dependencies for clip-processor-py

# Get the script directory
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
cd "$SCRIPT_DIR" || exit

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install requirements
echo "Installing dependencies from requirements.txt..."
pip install --index-url https://pypi.org/simple/ -r requirements.txt

# Check if streamlink is installed correctly
echo "Checking streamlink installation..."
if python -c "import streamlink" &>/dev/null; then
  echo "✓ Streamlink installed successfully!"
  python -c "from streamlink import Streamlink; print(f'Streamlink version: {Streamlink.version}')"
else
  echo "✗ Failed to import streamlink. Installing directly..."
  pip install --index-url https://pypi.org/simple/ streamlink

  # Check again
  if python -c "import streamlink" &>/dev/null; then
    echo "✓ Streamlink now installed successfully!"
    python -c "from streamlink import Streamlink; print(f'Streamlink version: {Streamlink.version}')"
  else
    echo "✗ Still failed to install streamlink. Please install it manually with:"
    echo "  pip install --index-url https://pypi.org/simple/ streamlink"
  fi
fi

# Verify all dependencies
echo ""
echo "Checking all required dependencies..."
MODULES=("cv2" "numpy" "streamlink" "requests" "flask" "tqdm" "bs4")
ALL_GOOD=true

for MODULE in "${MODULES[@]}"; do
  if python -c "import $MODULE" &>/dev/null; then
    echo "✓ $MODULE is installed"
  else
    echo "✗ $MODULE is missing"
    ALL_GOOD=false
  fi
done

if $ALL_GOOD; then
  echo ""
  echo "All dependencies are installed successfully!"
  echo "You can now run the detect-stream.sh script with:"
  echo "./detect-stream.sh <twitch_username>"
else
  echo ""
  echo "Some dependencies are missing. Please check the errors above."
fi
