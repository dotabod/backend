"""Offline geometry tests for the in-game (GAME_IN_PROGRESS) top-bar extractor.

These validate the crop math/bounds derived from tooltips/src/components/TopHud.tsx
(hero 60x40, 62px pitch, clock +/-102.5, 9deg skew). Template-matching accuracy on
real footage is a separate calibration step that needs an actual gameplay frame.
"""
import numpy as np

from dota_hero_detection import (
    extract_in_game_hero_icons,
    IN_GAME_HERO_WIDTH,
    IN_GAME_ACTUAL_HEIGHT,
    IN_GAME_TOP_PADDING,
)


def _blank_1080p():
    # Real numpy is available offline (cv2/numpy are not stubbed in conftest).
    return np.zeros((1080, 1920, 3), dtype=np.uint8)


def test_extract_returns_ten_slots_split_by_team():
    icons = extract_in_game_hero_icons(_blank_1080p())
    assert len(icons) == 10

    radiant = [(t, p) for (t, p, _img) in icons if t == "Radiant"]
    dire = [(t, p) for (t, p, _img) in icons if t == "Dire"]
    assert sorted(p for _t, p in radiant) == [0, 1, 2, 3, 4]
    assert sorted(p for _t, p in dire) == [0, 1, 2, 3, 4]


def test_extracted_icons_are_deskewed_to_expected_size():
    icons = extract_in_game_hero_icons(_blank_1080p())
    # De-skewed (warped) to an upright rectangle: width = hero width, height =
    # actual height minus the trimmed top colour strip.
    exp_w = IN_GAME_HERO_WIDTH
    exp_h = IN_GAME_ACTUAL_HEIGHT - IN_GAME_TOP_PADDING
    for _team, _pos, img in icons:
        h, w = img.shape[:2]
        assert (h, w) == (exp_h, exp_w)
        assert img.size > 0


def test_tiny_frame_is_rejected():
    tiny = np.zeros((20, 200, 3), dtype=np.uint8)
    assert extract_in_game_hero_icons(tiny) == []
