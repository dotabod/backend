#!/bin/bash
# Script to install Tesseract language packages required for dota_hero_detection.py

echo "Installing Tesseract OCR language packages..."

# Check if Tesseract is installed
if ! command -v tesseract &>/dev/null; then
  echo "Tesseract is not installed. Please install it first."
  echo "  On macOS: brew install tesseract"
  echo "  On Debian/Ubuntu: sudo apt-get install tesseract-ocr"
  exit 1
fi

# Check operating system and install language packs
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  echo "Installing Tesseract language packs on macOS..."
  brew list tesseract-lang &>/dev/null || brew install tesseract-lang

  # Verify installation
  if brew list tesseract-lang &>/dev/null; then
    echo "✓ Tesseract language packs installed successfully!"
  else
    echo "✗ Failed to install Tesseract language packs."
    exit 1
  fi

elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Linux
  echo "Installing Tesseract language packs on Linux..."

  if command -v apt-get &>/dev/null; then
    # Debian/Ubuntu
    sudo apt-get update
    sudo apt-get install -y \
      tesseract-ocr-eng \
      tesseract-ocr-rus

  elif command -v yum &>/dev/null; then
    # RHEL/CentOS
    sudo yum install -y \
      tesseract-langpack-eng \
      tesseract-langpack-rus

  else
    echo "⚠️ Unsupported Linux distribution. Please install Tesseract language packs manually."
    exit 1
  fi

else
  echo "⚠️ Unsupported OS. Please install Tesseract language packs manually."
  exit 1
fi

# Verify available languages
echo "Verifying available Tesseract languages:"
tesseract --list-langs | cat

# Check if the required languages are installed
REQUIRED_LANGS=("eng" "chi_sim" "chi_tra" "rus" "kor" "jpn" "tha" "ara" "grc")
MISSING_LANGS=()

for LANG in "${REQUIRED_LANGS[@]}"; do
  if ! tesseract --list-langs | grep -q "$LANG"; then
    MISSING_LANGS+=("$LANG")
  fi
done

if [ ${#MISSING_LANGS[@]} -eq 0 ]; then
  echo "✓ All required language packs are installed successfully!"
else
  echo "⚠️ The following language packs are still missing:"
  for LANG in "${MISSING_LANGS[@]}"; do
    echo "  - $LANG"
  done
  echo "Please install them manually."
fi

echo "Done."
