"""Characterization tests for api_server: pure helpers, the queue worker
dispatch, and the process_clip_request cache matrix.

These pin behavior before `process_queue_worker` (145 lines) and
`process_clip_request` (243 lines) get decomposed.
"""

from unittest.mock import MagicMock, patch

import pytest

import api_server


class _StopLoop(Exception):
    """Sentinel used to break process_queue_worker's `while True` after one pass."""


# --------------------------------------------------------------------------- #
# parse_bool_param
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "value, default, expected",
    [
        ("1", False, True),
        ("TRUE", False, True),
        ("yes", False, True),
        ("on", False, True),
        ("0", True, False),
        ("False", True, False),
        ("no", True, False),
        ("off", True, False),
        (None, True, True),
        (None, False, False),
        ("unknown", False, False),
        ("unknown", True, True),
    ],
)
def test_parse_bool_param(value, default, expected):
    assert api_server.parse_bool_param(value, default) is expected


# --------------------------------------------------------------------------- #
# extract_clip_id
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "url, expected",
    [
        ("https://clips.twitch.tv/AbcDef123", "AbcDef123"),
        ("https://www.twitch.tv/streamer/clip/Funny-Clip-Name", "Funny-Clip-Name"),
        ("https://example.com/x?clip=My-Clip-99", "My-Clip-99"),
        # pattern 1 stops at the first non-alnum (hyphen not allowed there)
        ("https://clips.twitch.tv/Foo-Bar", "Foo"),
        # no pattern matches -> last path segment fallback
        ("https://example.com/some/path/segment", "segment"),
    ],
)
def test_extract_clip_id(url, expected):
    assert api_server.extract_clip_id(url) == expected


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com",       # bare domain, no path
        "https://example.com/",      # trailing slash only
        "https://clips.twitch.tv/?x=1",  # query only, no clip slug
    ],
)
def test_extract_clip_id_junk_urls_return_none(url):
    # BUG TARGET #4: for URLs with no usable clip slug, extract_clip_id falls
    # through to the last path segment and returns "" (empty string) instead of
    # None. An empty clip_id then becomes a cache key / queue-dedup key downstream
    # and can collide across unrelated requests. Correct behavior: return None.
    assert api_server.extract_clip_id(url) is None


# --------------------------------------------------------------------------- #
# reset_stuck_processing_requests
# --------------------------------------------------------------------------- #
def test_reset_stuck_counts_both_started_and_null_started():
    db = MagicMock()
    cursor = MagicMock()
    db._get_connection.return_value.cursor.return_value = cursor
    # one row with started_at, two rows with NULL started_at -> total 3
    cursor.fetchall.side_effect = [[("r1",)], [("r2",), ("r3",)]]
    with patch.object(api_server, "db_client", db):
        total = api_server.reset_stuck_processing_requests(timeout_minutes=2)
    assert total == 3
    assert cursor.execute.call_count == 2
    db._get_connection.return_value.commit.assert_called_once()


def test_reset_stuck_returns_zero_on_db_error():
    db = MagicMock()
    db._get_connection.return_value.cursor.return_value.execute.side_effect = RuntimeError("boom")
    with patch.object(api_server, "db_client", db):
        assert api_server.reset_stuck_processing_requests() == 0


# --------------------------------------------------------------------------- #
# process_stream_request
# --------------------------------------------------------------------------- #
def test_process_stream_request_direct_returns_result():
    # conftest sets RUN_LOCALLY=true, which forces add_to_queue=False (direct path).
    stream_result = {"players": [{"player_name": "x"}]}
    with patch.object(api_server, "process_stream_username", return_value=stream_result) as psu:
        result = api_server.process_stream_request(
            "streamer", num_frames=3, include_image=False, from_worker=True
        )
    psu.assert_called_once()
    assert result["players"] == [{"player_name": "x"}]
    assert "processing_time" in result


def test_process_stream_request_direct_handles_no_result():
    with patch.object(api_server, "process_stream_username", return_value=None):
        result = api_server.process_stream_request(
            "streamer", include_image=False, from_worker=True
        )
    assert "error" in result


def test_process_stream_request_new_insert_starts_worker(monkeypatch):
    # A fresh enqueue (no 'deduplicated' flag) must start the worker and report
    # it as newly queued -- NOT as "already in the queue".
    monkeypatch.setenv("RUN_LOCALLY", "false")
    db = MagicMock()
    db.add_to_queue.return_value = ("rid", {"status": "pending", "position": 2, "estimated_wait_seconds": 30})
    with patch.object(api_server, "db_client", db), \
         patch.object(api_server, "start_worker_thread") as start_worker:
        result = api_server.process_stream_request("streamer", add_to_queue=True)
    assert result["queued"] is True
    assert result["request_id"] == "rid"
    assert result["position"] == 2
    assert "already in the processing queue" not in result.get("message", "")
    start_worker.assert_called_once()


def test_process_stream_request_dedup_hit_does_not_start_worker(monkeypatch):
    monkeypatch.setenv("RUN_LOCALLY", "false")
    db = MagicMock()
    db.add_to_queue.return_value = (
        "existing", {"status": "pending", "position": 5, "deduplicated": True},
    )
    with patch.object(api_server, "db_client", db), \
         patch.object(api_server, "start_worker_thread") as start_worker:
        result = api_server.process_stream_request("streamer", add_to_queue=True)
    assert result["request_id"] == "existing"
    assert result["message"] == "This stream is already in the processing queue"
    start_worker.assert_not_called()


def test_process_clip_request_dedup_hit_reports_already_queued(monkeypatch):
    monkeypatch.setenv("RUN_LOCALLY", "false")
    db = MagicMock()
    db.get_clip_result.return_value = None
    db.check_for_match_processing.return_value = {"found": False}
    db.add_to_queue.return_value = (
        "existing", {"status": "processing", "position": 1, "deduplicated": True},
    )
    with patch.object(api_server, "db_client", db), \
         patch.object(api_server, "start_worker_thread") as start_worker:
        result = api_server.process_clip_request(
            clip_url="u", clip_id="abc", add_to_queue=True,
        )
    assert result["message"] == "This clip is currently being processed"
    start_worker.assert_not_called()


# --------------------------------------------------------------------------- #
# get_image_url
# --------------------------------------------------------------------------- #
def test_get_image_url_builds_url_from_request_host(tmp_path):
    fake_request = MagicMock()
    fake_request.host_url = "http://vision.local/"
    with patch.object(api_server, "IMAGE_DIR", tmp_path), \
         patch.object(api_server, "request", fake_request), \
         patch("shutil.copy2") as copy2:
        image_url, saved = api_server.get_image_url("/frames/best.jpg", "clip42")
    copy2.assert_called_once()
    assert image_url == "http://vision.local/images/clip42.jpg"
    assert saved == image_url


def test_get_image_url_returns_none_on_copy_failure(tmp_path):
    with patch.object(api_server, "IMAGE_DIR", tmp_path), \
         patch("shutil.copy2", side_effect=OSError("disk full")):
        assert api_server.get_image_url("/frames/best.jpg", "clip42") == (None, None)


# --------------------------------------------------------------------------- #
# process_queue_worker dispatch
# --------------------------------------------------------------------------- #
def _run_worker_once(db, first_request):
    """Drive process_queue_worker through exactly one request then stop."""
    db.get_next_pending_request.side_effect = [first_request, _StopLoop()]
    with patch.object(api_server, "db_client", db), \
         patch.object(api_server.time, "sleep"):
        # _StopLoop propagates to the worker's broad except and ends the loop.
        api_server.process_queue_worker()


def test_worker_clip_branch_saves_result_without_frame_image_url():
    db = MagicMock()
    clip_request = {
        "request_id": "req1",
        "request_type": "clip",
        "clip_url": "https://clips.twitch.tv/abc",
        "clip_id": "abc",
        "debug": False,
        "force": False,
        "include_image": True,
    }
    worker_result = {"players": [{"player_name": "x"}], "frame_image_url": "http://img/x.jpg"}

    with patch.object(api_server, "process_clip_request", return_value=worker_result) as pcr:
        _run_worker_once(db, clip_request)

    # routed to clip processing as a worker call
    assert pcr.call_count == 1
    assert pcr.call_args.kwargs["from_worker"] is True
    assert pcr.call_args.kwargs["add_to_queue"] is False

    # frame_image_url stripped before persisting
    db.save_clip_result.assert_called_once()
    saved_result = db.save_clip_result.call_args[0][2]
    assert "frame_image_url" not in saved_result

    # status transitions: processing -> completed
    statuses = [c.args[1] for c in db.update_queue_status.call_args_list]
    assert statuses == ["processing", "completed"]


def test_worker_stream_branch_does_not_call_save_clip_result():
    db = MagicMock()
    stream_request = {
        "request_id": "req2",
        "request_type": "stream",
        "stream_username": "streamer",
        "num_frames": 3,
        "debug": False,
        "include_image": True,
    }
    worker_result = {"players": [{"player_name": "x"}]}

    with patch.object(api_server, "process_stream_request", return_value=worker_result) as psr:
        _run_worker_once(db, stream_request)

    assert psr.call_count == 1
    assert psr.call_args.kwargs["from_worker"] is True
    db.save_clip_result.assert_not_called()
    statuses = [c.args[1] for c in db.update_queue_status.call_args_list]
    assert statuses == ["processing", "completed"]


def test_worker_clip_in_game_branch_calls_process_with_in_game_true():
    db = MagicMock()
    request = {
        "request_id": "rig1",
        "request_type": "clip_in_game",
        "clip_url": "https://clips.twitch.tv/abc",
        "clip_id": "abc",
        "debug": False,
        "force": False,
        "include_image": True,
        "match_id": "999",
    }
    worker_result = {"players": [{"player_name": "x"}]}
    with patch.object(api_server, "process_clip_request", return_value=worker_result) as pcr:
        _run_worker_once(db, request)

    assert pcr.call_count == 1
    assert pcr.call_args.kwargs["in_game"] is True
    assert pcr.call_args.kwargs["from_worker"] is True


def test_worker_clip_in_game_not_skipped_by_completed_match():
    # A completed match short-circuits a normal 'clip' request, but an in-game
    # request must always process (it's a fresh, higher-confidence detection).
    db = MagicMock()
    db.check_for_match_processing.return_value = {
        "found": True, "status": "completed", "clip_id": "old",
    }
    db.get_clip_result.return_value = {"players": [{"player_name": "cached"}]}
    request = {
        "request_id": "rig2",
        "request_type": "clip_in_game",
        "clip_url": "https://clips.twitch.tv/abc",
        "clip_id": "abc",
        "debug": False,
        "force": False,
        "include_image": True,
        "match_id": "999",
    }
    with patch.object(api_server, "process_clip_request",
                      return_value={"players": [{"player_name": "fresh"}]}) as pcr:
        _run_worker_once(db, request)

    # Must NOT short-circuit on the completed match -> processing actually ran.
    pcr.assert_called_once()
    assert pcr.call_args.kwargs["in_game"] is True
    # The completed-match dedup branch is skipped for in-game, so the existing
    # result is never fetched.
    db.check_for_match_processing.assert_not_called()


def test_worker_normal_clip_is_skipped_by_completed_match():
    # Contrast case: a plain 'clip' request with a completed match short-circuits
    # WITHOUT calling process_clip_request.
    db = MagicMock()
    db.check_for_match_processing.return_value = {
        "found": True, "status": "completed", "clip_id": "old",
    }
    db.get_clip_result.return_value = {"players": [{"player_name": "cached"}]}
    request = {
        "request_id": "rc1",
        "request_type": "clip",
        "clip_url": "https://clips.twitch.tv/abc",
        "clip_id": "abc",
        "debug": False,
        "force": False,
        "include_image": True,
        "match_id": "999",
    }
    with patch.object(api_server, "process_clip_request") as pcr:
        _run_worker_once(db, request)

    pcr.assert_not_called()
    statuses = [c.args[1] for c in db.update_queue_status.call_args_list]
    assert statuses[-1] == "completed"


def test_worker_clip_not_found_is_requeued_not_failed():
    # When Twitch GQL says "Clip not found or inaccessible" the clip is usually
    # just lagging behind Helix readiness. The worker must re-queue (transient)
    # rather than terminally fail; otherwise we permanently drop the only clip
    # we'll get for that match phase.
    db = MagicMock()
    db.requeue_for_retry.return_value = True
    request = {
        "request_id": "req_transient",
        "request_type": "clip",
        "clip_url": "https://clips.twitch.tv/abc",
        "clip_id": "abc",
        "debug": False,
        "force": False,
        "include_image": True,
        "match_id": "m1",
    }
    transient = ValueError("Clip not found or inaccessible: abc")
    with patch.object(api_server, "process_clip_request", side_effect=transient):
        _run_worker_once(db, request)

    db.requeue_for_retry.assert_called_once_with("req_transient")
    # Must NOT mark failed — only the initial 'processing' transition is allowed.
    statuses = [c.args[1] for c in db.update_queue_status.call_args_list]
    assert statuses == ["processing"]


def test_worker_clip_not_found_falls_back_to_failed_when_budget_exhausted():
    # Once requeue_for_retry returns False (retry_count >= cap), the worker must
    # fall through to the normal failed path so the row doesn't sit pending forever.
    db = MagicMock()
    db.requeue_for_retry.return_value = False
    request = {
        "request_id": "req_exhausted",
        "request_type": "clip",
        "clip_url": "https://clips.twitch.tv/abc",
        "clip_id": "abc",
        "debug": False,
        "force": False,
        "include_image": True,
        "match_id": "m1",
    }
    with patch.object(api_server, "process_clip_request",
                      side_effect=ValueError("Clip not found or inaccessible: abc")):
        _run_worker_once(db, request)

    statuses = [c.args[1] for c in db.update_queue_status.call_args_list]
    assert statuses == ["processing", "failed"]


def test_worker_other_error_does_not_requeue():
    # Non-transient errors (e.g. download/decode crashes) must not exhaust the
    # retry budget — they should fail immediately as before.
    db = MagicMock()
    request = {
        "request_id": "req_real_fail",
        "request_type": "clip",
        "clip_url": "https://clips.twitch.tv/abc",
        "clip_id": "abc",
        "debug": False,
        "force": False,
        "include_image": True,
    }
    with patch.object(api_server, "process_clip_request",
                      side_effect=RuntimeError("ffmpeg decode crashed")):
        _run_worker_once(db, request)

    db.requeue_for_retry.assert_not_called()
    statuses = [c.args[1] for c in db.update_queue_status.call_args_list]
    assert statuses == ["processing", "failed"]


def test_process_clip_request_in_game_enqueues_as_clip_in_game(monkeypatch):
    # in_game=True + add_to_queue must enqueue with request_type='clip_in_game'.
    monkeypatch.setenv("RUN_LOCALLY", "false")
    db = MagicMock()
    db.get_clip_result.return_value = None
    db.add_to_queue.return_value = (
        "rid", {"status": "pending", "position": 1},
    )
    with patch.object(api_server, "db_client", db), \
         patch.object(api_server, "start_worker_thread"):
        api_server.process_clip_request(
            clip_url="u", clip_id="abc", add_to_queue=True, in_game=True,
        )
    assert db.add_to_queue.call_args.kwargs["request_type"] == "clip_in_game"


def test_process_clip_request_in_game_skips_completed_match_cache(monkeypatch):
    # in_game=True must not reuse a completed non-draft match result.
    monkeypatch.setenv("RUN_LOCALLY", "false")
    db = MagicMock()
    db.get_clip_result.return_value = None
    db.add_to_queue.return_value = ("rid", {"status": "pending", "position": 1})
    with patch.object(api_server, "db_client", db), \
         patch.object(api_server, "start_worker_thread"):
        api_server.process_clip_request(
            clip_url="u", clip_id="abc", match_id="m1",
            add_to_queue=True, in_game=True,
        )
    # The completed-match reuse branch is gated on `not in_game`, so it's skipped.
    db.check_for_match_processing.assert_not_called()
    db.add_to_queue.assert_called_once()


def test_worker_marks_failed_when_no_players_detected():
    db = MagicMock()
    clip_request = {
        "request_id": "req3",
        "request_type": "clip",
        "clip_url": "https://clips.twitch.tv/abc",
        "clip_id": "abc",
        "debug": False,
        "force": False,
        "include_image": True,
    }
    with patch.object(api_server, "process_clip_request", return_value={"players": []}):
        _run_worker_once(db, clip_request)

    statuses = [c.args[1] for c in db.update_queue_status.call_args_list]
    assert statuses == ["processing", "failed"]
    db.save_clip_result.assert_not_called()


# --------------------------------------------------------------------------- #
# process_clip_request cache matrix (force=False)
# --------------------------------------------------------------------------- #
def test_clip_request_returns_existing_draft_for_match():
    db = MagicMock()
    db.get_latest_draft_for_match.return_value = {"is_draft": True, "clip_id": "old"}
    with patch.object(api_server, "db_client", db):
        result = api_server.process_clip_request(
            clip_url="u", clip_id="abc", match_id="m1", only_draft=True,
            add_to_queue=False, from_worker=True,
        )
    assert result["match_id"] == "m1"
    db.get_clip_result.assert_not_called()


def test_clip_request_reuses_completed_match_result():
    db = MagicMock()
    db.check_for_match_processing.return_value = {"found": True, "status": "completed", "clip_id": "old"}
    db.get_clip_result.return_value = {"players": [{"player_name": "x"}]}
    with patch.object(api_server, "db_client", db):
        result = api_server.process_clip_request(
            clip_url="u", clip_id="abc", match_id="m1", only_draft=False,
            add_to_queue=False, from_worker=True,
        )
    assert result["match_id"] == "m1"
    assert result["clip_id"] == "old"


def test_clip_request_returns_cached_draft_when_only_draft():
    db = MagicMock()
    db.get_clip_result.return_value = {"is_draft": True, "players": [], "saved_image_path": None}
    with patch.object(api_server, "db_client", db):
        result = api_server.process_clip_request(
            clip_url="u", clip_id="abc", only_draft=True,
            add_to_queue=False, from_worker=True,
        )
    assert result["is_draft"] is True


def test_clip_request_returns_filtered_cache_for_non_draft():
    db = MagicMock()
    db.get_clip_result.return_value = {
        "is_draft": False,
        "players": [{"player_name": "x"}],
        "heroes": [{"name": "h"}],
        "saved_image_path": "/img/x.jpg",
        "extra": "should-be-dropped",
    }
    with patch.object(api_server, "db_client", db):
        result = api_server.process_clip_request(
            clip_url="u", clip_id="abc", only_draft=False,
            add_to_queue=False, from_worker=True,
        )
    assert set(result.keys()) == {"saved_image_path", "players", "heroes"}
    assert "extra" not in result


def test_clip_request_force_skips_cache_and_processes():
    db = MagicMock()
    with patch.object(api_server, "db_client", db), \
         patch.object(api_server, "process_clip_url", return_value={"players": [{"player_name": "x"}]}) as pcu:
        result = api_server.process_clip_request(
            clip_url="u", clip_id="abc", force=True,
            add_to_queue=False, from_worker=True, include_image=False,
        )
    db.get_clip_result.assert_not_called()
    pcu.assert_called_once()
    assert result["players"] == [{"player_name": "x"}]
