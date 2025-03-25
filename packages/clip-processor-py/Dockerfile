FROM python:3.9-slim

# Install system dependencies including tesseract-ocr
RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  tesseract-ocr \
  libgl1-mesa-glx \
  libglib2.0-0 \
  postgresql-client \
  libpq-dev \
  gcc \
  python3-dev \
  && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and setup files
COPY setup.py requirements.txt ./

# Copy the src directory first for proper installation
COPY src/ ./src/

# Install dependencies with the src directory available
RUN pip install --no-cache-dir -e .

# Copy the rest of the application code
COPY . ./

# Create necessary directories (if they don't already exist)
RUN mkdir -p temp assets

# Create a simple entrypoint script
RUN echo '#!/bin/bash\n\
  # Check if hero assets exist and download if needed\n\
  if [ ! -d "assets/dota_heroes" ] || [ -z "$(ls -A assets/dota_heroes 2>/dev/null)" ]; then\n\
  echo "Downloading hero reference images..."\n\
  python -m src.dota_heroes\n\
  fi\n\
  \n\
  # Print diagnostic information to help with debugging\n\
  echo "Debugging environment information:"\n\
  echo "Current directory: $(pwd)"\n\
  echo "Files in current directory: $(ls -la)"\n\
  echo "Python path: $PYTHONPATH"\n\
  echo "Python version: $(python --version)"\n\
  echo "Testing imports..."\n\
  python -c "import sys; print(sys.path)"\n\
  python -c "import src.clip_utils; print(\"clip_utils imported successfully\")"\n\
  \n\
  # Preload hero templates\n\
  echo "Preloading hero templates to cache..."\n\
  python -c "from src.dota_hero_detection import load_heroes_data; load_heroes_data()"\n\
  \n\
  # Start the Gunicorn server with a single worker to ensure queue system works properly\n\
  exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 4 --timeout 300 src.api_server:app\n\
  ' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Expose the port the app runs on
EXPOSE 5000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app:/app/src
ENV PORT=5000
ENV MAX_CONCURRENT_WORKERS=1
ENV QUEUE_POLLING_INTERVAL=1

# Run the entrypoint script
CMD ["/app/entrypoint.sh"]
