#!/usr/bin/env python3
"""Tests for Dota hero roster refresh behavior."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import dota_heroes


class FakeImageResponse:
    """Small requests.Response stand in for image downloads."""

    def raise_for_status(self):
        return None

    def iter_content(self, chunk_size=8192):
        yield b"fake-image-bytes"


class DotaHeroesTests(unittest.TestCase):
    def test_parse_valve_hero_list_normalizes_new_heroes(self):
        heroes = dota_heroes.parse_valve_hero_list({
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
        })

        self.assertEqual(heroes[0]["id"], 155)
        self.assertEqual(heroes[0]["tag"], "largo")
        self.assertEqual(heroes[0]["localized_name"], "Largo")

    def test_get_hero_data_refreshes_missing_remote_hero_and_preserves_variants(self):
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
                dota_heroes.normalize_hero({
                    "id": 5,
                    "name": "npc_dota_hero_crystal_maiden",
                    "name_english_loc": "Crystal Maiden",
                }),
                dota_heroes.normalize_hero({
                    "id": 155,
                    "name": "npc_dota_hero_largo",
                    "name_english_loc": "Largo",
                }),
            ]

            with patch.object(dota_heroes, "ASSETS_DIR", assets_dir), \
                 patch.object(dota_heroes, "download_hero_abilities", return_value={}), \
                 patch.object(dota_heroes, "get_hero_list", return_value=current_heroes), \
                 patch.object(dota_heroes.requests, "get", return_value=FakeImageResponse()):
                refreshed = dota_heroes.get_hero_data(refresh=True)

            hero_ids = {hero["id"] for hero in refreshed}
            self.assertEqual(hero_ids, {5, 155})
            self.assertTrue((assets_dir / "155_base.png").exists())
            self.assertFalse((assets_dir / "templates_cache.npz").exists())

            crystal_maiden = next(hero for hero in refreshed if hero["id"] == 5)
            crystal_variants = {variant["variant"] for variant in crystal_maiden["variants"]}
            self.assertEqual(crystal_variants, {"base", "persona1"})

            largo = next(hero for hero in refreshed if hero["id"] == 155)
            self.assertEqual(largo["variants"][0]["image_url"], dota_heroes.steam_hero_image_url("largo"))


if __name__ == "__main__":
    unittest.main()
