"""Tests for confidence-aware hero detection: low-confidence flagging, per-slot
re-scan recovery, and the live-HUD validity gate."""

from contextlib import ExitStack
from unittest.mock import patch

import dota_hero_detection as dhd


def hero(team, pos, score, name):
    return {
        "team": team,
        "position": pos,
        "match_score": score,
        "hero_localized_name": name,
        "hero_id": pos,
    }


def ten_heroes(weak_slots=()):
    """Ten strong heroes, with the given (team, position) slots forced weak (0.60)."""
    heroes = []
    for team in ("Radiant", "Dire"):
        for pos in range(5):
            score = 0.60 if (team, pos) in weak_slots else 0.95
            heroes.append(hero(team, pos, score, f"{team}{pos}"))
    return heroes


# --------------------------------------------------------------------------- #
# is_valid_hud
# --------------------------------------------------------------------------- #
def test_is_valid_hud_accepts_enough_strong_slots():
    assert dhd.is_valid_hud(ten_heroes(), threshold=0.75, min_valid=8) is True


def test_is_valid_hud_accepts_with_two_weak():
    heroes = ten_heroes(weak_slots={("Dire", 3), ("Dire", 4)})  # 8 strong
    assert dhd.is_valid_hud(heroes, threshold=0.75, min_valid=8) is True


def test_is_valid_hud_rejects_too_few_strong():
    heroes = ten_heroes(weak_slots={("Dire", 2), ("Dire", 3), ("Dire", 4)})  # 7 strong
    assert dhd.is_valid_hud(heroes, threshold=0.75, min_valid=8) is False


def test_is_valid_hud_rejects_empty():
    assert dhd.is_valid_hud([], threshold=0.75, min_valid=8) is False


# --------------------------------------------------------------------------- #
# redetect_low_confidence_slots
# --------------------------------------------------------------------------- #
def test_redetect_replaces_weak_slot_with_higher_score():
    heroes = ten_heroes(weak_slots={("Dire", 3)})
    # The extra frame reads the occluded slot clearly as a different, confident hero.
    candidate = [hero("Dire", 3, 0.96, "Pudge")]
    with patch.object(dhd, "process_frame_for_heroes", return_value=candidate):
        result = dhd.redetect_low_confidence_slots(heroes, ["extra.jpg"], threshold=0.75)
    slot = next(h for h in result if (h["team"], h["position"]) == ("Dire", 3))
    assert slot["hero_localized_name"] == "Pudge"
    assert slot["match_score"] == 0.96


def test_redetect_leaves_strong_slots_untouched():
    heroes = ten_heroes(weak_slots={("Dire", 3)})
    # Re-scan offers a higher score for an already-strong slot; must be ignored.
    candidate = [hero("Radiant", 0, 0.99, "ShouldNotReplace")]
    with patch.object(dhd, "process_frame_for_heroes", return_value=candidate):
        result = dhd.redetect_low_confidence_slots(heroes, ["extra.jpg"], threshold=0.75)
    slot = next(h for h in result if (h["team"], h["position"]) == ("Radiant", 0))
    assert slot["hero_localized_name"] == "Radiant0"
    assert slot["match_score"] == 0.95


def test_redetect_does_not_downgrade_a_weak_slot():
    heroes = ten_heroes(weak_slots={("Dire", 3)})
    candidate = [hero("Dire", 3, 0.50, "WorseGuess")]
    with patch.object(dhd, "process_frame_for_heroes", return_value=candidate):
        result = dhd.redetect_low_confidence_slots(heroes, ["extra.jpg"], threshold=0.75)
    slot = next(h for h in result if (h["team"], h["position"]) == ("Dire", 3))
    assert slot["hero_localized_name"] == "Dire3"  # original, higher (0.60) kept
    assert slot["match_score"] == 0.60


def test_redetect_no_weak_slots_is_noop():
    heroes = ten_heroes()
    with patch.object(dhd, "process_frame_for_heroes") as pfh:
        result = dhd.redetect_low_confidence_slots(heroes, ["extra.jpg"], threshold=0.75)
    pfh.assert_not_called()
    assert result is heroes


def test_redetect_survives_frame_processing_error():
    heroes = ten_heroes(weak_slots={("Dire", 3)})
    with patch.object(dhd, "process_frame_for_heroes", side_effect=RuntimeError("bad frame")):
        result = dhd.redetect_low_confidence_slots(heroes, ["extra.jpg"], threshold=0.75)
    slot = next(h for h in result if (h["team"], h["position"]) == ("Dire", 3))
    assert slot["match_score"] == 0.60  # unchanged, no crash


# --------------------------------------------------------------------------- #
# process_media wiring: HUD gate + low_confidence flag
# --------------------------------------------------------------------------- #
def _patch_clip_pipeline(heroes):
    """Patch the clip I/O boundary so process_media runs offline with given heroes.
    extract_frames returns [] so the re-scan is a no-op (we test gate/flag, not re-scan)."""
    best = {"frame_path": "f0.jpg", "frame_index": 0, "match_score": 0.9, "detected_colors": {}}
    return [
        patch.object(dhd, "get_clip_details", return_value={"id": "abc", "duration": 30}),
        patch.object(dhd, "download_single_frame", return_value="f0.jpg"),
        patch.object(dhd, "download_clip", return_value="clip.mp4"),
        patch.object(dhd, "extract_frames", return_value=[]),
        patch.object(dhd, "load_image", return_value=object()),
        patch.object(dhd, "process_frames_for_heroes", return_value=(heroes, best)),
        patch.object(dhd, "extract_team_captains_from_frame", return_value=[]),
    ]


def _run_process_media(heroes):
    with ExitStack() as stack:
        for p in _patch_clip_pipeline(heroes):
            stack.enter_context(p)
        return dhd.process_media("https://clips.twitch.tv/abc", source_type="clip")


def test_process_media_rejects_non_dota_frame():
    # 5 strong + 5 weak slots -> below MIN_VALID_SLOTS (8) -> rejected as not-a-match.
    heroes = ten_heroes(weak_slots={("Dire", 0), ("Dire", 1), ("Dire", 2), ("Dire", 3), ("Dire", 4)})
    assert _run_process_media(heroes) is None


def test_process_media_flags_low_confidence_slot():
    # 9 strong + 1 weak -> valid HUD, but the weak slot is flagged low_confidence.
    heroes = ten_heroes(weak_slots={("Dire", 3)})
    result = _run_process_media(heroes)
    assert result is not None
    flagged = [h for h in result["heroes"] if h.get("low_confidence")]
    assert len(flagged) == 1
    assert (flagged[0]["team"], flagged[0]["position"]) == ("Dire", 3)
    # The flag is mirrored onto the players view (position is 1-indexed there).
    flagged_players = [p for p in result["players"] if p.get("low_confidence")]
    assert len(flagged_players) == 1
    assert flagged_players[0]["team"] == "Dire" and flagged_players[0]["position"] == 4


def test_process_media_no_flags_when_all_confident():
    result = _run_process_media(ten_heroes())
    assert result is not None
    assert all("low_confidence" not in h for h in result["heroes"])
    assert all("low_confidence" not in p for p in result["players"])
