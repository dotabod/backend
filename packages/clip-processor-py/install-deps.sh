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

# Check if Tesseract is installed and install language packs
echo "Checking Tesseract installation and language packs..."
if command -v tesseract &>/dev/null; then
  echo "✓ Tesseract is installed"

  # Check operating system
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "Installing Tesseract language packs on macOS..."
    brew list tesseract-lang &>/dev/null || brew install tesseract-lang
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    echo "Installing Tesseract language packs on Linux..."
    if command -v apt-get &>/dev/null; then
      # Debian/Ubuntu
      sudo apt-get update
      sudo apt-get install -y tesseract-ocr-eng tesseract-ocr-rus
    elif command -v yum &>/dev/null; then
      # RHEL/CentOS
      sudo yum install -y tesseract-langpack-rus
    else
      echo "⚠️ Unsupported Linux distribution. Please install Tesseract language packs manually."
    fi
  else
    echo "⚠️ Unsupported OS. Please install Tesseract language packs manually."
  fi

  # Verify available languages
  echo "Available Tesseract languages:"
  tesseract --list-langs | cat
else
  echo "✗ Tesseract is not installed. Please install it manually."
  echo "  On macOS: brew install tesseract tesseract-lang"
  echo "  On Debian/Ubuntu: sudo apt-get install tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim tesseract-ocr-chi-tra"
fi

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
