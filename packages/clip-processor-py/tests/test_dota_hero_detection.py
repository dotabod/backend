"""Tests for dota_hero_detection helpers, pure math, and small image ops.

numpy and cv2 (opencv-headless) are real offline deps, so image functions are
exercised with synthetic arrays. Heavy network/IO deps (clip download, stream
capture) are mocked at the process_media boundary.
"""

import itertools
import json
import os
from unittest.mock import patch

import cv2
import numpy as np
import pytest

import dota_hero_detection as dhd


@pytest.fixture(autouse=True)
def _restore_env():
    # process_media writes ADD_BORDER/APPLY_BLUR/EXTRACT_RANK_BANNERS/etc directly
    # into os.environ; snapshot+restore so those don't leak across tests.
    saved = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(saved)


@pytest.fixture(autouse=True)
def _reset_heroes_singleton():
    saved = dhd._LOADED_HEROES_DATA
    dhd._LOADED_HEROES_DATA = None
    yield
    dhd._LOADED_HEROES_DATA = saved


# --------------------------------------------------------------------------- #
# PerformanceTimer
# --------------------------------------------------------------------------- #
def test_performance_timer_start_stop_summary():
    t = dhd.PerformanceTimer()
    t.start("a")
    first = t.stop("a")
    assert first >= 0
    # already stopped -> returns the same last duration
    assert t.stop("a") == first
    summary = t.get_summary()
    assert summary["a"]["count"] == 1
    assert summary["a"]["total"] == pytest.approx(first)


def test_performance_timer_stop_unknown_label_returns_zero():
    assert dhd.PerformanceTimer().stop("never-started") == 0


# --------------------------------------------------------------------------- #
# clear_debug_directory / save_debug_image / load_image
# --------------------------------------------------------------------------- #
def test_clear_debug_directory_removes_files(tmp_path):
    (tmp_path / "old.jpg").write_bytes(b"x")
    with patch.object(dhd, "DEBUG_DIR", tmp_path):
        dhd.clear_debug_directory()
    assert list(tmp_path.glob("*")) == []


def test_clear_debug_directory_creates_when_missing(tmp_path):
    missing = tmp_path / "debug"
    with patch.object(dhd, "DEBUG_DIR", missing):
        dhd.clear_debug_directory()
    assert missing.exists()


def test_save_debug_image_noop_when_disabled(tmp_path, monkeypatch):
    monkeypatch.delenv("DEBUG_IMAGES", raising=False)
    assert dhd.save_debug_image(np.zeros((4, 4, 3), np.uint8), "x") is None


def test_save_debug_image_writes_when_enabled(tmp_path, monkeypatch):
    monkeypatch.setenv("DEBUG_IMAGES", "1")
    with patch.object(dhd, "DEBUG_DIR", tmp_path):
        out = dhd.save_debug_image(np.zeros((8, 8, 3), np.uint8), "frame", "info")
    assert out is not None and (tmp_path / "frame.jpg").exists()


def test_load_image_roundtrip_and_missing(tmp_path):
    img = np.full((10, 12, 3), 128, np.uint8)
    path = tmp_path / "f.jpg"
    cv2.imwrite(str(path), img)
    loaded = dhd.load_image(path)
    assert loaded is not None and loaded.shape == (10, 12, 3)
    assert dhd.load_image(tmp_path / "missing.jpg") is None


def test_load_image_color_correction_path(tmp_path, monkeypatch):
    path = tmp_path / "f.jpg"
    cv2.imwrite(str(path), np.full((6, 6, 3), 200, np.uint8))
    monkeypatch.setenv("COLOR_CORRECTION", "1")
    loaded = dhd.load_image(path)
    assert loaded is not None and loaded.shape == (6, 6, 3)


# --------------------------------------------------------------------------- #
# adjust_levels (pure numpy)
# --------------------------------------------------------------------------- #
def test_adjust_levels_clips_and_keeps_uint8():
    img = np.array([[0, 64, 128, 192, 255]], np.uint8)
    out = dhd.adjust_levels(img, 0, 255, 1.0)
    assert out.dtype == np.uint8 and out.shape == img.shape
    assert int(out.min()) >= 0 and int(out.max()) <= 255


# --------------------------------------------------------------------------- #
# _compute_draft_name_boxes (pure math)
# --------------------------------------------------------------------------- #
def test_compute_draft_name_boxes_base_resolution(monkeypatch):
    for k in ("DRAFT_BASE_WIDTH", "DRAFT_BASE_HEIGHT", "DRAFT_Y_START", "DRAFT_Y_END",
              "DRAFT_X_START_1", "DRAFT_GAP", "DRAFT_NUM_NAMES", "DRAFT_NAME_WIDTH"):
        monkeypatch.delenv(k, raising=False)
    boxes = dhd._compute_draft_name_boxes(1920, 1080)
    assert len(boxes) == 8
    assert boxes[0] == (125, 480, 325, 515)
    # second box starts after width + gap
    assert boxes[1][0] == 325 + 10


def test_compute_draft_name_boxes_scales_with_resolution(monkeypatch):
    for k in ("DRAFT_BASE_WIDTH", "DRAFT_BASE_HEIGHT"):
        monkeypatch.delenv(k, raising=False)
    half = dhd._compute_draft_name_boxes(960, 540)
    assert half[0] == (62, 240, 162, 258)  # ~half of the base-resolution box


# --------------------------------------------------------------------------- #
# extract_hero_bar
# --------------------------------------------------------------------------- #
def test_extract_hero_bar_succeeds_on_large_frame():
    frame = np.zeros((130, 1920, 3), np.uint8)
    ok, cropped, center_x = dhd.extract_hero_bar(frame)
    assert ok is True
    assert center_x == 960
    assert cropped.shape[0] == dhd.HERO_TOTAL_HEIGHT


def test_extract_hero_bar_fails_on_small_frame():
    ok, cropped, center_x = dhd.extract_hero_bar(np.zeros((50, 50, 3), np.uint8))
    assert ok is False and cropped is None


# --------------------------------------------------------------------------- #
# crop_hero_portrait
# --------------------------------------------------------------------------- #
def test_crop_hero_portrait_scales_crop_region():
    icon = np.zeros((dhd.HERO_ACTUAL_HEIGHT, dhd.HERO_WIDTH, 3), np.uint8)
    cropped = dhd.crop_hero_portrait(icon)
    # reference crop is 46x40 at the reference size -> same here (scale 1.0)
    assert cropped.shape[0] == 40 and cropped.shape[1] == 46


def test_crop_hero_portrait_returns_original_when_too_small():
    tiny = np.zeros((2, 2, 3), np.uint8)
    out = dhd.crop_hero_portrait(tiny)
    assert out.shape == tiny.shape  # invalid crop -> original returned


# --------------------------------------------------------------------------- #
# get_player_name_area_coordinates (pure math)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("team", ["Radiant", "Dire"])
def test_player_name_area_coordinates_in_bounds(team):
    top_bar = np.zeros((dhd.HERO_TOTAL_HEIGHT, 1920, 3), np.uint8)
    x, y, w, h = dhd.get_player_name_area_coordinates(top_bar, 960, team, 2)
    assert x >= 0 and w > 0 and h > 0
    assert x + w <= 1920


# --------------------------------------------------------------------------- #
# match_template
# --------------------------------------------------------------------------- #
def test_match_template_returns_zero_for_none_template():
    args = (np.zeros((20, 20, 3), np.uint8), None, {}, "base", 1, "n", "N")
    assert dhd.match_template(args)["match_score"] == 0


def test_match_template_discriminates_matching_from_mismatched():
    # Uniform arrays are useless here: TM_CCORR_NORMED of any two constant images
    # is always 1.0, so the score would pass regardless of correctness. Use a
    # structured icon so the matcher actually has to find the template.
    rng = np.random.default_rng(0)
    icon = rng.integers(0, 256, (20, 20, 3), dtype=np.uint8)
    matching = icon[3:13, 4:14].copy()      # an exact sub-region -> perfect match
    mismatched = 255 - matching             # photo-negative of it -> clearly worse

    match = dhd.match_template((icon, matching, {}, "base", 7, "axe", "Axe"))
    miss = dhd.match_template((icon, mismatched, {}, "base", 7, "axe", "Axe"))

    assert match["hero_id"] == 7
    assert match["match_score"] == pytest.approx(1.0)  # template is literally present
    assert match["match_score"] > miss["match_score"] + 0.15  # discriminative


# --------------------------------------------------------------------------- #
# resolve_hero_duplicates
# --------------------------------------------------------------------------- #
def _cand(hero_id, score, team="Radiant", pos=0, variant="base"):
    return {"hero_id": hero_id, "variant": variant, "team": team, "position": pos,
            "hero_localized_name": f"H{hero_id}", "match_score": score}


def test_resolve_hero_duplicates_keeps_unique():
    candidates = [[_cand(1, 0.9, pos=0)], [_cand(2, 0.8, pos=1)]]
    resolved = dhd.resolve_hero_duplicates(candidates)
    assert {h["hero_id"] for h in resolved} == {1, 2}


def test_resolve_hero_duplicates_uses_alternate_for_collision():
    # both positions' top pick is hero 1; the lower-confidence slot must fall back.
    candidates = [
        [_cand(1, 0.95, pos=0), _cand(3, 0.50, pos=0)],
        [_cand(1, 0.80, pos=1), _cand(2, 0.40, pos=1)],
    ]
    resolved = dhd.resolve_hero_duplicates(candidates)
    ids = sorted(h["hero_id"] for h in resolved)
    assert ids == [1, 2]  # pos0 keeps hero1 (higher), pos1 falls back to hero2


# --------------------------------------------------------------------------- #
# process_clip_url / process_stream_username delegate to process_media
# --------------------------------------------------------------------------- #
def test_process_clip_url_delegates():
    with patch.object(dhd, "process_media", return_value={"ok": True}) as pm:
        out = dhd.process_clip_url("http://clip", only_draft=True)
    assert out == {"ok": True}
    assert pm.call_args.kwargs["source_type"] == "clip"
    assert pm.call_args.kwargs["only_draft"] is True


def test_process_stream_username_delegates():
    with patch.object(dhd, "process_media", return_value={"ok": True}) as pm:
        out = dhd.process_stream_username("alice", num_frames=5)
    assert out == {"ok": True}
    assert pm.call_args.kwargs["source_type"] == "stream"
    assert pm.call_args.kwargs["num_frames"] == 5


# --------------------------------------------------------------------------- #
# is_valid_hud
# --------------------------------------------------------------------------- #
def test_is_valid_hud_requires_enough_strong_slots():
    strong = [{"match_score": 0.9} for _ in range(8)]
    assert dhd.is_valid_hud(strong) is True
    assert dhd.is_valid_hud(strong[:4]) is False
    assert dhd.is_valid_hud([]) is False


# --------------------------------------------------------------------------- #
# redetect_low_confidence_slots
# --------------------------------------------------------------------------- #
def test_redetect_noop_when_all_strong():
    heroes = [{"team": "Radiant", "position": 0, "match_score": 0.9}]
    assert dhd.redetect_low_confidence_slots(heroes, ["f.jpg"]) is heroes


def test_redetect_upgrades_weak_slot_from_extra_frame():
    heroes = [{"team": "Radiant", "position": 0, "match_score": 0.2,
               "hero_localized_name": "Weak"}]
    better = [{"team": "Radiant", "position": 0, "match_score": 0.95,
               "hero_localized_name": "Strong"}]
    with patch.object(dhd, "process_frame_for_heroes", return_value=better):
        out = dhd.redetect_low_confidence_slots(heroes, ["extra.jpg"])
    assert out[0]["hero_localized_name"] == "Strong"
    assert out[0]["match_score"] == 0.95


# --------------------------------------------------------------------------- #
# process_frames_for_heroes
# --------------------------------------------------------------------------- #
def test_process_frames_returns_empty_on_poor_color_match():
    with patch.object(dhd, "detect_hero_color_bars", return_value=(0.3, {})):
        heroes, info = dhd.process_frames_for_heroes(["f0.jpg", "f1.jpg"])
    assert heroes == []
    assert info["match_score"] == 0.3


def test_process_frames_uses_perfect_match_frame():
    heroes_out = [{"team": "Radiant", "position": 0, "match_score": 0.9}]
    with patch.object(dhd, "detect_hero_color_bars", return_value=(1.0, {"x": 1})), \
         patch.object(dhd, "process_frame_for_heroes", return_value=heroes_out) as pf:
        heroes, info = dhd.process_frames_for_heroes(["f0.jpg"])
    assert heroes == heroes_out
    assert info["match_score"] == 1.0
    pf.assert_called_once()


# --------------------------------------------------------------------------- #
# process_media
# --------------------------------------------------------------------------- #
def _heroes_and_info(n=8):
    heroes = [
        {"team": "Radiant" if i < n // 2 else "Dire", "position": i % 5,
         "hero_localized_name": f"H{i}", "hero_id": i, "match_score": 0.95}
        for i in range(n)
    ]
    info = {"frame_index": 0, "frame_path": "best.jpg", "match_score": 1.0, "detected_colors": {}}
    return heroes, info


def test_process_media_clip_happy_path():
    heroes, info = _heroes_and_info()
    with patch.object(dhd, "get_clip_details", return_value={"id": "c1", "duration": 30}), \
         patch.object(dhd, "download_single_frame", return_value="frame0.jpg"), \
         patch.object(dhd, "load_image", return_value=np.zeros((120, 1920, 3), np.uint8)), \
         patch.object(dhd, "process_frames_for_heroes", return_value=(heroes, info)), \
         patch.object(dhd, "is_valid_hud", return_value=True), \
         patch.object(dhd, "extract_team_captains_from_frame", return_value={}):
        result = dhd.process_media("http://clip", source_type="clip")
    assert result is not None
    assert len(result["players"]) == 8
    assert result["source_type"] == "clip"
    assert result["players"][0]["position"] == result["heroes"][0]["position"] + 1


def test_process_media_stream_happy_path():
    heroes, info = _heroes_and_info()
    with patch.object(dhd, "capture_multiple_frames", return_value=["s0.jpg"]), \
         patch.object(dhd, "load_image", return_value=np.zeros((120, 1920, 3), np.uint8)), \
         patch.object(dhd, "process_frames_for_heroes", return_value=(heroes, info)), \
         patch.object(dhd, "is_valid_hud", return_value=True), \
         patch.object(dhd, "extract_team_captains_from_frame", return_value={}):
        result = dhd.process_media("alice", source_type="stream", num_frames=1)
    assert result is not None and result["source_type"] == "stream"


def test_process_media_stream_returns_none_when_no_frames():
    with patch.object(dhd, "capture_multiple_frames", return_value=[]):
        assert dhd.process_media("alice", source_type="stream") is None


def test_process_media_returns_none_when_no_heroes():
    with patch.object(dhd, "get_clip_details", return_value={"id": "c1"}), \
         patch.object(dhd, "download_single_frame", return_value="frame0.jpg"), \
         patch.object(dhd, "load_image", return_value=np.zeros((120, 1920, 3), np.uint8)), \
         patch.object(dhd, "process_frames_for_heroes", return_value=([], {"frame_index": 0, "frame_path": None, "match_score": 0.0, "detected_colors": {}})):
        assert dhd.process_media("http://clip", source_type="clip") is None


def test_process_media_only_draft_returns_draft_result():
    with patch.object(dhd, "get_clip_details", return_value={"id": "c1"}), \
         patch.object(dhd, "download_single_frame", return_value="frame0.jpg"), \
         patch.object(dhd, "load_image", return_value=np.zeros((120, 1920, 3), np.uint8)), \
         patch.object(dhd, "isFrameDraft", return_value=True), \
         patch.object(dhd, "processDraft", return_value={"is_draft": True, "captains": {}}):
        result = dhd.process_media("http://clip", source_type="clip", only_draft=True)
    assert result["is_draft"] is True
    assert result["source_type"] == "clip"


def test_process_media_only_draft_when_not_draft():
    with patch.object(dhd, "get_clip_details", return_value={"id": "c1"}), \
         patch.object(dhd, "download_single_frame", return_value="frame0.jpg"), \
         patch.object(dhd, "load_image", return_value=np.zeros((120, 1920, 3), np.uint8)), \
         patch.object(dhd, "isFrameDraft", return_value=False):
        result = dhd.process_media("http://clip", source_type="clip", only_draft=True)
    assert result["is_draft"] is False


def test_process_media_rejects_invalid_hud():
    heroes, info = _heroes_and_info(n=2)  # too few strong slots
    with patch.object(dhd, "get_clip_details", return_value={"id": "c1"}), \
         patch.object(dhd, "download_single_frame", return_value="frame0.jpg"), \
         patch.object(dhd, "load_image", return_value=np.zeros((120, 1920, 3), np.uint8)), \
         patch.object(dhd, "process_frames_for_heroes", return_value=(heroes, info)), \
         patch.object(dhd, "is_valid_hud", return_value=False):
        assert dhd.process_media("http://clip", source_type="clip") is None


# --------------------------------------------------------------------------- #
# extract_hero_icons
# --------------------------------------------------------------------------- #
def test_extract_hero_icons_returns_ten_icons():
    top_bar = np.zeros((dhd.HERO_TOTAL_HEIGHT, 1920, 3), np.uint8)
    icons = dhd.extract_hero_icons(top_bar, 960)
    assert len(icons) == 10
    teams = [t for t, _, _ in icons]
    assert teams.count("Radiant") == 5 and teams.count("Dire") == 5


# --------------------------------------------------------------------------- #
# get_top_hero_matches
# --------------------------------------------------------------------------- #
def test_get_top_hero_matches_empty_data_returns_empty():
    assert dhd.get_top_hero_matches(np.zeros((66, 108, 3), np.uint8), []) == []


def test_get_top_hero_matches_ranks_matching_template_first(monkeypatch):
    monkeypatch.delenv("ADD_BORDER", raising=False)
    monkeypatch.delenv("APPLY_BLUR", raising=False)
    # Icon with real spatial structure (left half dark, right half bright) so the
    # score reflects template similarity rather than the trivial 1.0 a flat image
    # always yields. The hero whose template mirrors that split must win.
    icon = np.zeros((66, 108, 3), np.uint8)
    icon[:, 54:] = 255
    matching = np.zeros((72, 128, 3), np.uint8)
    matching[:, 64:] = 255              # same split as the icon
    inverted = np.full((72, 128, 3), 255, np.uint8)
    inverted[:, 64:] = 0               # opposite split -> should score far lower
    heroes_data = [
        {"id": 7, "name": "npc_dota_hero_axe", "localized_name": "Axe",
         "variants": [{"variant": "base", "cached_template": matching}]},
        {"id": 9, "name": "npc_dota_hero_mirana", "localized_name": "Mirana",
         "variants": [{"variant": "base", "cached_template": inverted}]},
    ]
    matches = dhd.get_top_hero_matches(icon, heroes_data, min_score=0.0)
    assert matches[0]["hero_id"] == 7
    assert matches[0]["match_score"] > 0.8
    inverted_score = next(m["match_score"] for m in matches if m["hero_id"] == 9)
    assert matches[0]["match_score"] > inverted_score + 0.5  # clearly discriminative


# --------------------------------------------------------------------------- #
# load_heroes_data (precompute + singleton)
# --------------------------------------------------------------------------- #
def test_load_heroes_data_precomputes_and_caches(tmp_path, monkeypatch):
    portrait = tmp_path / "7_base.png"
    cv2.imwrite(str(portrait), np.full((72, 108, 3), 80, np.uint8))
    heroes_file = tmp_path / "hero_data.json"
    heroes_file.write_text(json.dumps([
        {"id": 7, "name": "npc_dota_hero_axe", "localized_name": "Axe",
         "variants": [{"variant": "base", "image_path": str(portrait)}]}
    ]))
    cache = tmp_path / "templates_cache.npz"
    monkeypatch.setattr(dhd, "HEROES_FILE", heroes_file)
    monkeypatch.setattr(dhd, "TEMPLATES_CACHE_FILE", cache)

    data = dhd.load_heroes_data()
    assert data[0]["variants"][0]["cached_template"] is not None
    assert cache.exists()  # precomputed cache written
    # singleton: second call returns the same object without recomputing
    assert dhd.load_heroes_data() is data


# --------------------------------------------------------------------------- #
# process_frame_for_heroes
# --------------------------------------------------------------------------- #
def test_process_frame_returns_empty_when_frame_unloadable():
    with patch.object(dhd, "load_image", return_value=None):
        assert dhd.process_frame_for_heroes("missing.jpg") == []


def test_process_frame_returns_empty_without_heroes_data():
    with patch.object(dhd, "load_image", return_value=np.zeros((1080, 1920, 3), np.uint8)), \
         patch.object(dhd, "load_heroes_data", return_value=None):
        assert dhd.process_frame_for_heroes("f.jpg") == []


def test_process_frame_returns_empty_when_hero_bar_fails():
    with patch.object(dhd, "load_image", return_value=np.zeros((40, 40, 3), np.uint8)), \
         patch.object(dhd, "load_heroes_data", return_value=[{"id": 1}]):
        assert dhd.process_frame_for_heroes("f.jpg") == []


def test_process_frame_identifies_heroes(monkeypatch):
    monkeypatch.setattr(dhd, "TESSERACT_AVAILABLE", False)
    monkeypatch.setattr(dhd, "_LOADED_FACET_TEMPLATES", None)
    counter = itertools.count(1)

    def fake_matches(icon, data, **kwargs):
        hid = next(counter)
        return [{"hero_id": hid, "variant": "base",
                 "hero_localized_name": f"H{hid}", "match_score": 0.9}]

    with patch.object(dhd, "load_image", return_value=np.zeros((1080, 1920, 3), np.uint8)), \
         patch.object(dhd, "load_heroes_data", return_value=[{"id": 1}]), \
         patch.object(dhd, "get_top_hero_matches", side_effect=fake_matches), \
         patch.object(dhd, "load_facet_templates_singleton"):
        heroes = dhd.process_frame_for_heroes("f.jpg")
    assert len(heroes) == 10  # all positions resolved to distinct heroes
    assert all("team" in h and "position" in h for h in heroes)


# --------------------------------------------------------------------------- #
# detect_hero_color_bars
# --------------------------------------------------------------------------- #
_EXPECTED_COLORS = {
    "Radiant": {0: "#1778F8", 1: "#14FFB6", 2: "#BE02C9", 3: "#F6FE0C", 4: "#EC4000"},
    "Dire": {0: "#00831B", 1: "#955EA0", 2: "#2C8AAC", 3: "#CFA45A", 4: "#648486"},
}


def test_detect_color_bars_returns_zero_when_frame_unloadable():
    with patch.object(dhd, "load_image", return_value=None):
        score, colors = dhd.detect_hero_color_bars("missing.jpg", _EXPECTED_COLORS)
    assert score == 0.0 and colors == {}


def test_detect_color_bars_returns_zero_when_bar_fails():
    with patch.object(dhd, "load_image", return_value=np.zeros((40, 40, 3), np.uint8)):
        score, colors = dhd.detect_hero_color_bars("small.jpg", _EXPECTED_COLORS)
    assert score == 0.0 and colors == {}


def test_detect_color_bars_scores_all_ten_positions():
    # A black frame won't match the bright expected colors -> score 0, but the
    # full extraction/scoring loop runs for all 10 positions.
    with patch.object(dhd, "load_image", return_value=np.zeros((1080, 1920, 3), np.uint8)):
        score, colors = dhd.detect_hero_color_bars("f.jpg", _EXPECTED_COLORS)
    assert score == 0.0  # black bars match none of the bright expected colors
    assert len(colors["Radiant"]) == 5 and len(colors["Dire"]) == 5
    assert "average_similarity" in colors


def test_detect_color_bars_matches_when_colors_present():
    # Paint each Radiant color bar with its expected RGB so those positions match.
    frame = np.zeros((1080, 1920, 3), np.uint8)
    center_x = 1920 // 2
    for i in range(5):
        x = center_x - dhd.CLOCK_LEFT_EXTEND - (5 - i) * (dhd.HERO_WIDTH + dhd.HERO_GAP)
        hexv = _EXPECTED_COLORS["Radiant"][i].lstrip("#")
        r, g, b = (int(hexv[j:j+2], 16) for j in (0, 2, 4))
        frame[0:dhd.HERO_TOP_PADDING, x:x + dhd.HERO_WIDTH] = (b, g, r)  # BGR
    with patch.object(dhd, "load_image", return_value=frame):
        score, colors = dhd.detect_hero_color_bars("f.jpg", _EXPECTED_COLORS)
    assert score >= 0.5  # the 5 Radiant bars match


# --------------------------------------------------------------------------- #
# isFrameDraft / processDraft
# --------------------------------------------------------------------------- #
def test_is_frame_draft_true_when_names_detected():
    frame = np.zeros((1080, 1920, 3), np.uint8)
    with patch.object(dhd, "_ocr_text_from_region", return_value=("PlayerName", 90.0)):
        assert dhd.isFrameDraft(frame) is True


def test_is_frame_draft_false_when_no_names():
    frame = np.zeros((1080, 1920, 3), np.uint8)
    with patch.object(dhd, "_ocr_text_from_region", return_value=(None, 0.0)):
        assert dhd.isFrameDraft(frame) is False


def test_process_draft_extracts_captains_and_order(monkeypatch):
    monkeypatch.setattr(dhd, "TESSERACT_AVAILABLE", True)
    frame = np.zeros((1080, 1920, 3), np.uint8)
    with patch.object(dhd, "extract_player_name", side_effect=["RadCap", "DireCap"]), \
         patch.object(dhd, "_ocr_text_from_region", return_value=("Laner", 80.0)):
        result = dhd.processDraft(frame)
    assert result["is_draft"] is True
    assert result["captains"] == {"Radiant": "RadCap", "Dire": "DireCap"}
    assert len(result["draft_player_order"]) == 10
    assert result["draft_player_order"][:2] == ["RadCap", "DireCap"]


def test_process_draft_returns_early_when_bar_fails():
    with patch.object(dhd, "extract_hero_bar", return_value=(False, None, 0)):
        result = dhd.processDraft(np.zeros((1080, 1920, 3), np.uint8))
    assert result["captains"] == {"Radiant": None, "Dire": None}


# --------------------------------------------------------------------------- #
# debug-visualization paths
# --------------------------------------------------------------------------- #
def test_extract_hero_bar_debug_visualization(tmp_path, monkeypatch):
    monkeypatch.setenv("DEBUG_IMAGES", "1")
    with patch.object(dhd, "DEBUG_DIR", tmp_path):
        ok, cropped, _ = dhd.extract_hero_bar(np.zeros((130, 1920, 3), np.uint8), debug=True)
    assert ok is True and cropped is not None


def test_get_top_hero_matches_debug_visualization(tmp_path, monkeypatch):
    monkeypatch.delenv("ADD_BORDER", raising=False)
    monkeypatch.delenv("APPLY_BLUR", raising=False)
    monkeypatch.setenv("DEBUG_IMAGES", "1")
    template = np.full((72, 128, 3), 120, np.uint8)
    heroes_data = [{
        "id": 7, "name": "npc_dota_hero_axe", "localized_name": "Axe",
        "variants": [{"variant": "base", "cached_template": template}],
    }]
    with patch.object(dhd, "DEBUG_DIR", tmp_path):
        matches = dhd.get_top_hero_matches(np.full((66, 108, 3), 120, np.uint8),
                                           heroes_data, min_score=0.0, debug=True)
    assert matches and matches[0]["hero_id"] == 7
