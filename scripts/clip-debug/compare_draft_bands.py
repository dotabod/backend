#!/usr/bin/env python3
"""Compare draft-name OCR bands against real clips, using the repo's own OCR helper.

Two different draft screens exist and they put player names in different places:

  * Team Draft / captains screen — names on the mid-screen player cards (~y 480 at 1080p).
    This is what `_compute_draft_name_boxes` targets today.
  * All Pick / pick phase — names in the TOP BAR under each portrait (~y 82-108 at 1080p),
    while y 480 is the hero-selection grid. The current band OCRs hero portraits here and
    returns garbage, so All Pick drafts yield no names at all.

This script runs both bands over a list of clip slugs and reports which one wins per clip,
so a change can be justified by measurement instead of a single hand-picked frame.

Usage:
    uv run --no-project --with pytesseract --with opencv-python-headless --with numpy \
        --with requests --with tqdm --with pillow \
        scripts/clip-debug/compare_draft_bands.py <slug> [<slug> ...] [--json out.json]

Requires tesseract with eng+rus (packages/clip-processor-py/install-tesseract-langs.sh).
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse

import cv2
import requests

REPO_SRC = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "packages",
    "clip-processor-py",
    "src",
)
sys.path.insert(0, REPO_SRC)

from dota_hero_detection import (  # noqa: E402
    _compute_draft_name_boxes,
    _ocr_text_from_region,
)

CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"
GQL = "https://gql.twitch.tv/gql"
QUERY = (
    "query VideoAccessToken_Clip($slug: ID!) {"
    " clip(slug: $slug) {"
    " id playbackAccessToken("
    'params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}'
    ") { signature value }"
    " videoQualities { sourceURL quality frameRate } durationSeconds } }"
)


def plausible(text: str | None) -> bool:
    """Same bar isFrameDraft uses: >=2 chars with at least one letter."""
    return bool(text) and len(text.strip()) >= 2 and bool(re.search(r"[A-Za-zА-Яа-я]", text))


def top_bar_boxes(w: int, h: int):
    """Name boxes for the ALL PICK / pick-phase top bar.

    Baseline 1920x1080: five slots left of the clock from x=196 and five right from x=1090,
    each ~124 wide on a 125 pitch, with the name text at y 82..108.
    """
    sx, sy = w / 1920.0, h / 1080.0
    y1, y2 = int(round(82 * sy)), int(round(108 * sy))
    boxes = []
    for start in (196, 1090):
        x = start
        for _ in range(5):
            boxes.append((int(round(x * sx)), y1, int(round((x + 124) * sx)), y2))
            x += 125
    return boxes


def fetch_frame0(slug: str) -> str | None:
    body = {"operationName": "VideoAccessToken_Clip", "query": QUERY, "variables": {"slug": slug}}
    resp = requests.post(GQL, json=body, headers={"Client-ID": CLIENT_ID}, timeout=30)
    resp.raise_for_status()
    clip = resp.json().get("data", {}).get("clip")
    if not clip:
        return None

    token = clip["playbackAccessToken"]
    src = clip["videoQualities"][0]["sourceURL"]
    url = f"{src}?sig={token['signature']}&token={urllib.parse.quote(token['value'])}"

    mp4 = os.path.join(tempfile.gettempdir(), f"{slug}.mp4")
    if not os.path.exists(mp4):
        subprocess.run(["curl", "-sL", "-o", mp4, url], check=True)
    jpg = os.path.join(tempfile.gettempdir(), f"{slug}_t0_full.jpg")
    if not os.path.exists(jpg):
        cap = cv2.VideoCapture(mp4)
        ok, frame = cap.read()
        cap.release()
        if not ok:
            return None
        cv2.imwrite(jpg, frame)
    return jpg


def ocr_boxes(frame, boxes):
    h, w = frame.shape[:2]
    out = []
    for x1, y1, x2, y2 in boxes:
        roi = frame[max(0, y1) : min(h, y2), max(0, x1) : min(w, x2)]
        if roi.size == 0:
            out.append(None)
            continue
        text, _ = _ocr_text_from_region(roi, lang="eng+rus")
        out.append(text.strip() if text else None)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="+")
    ap.add_argument("--json", help="write per-clip results here")
    args = ap.parse_args()

    results = []
    for slug in args.slugs:
        try:
            path = fetch_frame0(slug)
        except Exception as exc:  # noqa: BLE001 - report and continue over a batch
            print(f"{slug}: fetch failed ({exc})")
            continue
        if not path:
            print(f"{slug}: clip unavailable")
            continue

        frame = cv2.imread(path)
        h, w = frame.shape[:2]
        cur = ocr_boxes(frame, _compute_draft_name_boxes(w, h))
        top = ocr_boxes(frame, top_bar_boxes(w, h))
        n_cur = sum(1 for t in cur if plausible(t))
        n_top = sum(1 for t in top if plausible(t))
        winner = "top" if n_top > n_cur else ("current" if n_cur > n_top else "tie")
        results.append(
            {"slug": slug, "current": n_cur, "top": n_top, "winner": winner,
             "current_names": cur, "top_names": top}
        )
        print(f"{slug[:44]:44} current={n_cur}/8  top={n_top}/10  -> {winner}")

    if results:
        cur_wins = sum(1 for r in results if r["winner"] == "current")
        top_wins = sum(1 for r in results if r["winner"] == "top")
        print(f"\n{len(results)} clips: current wins {cur_wins}, top wins {top_wins}, "
              f"tie {len(results) - cur_wins - top_wins}")
        print(f"best-of-both would yield names on "
              f"{sum(1 for r in results if max(r['current'], r['top']) >= 5)}/{len(results)}")

    if args.json:
        with open(args.json, "w") as fh:
            json.dump(results, fh, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
