# Canonical in-game hero icon extraction — PLAN (DRAFT)

> Status: DRAFT / research output. Nothing here is wired into prod. Do not run in CI
> until reviewed. The scripts in this directory are illustrative drafts, not tested
> end-to-end (extraction step requires downloading the real client, which was NOT done
> as part of this research).

## Goal

Extract the **canonical in-game top-bar hero icon art**, including **arcana** and
**persona** variants, directly from the real Dota 2 (Source 2) client, to add as
extra template images for the in-game hero detector
(`src/dota_hero_detection.py`). These supplement the Spectral CDN portraits, which
do not host arcana art.

The detector globs `assets/dota_heroes/{id}_*.png`, crops, and resizes each template
to 128x72. New variant PNGs only need to land in that directory with sensible names.

---

## TL;DR recommendation

- **Source: extract from the real Dota 2 VPK via DepotDownloader (anonymous), then
  decompile with ValveResourceFormat (Source2Viewer-CLI).** The cheaper GitHub
  mirrors do **not** carry the binary icon art (see "Source comparison" below), so
  there is no shortcut around pulling the real client files.
- **Which art:** the top-bar in-game icon is the `panorama/images/heroes/icons/`
  texture style — `npc_dota_hero_<tag>[_<variant>]_png.vtex_c`. Arcana/persona icon
  overrides are stored as the **same files with `_alt`, `_alt1/2/3`, `_persona1`
  suffixes** — i.e. the exact same suffixes our matcher already uses.
- **Mapping is trivial:** in-VPK suffix == our `{id}_{variant}.png` variant token.
  No separate "arcana cosmetic → hero" item lookup is required for the icon art;
  Valve ships the override icon under the hero's own name with the variant suffix.
- **CI blocker to decide:** anonymous depot download of app 570 content is large
  (the Source 2 content depots are tens of GB combined). DepotDownloader with a
  `-filelist` limits _which files are written to disk_, but it still must process the
  full depot manifest. The single `pak01_dir.vpk` + its referenced numbered chunks
  that actually contain `panorama/images/heroes/icons/` is far smaller than a full
  install, but exact bytes need to be measured on a first run (see "CI feasibility").

---

## Source comparison (real VPK vs the GitHub mirrors)

| Source                                 | Has the binary icon art?           | Notes                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`dotabuff/d2vpkr`**                  | **No**                             | Only tracks `dota/resource` (cursor, flash3, localization, overviews) and `dota/scripts` (VDF→JSON text). README states it tracks "only a subset of files." There is **no** `panorama/images/heroes` tree at all. This is what our dotaconstants pipeline reads — it is text/data only.                   |
| **`SteamDatabase/GameTracking-Dota2`** | **No (art), Yes (file _listing_)** | Tracks the panorama _directory structure_ and the authoritative VPK index `game/dota/pak01_dir.txt`, but **not** the binary `.vtex_c` texture content (`panorama/images` contains only a `temp/` folder). Excellent as the authoritative source of exact paths + variant names, useless as an art source. |
| **Real Dota 2 client VPK (app 570)**   | **Yes**                            | The only source that actually contains the `npc_dota_hero_*_png.vtex_c` icon textures. Requires DepotDownloader/SteamCMD + VRF decompile.                                                                                                                                                                 |

Conclusion: **the real VPK is required for the art.** We _do_, however, lean on
`GameTracking-Dota2/game/dota/pak01_dir.txt` as a free, hourly-updated **manifest of
exactly which icon files (and variants) exist** — useful both for the CI change-detection
("did the icon set change?") trigger and to know what to expect after extraction.

`pak01_dir.txt` raw URL:
`https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/game/dota/pak01_dir.txt`

---

## Exact in-VPK paths to extract

The container is `game/dota/pak01_dir.vpk` (a directory VPK that indexes numbered
`pak01_NNN.vpk` data chunks). Hero art exists in three texture styles:

- `panorama/images/heroes/` — large landscape portrait
- `panorama/images/heroes/icons/` — **small square top-bar hero icon ← what we want**
- `panorama/images/heroes/selection/` — vertical hero-select portrait

The detector matches a de-skewed ~60x40 top-bar slot, so the **`icons/` style is the
canonical match** for the in-game top bar. (We could optionally also extract `heroes/`
landscape art as additional templates, since the matcher crops + resizes anyway, but
`icons/` is the primary target.)

File-name pattern (compiled): `npc_dota_hero_<tag>[_<variant>]_png.vtex_c`

As of the current `pak01_dir.txt` snapshot there are **173** icon files: **127 base**

- **46 variant** icons. The full variant list (from `panorama/images/heroes/icons/`):

```
antimage_persona1        crystal_maiden_alt1      crystal_maiden_persona1
axe_alt                  dragon_knight_persona1   drow_ranger_alt1/alt2
earthshaker_alt1/alt2    faceless_void_alt1/alt2  invoker_persona1
juggernaut_alt1/alt2     legion_commander_alt1    lina_alt1
mirana_persona1          monkey_king_alt1         nevermore_alt1
ogre_magi_alt1/alt2      phantom_assassin_alt1    phantom_assassin_persona1
pudge_alt1/alt2          pudge_persona1           queenofpain_alt1/alt2
razor_alt1/alt2          rubick_alt               skeleton_king_alt1/alt2
skywrath_mage_alt1/alt2  spectre_alt1/alt2        techies_alt1
terrorblade_alt1         vengefulspirit_alt1/alt2/alt3
windrunner_alt1/alt2     wisp_alt                 zuus_alt1
```

These `_alt*` / `_persona*` icons ARE the arcana/persona top-bar overrides
(e.g. `terrorblade_alt1` = Fractal Horns arcana icon; `juggernaut_alt1/alt2` =
Bladeform Legacy two styles; `pudge_persona1`, `invoker_persona1`,
`antimage_persona1` = personas; `phantom_assassin_alt1`/`lina_alt1` = arcanas).

---

## Arcana / persona → hero icon mapping

**There is no item-level lookup to do.** Valve ships the arcana/persona top-bar icon
override under the hero's own internal name with a numbered suffix:

```
panorama/images/heroes/icons/npc_dota_hero_<tag>_<variant>_png.vtex_c
                                            ^tag      ^variant ∈ {alt, alt1..3, persona1, ...}
```

So the "mapping" is purely string parsing:

1. From `pak01_dir.txt`, enumerate `panorama/images/heroes/icons/npc_dota_hero_*_png.vtex_c`.
2. Strip the `panorama/images/heroes/icons/npc_dota_hero_` prefix and `_png.vtex_c` suffix.
3. Split into `<tag>` and `<variant>` by matching the trailing
   `_(alt[0-9]*|persona[0-9]*)` token; if none, `variant = base`.
4. Resolve `<tag>` → numeric hero `id` via the hero list we already fetch in
   `src/dota_heroes.py` (`tag` field, e.g. `nevermore` → id 11). Note a few tag
   quirks already handled in our data: `nevermore` (Shadow Fiend, id 11),
   `wisp` (Io, id 91), `zuus` (Zeus, id 22), `skeleton_king` (Wraith King, id 42),
   `queenofpain` (id 39), `vengefulspirit` (id 20), `windrunner` (id 21),
   `doom_bringer`, `obsidian_destroyer`, etc. The `tag` from our existing hero
   metadata is the same token Valve uses in these filenames.

This is why the suffixes line up 1:1 with the variants our matcher already globs
(`{id}_alt.png`, `{id}_alt1.png`, `{id}_persona1.png`, ...).

---

## Output → `{id}_{variant}.png` naming

For each extracted `npc_dota_hero_<tag>[_<variant>]_png.png`:

| Extracted suffix | Our template file   | Example                                      |
| ---------------- | ------------------- | -------------------------------------------- |
| (none / base)    | `{id}_base.png`     | `npc_dota_hero_axe_png` → `2_base.png`       |
| `_alt`           | `{id}_alt.png`      | `..._rubick_alt_png` → `86_alt.png`          |
| `_alt1`          | `{id}_alt1.png`     | `..._terrorblade_alt1_png` → `109_alt1.png`  |
| `_persona1`      | `{id}_persona1.png` | `..._pudge_persona1_png` → `14_persona1.png` |

Because the matcher crops + resizes to 128x72 itself, we do **not** need to pre-resize.
We just emit the decompiled PNG at native resolution under the mapped name. The
existing `invalidate_template_cache()` logic (deletes `templates_cache.npz`) should be
triggered whenever new PNGs land so templates get recomputed.

**Naming caution:** the in-VPK `icons/` art is the _small square_ icon, whereas the
existing Spectral templates in `assets/dota_heroes/` are the _large landscape_ portrait
(`portraits_lg`). These are visually different crops. Two options:

- **(Recommended) Add, don't replace.** Land VPK icons under a distinct variant token
  so both sources coexist as templates, e.g. `{id}_icon.png`, `{id}_icon_alt1.png`,
  `{id}_icon_persona1.png`. The matcher globs `{id}_*.png` so it will pick them up,
  and more templates per hero generally helps top-bar matching (the top bar shows the
  small icon, so these may even match _better_ than the landscape portraits).
- **(Alt) Replace** the Spectral set entirely with VPK `icons/`. Riskier — changes the
  95%-accuracy baseline — so prefer adding first and A/B with the eval scripts
  (`eval_in_game.py`, `eval3.py`, `eval5.py`) before considering replacement.

The draft `extract-icons.sh` uses the `_icon` suffix scheme so it is purely additive.

---

## Tools & versions

- **DepotDownloader** (SteamRE) — depot download via SteamKit2. Supports anonymous
  login and `-filelist` to restrict extracted files. Distributed as a self-contained
  .NET binary / NuGet tool (`dotnet tool install -g DepotDownloader`).
  - Caveat: "free-to-play" does not guarantee the _anonymous_ account can pull the
    app's content depots. Several SteamRE issues show `App is not available from this
account` for some f2p titles under anonymous. **Dota 2 (570) dedicated-server +
    content depots are generally anonymous-accessible**, but the CI job MUST treat
    "anonymous failed" as a first-class failure and surface it (fallback would require
    a real Steam account secret, which we likely do not want in CI).
- **ValveResourceFormat / Source2Viewer-CLI** — Source 2 decompiler. Latest release
  **19.1** (2026-04-09). Linux CLI asset: **`cli-linux-x64.zip`** from
  `github.com/ValveResourceFormat/ValveResourceFormat/releases`. Unzips to a
  `Source2Viewer-CLI` executable. Decompiles `.vtex_c` → PNG.
  - Key invocation (decompile + export only the icons folder):
    `Source2Viewer-CLI -i pak01_dir.vpk -o out -d -f "panorama/images/heroes/icons/" -e "vtex_c"`

---

## CI feasibility (runner disk / time)

`ubuntu-latest` GitHub-hosted runners provide ~14 GB free on the `/` SSD and ~65–70 GB
on the larger `/mnt` partition; jobs are capped at 6 h.

Concerns / mitigations:

1. **Download size.** A full app 570 install is ~35–50 GB — too large for the small
   partition and slow. Mitigations:
   - Use DepotDownloader `-filelist` with regex limited to
     `game/dota/pak01_dir.vpk` and the `pak01` data chunks. DepotDownloader only
     _writes_ matched files, but it still downloads the data chunks that contain them.
     The chunks holding `panorama/images/heroes/icons/` are a small fraction of the
     full game, but the exact footprint must be measured on a first manual/CI run.
   - Target only the **content depot** that holds panorama (historically 373301 /
     the 3733xx + 3814xx content depots — verify current IDs on SteamDB
     `steamdb.info/app/570/depots/`, they change per build).
   - Write downloads to the large `/mnt` partition (`-dir /mnt/dota`).
2. **Time.** Even a partial pull plus decompile of ~173 small textures (each ~6 KB
   compiled) is dominated by the network download. Decompile itself is seconds. Well
   within the 6 h cap; budget conservatively (~15–40 min) until measured.
3. **Format drift.** VRF may lag a Source 2 format bump for a day or two after a
   major patch; if decompile fails, the job should fail loudly and we re-run after a
   VRF update (pin a known-good VRF release, bump deliberately).
4. **`pak01_dir.vpk` chunk dependency.** A directory VPK references numbered data
   `.vpk` chunks; you need both the `_dir.vpk` and the chunk(s) that store the icon
   bytes. `-filelist` matching only `pak01_dir.vpk` is NOT enough — the regex must
   also allow the numbered chunks. (The draft script downloads the whole `pak01*`
   set to be safe; this is the main size unknown to validate.)

**Open item to validate before prod:** measure actual bytes/time of a `-filelist`
restricted pull on a runner. If it is still too large, fall back to a self-hosted
runner or a scheduled VM with persistent disk, or maintain a tiny private mirror of
just the icon `.vtex_c` files.

---

## CI change-detection trigger (mirrors the dotaconstants pattern)

The existing `dotaconstants-update.yml` compares a tracked SHA and only opens a PR on
change. Analogue here, without needing to download the client just to check:

1. Fetch `pak01_dir.txt` from `GameTracking-Dota2`.
2. Compute a hash of just the
   `panorama/images/heroes/icons/npc_dota_hero_*_png.vtex_c` lines (path + CRC).
3. Compare to a stored hash committed in this repo
   (`vpk-extraction/icons_manifest.sha`). If unchanged → exit, no extraction, no
   client download. If changed → run the (expensive) DepotDownloader+VRF extraction,
   regenerate PNGs, delete `templates_cache.npz`, and open a PR.

This keeps the heavy job rare (only when Valve actually ships new/changed hero icons),
matching the "low-noise" philosophy of the existing workflow.
