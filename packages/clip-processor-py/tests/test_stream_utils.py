"""Characterization tests for stream_utils.capture_frame_from_stream.

Pins the retry loop, frame-skip, "preparing screen" early-exit, and capture
release behavior before the retry logic is extracted into a shared helper.
cv2/streamlink are stubbed offline (see conftest); we patch the few seams the
function actually drives.
"""

from unittest.mock import MagicMock, patch

import numpy as np
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
         patch.object(stream_utils.cv2, "imwrite", return_value=True), \
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
         patch.object(stream_utils.cv2, "imwrite", return_value=True), \
         patch.object(stream_utils, "is_preparing_screen", return_value=True):
        result = stream_utils.capture_frame_from_stream(
            "streamer", max_retries=2, frames_to_skip=0
        )
    assert result is None
    # capture released once per retry
    assert cap.release.call_count == 2


# --------------------------------------------------------------------------- #
# get_stream_url
# --------------------------------------------------------------------------- #
def _streamlink_session(streams):
    session = MagicMock()
    session.streams.return_value = streams
    return session


def test_get_stream_url_returns_none_when_no_streams():
    with patch.object(stream_utils.streamlink, "Streamlink",
                      return_value=_streamlink_session({})):
        assert stream_utils.get_stream_url("alice") is None


def test_get_stream_url_returns_requested_quality():
    stream = MagicMock(); stream.url = "http://hls/720"
    with patch.object(stream_utils.streamlink, "Streamlink",
                      return_value=_streamlink_session({"720p": stream})):
        assert stream_utils.get_stream_url("alice", quality="720p") == "http://hls/720"


def test_get_stream_url_falls_back_to_best():
    best = MagicMock(); best.url = "http://hls/best"
    with patch.object(stream_utils.streamlink, "Streamlink",
                      return_value=_streamlink_session({"best": best})):
        assert stream_utils.get_stream_url("alice", quality="1440p") == "http://hls/best"


def test_get_stream_url_returns_none_on_error():
    with patch.object(stream_utils.streamlink, "Streamlink", side_effect=RuntimeError("boom")):
        assert stream_utils.get_stream_url("alice") is None


# --------------------------------------------------------------------------- #
# is_preparing_screen (real numpy, cv2 color ops patched to real arrays)
# --------------------------------------------------------------------------- #
def test_is_preparing_screen_true_when_dark():
    frame = np.zeros((8, 8, 3), dtype=np.uint8)
    with patch.object(stream_utils.cv2, "cvtColor", return_value=np.zeros((8, 8), dtype=np.uint8)):
        assert stream_utils.is_preparing_screen(frame) is True


def test_is_preparing_screen_true_when_uniform_low_std():
    frame = np.full((8, 8, 3), 100, dtype=np.uint8)
    with patch.object(stream_utils.cv2, "cvtColor", return_value=np.full((8, 8), 100, dtype=np.uint8)):
        assert stream_utils.is_preparing_screen(frame) is True


def test_is_preparing_screen_true_on_heavy_twitch_purple():
    frame = np.zeros((8, 8, 3), dtype=np.uint8)
    bright = np.tile(np.array([0, 40, 80, 120, 160, 200, 240, 255], dtype=np.uint8), (8, 1))  # mean 137, std 87
    purple_mask = np.full((8, 8), 255, dtype=np.uint8)  # 100% purple
    with patch.object(stream_utils, "TESSERACT_AVAILABLE", False), \
         patch.object(stream_utils.cv2, "cvtColor", side_effect=[bright, frame]), \
         patch.object(stream_utils.cv2, "inRange", return_value=purple_mask):
        assert stream_utils.is_preparing_screen(frame) is True


def test_is_preparing_screen_false_for_normal_frame():
    frame = np.zeros((8, 8, 3), dtype=np.uint8)
    bright = np.tile(np.array([0, 40, 80, 120, 160, 200, 240, 255], dtype=np.uint8), (8, 1))
    no_purple = np.zeros((8, 8), dtype=np.uint8)
    with patch.object(stream_utils, "TESSERACT_AVAILABLE", False), \
         patch.object(stream_utils.cv2, "cvtColor", side_effect=[bright, frame]), \
         patch.object(stream_utils.cv2, "inRange", return_value=no_purple):
        assert stream_utils.is_preparing_screen(frame) is False


def test_is_preparing_screen_false_on_exception():
    with patch.object(stream_utils.cv2, "cvtColor", side_effect=RuntimeError("bad")):
        assert stream_utils.is_preparing_screen(object()) is False


# --------------------------------------------------------------------------- #
# capture_multiple_frames
# --------------------------------------------------------------------------- #
def test_capture_multiple_returns_empty_without_url():
    with patch.object(stream_utils, "get_stream_url", return_value=None):
        assert stream_utils.capture_multiple_frames("alice") == []


def test_capture_multiple_returns_empty_when_not_opened():
    cap = MagicMock(); cap.isOpened.return_value = False
    with patch.object(stream_utils, "get_stream_url", return_value="http://s"), \
         patch.object(stream_utils.cv2, "VideoCapture", return_value=cap):
        assert stream_utils.capture_multiple_frames("alice") == []


def test_capture_multiple_collects_valid_frames():
    cap = MagicMock()
    cap.isOpened.return_value = True
    cap.read.return_value = (True, object())
    with patch.object(stream_utils, "get_stream_url", return_value="http://s"), \
         patch.object(stream_utils.cv2, "VideoCapture", return_value=cap), \
         patch.object(stream_utils.cv2, "imwrite", return_value=True), \
         patch.object(stream_utils, "is_preparing_screen", return_value=False):
        out = stream_utils.capture_multiple_frames("alice", num_frames=1, frames_to_skip=0)
    assert len(out) == 1
    cap.release.assert_called_once()
