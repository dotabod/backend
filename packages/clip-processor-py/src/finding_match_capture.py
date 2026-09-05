#!/usr/bin/env python3
"""Find a safe, native-1080p Dota 2 finding-match frame on Twitch."""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import re
from typing import Any, Iterable, Mapping, Sequence

import cv2
import numpy as np
import requests


logger = logging.getLogger(__name__)

# left, top, width, height within the native 1920x1080 Dota client.
FINDING_MATCH_CROP = (1080, 725, 840, 355)
# Dotabod's dynamic replacement timer begins around y=259. Excluding the lower
# section keeps an old browser overlay from manufacturing a false motion score.
TEXT_AND_TIMER_TOP = 250
FINDING_CONTROL = (742, 285, 790, 335)
IDLE_CONTROL = (445, 275, 790, 340)
QUEUE_TEXT_REGIONS = {
    "finding": (430, 270, 742, 350),
    "idle": (500, 285, 750, 335),
}
REFERENCE_SIMILARITY_LIMIT = 0.985
MINIMUM_MOTION_SCORE = 0.35


@dataclass(frozen=True)
class CandidateEvaluation:
    accepted: bool
    motion_score: float = 0.0
    reason: str = "unknown"
    reference_similarity: float = 0.0
    state: str = "unknown"


def _normalize_login(login: str) -> str:
    return login.strip().lower()


def is_english_queue_text(text: str, state: str) -> bool:
    """Return whether OCR found the expected English queue-control label."""
    letters = re.sub(r"[^A-Z]+", "", text.upper())
    if state == "idle":
        return letters in {"PLAY", "PLAYDOTA"}
    if state == "finding":
        return letters == "FINDINGMATCH"
    return False


def read_queue_text(frame: np.ndarray, state: str) -> str:
    """OCR the queue control itself so Twitch metadata cannot mask localization."""
    import pytesseract

    region = QUEUE_TEXT_REGIONS.get(state)
    if frame.shape[:2] != (1080, 1920) or region is None:
        return ""

    left, top, right, bottom = region
    control = _crop_finding_match(frame)[top:bottom, left:right]
    gray = cv2.cvtColor(control, cv2.COLOR_BGR2GRAY)
    enlarged = cv2.resize(gray, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    processed_images = [
        enlarged,
        cv2.threshold(enlarged, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],
    ]
    config = '--oem 3 --psm 7 -c tessedit_char_whitelist="ABCDEFGHIJKLMNOPQRSTUVWXYZ "'
    fallback = ""
    for image in processed_images:
        text = pytesseract.image_to_string(image, lang="eng", config=config).strip()
        if is_english_queue_text(text, state):
            return text
        if text and not fallback:
            fallback = text
    return fallback


def filter_candidate_streams(
    streams: Iterable[Mapping[str, Any]], excluded_logins: Iterable[str]
) -> list[Mapping[str, Any]]:
    """Remove every known Dotabod channel before opening any Twitch stream."""
    excluded = {_normalize_login(login) for login in excluded_logins if login.strip()}
    return [
        stream
        for stream in streams
        if _normalize_login(str(stream.get("user_login", ""))) not in excluded
        and str(stream.get("language", "")).lower() == "en"
    ]


def choose_1080p_stream(streams: Mapping[str, Any]) -> Any | None:
    """Choose an explicitly labelled 1080p rendition, never an ambiguous `best`."""
    candidates: list[tuple[int, str, Any]] = []
    for name, stream in streams.items():
        match = re.fullmatch(r"1080p(?P<fps>\d+)?(?:\s*\(source\))?", name.lower())
        if match:
            candidates.append((int(match.group("fps") or 0), name, stream))

    if not candidates:
        return None

    stream = max(candidates, key=lambda candidate: candidate[0])[2]
    return getattr(stream, "url", stream)


def _crop_finding_match(frame: np.ndarray) -> np.ndarray:
    left, top, width, height = FINDING_MATCH_CROP
    return frame[top : top + height, left : left + width]


def _ratio_in_region(
    image: np.ndarray,
    region: tuple[int, int, int, int],
    lower: np.ndarray,
    upper: np.ndarray,
) -> float:
    left, top, right, bottom = region
    hsv = cv2.cvtColor(image[top:bottom, left:right], cv2.COLOR_BGR2HSV)
    return float(
        np.count_nonzero(cv2.inRange(hsv, lower, upper)) / np.prod(hsv.shape[:2])
    )


def classify_queue_state(frame: np.ndarray) -> str:
    """Classify the fixed bottom-right queue control in a native Dota frame."""
    if frame.shape[:2] != (1080, 1920):
        return "unknown"

    crop = _crop_finding_match(frame)
    red_ratio = _ratio_in_region(
        crop,
        FINDING_CONTROL,
        np.array([0, 80, 80], dtype=np.uint8),
        np.array([15, 255, 255], dtype=np.uint8),
    )
    if red_ratio > 0.08:
        return "finding"

    green_ratio = _ratio_in_region(
        crop,
        IDLE_CONTROL,
        np.array([35, 55, 50], dtype=np.uint8),
        np.array([82, 255, 255], dtype=np.uint8),
    )
    if green_ratio > 0.12:
        return "idle"

    return "unknown"


def _perceptual_similarity(first: np.ndarray, second: np.ndarray) -> float:
    """Compare the static part of two blocker crops after removing codec noise."""
    first_gray = cv2.cvtColor(first[:TEXT_AND_TIMER_TOP], cv2.COLOR_BGR2GRAY)
    second_gray = cv2.cvtColor(second[:TEXT_AND_TIMER_TOP], cv2.COLOR_BGR2GRAY)
    size = (168, 55)
    first_small = cv2.resize(first_gray, size, interpolation=cv2.INTER_AREA).astype(
        np.float32
    )
    second_small = cv2.resize(second_gray, size, interpolation=cv2.INTER_AREA).astype(
        np.float32
    )
    first_small = cv2.GaussianBlur(first_small, (5, 5), 0)
    second_small = cv2.GaussianBlur(second_small, (5, 5), 0)

    first_std = float(first_small.std())
    second_std = float(second_small.std())
    if first_std < 1e-6 or second_std < 1e-6:
        difference = float(np.mean(np.abs(first_small - second_small)))
        return max(0.0, 1.0 - difference / 255.0)

    correlation = float(np.corrcoef(first_small.ravel(), second_small.ravel())[0, 1])
    return max(0.0, min(1.0, correlation))


def _motion_score(crops: Sequence[np.ndarray]) -> float:
    scores: list[float] = []
    for first, second in zip(crops, crops[1:]):
        first_stable = cv2.GaussianBlur(first[:TEXT_AND_TIMER_TOP], (5, 5), 0)
        second_stable = cv2.GaussianBlur(second[:TEXT_AND_TIMER_TOP], (5, 5), 0)
        scores.append(float(np.mean(cv2.absdiff(first_stable, second_stable))))
    return max(scores, default=0.0)


def evaluate_candidate_frames(
    frames: Sequence[np.ndarray],
    references: Sequence[np.ndarray],
    target_state: str = "finding",
) -> CandidateEvaluation:
    """Apply all feedback-loop and layout guards to consecutive decoded frames."""
    if len(frames) < 2 or any(frame.shape[:2] != (1080, 1920) for frame in frames):
        return CandidateEvaluation(False, reason="not_native_1080p")

    states = [classify_queue_state(frame) for frame in frames]
    state = states[0] if len(set(states)) == 1 else "unknown"
    if state == "unknown" or (target_state != "any" and state != target_state):
        return CandidateEvaluation(False, reason="wrong_queue_state", state=state)

    crops = [_crop_finding_match(frame) for frame in frames]
    similarities = [
        _perceptual_similarity(crop, reference)
        for crop in crops
        for reference in references
        if reference.shape[:2] == (FINDING_MATCH_CROP[3], FINDING_MATCH_CROP[2])
    ]
    reference_similarity = max(similarities, default=0.0)
    if reference_similarity >= REFERENCE_SIMILARITY_LIMIT:
        return CandidateEvaluation(
            False,
            reason="existing_overlay",
            reference_similarity=reference_similarity,
            state=state,
        )

    motion_score = _motion_score(crops)
    if motion_score < MINIMUM_MOTION_SCORE:
        return CandidateEvaluation(
            False,
            motion_score=motion_score,
            reason="static_capture",
            reference_similarity=reference_similarity,
            state=state,
        )

    return CandidateEvaluation(
        True,
        motion_score=motion_score,
        reason="accepted",
        reference_similarity=reference_similarity,
        state=state,
    )


def dotabod_logins_from_rows(rows: Iterable[Sequence[Any]]) -> set[str]:
    return {
        _normalize_login(value)
        for row in rows
        for value in row
        if isinstance(value, str) and value.strip()
    }


def load_dotabod_logins(database_url: str) -> set[str]:
    """Read current and legacy Twitch logins without loading other user data."""
    import psycopg2

    connection = psycopg2.connect(database_url, connect_timeout=15)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT "twitchUsername", name FROM users '
                "WHERE \"twitchUsername\" IS NOT NULL OR name <> ''"
            )
            return dotabod_logins_from_rows(cursor.fetchall())
    finally:
        connection.close()


class TwitchHelixClient:
    def __init__(self, client_id: str, client_secret: str) -> None:
        self.client_id = client_id
        response = requests.post(
            "https://id.twitch.tv/oauth2/token",
            params={
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "client_credentials",
            },
            timeout=20,
        )
        response.raise_for_status()
        self.access_token = response.json()["access_token"]

    @property
    def headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Client-Id": self.client_id,
        }

    def live_dota_streams(self, limit: int) -> list[dict[str, Any]]:
        game_response = requests.get(
            "https://api.twitch.tv/helix/games",
            headers=self.headers,
            params={"name": "Dota 2"},
            timeout=20,
        )
        game_response.raise_for_status()
        games = game_response.json().get("data", [])
        if not games:
            raise RuntimeError("Twitch did not return the Dota 2 category")

        streams: list[dict[str, Any]] = []
        cursor: str | None = None
        while len(streams) < limit:
            response = requests.get(
                "https://api.twitch.tv/helix/streams",
                headers=self.headers,
                params={
                    "after": cursor,
                    "first": min(100, limit - len(streams)),
                    "game_id": games[0]["id"],
                    "type": "live",
                },
                timeout=20,
            )
            response.raise_for_status()
            payload = response.json()
            streams.extend(payload.get("data", []))
            cursor = payload.get("pagination", {}).get("cursor")
            if not cursor:
                break
        return streams[:limit]


def _capture_consecutive_frames(
    login: str,
    frame_count: int,
    interval_seconds: float,
) -> list[np.ndarray]:
    import streamlink

    session = streamlink.Streamlink()
    session.set_option("twitch-disable-ads", True)
    session.set_option("twitch-low-latency", True)
    streams = session.streams(f"https://www.twitch.tv/{login}")
    stream_url = choose_1080p_stream(streams)
    if stream_url is None:
        return []

    capture = cv2.VideoCapture(
        stream_url,
        cv2.CAP_FFMPEG,
        [
            cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
            15_000,
            cv2.CAP_PROP_READ_TIMEOUT_MSEC,
            15_000,
        ],
    )
    if not capture.isOpened():
        capture.release()
        return []

    try:
        fps = capture.get(cv2.CAP_PROP_FPS)
        if not np.isfinite(fps) or fps < 1 or fps > 240:
            fps = 30

        frames: list[np.ndarray] = []
        frames_to_skip = max(30, round(fps))
        for _ in range(frames_to_skip):
            if not capture.grab():
                return []

        for frame_index in range(frame_count):
            success, frame = capture.read()
            if not success:
                return []
            frames.append(frame)

            if frame_index < frame_count - 1:
                for _ in range(max(1, round(fps * interval_seconds))):
                    if not capture.grab():
                        return []
        return frames
    finally:
        capture.release()


def _load_references(paths: Sequence[Path]) -> list[np.ndarray]:
    references: list[np.ndarray] = []
    for path in paths:
        reference = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if reference is None:
            raise RuntimeError(f"Could not read overlay reference: {path}")
        references.append(reference)
    return references


def attach_build_metadata(
    audit: Mapping[str, Any], build_id: str, menu_fingerprint: str
) -> dict[str, Any]:
    return {
        **audit,
        "dotaBuildId": build_id,
        "frameResolution": "1920x1080",
        "menuFingerprint": menu_fingerprint,
    }


def capture_from_twitch(
    streams: Sequence[Mapping[str, Any]],
    excluded_logins: set[str],
    references: Sequence[np.ndarray],
    frame_count: int,
    interval_seconds: float,
    target_state: str,
) -> tuple[np.ndarray, dict[str, Any]] | None:
    attempts: list[dict[str, Any]] = []
    for stream in filter_candidate_streams(streams, excluded_logins):
        login = _normalize_login(str(stream.get("user_login", "")))
        if not login:
            continue

        logger.info("Checking twitch.tv/%s", login)
        try:
            frames = _capture_consecutive_frames(login, frame_count, interval_seconds)
            evaluation = evaluate_candidate_frames(frames, references, target_state)
        except Exception as error:
            logger.warning("Capture failed for %s: %s", login, error)
            attempts.append({"channel": login, "reason": "capture_error"})
            continue

        queue_text = ""
        if evaluation.accepted:
            queue_text = read_queue_text(frames[-1], evaluation.state)
            if not is_english_queue_text(queue_text, evaluation.state):
                attempts.append(
                    {
                        "channel": login,
                        **asdict(evaluation),
                        "accepted": False,
                        "queueText": queue_text,
                        "reason": "localized_or_unreadable_queue_text",
                    }
                )
                continue

        attempts.append(
            {"channel": login, **asdict(evaluation), "queueText": queue_text}
        )
        if evaluation.accepted:
            return frames[-1], {
                "attempts": attempts,
                "capturedAt": datetime.now(timezone.utc).isoformat(),
                "channel": login,
                "evaluation": asdict(evaluation),
                "queueText": queue_text,
                "streamId": stream.get("id"),
                "streamUrl": f"https://www.twitch.tv/{login}",
            }
    return None


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--audit-output", required=True, type=Path)
    parser.add_argument("--reference", action="append", default=[], type=Path)
    parser.add_argument("--build-id", required=True)
    parser.add_argument("--menu-fingerprint", required=True)
    parser.add_argument("--max-streams", default=40, type=int)
    parser.add_argument("--frame-count", default=2, type=int)
    parser.add_argument("--interval-seconds", default=2.0, type=float)
    parser.add_argument(
        "--target-state", choices=("any", "finding", "idle"), default="finding"
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    client_id = os.environ.get("TWITCH_CLIENT_ID", "")
    client_secret = os.environ.get("TWITCH_CLIENT_SECRET", "")
    database_url = os.environ.get("DOTABOD_DATABASE_URL") or os.environ.get(
        "DATABASE_URL", ""
    )
    if not client_id or not client_secret or not database_url:
        raise RuntimeError(
            "TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, and DOTABOD_DATABASE_URL are required"
        )

    excluded_logins = load_dotabod_logins(database_url)
    if not excluded_logins:
        raise RuntimeError(
            "Dotabod channel exclusion list is empty; refusing to capture"
        )

    helix = TwitchHelixClient(client_id, client_secret)
    streams = helix.live_dota_streams(args.max_streams)
    result = capture_from_twitch(
        streams=streams,
        excluded_logins=excluded_logins,
        references=_load_references(args.reference),
        frame_count=max(2, args.frame_count),
        interval_seconds=max(0.5, args.interval_seconds),
        target_state=args.target_state,
    )
    if result is None:
        logger.info("No safe native-1080p %s menu frame was found", args.target_state)
        return 0

    frame, audit = result
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.audit_output.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(args.output), frame, [cv2.IMWRITE_PNG_COMPRESSION, 9]):
        raise RuntimeError(f"Could not write {args.output}")
    audit = attach_build_metadata(audit, args.build_id, args.menu_fingerprint)
    args.audit_output.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    logger.info("Accepted twitch.tv/%s", audit["channel"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
