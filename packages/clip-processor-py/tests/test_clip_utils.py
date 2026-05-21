"""Tests for clip_utils.get_clip_details: CDN quality fallback + retry/backoff.

Ported from the old unittest module and extended with retry characterization so
the retry loop's behavior is pinned before it gets extracted into a shared helper.
"""

import json
from unittest.mock import MagicMock, patch
from urllib.parse import quote

import pytest

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


# --------------------------------------------------------------------------- #
# CDN quality fallback
# --------------------------------------------------------------------------- #
def test_falls_back_to_720_when_1080_is_404():
    qualities = [
        {"quality": "1080", "sourceURL": URL_1080},
        {"quality": "720", "sourceURL": URL_720},
    ]
    token = make_token(URL_720)
    with patch("clip_utils.requests") as mock_requests:
        mock_requests.RequestException = Exception
        mock_requests.post.return_value = gql_response(qualities, token)
        mock_requests.get.side_effect = [probe(404), probe(206)]
        details = clip_utils.get_clip_details(f"https://clips.twitch.tv/{CLIP_SLUG}")
    assert details["selected_quality"] == "720"
    assert details["download_url"].startswith(URL_720)
    assert f"sig={token['signature']}" in details["download_url"]
    assert quote(token["value"]) in details["download_url"]


def test_uses_1080_when_available():
    qualities = [
        {"quality": "1080", "sourceURL": URL_1080},
        {"quality": "720", "sourceURL": URL_720},
    ]
    token = make_token(URL_720)
    with patch("clip_utils.requests") as mock_requests:
        mock_requests.RequestException = Exception
        mock_requests.post.return_value = gql_response(qualities, token)
        mock_requests.get.side_effect = [probe(206)]
        details = clip_utils.get_clip_details(f"https://clips.twitch.tv/{CLIP_SLUG}")
    assert details["selected_quality"] == "1080"
    assert details["download_url"].startswith(URL_1080)


def test_clip_uri_fallback_when_all_qualities_404():
    qualities = [{"quality": "1080", "sourceURL": URL_1080}]
    token = make_token(URL_720)
    with patch("clip_utils.requests") as mock_requests:
        mock_requests.RequestException = Exception
        mock_requests.post.return_value = gql_response(qualities, token)
        mock_requests.get.side_effect = [probe(404), probe(206)]
        details = clip_utils.get_clip_details(f"https://clips.twitch.tv/{CLIP_SLUG}")
    assert details["selected_quality"] == "720"
    assert details["download_url"].startswith(URL_720)


def test_returns_highest_when_every_candidate_404():
    qualities = [
        {"quality": "1080", "sourceURL": URL_1080},
        {"quality": "720", "sourceURL": URL_720},
    ]
    token = make_token(URL_720)
    with patch("clip_utils.requests") as mock_requests:
        mock_requests.RequestException = Exception
        mock_requests.post.return_value = gql_response(qualities, token)
        mock_requests.get.side_effect = [probe(404), probe(404)]
        details = clip_utils.get_clip_details(f"https://clips.twitch.tv/{CLIP_SLUG}")
    assert details["selected_quality"] == "1080"
    assert details["download_url"].startswith(URL_1080)


# --------------------------------------------------------------------------- #
# Retry / backoff
# --------------------------------------------------------------------------- #
def test_retries_then_raises_after_max_attempts():
    with patch("clip_utils.requests") as mock_requests, \
         patch("clip_utils.time.sleep") as sleep:
        mock_requests.RequestException = Exception
        mock_requests.post.side_effect = RuntimeError("network down")
        with pytest.raises(RuntimeError, match="network down"):
            clip_utils.get_clip_details(
                f"https://clips.twitch.tv/{CLIP_SLUG}", max_retries=3, retry_delay=2
            )
    # 3 attempts, sleeping between (not after the last) with 1.5x backoff
    assert mock_requests.post.call_count == 3
    assert [c.args[0] for c in sleep.call_args_list] == [2, 3.0]


def test_succeeds_on_second_attempt():
    qualities = [{"quality": "1080", "sourceURL": URL_1080}]
    token = make_token(URL_1080)
    with patch("clip_utils.requests") as mock_requests, \
         patch("clip_utils.time.sleep"):
        mock_requests.RequestException = Exception
        mock_requests.post.side_effect = [RuntimeError("blip"), gql_response(qualities, token)]
        mock_requests.get.side_effect = [probe(206)]
        details = clip_utils.get_clip_details(
            f"https://clips.twitch.tv/{CLIP_SLUG}", max_retries=3
        )
    assert details["selected_quality"] == "1080"
    assert mock_requests.post.call_count == 2


# --------------------------------------------------------------------------- #
# _build_download_url
# --------------------------------------------------------------------------- #
def test_build_download_url_encodes_token_and_signature():
    token = make_token(URL_1080)
    url = clip_utils._build_download_url(URL_1080, token)
    assert url.startswith(URL_1080 + "?token=")
    assert quote(token["value"]) in url
    assert f"sig={token['signature']}" in url


# --------------------------------------------------------------------------- #
# _resolve_available_download_url
# --------------------------------------------------------------------------- #
def test_resolve_skips_404_and_returns_first_206():
    qualities = [
        {"quality": "1080", "sourceURL": URL_1080},
        {"quality": "720", "sourceURL": URL_720},
    ]
    token = make_token(URL_720)
    with patch("clip_utils.requests") as mock_requests:
        mock_requests.RequestException = Exception
        mock_requests.get.side_effect = [probe(404), probe(206)]
        url, quality = clip_utils._resolve_available_download_url(qualities, token)
    assert quality == "720"
    assert url.startswith(URL_720)


def test_resolve_falls_back_to_clip_uri_when_advertised_404():
    # Only 1080 advertised (and 404); token's clip_uri points at a real 720 file.
    qualities = [{"quality": "1080", "sourceURL": URL_1080}]
    token = make_token(URL_720)
    with patch("clip_utils.requests") as mock_requests:
        mock_requests.RequestException = Exception
        mock_requests.get.side_effect = [probe(404), probe(206)]
        url, quality = clip_utils._resolve_available_download_url(qualities, token)
    assert url.startswith(URL_720)
    assert quality == "720"  # parsed from /720/index.mp4


def test_resolve_returns_highest_when_every_candidate_404():
    qualities = [
        {"quality": "1080", "sourceURL": URL_1080},
        {"quality": "720", "sourceURL": URL_720},
    ]
    token = make_token(URL_720)
    with patch("clip_utils.requests") as mock_requests:
        mock_requests.RequestException = Exception
        mock_requests.get.side_effect = [probe(404), probe(404)]
        url, quality = clip_utils._resolve_available_download_url(qualities, token)
    assert quality == "1080"


def test_resolve_raises_when_no_candidates():
    token = {"value": json.dumps({}), "signature": "s"}  # no clip_uri
    with patch("clip_utils.requests") as mock_requests:
        mock_requests.RequestException = Exception
        with pytest.raises(ValueError, match="No valid sourceURL"):
            clip_utils._resolve_available_download_url([], token)


# --------------------------------------------------------------------------- #
# get_clip_details — malformed GQL
# --------------------------------------------------------------------------- #
def test_get_clip_details_raises_when_clip_missing():
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {"data": {"clip": None}}
    with patch("clip_utils.requests") as mock_requests, \
         patch("clip_utils.time.sleep"):
        mock_requests.RequestException = Exception
        mock_requests.post.return_value = resp
        with pytest.raises(ValueError, match="Clip not found"):
            clip_utils.get_clip_details(f"https://clips.twitch.tv/{CLIP_SLUG}", max_retries=1)


# --------------------------------------------------------------------------- #
# download_single_frame — early-return seams (no network/cv2)
# --------------------------------------------------------------------------- #
def test_download_single_frame_raises_without_url():
    with pytest.raises(ValueError, match="No download URL"):
        clip_utils.download_single_frame({"id": "c1"})


def test_download_single_frame_reuses_existing_frame(tmp_path):
    frames_dir = tmp_path / "frames"
    frames_dir.mkdir()
    (frames_dir / "c1.jpg").write_bytes(b"cached")
    with patch.object(clip_utils, "TEMP_DIR", tmp_path), \
         patch("clip_utils.requests") as mock_requests:
        out = clip_utils.download_single_frame({"id": "c1", "download_url": "http://x"})
    assert out.endswith("c1.jpg")
    mock_requests.get.assert_not_called()  # reused, never hit the network
