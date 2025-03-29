# Stream Processor for Dota 2 Analysis

This solution provides a scalable system for capturing frames from multiple Twitch streams simultaneously and analyzing them for Dota 2 game information. It can handle 500+ streamers concurrently with efficient resource management.

## Features

- **Scalable Architecture**: Efficiently manages hundreds of streams with minimal resource usage
- **Asynchronous Processing**: Non-blocking I/O for maximum throughput
- **Configurable Capture Interval**: Default of one frame every 3 seconds
- **Stream Prioritization**: Allocate resources based on stream importance
- **REST API**: Manage streams and view results via HTTP endpoints
- **Error Recovery**: Automatic retry with exponential backoff
- **Metrics**: Prometheus-compatible metrics endpoint
- **Health Monitoring**: Detailed status reporting

## Components

1. **Stream Processor Core** (`stream_processor.py`): Manages the concurrent capture and analysis of frames
2. **API Server** (`stream_api.py`): Provides REST endpoints for managing streams
3. **Launcher Script** (`stream-processor.sh`): Easy startup with configurable options

## Requirements

- Python 3.8+
- OpenCV
- Streamlink
- Flask + Waitress
- Other dependencies in `requirements.txt`

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Make the launcher script executable:
   ```
   chmod +x stream-processor.sh
   ```

## Usage

### Basic Usage

Start the processor with default settings:

```bash
./stream-processor.sh
```

This will:
- Capture one frame every 3 seconds
- Process up to 100 streams simultaneously
- Use 720p quality to balance bandwidth and analysis accuracy
- Start the API server on port 5000

### Command Line Options

```
Usage: ./stream-processor.sh [options]
Options:
  -h, --host HOST           Host to bind to (default: 0.0.0.0)
  -p, --port PORT           Port to bind to (default: 5000)
  -i, --interval SECONDS    Seconds between frame captures (default: 3)
  -m, --max-concurrent NUM  Maximum concurrent streams (default: 100)
  -q, --quality QUALITY     Stream quality (default: 720p)
  -f, --streams-file FILE   Path to file containing usernames (one per line)
  -d, --debug               Enable debug mode
  --help                    Show this help message
```

### Examples

Capture frames every 5 seconds:
```bash
./stream-processor.sh -i 5
```

Load streamers from a file:
```bash
./stream-processor.sh -f streamers.txt
```

Use lower quality to save bandwidth:
```bash
./stream-processor.sh -q 480p
```

### Streams File Format

Create a text file with one Twitch username per line:

```
# Popular Dota 2 streamers
gorgc
admiralbulldog
dendi
# Comments are supported
wagamamatv
```

## API Endpoints

The solution provides a REST API for managing streams:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Get system status |
| `/api/streams` | GET | Get all stream statuses |
| `/api/streams` | POST | Add a stream to monitor |
| `/api/streams/bulk` | POST | Add multiple streams |
| `/api/streams/<username>` | GET | Get status of a specific stream |
| `/api/streams/<username>` | DELETE | Remove a stream |
| `/api/streams/<username>/priority` | PUT | Update stream priority |
| `/api/frames/<username>/<filename>` | GET | Get a captured frame image |
| `/api/config` | GET | Get current configuration |
| `/api/config` | PUT | Update configuration |
| `/api/restart` | POST | Restart the stream manager |
| `/api/metrics` | GET | Get metrics in Prometheus format |

### API Examples

Add a stream:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"username": "gorgc", "priority": 3}' \
  http://localhost:5000/api/streams
```

Add multiple streams:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"streams": ["gorgc", "admiralbulldog", "dendi"]}' \
  http://localhost:5000/api/streams/bulk
```

Change capture interval:
```bash
curl -X PUT -H "Content-Type: application/json" \
  -d '{"capture_interval": 5}' \
  http://localhost:5000/api/config
```

## Architecture

The stream processor uses a combination of asynchronous programming (asyncio) and thread pools to maximize efficiency:

1. **Asynchronous Scheduler**: Manages when to capture frames from each stream
2. **Thread Pool**: Handles CPU-bound tasks like image processing
3. **Priority Queue**: Ensures high-priority streams get processed first
4. **Resource Limiting**: Prevents overloading the system with too many concurrent connections

The process flow:
1. Add streams to the manager
2. Scheduler determines when to capture from each stream
3. Frame is captured from the Twitch stream
4. Frame is analyzed for Dota 2 hero information
5. Results are stored for API access
6. Repeat at the specified interval

## Performance Tuning

For optimal performance with 500+ streams:

1. **Lower the quality** to 480p or even 360p
2. **Increase the capture interval** to 5-10 seconds
3. **Run on a machine with ample CPU cores** (16+ recommended)
4. **Ensure sufficient network bandwidth** (100+ Mbps)
5. **Monitor memory usage** and adjust `max_concurrent` if needed

## Troubleshooting

- **High CPU usage**: Increase the capture interval or reduce max_concurrent
- **Network errors**: Check your internet connection and Twitch API rate limits
- **Memory issues**: Lower max_concurrent to reduce simultaneous connections
