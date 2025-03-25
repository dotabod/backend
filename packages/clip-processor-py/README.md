# Twitch Clip Processor (Python)

This Python tool processes a Twitch clip to extract player names and ranks from a game lobby screen. It can also identify Dota 2 heroes from the top bar of the game interface using template matching.

## Features

- Downloads Twitch clips using the clip URL
- Extracts frames from the clip at regular intervals
- Uses computer vision to find frames containing player cards
- Processes player cards to extract names and ranks
- Detects Dota 2 heroes in the game interface using template matching
- Automatically downloads hero images from the Dota 2 API
- Captures frames from live Twitch streams for real-time hero detection
- Saves results to a JSON file

## Requirements

- Python 3.7+
- OpenCV
- Tesseract OCR
- Other dependencies listed in `requirements.txt`

## Installation

### 1. Install Dependencies

First, ensure you have Python 3.7+ installed. Then install Tesseract OCR:

**On macOS:**
```bash
brew install tesseract
```

**On Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr
```

**On Windows:**
- Download and install the [Tesseract installer](https://github.com/UB-Mannheim/tesseract/wiki)
- Add Tesseract to your PATH environment variable

### 2. Install the Python Package

```bash
# Use the install script which handles all setup
./install.sh

# Or manually:
# Create and activate a virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install required Python packages
pip install -r requirements.txt

# Create necessary directories
mkdir -p temp assets
```

## Usage

### Process a specific clip:

```bash
python src/main.py --clip-url "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi"
```

### Detect Dota 2 heroes in a clip:

```bash
python src/main.py --clip-url "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi" --detect-heroes
```

### Detect Dota 2 heroes from a live Twitch stream:

```bash
python src/dota_hero_detection.py --stream "twitchusername" --debug
```

### Only detect heroes (skip player detection):

```bash
python src/main.py --clip-url "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi" --heroes-only
```

### Run hero detection directly:

```bash
python src/dota_hero_detection.py "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi" --debug
```

### Run stream hero detection directly:

```bash
python src/dota_hero_detection.py --stream "twitchusername" --debug
```

### Debug mode with image saving:

```bash
# Use the debug script
./debug_run.sh "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi"

# Or with OCR-specific debug
./ocr_run.sh "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi"
```

### Run player extraction on a specific image:

```bash
./extract_players.sh path/to/image.jpg
```

### Hero Reference Management

To download and manage hero reference images for hero detection:

```bash
# Download hero reference images
./download_heroes.sh

# Force re-download (overwrites existing)
./download_heroes.sh --force

# Extract a hero from a game image
python src/hero_reference.py extract path/to/image.jpg 1  # Position 1-10
```

### Additional options:

```bash
python src/main.py --help
```

This will show all available options:

```
usage: main.py [-h] [--frame-interval FRAME_INTERVAL] [--debug] [--save-frames] [--output OUTPUT] [--detect-heroes] [--heroes-only] [clip_url]

Process a Twitch clip to extract player info

positional arguments:
  clip_url              URL of the Twitch clip (default: clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi)

optional arguments:
  -h, --help            show this help message and exit
  --frame-interval FRAME_INTERVAL
                        Interval between frames in seconds (default: 0.5)
  --debug               Enable debug logging
  --save-frames         Keep extracted frames after processing
  --output OUTPUT, -o OUTPUT
                        Output file path (default: results.json)
  --detect-heroes       Detect Dota 2 heroes in the clip
  --heroes-only         Only detect heroes, skip player card detection
```

## Improving Accuracy

### Player Detection

The tool uses two approaches to extract player information:

1. **Top Bar Extractor**: Analyzes the top bar of the game interface to extract player cells
2. **Traditional OCR**: Fallback method using general text extraction and pattern matching

For best results:

- Ensure the clip shows the game interface clearly
- The top bar should be fully visible with player names and ranks
- Good lighting and minimal visual effects improve OCR accuracy

### Hero Detection

The hero detection feature uses template matching to identify Dota 2 heroes in the top bar of the game interface. To improve hero detection:

1. The system automatically downloads hero images from the Dota 2 API when first run. You can manually trigger this by running:
   ```bash
   python src/dota_heroes.py
   ```

2. For best results, use clips with clear visibility of the top bar. The detection works best when:
   - The top bar is clearly visible
   - There are no overlays or effects obscuring the hero portraits
   - The stream quality is good (720p or higher)

3. If you encounter detection issues, try using the debug mode to see what's happening:
   ```bash
   python src/dota_hero_detection.py "your-clip-url" --debug
   ```
   This will save debug images to the `temp/debug` directory, showing the detection process.

## Output

The script outputs a JSON file (default: `results.json`) with the extracted information:

```json
{
  "timestamp": "2023-04-12T15:30:45.123Z",
  "clip_url": "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi",
  "heroes": [
    {
      "team": "Radiant",
      "position": 0,
      "hero_id": 1,
      "hero_name": "npc_dota_hero_antimage",
      "hero_localized_name": "Anti-Mage",
      "match_score": 0.834
    },
    {
      "team": "Radiant",
      "position": 1,
      "hero_id": 2,
      "hero_name": "npc_dota_hero_axe",
      "hero_localized_name": "Axe",
      "match_score": 0.912
    },
    // ... more heroes ...
  ],
  "players": [
    {
      "position": 1,
      "name": "Player1",
      "rank": "4127",
      "hero": "spectre"
    },
    // ... more players ...
  ]
}
```

## Architecture

The project consists of several main components:

- `main.py`: Primary script for clip processing, coordinating both player and hero detection
- `dota_heroes.py`: Handles downloading and management of Dota 2 hero images
- `dota_hero_detection.py`: Implements template matching to detect heroes in the top bar
- `image_processing.py`: Processes frames to find player cards
- `clip_utils.py`: Handles clip downloading and frame extraction
- Various shell scripts (`*.sh`) for convenient execution of common tasks

## Limitations

- OCR accuracy depends on image quality and text clarity
- The script may need adjustments for different game interfaces or resolutions
- Tesseract OCR performance varies across platforms
- Hero detection requires good reference images and is sensitive to in-game visual effects

# Dota 2 Hero Detection API

This service provides a REST API for detecting Dota 2 heroes in Twitch clips and streams.

## Features

- Detect Dota 2 heroes in Twitch clips or live streams
- Process requests asynchronously using a queue system
- Cache results for faster repeated access
- Track processing time for better estimation of queue wait times
- Provide frame image URLs for heroes detected

## API Endpoints

### `/detect` - Process a Twitch clip

Detect heroes in a Twitch clip specified by URL or clip ID.

#### Parameters:
- `url`: The Twitch clip URL (required if `clip_id` not provided)
- `clip_id`: The Twitch clip ID (required if `url` not provided)
- `debug`: Enable debug mode (optional, default=false)
- `force`: Force reprocessing even if cached (optional, default=false)
- `include_image`: Include frame image URL in response (optional, default=true)
- `queue`: Use queue system (optional, default=true)

#### Response (when queued):
```json
{
  "queued": true,
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "position": 3,
  "estimated_wait_seconds": 45,
  "estimated_completion_time": "2023-12-01T15:30:45.123456",
  "message": "Your request has been queued for processing"
}
```

#### Response (when completed):
```json
{
  "detected_heroes": ["axe", "crystal_maiden", "pudge"],
  "processing_time": "5.23s",
  "frame_image_url": "http://localhost:5000/images/clip_id_20231201153045.jpg",
  "best_frame_info": {
    "frame_number": 120,
    "timestamp": "0:05"
  }
}
```

### `/detect-stream` - Process a Twitch stream

Detect heroes in a live Twitch stream by username.

#### Parameters:
- `username`: The Twitch username of the streamer (required)
- `frames`: Number of frames to capture and analyze (optional, default=3)
- `debug`: Enable debug mode (optional, default=false)
- `include_image`: Include frame image URL in response (optional, default=false)
- `queue`: Use queue system (optional, default=true)

### `/queue/status/{request_id}` - Check queue status

Check the status of a queued request by its ID.

#### Response:
```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "position": 0,
  "created_at": "2023-12-01T15:29:45.123456",
  "started_at": "2023-12-01T15:30:45.123456",
  "completed_at": "2023-12-01T15:31:05.123456",
  "result_id": "clip_id",
  "result": {
    "detected_heroes": ["axe", "crystal_maiden", "pudge"],
    "processing_time": "5.23s"
  }
}
```

## Queue System

The service implements a queue system to handle multiple requests in order and prevent overloading the server. Only one request is processed at a time, which is essential for optimal hero detection performance.

### How it works:

1. When a request is received, it's added to the queue database with a unique `request_id`
2. The system calculates estimated wait time based on:
   - Current position in queue
   - Average processing time of previous requests
3. The client receives immediate feedback with queue position and estimated completion time
4. A worker thread processes requests one at a time in order of submission
5. Clients can poll the `/queue/status/{request_id}` endpoint to check progress

### Why we queue requests:

- Hero detection is resource-intensive and benefits from dedicated resources
- Prevents server overload during high traffic periods
- Provides more accurate and reliable results
- Allows for better estimation of processing times

## Configuration

The service can be configured using environment variables:

- `PORT`: The port to run the server on (default: 5000)
- `DATABASE_URL`: PostgreSQL connection string (default: postgresql://postgres:postgres@localhost:5432/clip_processor)
- `MAX_CONCURRENT_WORKERS`: Maximum number of concurrent processing workers (default: 1)
- `QUEUE_POLLING_INTERVAL`: Interval to check for new items in the queue (seconds, default: 1)

## Development

### Prerequisites
- Python 3.9+
- PostgreSQL
- Tesseract OCR

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   pip install -e .
   ```
3. Run PostgreSQL (using Docker):
   ```
   docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=clip_processor postgres:14
   ```
4. Start the server:
   ```
   python -m src.api_server
   ```

### Running with Docker Compose

```
docker-compose up -d
```
