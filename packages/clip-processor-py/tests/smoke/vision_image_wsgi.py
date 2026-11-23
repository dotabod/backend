"""Start the real Vision app with one synthetic hero portrait and no upstream I/O."""

import json
from unittest.mock import patch

from PIL import Image

import dota_heroes


def create_fixture():
    """Provide the cached data the app normally obtains from external services."""
    assets = dota_heroes.ASSETS_DIR
    portrait = assets / "smoke-hero.png"
    Image.new("RGB", (128, 72), color=(34, 86, 144)).save(portrait)
    roster = [
        {
            "id": 1,
            "tag": "antimage",
            "name": "npc_dota_hero_antimage",
            "localized_name": "Anti-Mage",
            "variants": [{"variant": "base", "image_path": str(portrait)}],
        }
    ]
    (assets / "hero_data.json").write_text(json.dumps(roster), encoding="utf-8")


create_fixture()
# Leave the normal cache read, OpenCV template load, migrations, and queue startup
# in place. Only the network-fetched hero list and abilities are replaced.
with (
    patch.object(dota_heroes, "get_hero_list", return_value=[]),
    patch.object(dota_heroes, "download_hero_abilities", return_value={}),
):
    from src import api_server

    # Run initialization while the external I/O stubs are active. If startup
    # fails, don't allow a subsequent /health request to report success.
    if not api_server.initialize_app() or not api_server.db_client._initialized:
        raise RuntimeError("Vision or its database failed to initialize")

app = api_server.app
