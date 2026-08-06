FROM python:3.9-slim

# Install system dependencies including tesseract-ocr
RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  tesseract-ocr \
  tesseract-ocr-eng \
  tesseract-ocr-rus \
  curl \
  libgl1 \
  libglib2.0-0 \
  postgresql-client \
  libpq-dev \
  gcc \
  python3-dev \
  && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install third-party dependencies from the pinned list alone, before any source is
# copied in. This layer then only rebuilds when requirements.txt changes, so a
# source-only deploy reuses it instead of re-downloading ~40s of wheels (opencv alone is
# 42MB). Coolify has killed a build partway through that download.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Now the source and the editable install that links it. Every dependency is already
# satisfied above, so this resolves without hitting the network. Dependency resolution
# is deliberately left on rather than passing --no-deps: if setup.py ever gains a
# package that requirements.txt lacks, it gets installed here instead of going missing
# at runtime.
COPY setup.py ./
COPY src/ ./src/
RUN pip install --no-cache-dir -e .

# Copy the rest of the application code
COPY . ./

# Create necessary directories (if they don't already exist)
RUN mkdir -p temp assets

# Create a simple entrypoint script
RUN echo '#!/bin/bash\n\
  # Refresh hero assets on startup so newly released heroes become matchable.\n\
  echo "Refreshing hero reference images..."\n\
  python -m src.dota_heroes\n\
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
  # Start the Gunicorn server with a single worker to ensure queue system works properly\n\
  # The app will be initialized during startup through @app.before_first_request\n\
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
