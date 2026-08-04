#!/usr/bin/env python3
"""Measure how many rank reads the parser loses, versus what OCR actually saw.

`!gm` shows a rank per player, but a large share of clips come back with only some
slots filled. This tells you *where* that loss happens: the OCR failing to see the
digits at all, or the parser mishandling a read that was fine.

It scans each clip for its best frame (the roster panel is only up for part of a
clip), OCRs the rank band with the production settings, and then compares the raw
string against what `extract_rank_text`'s logic would make of it.

Usage:
    uv run --no-project --with pytesseract --with opencv-python-headless --with numpy \
        --with requests --with tqdm --with pillow \
        scripts/clip-debug/sweep_rank_parse.py <slug> [<slug> ...] [--json out.json]

Requires tesseract with eng+rus (packages/clip-processor-py/install-tesseract-langs.sh).
"""

import argparse
import json
import logging
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
logging.disable(logging.INFO)

import dota_hero_detection as d  # noqa: E402

CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"
QUERY = (
    "query VideoAccessToken_Clip($slug: ID!) {"
    " clip(slug: $slug) { id playbackAccessToken("
    'params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}'
    ") { signature value } videoQualities { sourceURL quality } } }"
)

# Ranks are Immortal leaderboard standings; anything outside this is a misread.
RANK_MIN, RANK_MAX = 1, 5000


def fetch_mp4(slug):
    body = {"operationName": "VideoAccessToken_Clip", "query": QUERY, "variables": {"slug": slug}}
    r = requests.post(
        "https://gql.twitch.tv/gql", json=body, headers={"Client-ID": CLIENT_ID}, timeout=30
    )
    clip = r.json().get("data", {}).get("clip")
    if not clip:
        return None
    tok = clip["playbackAccessToken"]
    src = clip["videoQualities"][0]["sourceURL"]
    url = f"{src}?sig={tok['signature']}&token={urllib.parse.quote(tok['value'])}"
    path = os.path.join(tempfile.gettempdir(), f"{slug}.mp4")
    if not os.path.exists(path):
        subprocess.run(["curl", "-sL", "-o", path, url], check=True)
    return path


def parse_current(text, confidence=100.0):
    """The production parser, called directly rather than reimplemented.

    An earlier version of this script mirrored `extract_rank_text` (first digit group,
    truncate until <=5000). That is the *picking* path's parser — the top bar uses
    `_parse_top_bar_rank`, which is stricter — so the comparison measured a function
    that never runs here and made the current behaviour look better than it is.
    """
    return d._parse_top_bar_rank(text, confidence)


def parse_proposed(text):
    """Longest digit group, rejected outright when out of range.

    Longest because the stray leading digit comes from OCR mangling the word "Rank"
    ('an 1 29', '1 199'), and the real standing is the longer run. Rejecting rather
    than truncating because a truncated number is indistinguishable from a real rank
    once it reaches chat.
    """
    digits = re.findall(r"\d+", text or "")
    if not digits:
        return None
    n = int(max(digits, key=len))
    return n if RANK_MIN <= n <= RANK_MAX else None


def best_frame_reads(mp4, step=5):
    """Return the per-slot raw rank strings from the frame with the most names."""
    cap = cv2.VideoCapture(mp4)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    best = (0, None)
    for t in range(0, int(total / fps), step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]
        n_names = d._score_names(d._ocr_name_boxes(frame, d._compute_top_bar_name_boxes(w, h)))
        if n_names > best[0]:
            best = (n_names, frame)
    cap.release()

    n_names, frame = best
    if frame is None:
        return 0, []
    h, w = frame.shape[:2]
    reads = []
    for x1, y1, x2, y2 in d._compute_top_bar_rank_boxes(w, h):
        txt, _ = d._ocr_text_from_region(
            frame[y1:y2, x1:x2], lang="eng+rus", config=d._TOPBAR_RANK_CONFIG, upscale=4
        )
        reads.append(txt)
    return n_names, reads


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="+")
    ap.add_argument("--json")
    args = ap.parse_args()

    rows = []
    for slug in args.slugs:
        try:
            mp4 = fetch_mp4(slug)
        except Exception as exc:  # noqa: BLE001 - keep sweeping the rest
            print(f"{slug[:44]:44} fetch failed ({exc})")
            continue
        if not mp4:
            print(f"{slug[:44]:44} unavailable")
            continue

        n_names, reads = best_frame_reads(mp4)
        saw_digits = sum(1 for r in reads if r and any(c.isdigit() for c in r))
        cur = sum(1 for r in reads if parse_current(r) is not None)
        new = sum(1 for r in reads if parse_proposed(r) is not None)
        differs = [
            (r, parse_current(r), parse_proposed(r))
            for r in reads
            if parse_current(r) != parse_proposed(r)
        ]
        rows.append(
            {"slug": slug, "names": n_names, "ocr_saw": saw_digits, "current": cur, "proposed": new,
             "differs": differs}
        )
        print(f"{slug[:40]:40} names={n_names:2}/10 ocr_saw={saw_digits:2} cur={cur:2} new={new:2}")
        for raw, a, b in differs:
            print(f"      {raw!r:16} current={a}  proposed={b}")

    if rows:
        n = len(rows)
        print(f"\n{n} clips")
        print(f"  slots where OCR saw digits : {sum(r['ocr_saw'] for r in rows)}")
        print(f"  parsed by current parser   : {sum(r['current'] for r in rows)}")
        print(f"  parsed by proposed parser  : {sum(r['proposed'] for r in rows)}")
        print(f"  clips with a differing slot: {sum(1 for r in rows if r['differs'])}")

    if args.json:
        with open(args.json, "w") as fh:
            json.dump(rows, fh, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
