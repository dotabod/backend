# Dota 2 Hero Detection from Live Twitch Streams

This guide explains how to use the new stream detection feature that captures frames directly from a live Twitch stream using Streamlink.

## Prerequisites

- Python 3.7+
- Streamlink (installed automatically with the setup script)
- Other dependencies from requirements.txt

## Quick Start

### 1. Install Dependencies

Run the dependency installer script to set up all required packages:

```bash
./install-deps.sh
```

This will create a virtual environment, install all necessary packages including Streamlink, and verify the installation.

### 2. Capture a Single Frame (Test)

To test if the stream capture is working without running the full hero detection:

```bash
./capture-stream-test.sh <twitch_username>
```

For example:
```bash
./capture-stream-test.sh arteezy
```

This will:
- Connect to the Twitch stream
- Capture a single frame
- Save it to the temp/frames directory
- Show the path to the captured frame

### 3. Run Hero Detection on a Live Stream

To detect heroes from a live Twitch stream:

```bash
./detect-stream.sh <twitch_username> [frames] [output_file]
```

For example:
```bash
./detect-stream.sh arteezy 3 heroes.json
```

Parameters:
- `<twitch_username>`: The Twitch username of the streamer (required)
- `[frames]`: Number of frames to capture (default: 3)
- `[output_file]`: Output JSON file (default: heroes.json)

## Using the API

You can also use the API server to detect heroes from a live stream:

1. Start the API server:
   ```bash
   python src/api_server.py
   ```

2. Make a request to the `/detect-stream` endpoint:
   ```
   GET http://localhost:5000/detect-stream?username=arteezy&frames=3&debug=false
   ```

## Troubleshooting

### Stream Not Found

If the stream is not found, make sure:
- The Twitch username is correct
- The streamer is currently live
- Your internet connection is working
- You have no network restrictions blocking Twitch

### Dealing with "Preparing Your Stream" Messages

The system now has built-in handling for Twitch's "preparing your stream" screens and advertisements:

1. **Multi-layered Detection**: The system uses several methods to identify "preparing" screens:
   - **Image Analysis**: Detects dark or low-contrast screens typical of loading states
   - **OCR Text Recognition**: If pytesseract is installed, the system can read text to detect phrases like "preparing your stream"
   - **Color Analysis**: Detects Twitch's signature purple color which is common in their branded screens

2. **Retry Logic**: When a "preparing" screen is detected, the system will:
   - Discard the current frame
   - Wait a few seconds
   - Try again, up to a maximum number of retries

3. **Ad-Blocking Options**: The implementation uses Streamlink's built-in ad-blocking capabilities:
   - `twitch-disable-ads`: Filters out advertisement segments
   - `twitch-low-latency`: Uses low-latency mode which can sometimes bypass ads
   - `retry-streams` and `retry-open`: Automatically retry stream fetching

4. **Debug Images**: When processing frames, the system saves:
   - The original captured frame
   - OCR-processed images for text detection
   - These are saved to `temp/debug_frames/` for troubleshooting

#### For Best Results

For optimal detection of "preparing" screens:

1. **Install pytesseract** for OCR text detection:
   ```bash
   pip install pytesseract
   ```

   You'll also need to install the Tesseract OCR engine:
   - macOS: `brew install tesseract`
   - Ubuntu/Debian: `sudo apt-get install tesseract-ocr`
   - Windows: Download from [Tesseract GitHub](https://github.com/UB-Mannheim/tesseract/wiki)

2. **Tweak parameters** if you're still having issues:
   - Increase `max_retries` (default: 5)
   - Increase `retry_delay` (default: 3 seconds)
   - Try a different quality setting

3. **Examine debug images** in `temp/debug_frames/` if detection isn't working correctly

If you're still encountering issues with ads or "preparing" screens after these adjustments, you may need to modify the detection thresholds in the `is_preparing_screen()` function.

### Import Error

If you see "stream_utils module not available" errors:
- Make sure you ran the `install-deps.sh` script
- Check that streamlink is installed correctly
- Try running `./capture-stream-test.sh <username>` to isolate the issue

### Improving Detection Quality

- Increase the number of frames (3-5 is recommended)
- Make sure the Dota 2 game interface is clearly visible in the stream
- The top bar should be fully visible with hero portraits
- Stream quality should be good (720p or higher)

## How It Works

1. The system uses Streamlink to get a stream URL from the Twitch username
2. OpenCV is used to capture frames from the stream
3. The frames are saved to the temp/frames directory
4. The hero detection algorithm processes these frames
5. Results are returned as a JSON object with hero identifications

## Additional Commands

### Using Command Line Arguments

You can also run the script directly with Python:

```bash
python src/dota_hero_detection.py --stream <username> --frames <num_frames> --debug
```

### Debugging Stream Issues

If you're having trouble with the stream detection, you can check:

1. If Streamlink can access the stream:
   ```bash
   streamlink https://www.twitch.tv/<username> --stream-url best
   ```

2. If OpenCV can open the stream:
   ```bash
   python -c "import cv2; cap = cv2.VideoCapture('<stream_url>'); print(cap.isOpened())"
   ```
