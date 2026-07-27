#!/usr/bin/env python3
"""Scan a Twitch clip frame-by-frame to see what the vision processor would have seen.

The processor only ever reads **frame 0** of a clip (`download_single_frame`), so a
clip whose first frame is a fade/black screen fails with "No good color match found,
best score was only 0.00" even when a perfectly usable Dota HUD appears a few seconds
later. This script samples the whole clip so you can tell the two cases apart:

  - every frame is unusable  -> the clip was genuinely captured at the wrong time
  - later frames are usable  -> the processor's single-frame read is the bug

Usage:
    uv run --no-project --with opencv-python-headless --with requests \
        scripts/clip-debug/scan_clip.py <clip-slug> [--interval 1] [--dump-every 5]

Output is one line per sampled second with the mean/max luma of the top-bar strip
(the region hero portraits live in). A mean near 0 means "nothing on screen there".
Frames are written to $TMPDIR for eyeballing.
"""

import argparse
import os
import subprocess
import sys
import tempfile
import urllib.parse

import cv2
import requests

# Public web-client ID, same one packages/clip-processor-py/src/clip_utils.py uses.
CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"
GQL = "https://gql.twitch.tv/gql"

# Send the full query rather than a persisted-query hash: Twitch rotates the
# sha256Hash for VideoAccessToken_Clip and a stale hash 404s every lookup.
QUERY = (
    "query VideoAccessToken_Clip($slug: ID!) {"
    " clip(slug: $slug) {"
    " id"
    " playbackAccessToken("
    'params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}'
    ") { signature value }"
    " videoQualities { sourceURL quality frameRate }"
    " durationSeconds title broadcaster { displayName } createdAt"
    " } }"
)

# Top-bar strip height at 1080p; scaled to the clip's real height below.
TOP_BAR_H_AT_1080 = 110


def get_download_url(slug: str) -> tuple[str, dict]:
    body = {"operationName": "VideoAccessToken_Clip", "query": QUERY, "variables": {"slug": slug}}
    resp = requests.post(GQL, json=body, headers={"Client-ID": CLIENT_ID}, timeout=30)
    resp.raise_for_status()
    clip = resp.json().get("data", {}).get("clip")
    if not clip:
        # Twitch's GQL graph lags Helix by ~30s on fresh clips; this is also what a
        # deleted clip looks like.
        sys.exit(f"clip not found or not yet available in GQL: {slug}")

    token = clip["playbackAccessToken"]
    quals = clip["videoQualities"]
    src = quals[0]["sourceURL"]
    url = f"{src}?sig={token['signature']}&token={urllib.parse.quote(token['value'])}"
    return url, clip


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", help="clip slug, e.g. CourteousWisePigFutureMan-hGI6OOh-yNa0q04m")
    ap.add_argument("--interval", type=float, default=1.0, help="seconds between samples")
    ap.add_argument("--dump-every", type=int, default=5, help="write a full frame every N samples")
    args = ap.parse_args()

    url, clip = get_download_url(args.slug)
    print(
        f"broadcaster={clip.get('broadcaster', {}).get('displayName')} "
        f"duration={clip.get('durationSeconds')}s "
        f"qualities={[q['quality'] for q in clip['videoQualities']]}"
    )

    path = os.path.join(tempfile.gettempdir(), f"{args.slug}.mp4")
    if not os.path.exists(path):
        print("downloading...")
        subprocess.run(["curl", "-sL", "-o", path, url], check=True)
    print(f"file: {path} ({os.path.getsize(path)} bytes)")

    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"fps={fps:.2f} frames={frames} dur={frames / fps:.2f}s res={width}x{height}\n")

    strip_h = int(round(TOP_BAR_H_AT_1080 * height / 1080))
    step = max(1, int(args.interval * fps))
    idx = 0
    sample = 0
    while idx < frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if not ok:
            break
        strip = frame[0:strip_h, :, :]
        secs = idx / fps
        mean, mx = float(strip.mean()), int(strip.max())
        flag = "  <- blank" if mean < 5 else ""
        print(f"t={secs:6.1f}s mean={mean:6.1f} max={mx:3d}{flag}")

        if args.dump_every and sample % args.dump_every == 0:
            out = os.path.join(tempfile.gettempdir(), f"{args.slug}_t{int(secs)}_full.jpg")
            cv2.imwrite(out, frame)
        if idx == 0:
            write_clock_crop(frame, args.slug)

        idx += step
        sample += 1

    cap.release()
    print(f"\nframes written to {tempfile.gettempdir()}/{args.slug}_t*_full.jpg")
    print(
        f"clock crop:    {tempfile.gettempdir()}/{args.slug}_clock.png\n"
        "  Read the STRATEGY TIME countdown in that crop — it counts DOWN from ~30 to 0 and is\n"
        "  the ground truth for where a strategy clip landed. Above 0:00 means the roster panel\n"
        "  was on screen; past 0:00 means the clip missed it. Compare the number against the\n"
        "  CLIP_DELAY_MS in effect when the clip was taken (map.game_state.ts), not a fixed range."
    )


def write_clock_crop(frame, slug: str) -> str:
    """Save an upscaled crop of the central STRATEGY TIME countdown from frame 0.

    Reading this number is how you tell a well-aimed strategy clip from a late one, and it's
    the only direct measurement of clip-vs-broadcast alignment available after the fact. It's
    upscaled 3x because the digits are small and the surrounding HUD is dark — at native size
    they're easy to misread.
    """
    h, w = frame.shape[:2]
    x1, x2 = int(w * 850 / 1920), int(w * 1080 / 1920)
    y2 = int(h * 110 / 1080)
    crop = frame[0:y2, x1:x2]
    crop = cv2.resize(crop, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    out = os.path.join(tempfile.gettempdir(), f"{slug}_clock.png")
    cv2.imwrite(out, crop)
    return out


if __name__ == "__main__":
    main()
