#!/usr/bin/env python3
"""Command line interface for the clip processor."""

import argparse
import json
import logging
import sys

from detection.image_processing import (
    process_frame_for_heroes,
    process_frames_for_heroes,
    load_heroes_data,
    expected_colors,
)
from dota_hero_detection import process_clip_url, process_stream_username

logger = logging.getLogger(__name__)


def main() -> int:
    """Entry point for the CLI."""
    parser = argparse.ArgumentParser(description="Detect Dota 2 heroes in a Twitch clip or stream")
    parser.add_argument("clip_url", nargs="?", help="URL of the Twitch clip (required if --stream not provided)")
    parser.add_argument("--stream", help="Twitch username for live stream capture")
    parser.add_argument("--frames", type=int, default=3, help="Number of frames to capture from the stream (default: 3)")
    parser.add_argument("--frame-path", help="Path to a single frame to process")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    parser.add_argument("--output", "-o", default="heroes.json", help="Output file path (default: heroes.json)")
    parser.add_argument("--min-score", type=float, default=0.4, help="Minimum match score (0.0-1.0) to consider a hero identified (default: 0.4)")
    parser.add_argument("--debug-templates", action="store_true", help="Save debug images of template matching results")
    parser.add_argument("--show-timings", action="store_true", help="Show detailed performance timing information")
    parser.add_argument("--keep-debug", action="store_true", help="Don't clear debug directory between runs")
    parser.add_argument("--json-only", action="store_true", help="Only output JSON with no additional text")

    args = parser.parse_args()

    if args.stream:
        result = process_stream_username(
            username=args.stream,
            debug=args.debug,
            min_score=args.min_score,
            debug_templates=args.debug_templates,
            show_timings=args.show_timings,
            num_frames=args.frames,
        )
    elif args.frame_path:
        result = process_frame_for_heroes(args.frame_path, debug=args.debug)
        if result:
            result = {
                "heroes": result,
                "source_type": "frame",
                "source": args.frame_path,
            }
    elif args.clip_url:
        result = process_clip_url(
            clip_url=args.clip_url,
            debug=args.debug,
            min_score=args.min_score,
            debug_templates=args.debug_templates,
            show_timings=args.show_timings,
        )
    else:
        parser.print_help()
        return 1

    if not result:
        return 1

    if args.json_only:
        print(json.dumps(result, indent=2))
    else:
        with open(args.output, "w") as f:
            json.dump(result, f, indent=2)
        logger.info("Saved hero data to %s", args.output)

    return 0


if __name__ == "__main__":  # pragma: no cover - manual entry point
    sys.exit(main())
