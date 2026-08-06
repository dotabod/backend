#!/usr/bin/env python3
"""A/B the font-exact rank reader against Tesseract on real clips.

`!gm` shows a leaderboard rank per player, and a large share of clips historically
came back with only some slots filled. This measures how many slots each reader
recovers on the same frames, so a change is justified by production data rather
than by the handful of frames that happened to be on hand.

It picks each clip's best frame (the roster panel is only up for part of a clip),
then reads every rank slot with both readers and reports per-slot agreement.

Usage:
    uv run --no-project --with pytesseract --with opencv-python-headless --with numpy \
        --with requests --with tqdm --with pillow \
        scripts/clip-debug/sweep_rank_readers.py <slug> [<slug> ...] [--json out.json]

Needs tesseract with eng+rus for the baseline half
(packages/clip-processor-py/install-tesseract-langs.sh).
"""

import argparse
import json
import logging
import os
import subprocess
import sys
import tempfile
import time
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


def best_frame(mp4, step=5):
    """The frame with the most readable player names — i.e. the roster panel."""
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
        score = d._score_names(d._ocr_name_boxes(frame, d._compute_top_bar_name_boxes(w, h)))
        if score > best[0]:
            best = (score, frame)
    cap.release()
    return best


def read_tesseract(frame):
    h, w = frame.shape[:2]
    out = []
    for x1, y1, x2, y2 in d._compute_top_bar_rank_boxes(w, h):
        text, conf = d._ocr_text_from_region(
            frame[y1:y2, x1:x2], lang="eng+rus", config=d._TOPBAR_RANK_CONFIG, upscale=4
        )
        out.append(d._parse_top_bar_rank(text, conf))
    return out


def read_font(frame):
    h, w = frame.shape[:2]
    return [
        d._read_rank_font_exact(frame, *box) for box in d._compute_top_bar_rank_boxes(w, h)
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="+")
    ap.add_argument("--json")
    args = ap.parse_args()

    rows = []
    for slug in args.slugs:
        try:
            mp4 = fetch_mp4(slug)
        except Exception as exc:  # noqa: BLE001 - keep sweeping
            print(f"{slug[:40]:40} fetch failed ({exc})")
            continue
        if not mp4:
            print(f"{slug[:40]:40} unavailable")
            continue

        names, frame = best_frame(mp4)
        if frame is None:
            print(f"{slug[:40]:40} no readable frame")
            continue

        t0 = time.time()
        tess = read_tesseract(frame)
        t_ms = 1000 * (time.time() - t0) / 10
        t1 = time.time()
        font = read_font(frame)
        f_ms = 1000 * (time.time() - t1) / 10

        n_t = sum(1 for v in tess if v is not None)
        n_f = sum(1 for v in font if v is not None)
        # Disagreements are the interesting column: one of them is wrong.
        clash = [(i, a, b) for i, (a, b) in enumerate(zip(tess, font))
                 if a is not None and b is not None and a != b]
        rows.append({"slug": slug, "names": names, "tess": n_t, "font": n_f,
                     "tess_vals": tess, "font_vals": font, "clash": clash,
                     "tess_ms": t_ms, "font_ms": f_ms})
        print(f"{slug[:40]:40} names={names:2}/10 tess={n_t:2}/10 font={n_f:2}/10"
              f"  {t_ms:6.0f}ms vs {f_ms:5.1f}ms")
        for i, a, b in clash:
            print(f"      slot {i}: tesseract={a} font={b}")

    if rows:
        n = len(rows)
        st, sf = sum(r["tess"] for r in rows), sum(r["font"] for r in rows)
        print(f"\n{n} clips, {n * 10} slots")
        print(f"  tesseract  : {st:4} ({100 * st / (n * 10):.1f}%)  "
              f"{sum(r['tess_ms'] for r in rows) / n:.0f}ms/slot")
        print(f"  font-exact : {sf:4} ({100 * sf / (n * 10):.1f}%)  "
              f"{sum(r['font_ms'] for r in rows) / n:.1f}ms/slot")
        print(f"  disagreements: {sum(len(r['clash']) for r in rows)}")

    if args.json:
        with open(args.json, "w") as fh:
            json.dump(rows, fh, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
