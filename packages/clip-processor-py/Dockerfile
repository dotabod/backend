FROM python:3.9-slim

# Install system dependencies including tesseract-ocr
RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  tesseract-ocr \
  libgl1-mesa-glx \
  libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and setup files
COPY setup.py requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir -e .

# Copy the application code
COPY src/ ./src/

# Create necessary directories
RUN mkdir -p temp assets

# Create a simple entrypoint script
RUN echo '#!/bin/bash\n\
  # Check if hero assets exist and download if needed\n\
  if [ ! -d "assets/dota_heroes" ] || [ -z "$(ls -A assets/dota_heroes 2>/dev/null)" ]; then\n\
  echo "Downloading hero reference images..."\n\
  python -m src.dota_heroes\n\
  fi\n\
  \n\
  # Start the Gunicorn server\n\
  exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 4 --timeout 120 src.api_server:app\n\
  ' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Expose the port the app runs on
EXPOSE 5000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV PORT=5000

# Run the entrypoint script
CMD ["/app/entrypoint.sh"]
