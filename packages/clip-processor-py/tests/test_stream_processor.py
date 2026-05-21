"""Tests for StreamManager state management and per-stream error backoff.

cv2/numpy/streamlink are stubbed offline (see conftest). We never start the
asyncio loop; instead we construct a manager and drive its pure dict-state
methods plus a single `_process_stream` iteration with `_capture_frame`/
`_process_frame` mocked.
"""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from stream_processor import StreamManager, StreamStatus


@pytest.fixture
def manager():
    mgr = StreamManager(capture_interval=3, max_concurrent=10, quality="720p")
    yield mgr
    mgr.executor.shutdown(wait=False)


# --------------------------------------------------------------------------- #
# add_stream / remove_stream / update_priority
# --------------------------------------------------------------------------- #
def test_add_stream_initializes_state(manager):
    manager.add_stream("streamer", priority=4)
    s = manager.streams["streamer"]
    assert s["status"] == StreamStatus.PENDING
    assert s["priority"] == 4
    assert s["captures"] == 0
    assert s["frame_paths"] == []


def test_add_stream_dedups_and_updates_priority(manager):
    manager.add_stream("streamer", priority=5)
    manager.add_stream("streamer", priority=1)
    assert len(manager.streams) == 1
    assert manager.streams["streamer"]["priority"] == 1


def test_remove_stream_drops_from_active(manager):
    manager.add_stream("streamer")
    manager.active_streams.add("streamer")
    manager.remove_stream("streamer")
    assert "streamer" not in manager.streams
    assert "streamer" not in manager.active_streams


def test_update_priority_noop_for_unknown(manager):
    manager.update_priority("ghost", 2)  # must not raise / create
    assert "ghost" not in manager.streams


# --------------------------------------------------------------------------- #
# get_stats / get_stream_status / get_all_streams
# --------------------------------------------------------------------------- #
def test_get_stats_success_rate_math(manager):
    manager.add_stream("a")
    manager.stats["total_captures"] = 4
    manager.stats["successful_captures"] = 3
    stats = manager.get_stats()
    assert stats["streams"] == 1
    assert stats["success_rate"] == 75.0


def test_get_stats_zero_capture_guard(manager):
    stats = manager.get_stats()
    assert stats["success_rate"] == 0  # no divide-by-zero


def test_get_stream_status_returns_copy_or_none(manager):
    manager.add_stream("a")
    status = manager.get_stream_status("a")
    status["priority"] = 999  # mutate the copy
    assert manager.streams["a"]["priority"] != 999  # original untouched
    assert manager.get_stream_status("missing") is None


def test_get_all_streams_returns_all(manager):
    manager.add_stream("a")
    manager.add_stream("b")
    assert set(manager.get_all_streams()) == {"a", "b"}


# --------------------------------------------------------------------------- #
# _process_stream — error backoff vs success reset
# --------------------------------------------------------------------------- #
def test_process_stream_failure_increments_consecutive_errors(manager):
    manager.add_stream("a")
    manager.running = False  # so the finally block does not requeue on the loop
    with patch.object(manager, "_capture_frame", AsyncMock(return_value=None)):
        asyncio.run(manager._process_stream("a"))
    s = manager.streams["a"]
    assert s["consecutive_errors"] == 1
    assert s["status"] == StreamStatus.ERROR
    assert manager.stats["failed_captures"] == 1
    assert "a" not in manager.active_streams


def test_process_stream_success_resets_errors_and_records_frame(manager):
    manager.add_stream("a")
    manager.running = False
    manager.streams["a"]["consecutive_errors"] = 3  # pre-existing error streak
    with patch.object(manager, "_capture_frame", AsyncMock(return_value="/tmp/a.jpg")), \
         patch.object(manager, "_process_frame", AsyncMock(return_value=False)):
        asyncio.run(manager._process_stream("a"))
    s = manager.streams["a"]
    assert s["consecutive_errors"] == 0
    assert s["status"] == StreamStatus.ONLINE
    assert s["frame_paths"] == ["/tmp/a.jpg"]
    assert manager.stats["successful_captures"] == 1


def test_process_stream_counts_dota_match(manager):
    manager.add_stream("a")
    manager.running = False
    with patch.object(manager, "_capture_frame", AsyncMock(return_value="/tmp/a.jpg")), \
         patch.object(manager, "_process_frame", AsyncMock(return_value=True)):
        asyncio.run(manager._process_stream("a"))
    assert manager.streams["a"]["dota_matches"] == 1
    assert manager.stats["dota_matches_found"] == 1
