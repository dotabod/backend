#!/bin/bash

# Script to set up the Twitch Clip Processor

echo "Setting up Twitch Clip Processor..."

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  echo "Detected macOS"

  # Check if Homebrew is installed
  if ! command -v brew &>/dev/null; then
    echo "Homebrew not found. Please install Homebrew first:"
    echo "https://brew.sh/"
    exit 1
  fi

  # Check if Tesseract is installed
  if ! command -v tesseract &>/dev/null; then
    echo "Installing Tesseract OCR with Homebrew..."
    brew install tesseract
  else
    echo "Tesseract OCR already installed"
  fi

elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Linux
  echo "Detected Linux"

  # Check for apt (Debian/Ubuntu)
  if command -v apt-get &>/dev/null; then
    echo "Installing Tesseract OCR with apt..."
    sudo apt-get update
    sudo apt-get install -y tesseract-ocr
  # Check for yum (Red Hat/CentOS/Fedora)
  elif command -v yum &>/dev/null; then
    echo "Installing Tesseract OCR with yum..."
    sudo yum install -y tesseract
  else
    echo "Unsupported Linux distribution. Please install Tesseract OCR manually."
    echo "See: https://tesseract-ocr.github.io/tessdoc/Installation.html"
  fi

elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  # Windows
  echo "Detected Windows"
  echo "Please install Tesseract OCR manually from:"
  echo "https://github.com/UB-Mannheim/tesseract/wiki"
  echo "And make sure it's in your PATH environment variable"

else
  echo "Unsupported operating system: $OSTYPE"
  echo "Please install Tesseract OCR manually"
  echo "See: https://tesseract-ocr.github.io/tessdoc/Installation.html"
fi

# Create virtual environment
echo "Creating Python virtual environment..."
python3 -m venv venv

# Activate virtual environment
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  # Windows
  source venv/Scripts/activate
else
  # Unix-like
  source venv/bin/activate
fi

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p temp assets

echo ""
echo "Installation complete!"
echo ""
echo "To use the clip processor:"
echo "1. Activate the virtual environment:"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  echo "   source venv/Scripts/activate"
else
  echo "   source venv/bin/activate"
fi
echo "2. Run the processor:"
echo "   python src/main.py \"clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi\""
echo ""
echo "For more options:"
echo "python src/main.py --help"
echo ""
