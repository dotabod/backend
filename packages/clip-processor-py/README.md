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

A Flask-based API service that processes Twitch clips to detect Dota 2 heroes in gameplay.

## Features

- Process Twitch clips to detect Dota 2 heroes
- Cache processing results using PocketBase
- Process live Twitch streams
- Debug mode for detailed processing information

## Setup

### Prerequisites

- Docker and Docker Compose
- Python 3.8+ (for local development)

### Running with Docker Compose

1. Clone the repository
2. Navigate to the project directory
3. Start the services:

```bash
docker-compose up -d
```

This will start two services:
- **clip-processor-api**: The main API service on port 5000
- **pocketbase**: Database for caching results on port 8080

### Local Development

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Run the API server:

```bash
python -m src.api_server
```

## API Endpoints

### Health Check

```
GET /health
```

Returns the health status of the API.

### Process Twitch Clip

```
GET /detect?url=CLIP_URL
```

or

```
GET /detect?clip_id=CLIP_ID
```

Parameters:
- `url`: The Twitch clip URL to process
- `clip_id`: The Twitch clip ID (alternative to URL)
- `debug` (optional): Set to "true" for detailed processing information
- `force` (optional): Set to "true" to force reprocessing even if cached

### Process Twitch Stream

```
GET /detect-stream?username=TWITCH_USERNAME
```

Parameters:
- `username`: The Twitch username of the streamer
- `frames` (optional): Number of frames to capture and analyze (default: 3, max: 10)
- `debug` (optional): Set to "true" for detailed processing information

## PocketBase Admin

Access the PocketBase admin interface at http://localhost:8080/_/ using:

- Email: admin@dota-hero-detection.local
- Password: adminpassword123

## Response Format

Successful response example:

```json
{
  "heroes": [
    {
      "hero_id": 1,
      "hero_name": "Anti-Mage",
      "confidence": 0.95,
      "position": "carry"
    },
    ...
  ],
  "clip_info": {
    "url": "https://clips.twitch.tv/example",
    "processed_at": "2023-06-15T12:34:56"
  },
  "debug_info": { ... }
}
```

Error response example:

```json
{
  "error": "Error message",
  "message": "Detailed error information",
  "trace": "Stack trace (only in debug mode)"
}
```
