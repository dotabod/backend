#!/bin/bash
# Shell script to setup and run the Dota 2 Hero Detection API locally

# Get the script directory in a cross-platform way
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  # Linux and others with readlink -f support
  SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
fi
cd "$SCRIPT_DIR" || exit

# Run the dependency installation script
if [ ! -f "./install-deps.sh" ]; then
  echo "Error: install-deps.sh not found!"
  exit 1
fi

echo "Installing dependencies..."
bash ./install-deps.sh

# Ensure virtual environment is activated
source venv/bin/activate

# Install the package in development mode
pip install --index-url https://pypi.org/simple/ -e .

# Create necessary directories
mkdir -p temp assets

# Check if hero assets exist
if [ ! -d "assets/dota_heroes" ] || [ -z "$(ls -A assets/dota_heroes 2>/dev/null)" ]; then
  echo "Downloading hero reference images..."
  python -m src.dota_heroes
fi

# Run the server (development mode)
echo "Starting API server in development mode..."
# The app will be initialized during startup in the main() function
python -m src.api_server

# Alternative: To run with Gunicorn instead (production-like), uncomment:
# echo "Starting API server with Gunicorn..."
# gunicorn --bind 0.0.0.0:5000 --workers 1 --threads 4 --timeout 300 src.api_server:app
