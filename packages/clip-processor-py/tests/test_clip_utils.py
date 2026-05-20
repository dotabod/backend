#!/usr/bin/env python3
"""Tests for clip_utils download-URL resolution (quality fallback on CDN 404)."""

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.parse import quote

# Add the src directory to the Python path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

# Stub heavy/optional module-level imports so the test runs fully offline without
# requiring opencv/numpy to be installed. clip_utils only uses these for the
# frame-extraction paths, not for get_clip_details.
for _mod in ("cv2", "numpy", "bs4", "tqdm"):
    sys.modules.setdefault(_mod, MagicMock())

import clip_utils

CLIP_SLUG = "SoftAlluringPorcupineWoofer-S0qyX3h5b6Xh-KqE"
BASE = "https://d1ndex63qxojbr.cloudfront.net/nauth/abc/landscape/h264"
URL_1080 = f"{BASE}/1080/index.mp4"
URL_720 = f"{BASE}/720/index.mp4"


def make_token(clip_uri):
    return {
        "value": json.dumps({"clip_uri": clip_uri, "clip_slug": CLIP_SLUG}),
        "signature": "sigvalue",
    }


def gql_response(qualities, token):
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {
        "data": {
            "clip": {
                "playbackAccessToken": token,
                "videoQualities": qualities,
                "durationSeconds": 30,
                "title": "t",
                "broadcaster": {"displayName": "b"},
                "createdAt": "2026-05-20T00:00:00Z",
            }
        }
    }
    return resp


def probe(status_code):
    resp = MagicMock()
    resp.status_code = status_code
    resp.close.return_value = None
    return resp


class ClipUtilsResolveTests(unittest.TestCase):
    def test_falls_back_to_720_when_1080_is_404(self):
        qualities = [
            {"quality": "1080", "sourceURL": URL_1080},
            {"quality": "720", "sourceURL": URL_720},
        ]
        token = make_token(URL_720)

        with patch("clip_utils.requests") as mock_requests:
            mock_requests.RequestException = Exception
            mock_requests.post.return_value = gql_response(qualities, token)
            # 1080 probe -> 404, 720 probe -> 206
            mock_requests.get.side_effect = [probe(404), probe(206)]

            details = clip_utils.get_clip_details(
                f"https://clips.twitch.tv/{CLIP_SLUG}"
            )

        self.assertEqual(details["selected_quality"], "720")
        self.assertTrue(details["download_url"].startswith(URL_720))
        self.assertIn(f"sig={token['signature']}", details["download_url"])
        self.assertIn(quote(token["value"]), details["download_url"])

    def test_uses_1080_when_available(self):
        qualities = [
            {"quality": "1080", "sourceURL": URL_1080},
            {"quality": "720", "sourceURL": URL_720},
        ]
        token = make_token(URL_720)

        with patch("clip_utils.requests") as mock_requests:
            mock_requests.RequestException = Exception
            mock_requests.post.return_value = gql_response(qualities, token)
            mock_requests.get.side_effect = [probe(206)]

            details = clip_utils.get_clip_details(
                f"https://clips.twitch.tv/{CLIP_SLUG}"
            )

        self.assertEqual(details["selected_quality"], "1080")
        self.assertTrue(details["download_url"].startswith(URL_1080))

    def test_clip_uri_fallback_when_all_qualities_404(self):
        # clip_uri points to a rendition not present in videoQualities.
        qualities = [{"quality": "1080", "sourceURL": URL_1080}]
        token = make_token(URL_720)

        with patch("clip_utils.requests") as mock_requests:
            mock_requests.RequestException = Exception
            mock_requests.post.return_value = gql_response(qualities, token)
            # 1080 -> 404, then clip_uri (720) -> 206
            mock_requests.get.side_effect = [probe(404), probe(206)]

            details = clip_utils.get_clip_details(
                f"https://clips.twitch.tv/{CLIP_SLUG}"
            )

        self.assertEqual(details["selected_quality"], "720")
        self.assertTrue(details["download_url"].startswith(URL_720))

    def test_returns_highest_when_every_candidate_404(self):
        qualities = [
            {"quality": "1080", "sourceURL": URL_1080},
            {"quality": "720", "sourceURL": URL_720},
        ]
        token = make_token(URL_720)

        with patch("clip_utils.requests") as mock_requests:
            mock_requests.RequestException = Exception
            mock_requests.post.return_value = gql_response(qualities, token)
            # both quality probes 404; clip_uri (== 720 url) is deduped, so 2 probes
            mock_requests.get.side_effect = [probe(404), probe(404)]

            details = clip_utils.get_clip_details(
                f"https://clips.twitch.tv/{CLIP_SLUG}"
            )

        # Last resort: highest advertised quality
        self.assertEqual(details["selected_quality"], "1080")
        self.assertTrue(details["download_url"].startswith(URL_1080))


if __name__ == "__main__":
    unittest.main()
