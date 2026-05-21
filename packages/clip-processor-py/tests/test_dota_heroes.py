"""Tests for Dota hero roster refresh behavior (ported to pytest)."""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import dota_heroes


class FakeImageResponse:
    def raise_for_status(self):
        return None

    def iter_content(self, chunk_size=8192):
        yield b"fake-image-bytes"


class FakeJsonResponse:
    def __init__(self, data):
        self.data = data

    def raise_for_status(self):
        return None

    def json(self):
        return self.data


def test_parse_valve_hero_list_normalizes_new_heroes():
    heroes = dota_heroes.parse_valve_hero_list(
        {
            "result": {
                "data": {
                    "heroes": [
                        {
                            "id": 155,
                            "name": "npc_dota_hero_largo",
                            "name_loc": "Largo",
                            "name_english_loc": "Largo",
                        }
                    ]
                }
            }
        }
    )
    assert heroes[0]["id"] == 155
    assert heroes[0]["tag"] == "largo"
    assert heroes[0]["localized_name"] == "Largo"


def test_get_hero_list_uses_valve_roster_and_spectral_alticons():
    valve_response = {
        "result": {
            "data": {
                "heroes": [
                    {"id": 5, "name": "npc_dota_hero_crystal_maiden", "name_english_loc": "Crystal Maiden"},
                    {"id": 155, "name": "npc_dota_hero_largo", "name_english_loc": "Largo"},
                ]
            }
        }
    }
    odota_response = {}
    spectral_response = {
        "result": {
            "heroes": [
                {
                    "id": 5,
                    "name": "npc_dota_hero_crystal_maiden",
                    "tag": "crystal_maiden",
                    "localized_name": "Crystal Maiden",
                    "aliases": "cm",
                    "alticons": ["arcana"],
                }
            ]
        }
    }
    with patch.object(
        dota_heroes.requests,
        "get",
        side_effect=[
            FakeJsonResponse(valve_response),
            FakeJsonResponse(odota_response),
            FakeJsonResponse(spectral_response),
        ],
    ):
        heroes = dota_heroes.get_hero_list()

    crystal_maiden = next(h for h in heroes if h["id"] == 5)
    largo = next(h for h in heroes if h["id"] == 155)
    assert crystal_maiden["alticons"] == ["arcana"]
    assert crystal_maiden["aliases"] == "cm"
    assert largo["localized_name"] == "Largo"


def test_get_hero_data_refreshes_missing_remote_hero_and_missing_variants():
    with tempfile.TemporaryDirectory() as temp_dir:
        assets_dir = Path(temp_dir) / "dota_heroes"
        assets_dir.mkdir(parents=True)

        (assets_dir / "5_base.png").write_bytes(b"existing-base")
        (assets_dir / "5_persona1.png").write_bytes(b"existing-persona")
        (assets_dir / "templates_cache.npz").write_bytes(b"stale-cache")

        cached_hero_data = [
            {
                "id": 5,
                "name": "npc_dota_hero_crystal_maiden",
                "tag": "crystal_maiden",
                "localized_name": "Crystal Maiden",
                "aliases": "cm",
                "alt_name": "Rylai",
                "variants": [
                    {
                        "variant": "base",
                        "image_path": str(assets_dir / "5_base.png"),
                        "image_url": "https://old.example/crystal_maiden.png",
                    },
                    {
                        "variant": "persona1",
                        "image_path": str(assets_dir / "5_persona1.png"),
                        "image_url": "https://old.example/crystal_maiden_persona1.png",
                    },
                ],
            }
        ]
        (assets_dir / "hero_data.json").write_text(json.dumps(cached_hero_data))

        current_heroes = [
            dota_heroes.normalize_hero(
                {"id": 5, "name": "npc_dota_hero_crystal_maiden", "name_english_loc": "Crystal Maiden", "alticons": ["arcana"]}
            ),
            dota_heroes.normalize_hero(
                {"id": 155, "name": "npc_dota_hero_largo", "name_english_loc": "Largo"}
            ),
        ]

        with patch.object(dota_heroes, "ASSETS_DIR", assets_dir), \
             patch.object(dota_heroes, "download_hero_abilities", return_value={}), \
             patch.object(dota_heroes, "get_hero_list", return_value=current_heroes), \
             patch.object(dota_heroes.requests, "get", return_value=FakeImageResponse()):
            refreshed = dota_heroes.get_hero_data(refresh=True)

        hero_ids = {h["id"] for h in refreshed}
        assert hero_ids == {5, 155}
        assert (assets_dir / "5_arcana.png").exists()
        assert (assets_dir / "155_base.png").exists()
        assert not (assets_dir / "templates_cache.npz").exists()

        crystal_maiden = next(h for h in refreshed if h["id"] == 5)
        crystal_variants = {v["variant"] for v in crystal_maiden["variants"]}
        assert crystal_variants == {"base", "persona1", "arcana"}

        largo = next(h for h in refreshed if h["id"] == 155)
        assert largo["variants"][0]["image_url"] == dota_heroes.steam_hero_image_url("largo")


# --------------------------------------------------------------------------- #
# parse_odota_hero_list / parse_legacy_hero_list
# --------------------------------------------------------------------------- #
def test_parse_odota_hero_list_handles_dict_keyed_by_id():
    data = {
        "1": {"id": 1, "name": "npc_dota_hero_antimage", "localized_name": "Anti-Mage"},
        "2": {"id": 2, "name": "npc_dota_hero_axe", "localized_name": "Axe"},
    }
    heroes = dota_heroes.parse_odota_hero_list(data)
    by_id = {h["id"]: h for h in heroes}
    assert by_id[1]["tag"] == "antimage"
    assert by_id[1]["localized_name"] == "Anti-Mage"
    assert by_id[2]["tag"] == "axe"


def test_parse_legacy_hero_list_reads_result_heroes():
    data = {"result": {"heroes": [
        {"id": 5, "name": "npc_dota_hero_crystal_maiden", "tag": "crystal_maiden",
         "localized_name": "Crystal Maiden", "alticons": ["arcana"]},
    ]}}
    heroes = dota_heroes.parse_legacy_hero_list(data)
    assert heroes[0]["alticons"] == ["arcana"]
    assert heroes[0]["tag"] == "crystal_maiden"


# --------------------------------------------------------------------------- #
# merge_hero_metadata
# --------------------------------------------------------------------------- #
def test_merge_hero_metadata_merges_alticons_and_aliases():
    base = [dota_heroes.normalize_hero(
        {"id": 5, "name": "npc_dota_hero_crystal_maiden", "name_english_loc": "Crystal Maiden"}
    )]
    augment = [{"id": 5, "aliases": "cm", "alt_name": "Rylai", "alticons": ["arcana", "winter"]}]
    merged = dota_heroes.merge_hero_metadata(base, augment)
    assert merged[0]["aliases"] == "cm"
    assert merged[0]["alt_name"] == "Rylai"
    assert merged[0]["alticons"] == ["arcana", "winter"]  # sorted union


def test_merge_hero_metadata_keeps_base_when_no_augment_match():
    base = [dota_heroes.normalize_hero(
        {"id": 7, "name": "npc_dota_hero_earthshaker", "name_english_loc": "Earthshaker"}
    )]
    merged = dota_heroes.merge_hero_metadata(base, [])
    assert merged[0]["id"] == 7
    assert merged[0]["alticons"] == []


# --------------------------------------------------------------------------- #
# hero_roster_signature
# --------------------------------------------------------------------------- #
def test_roster_signature_changes_when_variant_path_changes():
    hero = {"id": 5, "name": "npc_dota_hero_crystal_maiden", "tag": "crystal_maiden",
            "localized_name": "Crystal Maiden",
            "variants": [{"variant": "base", "image_path": "/a/5_base.png"}]}
    sig_a = dota_heroes.hero_roster_signature([hero])
    hero2 = dict(hero)
    hero2["variants"] = [{"variant": "base", "image_path": "/b/5_base.png"}]
    sig_b = dota_heroes.hero_roster_signature([hero2])
    assert sig_a == dota_heroes.hero_roster_signature([hero])  # deterministic
    assert sig_a != sig_b


# --------------------------------------------------------------------------- #
# all_variant_images_exist / get_missing_expected_variants
# --------------------------------------------------------------------------- #
def test_all_variant_images_exist_true_then_false(tmp_path):
    img = tmp_path / "5_base.png"
    img.write_bytes(b"x")
    hero = {"id": 5, "localized_name": "Crystal Maiden",
            "variants": [{"variant": "base", "image_path": str(img)}]}
    assert dota_heroes.all_variant_images_exist([hero]) is True

    hero_missing = {"id": 6, "localized_name": "Axe",
                    "variants": [{"variant": "base", "image_path": str(tmp_path / "6_base.png")}]}
    assert dota_heroes.all_variant_images_exist([hero_missing]) is False


def test_get_missing_expected_variants_detects_new_alticon():
    cached = [{"id": 5, "variants": [{"variant": "base"}]}]
    heroes = [{"id": 5, "localized_name": "Crystal Maiden", "alticons": ["arcana"]}]
    missing = dota_heroes.get_missing_expected_variants(cached, heroes)
    assert (5, "Crystal Maiden", "arcana") in missing
    assert all(m[2] != "base" for m in missing)  # base already cached


def test_get_missing_expected_variants_skips_unknown_hero():
    cached = []  # nothing cached
    heroes = [{"id": 99, "localized_name": "New", "alticons": ["x"]}]
    # hero not in cache -> skipped (handled by full download path, not "missing")
    assert dota_heroes.get_missing_expected_variants(cached, heroes) == []


# --------------------------------------------------------------------------- #
# get_hero_list fallback when every remote source fails
# --------------------------------------------------------------------------- #
def test_get_hero_list_returns_empty_when_all_sources_raise():
    with patch.object(dota_heroes.requests, "get", side_effect=RuntimeError("network down")):
        assert dota_heroes.get_hero_list() == []
