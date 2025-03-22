# Twitch Clip Processor (Python)

This Python tool processes a Twitch clip to extract player names and ranks from a game lobby screen. It downloads a Twitch clip, extracts frames, and then processes those frames to find player information.

## Features

- Downloads Twitch clips using the clip URL
- Extracts frames from the clip at regular intervals
- Uses computer vision to find frames containing player cards
- Processes player cards to extract names and ranks
- Extracts hero information from player portraits
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
python src/main_ocr.py --clip-url "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi"
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
python src/main_ocr.py --help
```

This will show all available options:

```
usage: main_ocr.py [-h] [--clip-url CLIP_URL] [--frames-dir FRAMES_DIR] [--debug] [--debug-images]

Process a Twitch clip for player information using OCR

optional arguments:
  -h, --help            show this help message and exit
  --clip-url CLIP_URL   URL of the Twitch clip to process
  --frames-dir FRAMES_DIR
                        Directory containing pre-extracted frames (skips clip download)
  --debug               Enable debug logging
  --debug-images        Save debug images
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

To improve hero detection:

1. Download hero reference images using the provided script:
   ```bash
   ./download_heroes.sh
   ```

2. Extract hero images from known good examples:
   ```bash
   python src/hero_reference.py extract path/to/image.jpg 1  # Position 1-10
   ```

3. View the hero reference sheet to check available references:
   ```bash
   python src/hero_reference.py sheet
   ```

## Output

The script outputs a JSON file (default: `temp/results.json`) with the extracted player information:

```json
{
  "timestamp": "2023-04-12T15:30:45.123Z",
  "clip_url": "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi",
  "players": [
    {
      "position": 1,
      "name": "Player1",
      "rank": "4127",
      "hero": "spectre"
    },
    {
      "position": 2,
      "name": "Player2",
      "rank": "853",
      "hero": "invoker"
    },
    ...
  ]
}
```

## Architecture

The project consists of several main components:

- `main_ocr.py`: Primary script for clip processing and OCR
- `player_extractor.py`: Specialized module for extracting player information from the top bar
- `hero_reference.py`: Manages hero reference images for hero detection
- `clip_utils.py`: Handles clip downloading and frame extraction
- Various shell scripts (`*.sh`) for convenient execution of common tasks

## Limitations

- OCR accuracy depends on image quality and text clarity
- The script may need adjustments for different game interfaces or resolutions
- Tesseract OCR performance varies across platforms
- Hero detection requires good reference images and is sensitive to in-game visual effects
