"""Characterization tests for stream_utils.capture_frame_from_stream.

Pins the retry loop, frame-skip, "preparing screen" early-exit, and capture
release behavior before the retry logic is extracted into a shared helper.
cv2/streamlink are stubbed offline (see conftest); we patch the few seams the
function actually drives.
"""

from unittest.mock import MagicMock, patch

import pytest

import stream_utils


def _capture(read_results, opened=True):
    """A mock cv2.VideoCapture whose .read() yields the given (ok, frame) tuples."""
    cap = MagicMock()
    cap.isOpened.return_value = opened
    cap.read.side_effect = list(read_results)
    return cap


@pytest.fixture(autouse=True)
def _no_sleep_and_tmp_frames(tmp_path):
    with patch.object(stream_utils, "TEMP_DIR", tmp_path), \
         patch.object(stream_utils.time, "sleep"):
        yield


def test_returns_frame_path_on_clean_capture():
    cap = _capture([(True, "frame")])
    with patch.object(stream_utils, "get_stream_url", return_value="http://s"), \
         patch.object(stream_utils.cv2, "VideoCapture", return_value=cap), \
         patch.object(stream_utils, "is_preparing_screen", return_value=False):
        result = stream_utils.capture_frame_from_stream(
            "streamer", max_retries=1, frames_to_skip=0
        )
    assert result is not None
    assert result.endswith(".jpg")
    cap.release.assert_called_once()


def test_returns_none_when_stream_url_unavailable():
    with patch.object(stream_utils, "get_stream_url", return_value=None) as get_url, \
         patch.object(stream_utils.cv2, "VideoCapture") as vc:
        result = stream_utils.capture_frame_from_stream(
            "streamer", max_retries=3, frames_to_skip=0
        )
    assert result is None
    assert get_url.call_count == 3  # retried for each attempt
    vc.assert_not_called()  # never tried to open a capture


def test_retries_and_releases_on_preparing_screen():
    # Every read succeeds but every frame is a "preparing your stream" screen.
    cap = _capture([(True, "frame")] * 10)
    with patch.object(stream_utils, "get_stream_url", return_value="http://s"), \
         patch.object(stream_utils.cv2, "VideoCapture", return_value=cap), \
         patch.object(stream_utils, "is_preparing_screen", return_value=True):
        result = stream_utils.capture_frame_from_stream(
            "streamer", max_retries=2, frames_to_skip=0
        )
    assert result is None
    # capture released once per retry
    assert cap.release.call_count == 2
