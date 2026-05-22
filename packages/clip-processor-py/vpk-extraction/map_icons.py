#!/usr/bin/env python3
"""map_icons.py — DRAFT, NOT WIRED INTO PROD.

Rename decompiled VPK hero-icon PNGs from
    npc_dota_hero_<tag>[_<variant>]_png.png
to our detector template naming
    {id}_icon[_<variant>].png

The "arcana/persona -> hero icon" mapping is pure string parsing: Valve ships the
arcana/persona top-bar override under the hero's own internal name with a numbered
suffix (_alt, _alt1..N, _persona1, ...). We only need tag -> numeric hero id.

Emits {id}_icon[_<variant>].png (additive), so it never clobbers the existing
Spectral landscape templates ({id}_base.png, {id}_alt1.png, ...).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

# OpenDota dotaconstants heroes.json: { "1": {"id":1,"name":"npc_dota_hero_antimage",...}, ... }
HEROES_JSON_URL = (
    "https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json"
)

NAME_RE = re.compile(r"^npc_dota_hero_(?P<rest>.+)_png$")
VARIANT_RE = re.compile(r"^(?P<tag>.+?)_(?P<variant>alt\d*|persona\d+)$")


def load_tag_to_id() -> dict[str, int]:
    """Build {tag: hero_id} from dotaconstants heroes.json."""
    with urllib.request.urlopen(HEROES_JSON_URL, timeout=30) as resp:
        data = json.load(resp)
    heroes = data.values() if isinstance(data, dict) else data
    mapping: dict[str, int] = {}
    for hero in heroes:
        name = hero.get("name", "")  # npc_dota_hero_<tag>
        tag = name.replace("npc_dota_hero_", "", 1)
        if tag and hero.get("id") is not None:
            mapping[tag] = int(hero["id"])
    return mapping


def parse_stem(stem: str) -> tuple[str, str] | None:
    """npc_dota_hero_<tag>[_<variant>]_png -> (tag, variant)."""
    m = NAME_RE.match(stem)
    if not m:
        return None
    rest = m.group("rest")  # <tag>[_<variant>]
    vm = VARIANT_RE.match(rest)
    if vm:
        return vm.group("tag"), vm.group("variant")
    return rest, "base"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="dir of decompiled icon PNGs")
    ap.add_argument("--dest", required=True, help="assets/dota_heroes dir")
    args = ap.parse_args()

    src = Path(args.src)
    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)

    tag_to_id = load_tag_to_id()

    written = 0
    unmatched: list[str] = []
    for png in sorted(src.glob("npc_dota_hero_*_png.png")):
        parsed = parse_stem(png.stem)
        if not parsed:
            unmatched.append(png.name)
            continue
        tag, variant = parsed
        hero_id = tag_to_id.get(tag)
        if hero_id is None:
            unmatched.append(f"{png.name} (unknown tag '{tag}')")
            continue
        # Additive naming: {id}_icon.png / {id}_icon_alt1.png / {id}_icon_persona1.png
        suffix = "icon" if variant == "base" else f"icon_{variant}"
        out = dest / f"{hero_id}_{suffix}.png"
        out.write_bytes(png.read_bytes())
        written += 1

    print(f"wrote {written} icon templates to {dest}")
    if unmatched:
        print(f"WARNING: {len(unmatched)} unmatched files:", file=sys.stderr)
        for u in unmatched:
            print(f"  - {u}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
