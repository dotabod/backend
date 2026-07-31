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


@pytest.fixture(autouse=True)
def _reset_draft_names_cache():
    # _read_draft_names memoizes by frame content, and most tests here build frames from
    # np.zeros(...) — identical content, so one test's stubbed OCR result would otherwise be
    # served to the next.
    dhd._DRAFT_NAMES_CACHE.clear()
    yield
    dhd._DRAFT_NAMES_CACHE.clear()


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
# _compute_top_bar_name_boxes (All Pick layout)
# --------------------------------------------------------------------------- #
def test_top_bar_boxes_are_ten_slots_split_around_the_clock(monkeypatch):
    for k in ("DRAFT_BASE_WIDTH", "DRAFT_BASE_HEIGHT", "TOPBAR_Y_START", "TOPBAR_Y_END",
              "TOPBAR_X_LEFT", "TOPBAR_X_RIGHT", "TOPBAR_PITCH", "TOPBAR_NAME_WIDTH"):
        monkeypatch.delenv(k, raising=False)
    boxes = dhd._compute_top_bar_name_boxes(1920, 1080)
    # Ten slots: five left of the centre clock, five right. Slot order is meaningful here
    # (Radiant 0-4 then Dire 0-4), unlike the card strip.
    assert len(boxes) == 10
    assert boxes[0] == (196, 82, 320, 108)
    assert boxes[1][0] == 196 + 125
    assert boxes[5][0] == 1090  # first Dire slot jumps past the clock
    assert all(b[0] < 960 for b in boxes[:5])
    assert all(b[0] > 960 for b in boxes[5:])


def test_top_bar_boxes_scale_with_resolution(monkeypatch):
    for k in ("DRAFT_BASE_WIDTH", "DRAFT_BASE_HEIGHT"):
        monkeypatch.delenv(k, raising=False)
    half = dhd._compute_top_bar_name_boxes(960, 540)
    assert half[0] == (98, 41, 160, 54)


# --------------------------------------------------------------------------- #
# _compute_top_bar_rank_boxes (All Pick rank band)
# --------------------------------------------------------------------------- #
def test_top_bar_rank_boxes_align_with_name_slots(monkeypatch):
    for k in ("DRAFT_BASE_WIDTH", "DRAFT_BASE_HEIGHT", "TOPBAR_RANK_Y_START", "TOPBAR_RANK_Y_END",
              "TOPBAR_X_LEFT", "TOPBAR_X_RIGHT", "TOPBAR_PITCH", "TOPBAR_NAME_WIDTH",
              "TOPBAR_RANK_X_INSET_LEFT", "TOPBAR_RANK_X_INSET_RIGHT"):
        monkeypatch.delenv(k, raising=False)
    boxes = dhd._compute_top_bar_rank_boxes(1920, 1080)
    assert len(boxes) == 10
    # Measured against a real 1080p pick screen: "Rank N" sits at y 50-72, above the
    # y 82-108 name band, inset from the medal/portrait at the slot edges.
    assert boxes[0] == (216, 50, 296, 72)
    assert boxes[5][0] == 1090 + 20  # Dire slots jump past the clock, same as names
    name_boxes = dhd._compute_top_bar_name_boxes(1920, 1080)
    for rank_box, name_box in zip(boxes, name_boxes):
        assert rank_box[0] >= name_box[0] and rank_box[2] <= name_box[2]
        assert rank_box[3] <= name_box[1]  # rank band sits above the name band


def test_top_bar_rank_boxes_scale_with_resolution(monkeypatch):
    for k in ("DRAFT_BASE_WIDTH", "DRAFT_BASE_HEIGHT"):
        monkeypatch.delenv(k, raising=False)
    half = dhd._compute_top_bar_rank_boxes(960, 540)
    assert half[0] == (108, 25, 148, 36)


# --------------------------------------------------------------------------- #
# _parse_top_bar_rank (rank digit validation)
# --------------------------------------------------------------------------- #
def test_parse_top_bar_rank_accepts_anchored_ranks(monkeypatch):
    monkeypatch.delenv("TOPBAR_RANK_MIN_CONF", raising=False)
    assert dhd._parse_top_bar_rank("Rank 30", 92.0) == 30
    assert dhd._parse_top_bar_rank("Rank 344", 96.0) == 344
    # Medal leaderboard digits beside the banner text are not the rank.
    assert dhd._parse_top_bar_rank("4 Rank 30", 92.0) == 30
    assert dhd._parse_top_bar_rank("Rank 301 7", 40.0) == 301
    # OCR sometimes splits the label.
    assert dhd._parse_top_bar_rank("Ra nk 111", 87.0) == 111
    assert dhd._parse_top_bar_rank("Ранг 12", 80.0) == 12


def test_parse_top_bar_rank_rejects_instead_of_mangling(monkeypatch):
    monkeypatch.delenv("TOPBAR_RANK_MIN_CONF", raising=False)
    # No anchor: bare digits could be the medal's leaderboard number.
    assert dhd._parse_top_bar_rank("29", 90.0) is None
    assert dhd._parse_top_bar_rank(None, 90.0) is None
    # extract_rank_text would truncate these to fit; the pick-screen read must drop them.
    assert dhd._parse_top_bar_rank("Rank 88888", 90.0) is None
    assert dhd._parse_top_bar_rank("Rank 6000", 90.0) is None
    assert dhd._parse_top_bar_rank("Rank 0", 90.0) is None
    assert dhd._parse_top_bar_rank("Rank", 90.0) is None
    # Low-confidence reads are dropped.
    assert dhd._parse_top_bar_rank("Rank 344", 5.0) is None


def test_read_top_bar_ranks_uses_whitelist_config_and_upscale(monkeypatch):
    calls = []

    def fake_ocr(region, lang=None, debug_name=None, config=None, upscale=1):
        calls.append((config, upscale, region.shape))
        return ("Rank 344", 96.0) if len(calls) == 6 else (None, 0.0)

    monkeypatch.setattr(dhd, "_ocr_text_from_region", fake_ocr)
    ranks = dhd._read_top_bar_ranks(np.zeros((1080, 1920, 3), np.uint8))
    assert ranks == [None, None, None, None, None, 344, None, None, None, None]
    assert all(c[0] == dhd._TOPBAR_RANK_CONFIG and c[1] == 4 for c in calls)
    # Source crops are the measured band: 22px tall, 80px wide at 1080p.
    assert all(c[2] == (22, 80, 3) for c in calls)


# --------------------------------------------------------------------------- #
# name plausibility / band selection
# --------------------------------------------------------------------------- #
def test_repeated_glyph_reads_are_treated_as_noise():
    # Tesseract renders faint empty-slot edges as short repeated glyphs. These pass the bare
    # plausibility check, so scoring has to exclude them or a band aimed at empty slots can
    # out-count one reading real names.
    for junk in ("ee", "ии", "oo", "И", "  aa  "):
        assert dhd._looks_like_ocr_noise(junk)
    for real in ("Ame", "Тарган Жак", "takizawa-", "BurNIng"):
        assert not dhd._looks_like_ocr_noise(real)


def test_score_names_counts_only_real_names():
    names = ["INFERNAL", "ee", "ee", "Юрец", None, "ии"]
    assert dhd._score_names(names) == 2


# --------------------------------------------------------------------------- #
# _sample_clip_frames — spreading candidate frames across the clip
# --------------------------------------------------------------------------- #
def _stub_frame_sampling(monkeypatch, returns):
    """Stub download_clip/extract_frames and record the frame_interval requested."""
    seen = {}

    def fake_extract(path, clip_details=None, frame_interval=None):
        seen["interval"] = frame_interval
        return returns

    monkeypatch.setattr(dhd, "download_clip", lambda details: "/tmp/clip.mp4")
    monkeypatch.setattr(dhd, "extract_frames", fake_extract)
    return seen


def test_sample_clip_frames_spreads_interval_over_the_duration(monkeypatch):
    # A 60s clip at the default count should sample well inside the ~30s the roster
    # panel is on screen, so a clip aimed late still contains it.
    seen = _stub_frame_sampling(monkeypatch, ["/tmp/f1.jpg", "/tmp/f2.jpg"])

    out = dhd._sample_clip_frames({"duration": 60}, count=8)
    assert out == ["/tmp/f1.jpg", "/tmp/f2.jpg"]
    assert seen["interval"] == 7  # 60 // 8, comfortably finer than the panel window


def test_sample_clip_frames_falls_back_when_duration_unknown(monkeypatch):
    seen = _stub_frame_sampling(monkeypatch, [])
    dhd._sample_clip_frames({}, count=8)
    assert seen["interval"] == 5


def test_sample_clip_frames_never_returns_a_zero_interval(monkeypatch):
    # A very short clip must not produce frame_interval=0, which would loop forever
    # building timestamps in extract_frames.
    seen = _stub_frame_sampling(monkeypatch, [])
    dhd._sample_clip_frames({"duration": 5}, count=8)
    assert seen["interval"] >= 1


def test_read_draft_names_picks_the_band_with_more_real_names(monkeypatch):
    # Simulates the Team Draft case that motivated noise-aware scoring: the top bar returned
    # MORE raw strings (8) than the cards (7), but five were 'ee' artifacts.
    card_names = ["Юрец пез", "www", "Son of Shore", "fortniteMan", "dualrazee", "Immersion", "Nyx"]
    top_names = ["INFERNAL", "ee", "ee", "ye ТОРО", "Юрец", "ee", "ee", "ee"]

    calls = []

    def fake_ocr(frame, boxes):
        calls.append(len(boxes))
        return card_names if len(calls) == 1 else top_names

    monkeypatch.setattr(dhd, "_ocr_name_boxes", fake_ocr)
    names, layout = dhd._read_draft_names(np.zeros((1080, 1920, 3), np.uint8))
    assert layout == "cards"
    assert names == card_names


def test_read_draft_names_prefers_top_bar_on_all_pick(monkeypatch):
    card_names = ["OS kan", "ou Bate", None, None, None, None, None, None]
    top_names = ["Ame", "Тарган Жак", "BurNIng", "Bach", "takizawa-",
                 "Bengan", "keetai", "ponlo", "ChodΣX", "Manem"]

    calls = []

    def fake_ocr(frame, boxes):
        calls.append(len(boxes))
        return card_names if len(calls) == 1 else top_names

    monkeypatch.setattr(dhd, "_ocr_name_boxes", fake_ocr)
    names, layout = dhd._read_draft_names(np.zeros((1080, 1920, 3), np.uint8))
    assert layout == "top_bar"
    assert names == top_names


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


def test_process_media_propagates_renditions_not_yet_available():
    # All-renditions-404 (clip still transcoding) must propagate like
    # "Clip not found or inaccessible" so the queue worker re-queues the
    # request instead of recording a permanent failure.
    with patch.object(dhd, "get_clip_details", side_effect=ValueError(
            "Clip renditions not yet available (all candidates returned 404); "
            "clip is likely still transcoding")):
        with pytest.raises(ValueError, match="Clip renditions not yet available"):
            dhd.process_media("http://clip", source_type="clip")


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
# process_media pick-screen fallback (colour gate failed, top bar readable)
# --------------------------------------------------------------------------- #
def _pick_screen_names():
    return (["PaSTiL", "123", "my role my te...", None, "Stoic",
             "Malr1ne", "kiyotaka", "spoiled", "lantana", "panto"], "top_bar")


def _pick_screen_patches(names, ranks=None):
    info = {"frame_index": 0, "frame_path": "best.jpg", "match_score": 0.4, "detected_colors": {}}
    return (
        patch.object(dhd, "get_clip_details", return_value={"id": "c1", "duration": 30}),
        patch.object(dhd, "download_single_frame", return_value="frame0.jpg"),
        patch.object(dhd, "load_image", return_value=np.zeros((1080, 1920, 3), np.uint8)),
        patch.object(dhd, "process_frames_for_heroes", return_value=([], info)),
        patch.object(dhd, "_read_draft_names", return_value=names),
        patch.object(dhd, "_read_top_bar_ranks", return_value=ranks or [None] * 10),
    )


def test_process_media_pick_screen_fallback_builds_roster():
    ranks = [None, None, None, None, None, 30, 344, 345, 301, 111]
    patches = _pick_screen_patches(_pick_screen_names(), ranks)
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
        result = dhd.process_media("http://clip", source_type="clip")
    assert result is not None
    assert result["detection_source"] == "pick_screen"
    assert result["is_draft"] is False
    assert result["heroes_status"] == "waiting"
    assert result["players"]  # the queue worker discards results with empty players[]
    heroes = result["heroes"]
    assert len(heroes) == 9  # one Radiant slot resolved neither name nor rank
    dire0 = next(h for h in heroes if h["team"] == "Dire" and h["position"] == 0)
    assert dire0["player_name"] == "Malr1ne" and dire0["rank"] == 30
    # Sentinel identity: loses to any real in-game read in the per-slot merge.
    assert dire0["hero_id"] == 0 and dire0["match_score"] == 0.0
    assert dire0["detection_source"] == "pick_screen"
    rad0 = next(h for h in heroes if h["team"] == "Radiant" and h["position"] == 0)
    assert rad0["player_name"] == "PaSTiL" and "rank" not in rad0


def test_process_media_pick_screen_fallback_needs_enough_names():
    sparse = (["Ame", None, None, None, None, None, None, None, None, None], "top_bar")
    patches = _pick_screen_patches(sparse)
    with patches[0], patches[1], patches[2], patches[3], patches[4], \
         patch.object(dhd, "_read_top_bar_ranks") as rank_read:
        # The rank band is real OCR cost — it must not run when the roster won't resolve.
        assert dhd.process_media("http://clip", source_type="clip") is None
    rank_read.assert_not_called()


def test_process_media_pick_screen_fallback_skips_card_layout():
    # Card-band names aren't slot-indexed, so they can't map to team/position slots.
    cards = (["Ame", "Bach", "BurNIng", "ponlo", "keetai", "ChodΣX", "Manem", "takizawa-"], "cards")
    patches = _pick_screen_patches(cards)
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
        assert dhd.process_media("http://clip", source_type="clip") is None


def test_process_media_success_path_never_reads_pick_screen():
    heroes, info = _heroes_and_info()
    with patch.object(dhd, "get_clip_details", return_value={"id": "c1", "duration": 30}), \
         patch.object(dhd, "download_single_frame", return_value="frame0.jpg"), \
         patch.object(dhd, "load_image", return_value=np.zeros((120, 1920, 3), np.uint8)), \
         patch.object(dhd, "process_frames_for_heroes", return_value=(heroes, info)), \
         patch.object(dhd, "is_valid_hud", return_value=True), \
         patch.object(dhd, "extract_team_captains_from_frame", return_value={}), \
         patch.object(dhd, "_read_pick_screen_roster") as pick_read:
        result = dhd.process_media("http://clip", source_type="clip")
    assert result is not None
    pick_read.assert_not_called()


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
    counter = itertools.count(1)

    def fake_matches(icon, data, **kwargs):
        hid = next(counter)
        return [{"hero_id": hid, "variant": "base",
                 "hero_localized_name": f"H{hid}", "match_score": 0.9}]

    with patch.object(dhd, "load_image", return_value=np.zeros((1080, 1920, 3), np.uint8)), \
         patch.object(dhd, "load_heroes_data", return_value=[{"id": 1}]), \
         patch.object(dhd, "get_top_hero_matches", side_effect=fake_matches):
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
    """Team Draft (card) layout: captains are read separately and prefix the draft order."""
    monkeypatch.setattr(dhd, "TESSERACT_AVAILABLE", True)
    frame = np.zeros((1080, 1920, 3), np.uint8)
    lanes = [f"Laner{i}" for i in range(8)]
    with patch.object(dhd, "extract_player_name", side_effect=["RadCap", "DireCap"]), \
         patch.object(dhd, "_read_draft_names", return_value=(lanes, "cards")):
        result = dhd.processDraft(frame)
    assert result["is_draft"] is True
    assert result["captains"] == {"Radiant": "RadCap", "Dire": "DireCap"}
    assert len(result["draft_player_order"]) == 10
    assert result["draft_player_order"][:2] == ["RadCap", "DireCap"]
    assert result["draft_name_layout"] == "cards"


def test_process_draft_top_bar_layout_is_already_slot_ordered(monkeypatch):
    """All Pick (top-bar) layout carries all ten players in slot order.

    No captain prefix here: prepending captains would shift every slot by two and destroy the
    one property that makes this layout valuable — index i is top-bar slot i, the same indexing
    the in-game hero detector uses.
    """
    monkeypatch.setattr(dhd, "TESSERACT_AVAILABLE", True)
    frame = np.zeros((1080, 1920, 3), np.uint8)
    slots = [f"P{i}" for i in range(10)]
    with patch.object(dhd, "extract_player_name", side_effect=["RadCap", "DireCap"]), \
         patch.object(dhd, "_read_draft_names", return_value=(slots, "top_bar")):
        result = dhd.processDraft(frame)
    assert result["draft_player_order"] == slots
    assert result["draft_name_layout"] == "top_bar"


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
