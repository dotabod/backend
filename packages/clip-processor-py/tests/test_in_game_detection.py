"""Offline geometry tests for the in-game (GAME_IN_PROGRESS) top-bar extractor.

These validate the crop math/bounds derived from tooltips/src/components/TopHud.tsx
(hero 60x40, 62px pitch, clock +/-102.5, 9deg skew). Template-matching accuracy on
real footage is a separate calibration step that needs an actual gameplay frame.
"""
from unittest.mock import patch

import cv2
import numpy as np

import dota_hero_detection
from dota_hero_detection import (
    extract_in_game_hero_icons,
    load_in_game_templates,
    match_in_game_icon,
    process_frame_for_in_game_heroes,
    IN_GAME_BORDER_SIZE,
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


# --------------------------------------------------------------------------- #
# match_in_game_icon
# --------------------------------------------------------------------------- #
def _bordered_template(hero_id, localized, base):
    """Build a (id, name, localized, bordered_template) tuple like load_in_game_templates."""
    tpl = cv2.resize(base, (128, 72))
    bordered = cv2.copyMakeBorder(
        tpl, IN_GAME_BORDER_SIZE, IN_GAME_BORDER_SIZE, IN_GAME_BORDER_SIZE,
        IN_GAME_BORDER_SIZE, cv2.BORDER_CONSTANT, value=[0, 0, 0],
    )
    return (hero_id, f"npc_{hero_id}", localized, bordered)


def _solid(color):
    img = np.zeros((72, 128, 3), dtype=np.uint8)
    img[:, :64] = color  # half-filled so distinct templates aren't all-equal
    return img


def test_match_in_game_icon_best_is_most_similar_template():
    red, green, blue = (255, 0, 0), (0, 255, 0), (0, 0, 255)
    templates = [
        _bordered_template(1, "HeroA", _solid(red)),
        _bordered_template(2, "HeroB", _solid(green)),
        _bordered_template(3, "HeroC", _solid(blue)),
    ]
    # Icon identical to HeroB's source -> HeroB must win.
    results = match_in_game_icon(_solid(green), templates)
    assert results[0]["hero_id"] == 2
    assert results[0]["hero_localized_name"] == "HeroB"


def test_match_in_game_icon_returns_sorted_candidates_with_blank_variant():
    templates = [
        _bordered_template(1, "HeroA", _solid((255, 0, 0))),
        _bordered_template(2, "HeroB", _solid((0, 255, 0))),
        _bordered_template(3, "HeroC", _solid((0, 0, 255))),
    ]
    results = match_in_game_icon(_solid((0, 255, 0)), templates)
    scores = [r["match_score"] for r in results]
    assert scores == sorted(scores, reverse=True)
    # variant is intentionally blank so dedup keys on hero_id only.
    assert all(r["variant"] == "" for r in results)
    assert all(isinstance(r["match_score"], float) for r in results)


def test_match_in_game_icon_respects_top_n():
    templates = [
        _bordered_template(i, f"Hero{i}", _solid((i * 40 % 256, 0, 0)))
        for i in range(1, 6)
    ]
    assert len(match_in_game_icon(_solid((40, 0, 0)), templates, top_n=2)) == 2
    assert len(match_in_game_icon(_solid((40, 0, 0)), templates, top_n=5)) == 5


# --------------------------------------------------------------------------- #
# load_in_game_templates
# --------------------------------------------------------------------------- #
def test_load_in_game_templates_globs_and_borders(tmp_path, monkeypatch):
    # Reset the module-level cache so this test controls what gets loaded.
    monkeypatch.setattr(dota_hero_detection, "_IN_GAME_TEMPLATES", None)
    monkeypatch.setattr(dota_hero_detection, "HEROES_DIR", tmp_path)

    # Two hero portrait PNGs on disk: 1_base.png (hero 1) and 2_alt.png (hero 2).
    cv2.imwrite(str(tmp_path / "1_base.png"), _solid((255, 0, 0)))
    cv2.imwrite(str(tmp_path / "2_alt.png"), _solid((0, 255, 0)))
    # A non-matching file that must NOT be globbed for hero 1.
    cv2.imwrite(str(tmp_path / "99_other.png"), _solid((0, 0, 255)))

    heroes_data = [
        {"id": 1, "name": "npc_1", "localized_name": "HeroA"},
        {"id": 2, "name": "npc_2", "localized_name": "HeroB"},
    ]
    with patch.object(dota_hero_detection, "load_heroes_data", return_value=heroes_data):
        templates = load_in_game_templates()

    # One template per hero (only the id-prefixed files for each hero).
    assert len(templates) == 2
    ids = sorted(t[0] for t in templates)
    assert ids == [1, 2]
    bs = IN_GAME_BORDER_SIZE
    for hero_id, name, localized, bordered in templates:
        # Bordered to (72 + 2*bs) x (128 + 2*bs).
        assert bordered.shape[:2] == (72 + 2 * bs, 128 + 2 * bs)
        assert localized in ("HeroA", "HeroB")


def test_load_in_game_templates_is_cached(monkeypatch):
    sentinel = [(1, "npc_1", "HeroA", np.zeros((112, 168, 3), np.uint8))]
    monkeypatch.setattr(dota_hero_detection, "_IN_GAME_TEMPLATES", sentinel)
    # load_heroes_data must not even be consulted when the cache is populated.
    with patch.object(dota_hero_detection, "load_heroes_data") as lhd:
        result = load_in_game_templates()
    assert result is sentinel
    lhd.assert_not_called()


# --------------------------------------------------------------------------- #
# process_frame_for_in_game_heroes (end-to-end with mocked stages)
# --------------------------------------------------------------------------- #
def test_process_frame_dedups_and_sorts(monkeypatch):
    # 10 extracted icons (team, position, icon); icon contents are irrelevant
    # because match_in_game_icon is stubbed.
    fake_icons = [("Radiant", i, object()) for i in range(5)] + \
                 [("Dire", i, object()) for i in range(5)]
    monkeypatch.setattr(dota_hero_detection, "load_image", lambda _p: np.zeros((1080, 1920, 3), np.uint8))
    monkeypatch.setattr(dota_hero_detection, "load_in_game_templates", lambda: [("t",)])
    monkeypatch.setattr(dota_hero_detection, "extract_in_game_hero_icons",
                        lambda frame, debug=False: fake_icons)

    # First two icons collide on hero 100; remaining slots get distinct ids so
    # dedup must push the lower-confidence collider to its alternate (id 101).
    counter = {"n": 0}

    def varied_match(icon, templates, top_n=3):
        i = counter["n"]
        counter["n"] += 1
        if i < 2:
            return [
                {"hero_id": 100, "hero_localized_name": "Dup", "variant": "", "match_score": 0.9 - i * 0.01},
                {"hero_id": 101, "hero_localized_name": "Alt", "variant": "", "match_score": 0.5},
            ]
        return [{"hero_id": 200 + i, "hero_localized_name": f"H{i}", "variant": "", "match_score": 0.8}]

    monkeypatch.setattr(dota_hero_detection, "match_in_game_icon", varied_match)

    result = process_frame_for_in_game_heroes("frame.jpg")

    # 10 unique heroes resolved (no duplicate hero_id after dedup).
    assert len(result) == 10
    assert len({h["hero_id"] for h in result}) == 10
    # Both 100 and 101 present (the collision was resolved to the alternate).
    assert 100 in {h["hero_id"] for h in result}
    assert 101 in {h["hero_id"] for h in result}
    # Sorted Radiant-before-Dire, then by ascending position.
    keyed = [(h["team"] == "Dire", h["position"]) for h in result]
    assert keyed == sorted(keyed)
    radiant = [h for h in result if h["team"] == "Radiant"]
    dire = [h for h in result if h["team"] == "Dire"]
    assert [h["position"] for h in radiant] == [0, 1, 2, 3, 4]
    assert [h["position"] for h in dire] == [0, 1, 2, 3, 4]


def test_process_frame_returns_empty_when_frame_unloadable(monkeypatch):
    monkeypatch.setattr(dota_hero_detection, "load_image", lambda _p: None)
    assert process_frame_for_in_game_heroes("missing.jpg") == []


def test_process_frame_returns_empty_when_no_templates(monkeypatch):
    monkeypatch.setattr(dota_hero_detection, "load_image", lambda _p: np.zeros((1, 1, 3), np.uint8))
    monkeypatch.setattr(dota_hero_detection, "load_in_game_templates", lambda: [])
    assert process_frame_for_in_game_heroes("frame.jpg") == []


def test_process_frame_returns_empty_when_no_icons(monkeypatch):
    monkeypatch.setattr(dota_hero_detection, "load_image", lambda _p: np.zeros((1, 1, 3), np.uint8))
    monkeypatch.setattr(dota_hero_detection, "load_in_game_templates", lambda: [("t",)])
    monkeypatch.setattr(dota_hero_detection, "extract_in_game_hero_icons", lambda f, debug=False: [])
    assert process_frame_for_in_game_heroes("frame.jpg") == []
