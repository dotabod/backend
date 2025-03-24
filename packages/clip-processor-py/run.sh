#!/bin/bash
# Shell script to setup and run the Dota 2 Hero Detection API locally

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install requirements
echo "Installing dependencies..."
pip install -e .

# Create necessary directories
mkdir -p temp assets

# Check if hero assets exist
if [ ! -d "assets/dota_heroes" ] || [ -z "$(ls -A assets/dota_heroes 2>/dev/null)" ]; then
  echo "Downloading hero reference images..."
  python -m src.dota_heroes
fi

# Run the server (development mode)
echo "Starting API server in development mode..."
python -m src.api_server

# To run with Gunicorn instead (production-like), uncomment:
# gunicorn --bind 0.0.0.0:5000 --workers 4 --timeout 120 src.api_server:app
