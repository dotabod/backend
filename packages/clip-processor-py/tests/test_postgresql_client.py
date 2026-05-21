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
# save_clip_result / get_clip_result — JSON round-trip
# --------------------------------------------------------------------------- #
def test_save_clip_result_serializes_result_and_omits_empty_facets(db_client, mock_cursor):
    result = {"players": [{"player_name": "x", "team": "Radiant", "position": 0}], "heroes": []}
    assert db_client.save_clip_result("c1", "u", result) is True
    params = mock_cursor.execute.call_args.args[1]
    assert params[0] == "c1"
    assert json.loads(params[2]) == result  # results column = json.dumps(result)
    assert params[5] is None  # no per-player facet -> facets column is NULL


def test_save_clip_result_extracts_facets(db_client, mock_cursor):
    result = {"players": [{"player_name": "x", "team": "Dire", "position": 2, "facet": 1}]}
    assert db_client.save_clip_result("c1", "u", result) is True
    params = mock_cursor.execute.call_args.args[1]
    facets = json.loads(params[5])
    assert facets["dire"] == [{"position": 2, "facet": 1}]
    assert facets["radiant"] == []


def test_get_clip_result_returns_results_payload(db_client, mock_cursor):
    payload = {"players": [{"player_name": "x", "team": "Radiant", "position": 0}]}
    mock_cursor.fetchone.return_value = {"results": payload, "facets": None}
    assert db_client.get_clip_result("c1") == payload


def test_get_clip_result_merges_facets_into_players(db_client, mock_cursor):
    payload = {"players": [{"player_name": "x", "team": "Radiant", "position": 0}]}
    facets = {"radiant": [{"position": 0, "facet": 7}], "dire": []}
    mock_cursor.fetchone.return_value = {"results": payload, "facets": facets}
    out = db_client.get_clip_result("c1")
    assert out["players"][0]["facet"] == 7


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
    mock_cursor.fetchone.return_value = {
        "clip_id": "c1",
        "clip_url": "u1",
        "results": {"is_draft": False, "players": [{"player_name": "x"}]},
        "facets": None,
    }
    out = db_client.get_clip_result_by_match_id("m1")
    assert out["clip_id"] == "c1"
    assert out["clip_url"] == "u1"
    assert out["is_draft"] is False


def test_match_result_merges_facets_into_players_and_heroes(db_client, mock_cursor):
    # players are 1-indexed, heroes are 0-indexed; facets are keyed by the
    # 1-indexed (player) position. The heroes loop adds +1 to realign, so the
    # SAME facet must land on both the player and its corresponding hero.
    db_client.get_latest_draft_for_match = MagicMock(return_value=None)
    mock_cursor.fetchone.return_value = {
        "clip_id": "c1",
        "clip_url": "u1",
        "results": {
            "is_draft": False,
            "players": [{"player_name": "x", "team": "Radiant", "position": 1}],
            "heroes": [{"name": "h", "team": "Radiant", "position": 0}],
        },
        "facets": {"radiant": [{"position": 1, "facet": 7}], "dire": []},
    }
    out = db_client.get_clip_result_by_match_id("m1")
    assert out["players"][0]["facet"] == 7
    assert out["heroes"][0]["facet"] == 7  # +1 realignment lands on the same facet


def test_match_result_attaches_draft_info(db_client, mock_cursor):
    db_client.get_latest_draft_for_match = MagicMock(
        return_value={"is_draft": True, "captains": {"Radiant": "Cap"}, "draft_player_order": ["a"]}
    )
    mock_cursor.fetchone.return_value = {
        "clip_id": "c1", "clip_url": "u1",
        "results": {"is_draft": False, "players": []}, "facets": None,
    }
    out = db_client.get_clip_result_by_match_id("m1")
    assert out["draft_info"]["captains"] == {"Radiant": "Cap"}
    assert out["draft_info"]["draft_player_order"] == ["a"]


def test_match_result_falls_back_to_draft_when_no_non_draft(db_client, mock_cursor):
    # First query (non-draft) returns nothing; fallback draft query returns a row.
    mock_cursor.fetchone.side_effect = [
        None,
        {"clip_id": "cd", "clip_url": "ud", "results": {"is_draft": True, "players": []}},
    ]
    out = db_client.get_clip_result_by_match_id("m1")
    assert out["clip_id"] == "cd"
    assert out["is_draft"] is True


def test_match_result_returns_none_when_nothing_found(db_client, mock_cursor):
    mock_cursor.fetchone.side_effect = [None, None]
    assert db_client.get_clip_result_by_match_id("m1") is None


def test_match_result_survives_facets_missing_a_team_key(db_client, mock_cursor):
    # BUG TARGET #1: stored facets dict is missing the 'dire' key (legacy/partial
    # payload), and a Dire player is present. The merge does `facets['dire']`
    # which raises KeyError; the broad except swallows it and the whole cached
    # read returns None -> silent cache miss -> needless reprocessing in prod.
    # Correct behavior: still return the cached result.
    db_client.get_latest_draft_for_match = MagicMock(return_value=None)
    mock_cursor.fetchone.return_value = {
        "clip_id": "c1", "clip_url": "u1",
        "results": {
            "is_draft": False,
            "players": [{"player_name": "x", "team": "Dire", "position": 2}],
        },
        "facets": {"radiant": [{"position": 1, "facet": 7}]},  # no 'dire' key
    }
    out = db_client.get_clip_result_by_match_id("m1")
    assert out is not None
    assert out["clip_id"] == "c1"


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


# --------------------------------------------------------------------------- #
# get_clip_result robustness (BUG TARGET #1)
# --------------------------------------------------------------------------- #
def test_get_clip_result_survives_facets_missing_team_key(db_client, mock_cursor):
    # Same silent-cache-miss robustness gap as the match_id path: a facets dict
    # lacking the player's team key raises KeyError, swallowed -> returns None.
    mock_cursor.fetchone.return_value = {
        "results": {"players": [{"player_name": "x", "team": "Dire", "position": 2}]},
        "facets": {"radiant": [{"position": 1, "facet": 7}]},  # no 'dire' key
    }
    out = db_client.get_clip_result("c1")
    assert out is not None
    assert out["players"][0]["player_name"] == "x"


def test_get_clip_result_survives_player_missing_position(db_client, mock_cursor):
    # A player dict missing 'position'/'team' (partial detection) also raises
    # KeyError during facet merge and silently nukes the cached result.
    mock_cursor.fetchone.return_value = {
        "results": {"players": [{"player_name": "x"}]},  # no team/position
        "facets": {"radiant": [{"position": 1, "facet": 7}], "dire": []},
    }
    out = db_client.get_clip_result("c1")
    assert out is not None
    assert out["players"][0]["player_name"] == "x"
