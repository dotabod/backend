"""
Clip Processor Python Package

This package contains modules for processing Twitch clips and streams
to extract Dota 2 hero information.
"""

# Import main modules to make them available at the package level
try:
    from .clip_utils import get_clip_details, download_clip, download_single_frame, extract_frames
    from .dota_hero_detection import process_clip_url, process_stream_username, load_heroes_data
    from .detection.image_processing import process_frame_for_heroes
    from .dota_heroes import get_hero_data
    from .api_server import app
except ImportError:
    # It's okay if imports fail here, they'll be properly handled in each module
    pass
