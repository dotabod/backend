# Twitch Clip Processor (Python)

This Python tool processes a Twitch clip to extract player names and ranks from a game lobby screen. It downloads a Twitch clip, extracts frames, and then processes those frames to find player information.

## Features

- Downloads Twitch clips using the clip URL
- Extracts frames from the clip at regular intervals
- Uses computer vision to find frames containing player cards
- Processes player cards to extract names and ranks
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
python src/main.py "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi"
```

### Additional options:

```bash
python src/main.py --help
```

This will show all available options:

```
usage: main.py [-h] [--frame-interval FRAME_INTERVAL] [--debug] [--save-frames] [--output OUTPUT] [clip_url]

Process a Twitch clip to extract player info

positional arguments:
  clip_url               URL of the Twitch clip (default: clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi)

optional arguments:
  -h, --help            show this help message and exit
  --frame-interval FRAME_INTERVAL
                        Interval between frames in seconds (default: 0.5)
  --debug               Enable debug logging
  --save-frames         Keep extracted frames after processing
  --output OUTPUT, -o OUTPUT
                        Output file path (default: results.json)
```

## Improving Accuracy

To improve recognition accuracy, you can provide a reference image:

1. Download a clear screenshot of the player cards dashboard
2. Save it to `assets/reference.png` or use the download helper:

```bash
python src/download_reference.py "URL_TO_REFERENCE_IMAGE"
```

## Output

The script outputs a JSON file (default: `results.json`) with the extracted player information:

```json
{
  "timestamp": "2023-04-12T15:30:45.123Z",
  "clip_url": "clips.twitch.tv/WonderfulEntertainingWasabiCopyThis-I2pCrWZFkn_EFiZi",
  "players": [
    {
      "name": "Player1",
      "rank": "4,127",
      "position": 1
    },
    {
      "name": "Player2",
      "position": 2
    },
    ...
  ]
}
```

## Limitations

- OCR accuracy depends on image quality and text clarity
- The script may need adjustments for different game interfaces or resolutions
- Tesseract OCR performance varies across platforms
