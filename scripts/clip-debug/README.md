# clip-debug

Tools for debugging why a `!np` / `!gm` roster came back wrong or empty — i.e. why the
Vision processor (`clip-processor-api`) didn't return heroes for a match.

Nothing here writes to production; they read Twitch clips and the processor's Postgres.

## scan_clip.py

Samples a Twitch clip frame-by-frame and reports the brightness of the top-bar strip
(where the 10 hero portraits live).

```sh
uv run --no-project --with opencv-python-headless --with requests \
  scripts/clip-debug/scan_clip.py <clip-slug>
```

Why it matters: the processor only reads **frame 0** of a clip
(`download_single_frame` in `packages/clip-processor-py/src/clip_utils.py`). If that
frame is a fade, a black screen, or a pre-game screen with no HUD, detection fails with

```
No good color match found, best score was only 0.00
```

even when the clip contains perfectly usable frames a few seconds later. This script
tells you which case you're in — a `mean` near 0 is a blank strip. It also dumps full
frames to `$TMPDIR` so you can look at what was actually on screen.

## query_match.sh

Dumps everything the processor knows about one match: every queue attempt (including
failures and retries) and every cached detection result.

```sh
scripts/clip-debug/query_match.sh 8916275620
```

Reads the production clip-processor Postgres (db `clip_processor`, port 5439). The script checks
the current host's Coolify containers first—this workspace normally runs directly on `oracle`—and
uses the `oracle` SSH alias only when the production container is not locally accessible. The
container name carries a deploy-specific suffix, so the script rediscovers it each run.

Gotcha worth knowing: draft requests (`only_draft=true`) are **always** marked
`failed` even when they succeed and write a row to `clip_results` — so a "failed" draft
row is usually a mislabeled success. Only `only_draft=false` status is meaningful.

## Fetching the live API's view of a match

```sh
K=$(sudo -n docker exec i8gccg8 printenv VISION_API_KEY)
curl -s -H "X-API-Key: $K" "https://vision.dotabod.com/match/<matchId>"
```

Re-run a single clip with debug images and cache bypass:

```sh
K=$(sudo -n docker exec i8gccg8 printenv VISION_API_KEY)
curl -s -H "X-API-Key: $K" \
  "https://vision.dotabod.com/detect?clip_id=<slug>&match_id=<id>&debug=1&force=1&queue=0"
```

Check `sudo -n docker ps --format '{{.Names}}' | grep -Fxq coolify` first. If Coolify is local
but `i8gccg8` is absent, report the production service as stopped; do not SSH back into Oracle.
Use the same Docker commands through `ssh oracle` only when Coolify is not local.

Debug crops then live in the container at `/app/temp/debug/` (`top_bar_full.jpg`,
`hero_color_bars.jpg` — the latter is annotated with the per-slot match scores).

## Reading the strategy clock

`scan_clip.py` writes `$TMPDIR/<slug>_clock.png` — an upscaled crop of the `STRATEGY TIME`
countdown from frame 0. It counts **down** from ~30, so it tells you exactly where a strategy
clip landed relative to the roster panel. Above 0:00 means the panel was on screen; past 0:00
means the clip missed it and only the draft/in-game clips have usable data.

This is the fastest way to tell a timing problem from a detection problem — check it before
reading any detection code. Interpret the number against the `CLIP_DELAY_MS` that was live when
the clip was taken (`map.game_state.ts`), since that constant gets retuned.
