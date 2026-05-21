"""Tests for StreamManager state management and per-stream error backoff.

cv2/numpy/streamlink are stubbed offline (see conftest). We never start the
asyncio loop; instead we construct a manager and drive its pure dict-state
methods plus a single `_process_stream` iteration with `_capture_frame`/
`_process_frame` mocked.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import stream_processor
from stream_processor import StreamManager, StreamStatus


@pytest.fixture
def manager():
    mgr = StreamManager(capture_interval=3, max_concurrent=10, quality="720p")
    yield mgr
    mgr.executor.shutdown(wait=False)


@pytest.fixture(autouse=True)
def _no_capture_sleep():
    # _capture_frame sleeps 0.2s per skipped frame; collapse it.
    with patch.object(stream_processor.time, "sleep"):
        yield


def _mock_capture(read_result, opened=True):
    cap = MagicMock()
    cap.isOpened.return_value = opened
    cap.read.return_value = read_result
    return cap


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


# --------------------------------------------------------------------------- #
# _capture_frame
# --------------------------------------------------------------------------- #
def test_capture_frame_returns_none_without_stream_url(manager):
    with patch.object(stream_processor, "get_stream_url", return_value=None):
        assert asyncio.run(manager._capture_frame("a")) is None


def test_capture_frame_returns_none_when_capture_not_opened(manager):
    cap = _mock_capture((True, object()), opened=False)
    with patch.object(stream_processor, "get_stream_url", return_value="http://s"), \
         patch.object(stream_processor.cv2, "VideoCapture", return_value=cap):
        assert asyncio.run(manager._capture_frame("a")) is None


def test_capture_frame_returns_none_on_preparing_screen(manager):
    cap = _mock_capture((True, object()))
    with patch.object(stream_processor, "get_stream_url", return_value="http://s"), \
         patch.object(stream_processor.cv2, "VideoCapture", return_value=cap), \
         patch.object(stream_processor, "is_preparing_screen", return_value=True):
        assert asyncio.run(manager._capture_frame("a")) is None
    cap.release.assert_called()


def test_capture_frame_returns_none_when_read_fails(manager):
    cap = _mock_capture((False, None))
    with patch.object(stream_processor, "get_stream_url", return_value="http://s"), \
         patch.object(stream_processor.cv2, "VideoCapture", return_value=cap):
        assert asyncio.run(manager._capture_frame("a")) is None


def test_capture_frame_writes_and_returns_path(manager, tmp_path):
    cap = _mock_capture((True, object()))
    with patch.object(stream_processor, "FRAMES_DIR", tmp_path), \
         patch.object(stream_processor, "get_stream_url", return_value="http://s"), \
         patch.object(stream_processor.cv2, "VideoCapture", return_value=cap), \
         patch.object(stream_processor.cv2, "imwrite", return_value=True) as imwrite, \
         patch.object(stream_processor, "is_preparing_screen", return_value=False):
        out = asyncio.run(manager._capture_frame("alice"))
    assert out is not None and out.endswith(".jpg") and "alice" in out
    imwrite.assert_called()
    cap.release.assert_called()


# --------------------------------------------------------------------------- #
# _process_frame
# --------------------------------------------------------------------------- #
def test_process_frame_skips_when_detection_unavailable(manager):
    with patch.object(stream_processor, "DOTA_DETECTION_AVAILABLE", False):
        assert asyncio.run(manager._process_frame("a", "/t/f.jpg")) is False


def test_process_frame_detects_match_and_writes_result(manager, tmp_path):
    with patch.object(stream_processor, "DOTA_DETECTION_AVAILABLE", True), \
         patch.object(stream_processor, "RESULTS_DIR", tmp_path), \
         patch.object(stream_processor, "process_frame_for_heroes",
                      return_value={"heroes": [{"name": "x"}]}):
        assert asyncio.run(manager._process_frame("alice", "/t/f.jpg")) is True
    assert (tmp_path / "alice").exists()


def test_process_frame_returns_false_when_no_heroes(manager, tmp_path):
    with patch.object(stream_processor, "DOTA_DETECTION_AVAILABLE", True), \
         patch.object(stream_processor, "RESULTS_DIR", tmp_path), \
         patch.object(stream_processor, "process_frame_for_heroes", return_value={"heroes": []}):
        assert asyncio.run(manager._process_frame("alice", "/t/f.jpg")) is False


# --------------------------------------------------------------------------- #
# _initialize / _scheduler
# --------------------------------------------------------------------------- #
def test_initialize_queues_all_streams(manager):
    manager.add_stream("a")
    manager.add_stream("b")
    async def drive():
        await manager._initialize()
        return manager.stream_queue.qsize()
    with patch.object(stream_processor.random, "uniform", return_value=0):
        assert asyncio.run(drive()) == 2


def test_scheduler_dispatches_due_stream(manager):
    manager.add_stream("a")
    processed = []
    async def fake_process(u):
        processed.append(u)
    async def drive():
        manager.running = True
        manager.stream_queue = asyncio.PriorityQueue()
        await manager.stream_queue.put((0, "a"))  # due now
        task = asyncio.create_task(manager._scheduler())
        for _ in range(5):
            await asyncio.sleep(0)
            if processed:
                break
        manager.running = False
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
    with patch.object(manager, "_process_stream", side_effect=fake_process):
        asyncio.run(drive())
    assert processed == ["a"]


def test_scheduler_skips_removed_stream(manager):
    async def drive():
        manager.running = True
        manager.stream_queue = asyncio.PriorityQueue()
        await manager.stream_queue.put((0, "gone"))  # not in self.streams
        task = asyncio.create_task(manager._scheduler())
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        manager.running = False
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
    with patch.object(manager, "_process_stream", new=AsyncMock()) as proc:
        asyncio.run(drive())
        proc.assert_not_called()


# --------------------------------------------------------------------------- #
# _health_check / _cleanup (one iteration, then running flips off)
# --------------------------------------------------------------------------- #
def test_health_check_runs_one_iteration(manager):
    manager.add_stream("a")
    manager.stats["total_captures"] = 4
    manager.stats["successful_captures"] = 2

    async def fake_sleep(_):
        manager.running = False

    async def drive():
        manager.running = True
        with patch.object(stream_processor.asyncio, "sleep", fake_sleep):
            await manager._health_check()

    asyncio.run(drive())  # exits cleanly after one pass


def test_cleanup_removes_old_frames(manager, tmp_path):
    import os
    old = tmp_path / "old.jpg"
    new = tmp_path / "new.jpg"
    old.write_bytes(b"x")
    new.write_bytes(b"x")
    old_time = __import__("time").time() - (stream_processor.MAX_FRAME_AGE + 100)
    os.utime(old, (old_time, old_time))

    async def fake_sleep(_):
        manager.running = False

    async def drive():
        manager.running = True
        with patch.object(stream_processor, "FRAMES_DIR", tmp_path), \
             patch.object(stream_processor.asyncio, "sleep", fake_sleep):
            await manager._cleanup()

    asyncio.run(drive())
    assert not old.exists()
    assert new.exists()


# --------------------------------------------------------------------------- #
# start / stop lifecycle
# --------------------------------------------------------------------------- #
def test_start_noop_when_already_running(manager):
    manager.running = True
    with patch.object(stream_processor.threading, "Thread") as thread:
        manager.start()
    thread.assert_not_called()


def test_stop_noop_when_not_running(manager):
    manager.running = False
    manager.stop()  # must not raise
    assert manager.running is False


def test_stop_flips_running_flag(manager):
    manager.running = True
    manager.stop()
    assert manager.running is False


def test_run_starts_tasks_and_stops_cleanly(manager, tmp_path):
    async def drive():
        with patch.object(stream_processor, "FRAMES_DIR", tmp_path):
            task = asyncio.create_task(manager.run())
            for _ in range(5):
                await asyncio.sleep(0)
                if manager.running:
                    break
            assert manager.running is True
            manager.stop()
            await asyncio.wait_for(task, timeout=3)
    asyncio.run(drive())
    assert manager.running is False
