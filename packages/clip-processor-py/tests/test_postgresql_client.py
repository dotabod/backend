"""Characterization tests for PostgresClient queue/result logic.

All DB I/O is mocked via the `db_client`/`mock_cursor` fixtures (see conftest).
These pin:
  - the multi-query dispatch in check_for_match_processing (before a UNION rewrite)
  - the per-status branch in update_queue_status (before status-string constants)
  - the JSON (de)serialization round-trip in save/get clip result
"""

import json
from unittest.mock import MagicMock

import pytest


# --------------------------------------------------------------------------- #
# check_for_match_processing — query dispatch order
# --------------------------------------------------------------------------- #
def test_match_processing_completed_short_circuits(db_client, mock_cursor):
    mock_cursor.fetchone.side_effect = [{"clip_id": "c1"}]
    out = db_client.check_for_match_processing("m1")
    assert out == {"found": True, "status": "completed", "clip_id": "c1"}
    assert mock_cursor.execute.call_count == 1  # stops at the first query


def test_match_processing_returns_active_queue_entry(db_client, mock_cursor):
    mock_cursor.fetchone.side_effect = [
        None,  # no completed result
        {"request_id": "r1", "clip_id": "c1", "status": "processing"},
    ]
    out = db_client.check_for_match_processing("m1")
    assert out == {"found": True, "status": "processing", "clip_id": "c1", "request_id": "r1"}
    assert mock_cursor.execute.call_count == 2


def test_match_processing_returns_failed(db_client, mock_cursor):
    mock_cursor.fetchone.side_effect = [None, None, {"request_id": "r1", "clip_id": "c1"}]
    out = db_client.check_for_match_processing("m1")
    assert out == {"found": True, "status": "failed", "clip_id": "c1", "request_id": "r1"}
    assert mock_cursor.execute.call_count == 3


def test_match_processing_returns_draft(db_client, mock_cursor):
    mock_cursor.fetchone.side_effect = [None, None, None, {"clip_id": "c1"}]
    out = db_client.check_for_match_processing("m1")
    assert out == {"found": True, "status": "draft", "clip_id": "c1"}
    assert mock_cursor.execute.call_count == 4


def test_match_processing_not_found(db_client, mock_cursor):
    mock_cursor.fetchone.side_effect = [None, None, None, None]
    out = db_client.check_for_match_processing("m1")
    assert out == {"found": False}
    assert mock_cursor.execute.call_count == 4


# --------------------------------------------------------------------------- #
# update_queue_status — per-status branch
# --------------------------------------------------------------------------- #
def test_update_status_processing_sets_started_at(db_client, mock_cursor):
    assert db_client.update_queue_status("r1", "processing") is True
    assert mock_cursor.execute.call_count == 1
    query = mock_cursor.execute.call_args_list[0].args[0]
    assert "started_at" in query
    db_client._mock_conn.commit.assert_called_once()


def test_update_status_completed_also_recomputes_positions(db_client, mock_cursor):
    assert db_client.update_queue_status("r1", "completed", result_id="c1") is True
    # main update + the pending-position recompute
    assert mock_cursor.execute.call_count == 2
    first_query = mock_cursor.execute.call_args_list[0].args[0]
    second_query = mock_cursor.execute.call_args_list[1].args[0]
    assert "completed_at" in first_query and "result_id" in first_query
    assert "position" in second_query


def test_update_status_failed_recomputes_positions(db_client, mock_cursor):
    assert db_client.update_queue_status("r1", "failed") is True
    assert mock_cursor.execute.call_count == 2


def test_update_status_other_is_bare_update(db_client, mock_cursor):
    assert db_client.update_queue_status("r1", "pending") is True
    assert mock_cursor.execute.call_count == 1
    query = mock_cursor.execute.call_args_list[0].args[0]
    assert "started_at" not in query and "completed_at" not in query


def test_update_status_rolls_back_on_error(db_client, mock_cursor):
    mock_cursor.execute.side_effect = RuntimeError("boom")
    assert db_client.update_queue_status("r1", "processing") is False
    db_client._mock_conn.rollback.assert_called_once()


# --------------------------------------------------------------------------- #
# requeue_for_retry — atomic retry budget
# --------------------------------------------------------------------------- #
def test_requeue_for_retry_returns_true_when_row_updated(db_client, mock_cursor):
    mock_cursor.rowcount = 1
    assert db_client.requeue_for_retry("r1", delay_seconds=42, max_retries=3) is True
    query, params = mock_cursor.execute.call_args.args
    assert "status = 'pending'" in query
    assert "retry_count = COALESCE(retry_count, 0) + 1" in query
    assert "not_before" in query and "interval '1 second'" in query
    # max_retries is enforced in the WHERE clause, not Python, so the cap is atomic
    assert "COALESCE(retry_count, 0) < %s" in query
    assert params == (42, "r1", 3)
    db_client._mock_conn.commit.assert_called_once()


def test_requeue_for_retry_returns_false_when_cap_reached(db_client, mock_cursor):
    # WHERE clause filtered the row out (retry_count >= max_retries) — no row updated
    mock_cursor.rowcount = 0
    assert db_client.requeue_for_retry("r1") is False


# --------------------------------------------------------------------------- #
# save_clip_result / get_clip_result — JSON round-trip
# --------------------------------------------------------------------------- #
def test_save_clip_result_serializes_result(db_client, mock_cursor):
    result = {"players": [{"player_name": "x", "team": "Radiant", "position": 0}], "heroes": []}
    assert db_client.save_clip_result("c1", "u", result) is True
    params = mock_cursor.execute.call_args.args[1]
    assert params[0] == "c1"
    assert json.loads(params[2]) == result  # results column = json.dumps(result)


def test_get_clip_result_returns_results_payload(db_client, mock_cursor):
    payload = {"players": [{"player_name": "x", "team": "Radiant", "position": 0}]}
    mock_cursor.fetchone.return_value = {"results": payload}
    assert db_client.get_clip_result("c1") == payload


def test_get_clip_result_returns_none_when_missing(db_client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    assert db_client.get_clip_result("missing") is None


# --------------------------------------------------------------------------- #
# Queue lifecycle (ported from the old test/test_queue.py)
# --------------------------------------------------------------------------- #
def test_add_to_queue_inserts_and_returns_position(db_client, mock_cursor):
    # add_to_queue consumes fetchone in this order: two schema-column checks,
    # the dedup lookup, the pending-count, the avg-time query, then RETURNING *.
    mock_cursor.fetchone.side_effect = [
        None,            # match_id column check -> absent
        None,            # only_draft column check -> absent
        None,            # no existing duplicate
        {"count": 2},    # pending count -> position 3
        [15.0],          # get_average_processing_time
        {"request_id": "row-id", "status": "pending", "position": 3},  # RETURNING *
    ]
    request_id, queue_info = db_client.add_to_queue(
        request_type="clip", clip_id="test-clip", clip_url="https://clips.twitch.tv/test-clip"
    )
    assert request_id is not None
    assert queue_info.get("status") == "pending"
    assert queue_info.get("position") == 3
    db_client._mock_conn.commit.assert_called_once()


def test_add_to_queue_accepts_clip_in_game(db_client, mock_cursor):
    # Regression: 'clip_in_game' must be treated as a clip, not rejected by the
    # request-type whitelist (which previously dropped every queued in-game request).
    mock_cursor.fetchone.side_effect = [
        None,            # match_id column check
        None,            # only_draft column check
        None,            # no existing duplicate
        {"count": 0},    # pending count -> position 1
        [15.0],          # get_average_processing_time
        {"request_id": "ig-id", "status": "pending", "position": 1},  # RETURNING *
    ]
    request_id, queue_info = db_client.add_to_queue(
        request_type="clip_in_game", clip_id="ig-clip", clip_url="https://clips.twitch.tv/ig-clip"
    )
    # Not the invalid-type early return (which yields an empty queue_info).
    assert queue_info.get("status") == "pending"
    assert queue_info.get("position") == 1
    db_client._mock_conn.commit.assert_called_once()


@pytest.mark.parametrize(
    "fetched, expected",
    [
        ([10.5], 10.5),
        ([None], 15.0),  # default when no data
        ([20.3], 20.3),
    ],
)
def test_get_average_processing_time(db_client, mock_cursor, fetched, expected):
    mock_cursor.fetchone.return_value = fetched
    assert db_client.get_average_processing_time("clip") == expected


def test_get_next_pending_request_returns_row(db_client, mock_cursor):
    mock_cursor.fetchone.return_value = {
        "request_id": "test-id", "clip_id": "test-clip", "status": "pending", "position": 1
    }
    request = db_client.get_next_pending_request()
    assert request["request_id"] == "test-id"
    assert request["status"] == "pending"


def test_get_next_pending_request_returns_none_when_empty(db_client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    assert db_client.get_next_pending_request() is None


def test_get_next_pending_request_gates_on_not_before(db_client, mock_cursor):
    # A re-queued row carries `not_before` set in the future; the worker poll
    # must skip those rows so we don't immediately re-attempt while Twitch GQL
    # is still cold.
    mock_cursor.fetchone.return_value = None
    db_client.get_next_pending_request()
    query = mock_cursor.execute.call_args.args[0]
    assert "not_before IS NULL OR not_before <= CURRENT_TIMESTAMP" in query


def test_add_to_queue_returns_existing_duplicate(db_client, mock_cursor):
    mock_cursor.fetchone.return_value = {
        "request_id": "existing-id",
        "clip_id": "test-clip",
        "status": "pending",
        "position": 3,
        "estimated_wait_seconds": 45,
    }
    request_id, queue_info = db_client.add_to_queue(
        request_type="clip", clip_id="test-clip", clip_url="https://clips.twitch.tv/test-clip"
    )
    assert request_id == "existing-id"
    assert queue_info["status"] == "pending"
    assert queue_info["position"] == 3


def test_is_request_in_queue_finds_existing(db_client, mock_cursor):
    mock_cursor.fetchone.return_value = {"request_id": "existing-id", "status": "pending"}
    assert db_client.is_request_in_queue("clip", "test-clip")["request_id"] == "existing-id"


def test_is_request_in_queue_returns_none_when_absent(db_client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    assert db_client.is_request_in_queue("clip", "non-existent-clip") is None


# --------------------------------------------------------------------------- #
# get_clip_result_by_match_id
# --------------------------------------------------------------------------- #
def test_match_result_prefers_non_draft_and_attaches_clip_meta(db_client, mock_cursor):
    db_client.get_latest_draft_for_match = MagicMock(return_value=None)
    mock_cursor.fetchall.return_value = [{
        "clip_id": "c1",
        "clip_url": "u1",
        "results": {"is_draft": False, "players": [{"player_name": "x"}]},
    }]
    out = db_client.get_clip_result_by_match_id("m1")
    assert out["clip_id"] == "c1"
    assert out["clip_url"] == "u1"
    assert out["is_draft"] is False


def test_match_result_attaches_draft_info(db_client, mock_cursor):
    db_client.get_latest_draft_for_match = MagicMock(
        return_value={"is_draft": True, "captains": {"Radiant": "Cap"}, "draft_player_order": ["a"]}
    )
    mock_cursor.fetchall.return_value = [{
        "clip_id": "c1", "clip_url": "u1",
        "results": {"is_draft": False, "players": []},
    }]
    out = db_client.get_clip_result_by_match_id("m1")
    assert out["draft_info"]["captains"] == {"Radiant": "Cap"}
    assert out["draft_info"]["draft_player_order"] == ["a"]


def test_match_result_falls_back_to_draft_when_no_non_draft(db_client, mock_cursor):
    # Non-draft query returns nothing; fallback draft query (fetchone) returns a row.
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = {
        "clip_id": "cd", "clip_url": "ud", "results": {"is_draft": True, "players": []},
    }
    out = db_client.get_clip_result_by_match_id("m1")
    assert out["clip_id"] == "cd"
    assert out["is_draft"] is True


def test_match_result_returns_none_when_nothing_found(db_client, mock_cursor):
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = None
    assert db_client.get_clip_result_by_match_id("m1") is None


def test_match_result_in_game_overrides_lower_confidence_per_slot(db_client, mock_cursor):
    # Two non-draft rows for the same match: a pre-game clip and a higher-confidence
    # in-game clip. Each slot should resolve to the hero with the higher match_score.
    db_client.get_latest_draft_for_match = MagicMock(return_value=None)
    pregame = {
        "is_draft": False,
        "heroes": [
            {"team": "Radiant", "position": 0, "hero_id": 1, "hero_localized_name": "Anti-Mage", "match_score": 0.80},
            {"team": "Radiant", "position": 1, "hero_id": 2, "hero_localized_name": "Axe", "match_score": 0.70},
        ],
    }
    ingame = {
        "is_draft": False,
        "detection_source": "in_game",
        "heroes": [
            # Same slot 0, but a different (more confident) hero -> should win.
            {"team": "Radiant", "position": 0, "hero_id": 5, "hero_localized_name": "Crystal Maiden", "match_score": 0.95},
            # Slot 1 lower than pre-game -> pre-game keeps it.
            {"team": "Radiant", "position": 1, "hero_id": 2, "hero_localized_name": "Axe", "match_score": 0.60},
        ],
    }
    # Newest first (base row = in-game), both returned by the non-draft query.
    mock_cursor.fetchall.return_value = [
        {"clip_id": "cg", "clip_url": "ug", "results": ingame},
        {"clip_id": "cp", "clip_url": "up", "results": pregame},
    ]
    out = db_client.get_clip_result_by_match_id("m1")
    by_slot = {(h["team"], h["position"]): h for h in out["heroes"]}
    assert by_slot[("Radiant", 0)]["hero_id"] == 5  # in-game (0.95) beat pre-game (0.80)
    assert by_slot[("Radiant", 1)]["hero_id"] == 2  # pre-game (0.70) beat in-game (0.60)
    # players[] is rebuilt from the merged heroes
    assert {p["hero_id"] for p in out["players"]} == {5, 2}


def test_match_result_in_game_fills_missing_slot_from_pregame(db_client, mock_cursor):
    # In-game clip only detected one slot; the other is filled from the pre-game clip.
    db_client.get_latest_draft_for_match = MagicMock(return_value=None)
    pregame = {
        "is_draft": False,
        "heroes": [
            {"team": "Dire", "position": 0, "hero_id": 9, "hero_localized_name": "Mirana", "match_score": 0.85},
            {"team": "Dire", "position": 1, "hero_id": 10, "hero_localized_name": "Morphling", "match_score": 0.85},
        ],
    }
    ingame = {
        "is_draft": False,
        "detection_source": "in_game",
        "heroes": [
            {"team": "Dire", "position": 0, "hero_id": 11, "hero_localized_name": "Phantom Lancer", "match_score": 0.99},
        ],
    }
    mock_cursor.fetchall.return_value = [
        {"clip_id": "cg", "clip_url": "ug", "results": ingame},
        {"clip_id": "cp", "clip_url": "up", "results": pregame},
    ]
    out = db_client.get_clip_result_by_match_id("m1")
    by_slot = {(h["team"], h["position"]): h["hero_id"] for h in out["heroes"]}
    assert by_slot[("Dire", 0)] == 11  # in-game won its slot
    assert by_slot[("Dire", 1)] == 10  # filled from pre-game


def test_match_result_carries_player_name_from_lower_score_detection(db_client, mock_cursor):
    # The Techies incident: the pre-game clip wins the slot on match_score but its
    # name OCR missed (no player_name), while a lower-score detection of the same
    # slot did capture the name. The merge must keep the higher-score hero identity
    # yet still carry player_name/rank across, or the player is dropped downstream.
    db_client.get_latest_draft_for_match = MagicMock(return_value=None)
    pregame = {
        "is_draft": False,
        "heroes": [
            {"team": "Radiant", "position": 3, "hero_id": 105,
             "hero_localized_name": "Techies", "match_score": 0.99},  # no player_name
        ],
    }
    named = {
        "is_draft": False,
        "heroes": [
            {"team": "Radiant", "position": 3, "hero_id": 105,
             "hero_localized_name": "Techies", "match_score": 0.62,
             "player_name": "spleen", "rank": 459},
        ],
    }
    mock_cursor.fetchall.return_value = [
        {"clip_id": "cn", "clip_url": "un", "results": named},
        {"clip_id": "cp", "clip_url": "up", "results": pregame},
    ]
    out = db_client.get_clip_result_by_match_id("m1")
    techies = out["heroes"][0]
    assert techies["match_score"] == 0.99      # higher-score identity kept
    assert techies["player_name"] == "spleen"  # name carried from lower-score detection
    assert techies["rank"] == 459              # rank carried too
    assert out["players"][0]["player_name"] == "spleen"


# --------------------------------------------------------------------------- #
# get_latest_draft_for_match
# --------------------------------------------------------------------------- #
def test_latest_draft_returns_results_with_clip_meta(db_client, mock_cursor):
    mock_cursor.fetchone.return_value = {
        "clip_id": "cd", "clip_url": "ud", "results": {"is_draft": True, "players": []},
    }
    out = db_client.get_latest_draft_for_match("m1")
    assert out["clip_id"] == "cd"
    assert out["is_draft"] is True


def test_latest_draft_returns_none_when_absent(db_client, mock_cursor):
    mock_cursor.fetchone.return_value = None
    assert db_client.get_latest_draft_for_match("m1") is None


# --------------------------------------------------------------------------- #
# is_queue_processing
# --------------------------------------------------------------------------- #
def test_is_queue_processing_true_when_count_positive(db_client, mock_cursor):
    mock_cursor.fetchone.return_value = [1]
    assert db_client.is_queue_processing() is True


def test_is_queue_processing_false_when_zero(db_client, mock_cursor):
    mock_cursor.fetchone.return_value = [0]
    assert db_client.is_queue_processing() is False


