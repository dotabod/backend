"""Tests for facet_detection.

numpy is real (see conftest); cv2 is stubbed, so we patch the few cv2 calls
(matchTemplate/minMaxLoc/cvtColor/threshold/imread/resize) to return real arrays
where the surrounding logic does numpy work. Covers level adjustment, template
loading/matching, facet detection, team processing, and ability lookup.
"""

from unittest.mock import MagicMock, mock_open, patch

import numpy as np
import pytest

import facet_detection


# --------------------------------------------------------------------------- #
# get_hero_abilities — guards
# --------------------------------------------------------------------------- #
def test_get_hero_abilities_returns_none_for_empty_name():
    assert facet_detection.get_hero_abilities("") is None
    assert facet_detection.get_hero_abilities(None) is None


def test_get_hero_abilities_returns_none_when_files_missing():
    with patch("facet_detection.os.path.exists", return_value=False):
        assert facet_detection.get_hero_abilities("Crystal Maiden") is None


# --------------------------------------------------------------------------- #
# get_hero_abilities — localized -> internal name resolution
# --------------------------------------------------------------------------- #
def test_get_hero_abilities_resolves_via_hero_data_localized_name():
    abilities = {"npc_dota_hero_crystal_maiden": {"abilities": ["frostbite"]}}
    hero_data = [{"localized_name": "Crystal Maiden", "name": "npc_dota_hero_crystal_maiden"}]
    with patch("facet_detection.os.path.exists", return_value=True), \
         patch("builtins.open", mock_open(read_data="{}")), \
         patch("facet_detection.json.load", side_effect=[abilities, hero_data]):
        result = facet_detection.get_hero_abilities("Crystal Maiden")
    assert result is not None
    assert result["hero_internal_name"] == "npc_dota_hero_crystal_maiden"
    assert result["hero_localized_name"] == "Crystal Maiden"


def test_get_hero_abilities_returns_none_for_unknown_hero():
    abilities = {"npc_dota_hero_axe": {}}
    hero_data = [{"localized_name": "Axe", "name": "npc_dota_hero_axe"}]
    with patch("facet_detection.os.path.exists", return_value=True), \
         patch("builtins.open", mock_open(read_data="{}")), \
         patch("facet_detection.json.load", side_effect=[abilities, hero_data]):
        result = facet_detection.get_hero_abilities("Nonexistent Hero")
    assert result is None


# --------------------------------------------------------------------------- #
# extract_facet_region — team corner branch + None guard
# --------------------------------------------------------------------------- #
def test_extract_facet_region_none_portrait_returns_none():
    assert facet_detection.extract_facet_region(None, "Radiant") is None


def _recording_portrait():
    """A fake portrait whose .shape feeds the bounds math and whose __getitem__
    records the (y, x) slice the extractor used, so we can assert the corner."""
    captured = {}

    class FakePortrait:
        shape = (72, 108, 3)

        def __getitem__(self, key):
            captured["yx"] = key
            region = MagicMock()
            region.shape = (28, 28, 3)  # color -> triggers the stubbed cvtColor path
            return region

    return FakePortrait(), captured


def test_extract_facet_region_radiant_uses_top_left_corner():
    portrait, captured = _recording_portrait()
    facet_detection.extract_facet_region(portrait, "Radiant")
    _, x_slice = captured["yx"]
    assert x_slice.start == facet_detection.FACET_SIDE_MARGIN  # left corner for Radiant


def test_extract_facet_region_dire_uses_right_corner():
    portrait, captured = _recording_portrait()
    facet_detection.extract_facet_region(portrait, "Dire")
    _, x_slice = captured["yx"]
    # Dire pulls from the right corner: x = width - (FACET_SIZE + padding) - margin.
    assert x_slice.start == 108 - (facet_detection.FACET_SIZE + 4) - facet_detection.FACET_SIDE_MARGIN


# --------------------------------------------------------------------------- #
# adjust_levels (pure numpy)
# --------------------------------------------------------------------------- #
def test_adjust_levels_clips_to_uint8_range():
    img = np.array([[0, 64, 128, 192, 255]], dtype=np.uint8)
    out = facet_detection.adjust_levels(img, black_point=0, white_point=255, gamma=1.0)
    assert out.dtype == np.uint8
    assert out.min() >= 0 and out.max() <= 255
    assert out.shape == img.shape


def test_adjust_levels_black_point_darkens_low_values():
    img = np.array([[50, 200]], dtype=np.uint8)
    out = facet_detection.adjust_levels(img, black_point=50, white_point=255, gamma=1.0)
    assert out[0, 0] == 0  # at the black point -> clipped to 0


# --------------------------------------------------------------------------- #
# load_facet_templates
# --------------------------------------------------------------------------- #
def test_load_facet_templates_returns_empty_when_dir_missing(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)  # no assets/dota_heroes/facet_icons here
    assert facet_detection.load_facet_templates() == {}


def test_load_facet_templates_loads_pngs(monkeypatch, tmp_path):
    facets_dir = tmp_path / "assets" / "dota_heroes" / "facet_icons"
    facets_dir.mkdir(parents=True)
    (facets_dir / "damage.png").write_bytes(b"x")
    monkeypatch.chdir(tmp_path)
    binary = np.ones((facet_detection.FACET_SIZE, facet_detection.FACET_SIZE), dtype=np.uint8)
    with patch.object(facet_detection.cv2, "imread", return_value=np.ones((24, 24, 3), dtype=np.uint8)), \
         patch.object(facet_detection.cv2, "cvtColor", return_value=np.ones((24, 24), dtype=np.uint8)), \
         patch.object(facet_detection.cv2, "threshold", return_value=(128, binary)):
        templates = facet_detection.load_facet_templates()
    assert "damage" in templates


# --------------------------------------------------------------------------- #
# match_facet_template
# --------------------------------------------------------------------------- #
def test_match_facet_template_returns_direct_score():
    region = np.ones((24, 24), dtype=np.uint8)
    template = np.ones((24, 24), dtype=np.uint8)
    with patch.object(facet_detection.cv2, "matchTemplate", return_value=np.zeros((1, 1))), \
         patch.object(facet_detection.cv2, "minMaxLoc", return_value=(0.0, 0.9, (0, 0), (0, 0))):
        score = facet_detection.match_facet_template(region, template)
    assert score == pytest.approx(0.9)


def test_match_facet_template_tries_scaled_when_low(monkeypatch):
    region = np.ones((24, 24), dtype=np.uint8)
    template = np.ones((24, 24), dtype=np.uint8)
    # resize must yield real arrays so padding assignment works
    with patch.object(facet_detection.cv2, "resize",
                      side_effect=lambda img, dsize, *a, **k: np.ones((dsize[1], dsize[0]), dtype=np.uint8)), \
         patch.object(facet_detection.cv2, "matchTemplate", return_value=np.zeros((1, 1))), \
         patch.object(facet_detection.cv2, "minMaxLoc", return_value=(0.0, 0.1, (0, 0), (0, 0))):
        score = facet_detection.match_facet_template(region, template)
    assert score == pytest.approx(0.1)  # never beat the low score, still returns best


def test_match_facet_template_returns_zero_on_error():
    region = np.ones((24, 24), dtype=np.uint8)
    template = np.ones((24, 24), dtype=np.uint8)
    with patch.object(facet_detection.cv2, "matchTemplate", side_effect=RuntimeError("bad")):
        assert facet_detection.match_facet_template(region, template) == 0.0


# --------------------------------------------------------------------------- #
# detect_hero_facet
# --------------------------------------------------------------------------- #
def test_detect_hero_facet_guards_none_inputs():
    assert facet_detection.detect_hero_facet(None, "Radiant", {"facets": []}, {"x": 1}) is None
    portrait = np.ones((72, 108, 3), dtype=np.uint8)
    assert facet_detection.detect_hero_facet(portrait, "Radiant", None, {"x": 1}) is None
    assert facet_detection.detect_hero_facet(portrait, "Radiant", {"facets": []}, {}) is None


def test_detect_hero_facet_returns_none_when_no_facets():
    portrait = np.ones((72, 108, 3), dtype=np.uint8)
    with patch.object(facet_detection, "extract_facet_region", return_value=np.ones((24, 24), dtype=np.uint8)):
        assert facet_detection.detect_hero_facet(portrait, "Radiant", {"other": 1}, {"foo": 1}) is None


def test_detect_hero_facet_returns_best_match_above_threshold():
    portrait = np.ones((72, 108, 3), dtype=np.uint8)
    abilities = {"facets": [{"icon": "foo", "name": "Foo", "title": "Foo Title"}]}
    templates = {"foo": np.ones((24, 24), dtype=np.uint8)}
    with patch.object(facet_detection, "extract_facet_region", return_value=np.ones((24, 24), dtype=np.uint8)), \
         patch.object(facet_detection, "match_facet_template", return_value=0.9), \
         patch.object(facet_detection, "save_debug_image"):
        result = facet_detection.detect_hero_facet(portrait, "Radiant", abilities, templates, hero_name="H")
    assert result["name"] == "Foo"
    assert result["confidence"] == pytest.approx(0.9)


def test_detect_hero_facet_returns_none_below_threshold():
    portrait = np.ones((72, 108, 3), dtype=np.uint8)
    abilities = {"facets": [{"icon": "foo", "name": "Foo"}]}
    templates = {"foo": np.ones((24, 24), dtype=np.uint8)}
    with patch.object(facet_detection, "extract_facet_region", return_value=np.ones((24, 24), dtype=np.uint8)), \
         patch.object(facet_detection, "match_facet_template", return_value=0.05), \
         patch.object(facet_detection, "save_debug_image"):
        assert facet_detection.detect_hero_facet(portrait, "Radiant", abilities, templates) is None


# --------------------------------------------------------------------------- #
# process_team_facets
# --------------------------------------------------------------------------- #
def test_process_team_facets_attaches_facet_to_team_heroes():
    heroes = [
        {"team": "Radiant", "hero_localized_name": "A", "portrait_image": object(), "abilities": {}},
        {"team": "Radiant", "hero_localized_name": "B"},  # no portrait/abilities -> skipped
        {"team": "Dire", "hero_localized_name": "C", "portrait_image": object(), "abilities": {}},
    ]
    with patch.object(facet_detection, "detect_hero_facet", return_value={"name": "Foo"}) as det:
        out = facet_detection.process_team_facets(heroes, "Radiant", {"foo": 1})
    assert out[0]["facet"] == {"name": "Foo"}
    assert "facet" not in out[1]  # skipped (no portrait)
    assert "facet" not in out[2]  # different team
    det.assert_called_once()


# --------------------------------------------------------------------------- #
# get_hero_abilities fallback (internal-name match path)
# --------------------------------------------------------------------------- #
def test_get_hero_abilities_falls_back_to_internal_name_match():
    abilities = {"npc_dota_hero_axe": {"facets": [{"name": "f"}]}}
    hero_data = [{"localized_name": "Other", "name": "npc_dota_hero_other"}]  # no Axe in hero_data
    with patch("facet_detection.os.path.exists", return_value=True), \
         patch("builtins.open", mock_open(read_data="{}")), \
         patch("facet_detection.json.load", side_effect=[abilities, hero_data]):
        result = facet_detection.get_hero_abilities("Axe")
    assert result is not None
    assert result["hero_internal_name"] == "npc_dota_hero_axe"
