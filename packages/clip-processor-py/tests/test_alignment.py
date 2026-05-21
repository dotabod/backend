"""Characterization tests for the draft <-> detected-players alignment.

These pin the *observable* behavior of the fuzzy matcher before it gets
refactored, so a future scoring-unification can't silently change which player
maps to which draft slot.
"""

import pytest

from api_server import (
    _align_players_with_draft,
    _normalize_name,
    _refine_alignment_with_captains_and_leftovers,
)


def _p(*names):
    """Build a players list (list of {'player_name': ...}) from raw names."""
    return [{"player_name": n} for n in names]


# --------------------------------------------------------------------------- #
# _normalize_name
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Miracle-", "miracle"),
        ("  N0tail ", "n0tail"),
        ("Ab Cd!", "abcd"),
        ("", ""),
        (None, ""),
        ("Аdmiral", "admiral"),  # leading char is Cyrillic 'А' (U+0410)
        ("СКА", "cka"),          # all-Cyrillic -> latin skeleton
    ],
)
def test_normalize_name(raw, expected):
    assert _normalize_name(raw) == expected


# --------------------------------------------------------------------------- #
# _align_players_with_draft
# --------------------------------------------------------------------------- #
def test_exact_match_same_order():
    players = _p("Miracle-", "N0tail", "Topson", "Ceb")
    draft = ["Miracle-", "N0tail", "Topson", "Ceb"]
    mapping, reordered = _align_players_with_draft(players, draft)
    assert mapping == {0: 0, 1: 1, 2: 2, 3: 3}
    assert [r["player_name"] for r in reordered] == draft


def test_exact_match_shuffled_order():
    players = _p("Ceb", "Topson", "N0tail", "Miracle-")
    draft = ["Miracle-", "N0tail", "Topson", "Ceb"]
    mapping, reordered = _align_players_with_draft(players, draft)
    # draft index -> player index in the (shuffled) players list
    assert mapping == {0: 3, 1: 2, 2: 1, 3: 0}
    assert [r["player_name"] for r in reordered] == draft


def test_substring_containment_match():
    # normalized draft name is a substring of the detected name
    players = _p("n0tailthebest")
    draft = ["N0tail"]
    mapping, reordered = _align_players_with_draft(players, draft)
    assert mapping == {0: 0}
    assert reordered[0]["player_name"] == "n0tailthebest"


def test_fuzzy_difflib_match_above_threshold():
    # single-character OCR error, difflib ratio >= default min_ratio (0.7)
    players = _p("MiracIe")  # capital i instead of lowercase L
    draft = ["Miracle"]
    mapping, _ = _align_players_with_draft(players, draft)
    assert mapping == {0: 0}


def test_no_match_below_threshold_leaves_unmatched():
    players = _p("zzzzzz")
    draft = ["Miracle"]
    mapping, reordered = _align_players_with_draft(players, draft)
    assert mapping == {}
    assert reordered == [None]


def test_cyrillic_confusable_aligns_to_latin():
    players = _p("Аdmiral")  # Cyrillic leading 'А'
    draft = ["admiral"]
    mapping, _ = _align_players_with_draft(players, draft)
    assert mapping == {0: 0}


def test_reordered_length_matches_draft_when_counts_differ():
    players = _p("Miracle-", "N0tail")
    draft = ["Miracle-", "N0tail", "Topson"]  # one extra draft slot
    mapping, reordered = _align_players_with_draft(players, draft)
    assert len(reordered) == len(draft)
    assert reordered[2] is None  # unmatched draft slot stays empty


# --------------------------------------------------------------------------- #
# _refine_alignment_with_captains_and_leftovers
# --------------------------------------------------------------------------- #
def test_refine_anchors_captains_from_draft_info():
    # Nothing matched yet; captains in draft_info anchor draft 0/1 to exact names.
    players = _p("RadiantCap", "DireCap")
    draft = ["RadiantCap", "DireCap"]
    draft_info = {"captains": {"Radiant": "RadiantCap", "Dire": "DireCap"}}
    mapping, reordered = _refine_alignment_with_captains_and_leftovers(
        {}, players, draft, draft_info=draft_info
    )
    assert mapping == {0: 0, 1: 1}
    assert [r["player_name"] for r in reordered] == draft


def test_refine_falls_back_to_strategy_captains():
    players = _p("RadiantCap", "DireCap")
    draft = ["RadiantCap", "DireCap"]
    mapping, _ = _refine_alignment_with_captains_and_leftovers(
        {}, players, draft, draft_info={}, strategy_captains={"Radiant": "RadiantCap"}
    )
    assert mapping[0] == 0  # anchored from strategy captains


def test_refine_assigns_leftovers_without_threshold():
    # A pair that would fall below the strict alignment threshold still gets
    # assigned here because refine has no minimum score.
    players = _p("zzzzzz")
    draft = ["Miracle"]
    mapping, reordered = _refine_alignment_with_captains_and_leftovers(
        {}, players, draft, draft_info={}
    )
    assert mapping == {0: 0}
    assert reordered[0]["player_name"] == "zzzzzz"


def test_refine_preserves_existing_mapping():
    players = _p("Miracle-", "N0tail")
    draft = ["Miracle-", "N0tail"]
    mapping, _ = _refine_alignment_with_captains_and_leftovers(
        {0: 0}, players, draft, draft_info={}
    )
    assert mapping[0] == 0
    assert mapping[1] == 1


def test_refine_leftover_containment_wins_over_weak_ratio():
    # "miracle" is a substring of "xmiraclex" -> containment score (1.10) beats the
    # low difflib ratio of the other pairing, so it is assigned first, leaving the
    # remaining draft slot for the remaining player.
    players = _p("xMiraclex", "zzzz")
    draft = ["Miracle", "abcd"]
    mapping, reordered = _refine_alignment_with_captains_and_leftovers(
        {}, players, draft, draft_info={}
    )
    assert mapping == {0: 0, 1: 1}
    assert reordered[0]["player_name"] == "xMiraclex"
    assert reordered[1]["player_name"] == "zzzz"


def test_refine_assigns_all_three_leftovers():
    players = _p("Alpha", "Bravo", "Charlie")
    draft = ["Charlie", "Alpha", "Bravo"]
    mapping, reordered = _refine_alignment_with_captains_and_leftovers(
        {}, players, draft, draft_info={}
    )
    assert mapping == {0: 2, 1: 0, 2: 1}
    assert [r["player_name"] for r in reordered] == draft


def test_refine_captain_anchor_takes_precedence_over_ambiguous_leftover():
    # Two players both *contain* the captain name "cap" (equal leftover score),
    # so without anchoring the greedy tie could map draft 0 to either. The exact
    # captain anchor must deterministically bind draft 0 -> the exact "Cap" player.
    players = _p("Cap", "Capx")
    draft = ["Cap", "Other"]
    draft_info = {"captains": {"Radiant": "Cap", "Dire": None}}
    mapping, reordered = _refine_alignment_with_captains_and_leftovers(
        {}, players, draft, draft_info=draft_info
    )
    assert mapping[0] == 0
    assert reordered[0]["player_name"] == "Cap"


def test_refine_word_reordered_team_names_do_not_align_well():
    # Documents a real limitation: _normalize_name strips spaces, collapsing
    # "Team Liquid" / "Liquid Team" into single tokens, so the token-overlap path
    # cannot recover word-swapped names. They still get *assigned* here (refine has
    # no threshold), but only via the weak difflib-ratio fallback, not containment.
    players = _p("Liquid Team")
    draft = ["Team Liquid"]
    mapping, _ = _refine_alignment_with_captains_and_leftovers(
        {}, players, draft, draft_info={}
    )
    # assigned (no threshold in refine) but not by containment
    assert mapping == {0: 0}
