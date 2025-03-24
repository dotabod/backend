FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  libgl1-mesa-glx \
  libglib2.0-0 \
  ffmpeg \
  wget \
  && rm -rf /var/lib/apt/lists/*

# Install Tesseract OCR (optional but recommended for player rank detection)
RUN apt-get update && apt-get install -y --no-install-recommends \
  tesseract-ocr \
  && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Add Flask to requirements
RUN pip install --no-cache-dir flask gunicorn

# Copy application code
COPY src/ ./src/
COPY assets/ ./assets/

# Create directories for temp files
RUN mkdir -p /app/temp /app/debug

# Set working directory to src
WORKDIR /app/src

# Set environment variables
ENV PYTHONPATH=/app:$PYTHONPATH
ENV PORT=5000

# Expose the API port
EXPOSE 5000

# Run the API service with Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "8", "api_server:app"]
