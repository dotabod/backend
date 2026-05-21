"""Pure-logic seam tests for facet_detection.

cv2/numpy are MagicMock stubs (see conftest), so the pixel-matching core is not
exercised here. We cover the file-backed name-lookup logic of get_hero_abilities
and the team-based corner branch of extract_facet_region, which are plain Python.
"""

from unittest.mock import MagicMock, mock_open, patch

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


def test_extract_facet_region_radiant_uses_top_left_corner():
    # A fake portrait: .shape gives (h, w); slicing returns a sentinel whose own
    # slicing/shape is benign. We assert the Radiant branch starts at the left
    # edge (x == FACET_SIDE_MARGIN) by capturing the slice indices.
    captured = {}

    class FakePortrait:
        shape = (72, 108, 3)

        def __getitem__(self, key):
            captured["yx"] = key
            region = MagicMock()
            region.shape = (28, 28, 3)  # color -> triggers cvtColor path (stubbed)
            return region

    facet_detection.extract_facet_region(FakePortrait(), "Radiant")
    y_slice, x_slice = captured["yx"]
    assert x_slice.start == facet_detection.FACET_SIDE_MARGIN  # left corner for Radiant


def test_extract_facet_region_dire_uses_right_corner():
    captured = {}

    class FakePortrait:
        shape = (72, 108, 3)

        def __getitem__(self, key):
            captured["yx"] = key
            region = MagicMock()
            region.shape = (28, 28, 3)
            return region

    facet_detection.extract_facet_region(FakePortrait(), "Dire")
    y_slice, x_slice = captured["yx"]
    # Dire pulls from the right side, so x start is well into the portrait width.
    assert x_slice.start > 0
