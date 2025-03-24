# Twitch Clip Processor (Python)

This Python tool processes a Twitch clip to extract player names and ranks from a game lobby screen. It can also identify Dota 2 heroes from the top bar of the game interface using template matching.

## Features

- Downloads Twitch clips using the clip URL
- Extracts frames from the clip at regular intervals
- Uses computer vision to find frames containing player cards
- Processes player cards to extract names and ranks
- Detects Dota 2 heroes in the game interface using template matching
- Automatically downloads hero images from the Dota 2 API
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

### Only detect heroes (skip player detection):

```bash
python src/main.py --clip-url "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi" --heroes-only
```

### Run hero detection directly:

```bash
python src/dota_hero_detection.py "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi" --debug
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

This service processes Twitch clips and identifies Dota 2 heroes in the game interface using computer vision techniques.

## API Usage

The service provides a simple REST API to process Twitch clips and return hero detection results.

### Endpoints

#### GET /detect

Process a Twitch clip URL and return hero detection results.

**Query Parameters:**
- `url`: The Twitch clip URL to process (required)
- `debug`: Enable debug mode (optional, default=false)

**Example Request:**
```
GET /detect?url=https://clips.twitch.tv/SampleClipURL
```

**Example Response:**
```json
{
  "heroes": [
    {
      "hero_id": 1,
      "hero_localized_name": "Anti-Mage",
      "match_score": 0.92,
      "position": 0,
      "team": "Radiant",
      "variant": "default"
    },
    ...
  ],
  "players": [
    {
      "hero": "Anti-Mage",
      "hero_id": 1,
      "position": 1,
      "team": "Radiant"
    },
    ...
  ],
  "color_match_score": 0.8,
  "detected_colors": {...},
  "best_frame_index": 5,
  "best_frame_path": "temp/frame_5.jpg",
  "rank_banners_extracted": true,
  "player_names_extracted": true,
  "timing": {
    "total_processing_time": 5.234,
    "detailed_timings": {...}
  }
}
```

#### GET /health

Simple health check endpoint.

**Example Request:**
```
GET /health
```

**Example Response:**
```json
{
  "status": "ok",
  "service": "dota-hero-detection-api"
}
```

## Running the Service

### Using Docker Compose (Recommended)

1. Make sure you have Docker and Docker Compose installed
2. Clone this repository
3. Navigate to the project directory
4. Run the service:

```bash
docker-compose up -d
```

The API will be available at http://localhost:5000

### Without Docker

1. Install the required dependencies:

```bash
pip install -r requirements.txt
pip install flask gunicorn
```

2. Start the API server:

```bash
cd src
python api_server.py
```

### Command Line Usage

You can also use the script directly from the command line:

```bash
python dota_hero_detection.py "https://clips.twitch.tv/SampleClipURL" --json-only
```

## CLI Options

- `--debug`: Enable debug mode with verbose output and debug images
- `--json-only`: Only output JSON with no additional text (for API use)
- `--output/-o`: Output file path (default: heroes.json)
- `--min-score`: Minimum match score (0.0-1.0) to consider a hero identified (default: 0.4)
- `--debug-templates`: Save debug images of template matching results
- `--show-timings`: Show detailed performance timing information
