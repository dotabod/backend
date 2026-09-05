import cv2
import numpy as np

from finding_match_capture import (
    FINDING_MATCH_CROP,
    attach_build_metadata,
    capture_from_twitch,
    choose_1080p_stream,
    classify_queue_state,
    dotabod_logins_from_rows,
    evaluate_candidate_frames,
    filter_candidate_streams,
    is_english_queue_text,
    psycopg_database_url,
)


def _full_frame(state: str, motion_step: int = 0) -> np.ndarray:
    frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
    left, top, width, height = FINDING_MATCH_CROP

    x_gradient = np.linspace(15, 70, width, dtype=np.uint8)
    y_gradient = np.linspace(10, 55, height, dtype=np.uint8)[:, None]
    crop = frame[top : top + height, left : left + width]
    crop[:, :, 0] = x_gradient
    crop[:, :, 1] = y_gradient
    crop[:, :, 2] = 35

    if motion_step:
        crop[20:180, 300:600, 0] = np.clip(
            crop[20:180, 300:600, 0].astype(np.int16) + motion_step,
            0,
            255,
        )

    if state == "finding":
        crop[291:327, 748:784] = (25, 65, 180)
    elif state == "idle":
        crop[285:335, 452:782] = (65, 140, 70)

    return frame


def _embedded_reference(reference: np.ndarray) -> np.ndarray:
    frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
    left, top, width, height = FINDING_MATCH_CROP
    frame[top : top + height, left : left + width] = reference
    return frame


def test_filter_candidate_streams_excludes_every_known_dotabod_login_case_insensitively():
    streams = [
        {"language": "en", "user_login": "DotabodUser", "viewer_count": 100},
        {"language": "en", "user_login": "safe_streamer", "viewer_count": 50},
    ]
    assert filter_candidate_streams(streams, {"dotaboduser"}) == [
        {"language": "en", "user_login": "safe_streamer", "viewer_count": 50}
    ]


def test_filter_candidate_streams_uses_the_twitch_english_tag_as_a_prefilter():
    streams = [
        {"language": "ru", "user_login": "localized_stream", "viewer_count": 75},
        {"user_login": "untagged_stream", "viewer_count": 60},
        {"language": "en", "user_login": "english_stream", "viewer_count": 50},
    ]
    assert filter_candidate_streams(streams, set()) == [
        {"language": "en", "user_login": "english_stream", "viewer_count": 50}
    ]


def test_queue_ocr_requires_english_client_text_even_on_an_english_stream():
    assert is_english_queue_text("PLAY DOTA", "idle") is True
    assert is_english_queue_text("FINDING MATCH", "finding") is True
    assert is_english_queue_text("FINDINGMATCH", "finding") is True
    assert is_english_queue_text("ИГРАТЬ", "idle") is False
    assert is_english_queue_text("ПОИСК ИГРЫ", "finding") is False
    assert is_english_queue_text("", "finding") is False


def test_capture_rejects_russian_client_text_on_an_english_tagged_stream(
    monkeypatch,
):
    frames = [_full_frame("finding"), _full_frame("finding", motion_step=12)]
    monkeypatch.setattr(
        "finding_match_capture._capture_consecutive_frames",
        lambda *_args: frames,
    )
    monkeypatch.setattr(
        "finding_match_capture.read_queue_text",
        lambda _frame, _state: "ПОИСК ИГРЫ",
        raising=False,
    )

    result = capture_from_twitch(
        streams=[{"id": "123", "language": "en", "user_login": "safe_streamer"}],
        excluded_logins=set(),
        references=[],
        frame_count=2,
        interval_seconds=2.0,
        target_state="finding",
    )

    assert result is None


def test_capture_accepts_and_records_verified_english_client_text(monkeypatch):
    frames = [_full_frame("finding"), _full_frame("finding", motion_step=12)]
    monkeypatch.setattr(
        "finding_match_capture._capture_consecutive_frames",
        lambda *_args: frames,
    )
    monkeypatch.setattr(
        "finding_match_capture.read_queue_text",
        lambda _frame, _state: "FINDING MATCH",
    )

    result = capture_from_twitch(
        streams=[{"id": "123", "language": "en", "user_login": "safe_streamer"}],
        excluded_logins=set(),
        references=[],
        frame_count=2,
        interval_seconds=2.0,
        target_state="finding",
    )

    assert result is not None
    _, audit = result
    assert audit["queueText"] == "FINDING MATCH"
    assert audit["evaluation"]["accepted"] is True


def test_dotabod_login_rows_include_current_and_legacy_channel_columns():
    assert dotabod_logins_from_rows(
        [("CurrentLogin", "legacy_login"), (None, "FallbackName"), ("", None)]
    ) == {"currentlogin", "legacy_login", "fallbackname"}


def test_psycopg_database_url_removes_prisma_pooling_parameters():
    assert psycopg_database_url(
        "postgresql://user:p%40ss@db.example.com:6543/dotabod?"
        "pgbouncer=true&connection_limit=1&pool_timeout=10&schema=public&"
        "sslmode=require&application_name=finding-match"
    ) == (
        "postgresql://user:p%40ss@db.example.com:6543/dotabod?"
        "sslmode=require&application_name=finding-match"
    )


def test_attach_build_metadata_records_the_menu_fingerprint():
    audit = attach_build_metadata({}, "25132749", "abc123")

    assert audit == {
        "dotaBuildId": "25132749",
        "frameResolution": "1920x1080",
        "menuFingerprint": "abc123",
    }


def test_choose_1080p_stream_never_falls_back_to_an_ambiguous_best_rendition():
    streams = {
        "best": "best-stream",
        "720p60": "720-stream",
        "1080p": "1080-stream",
        "1080p60": "1080-60-stream",
    }

    assert choose_1080p_stream(streams) == "1080-60-stream"
    assert choose_1080p_stream({"best": "best-stream", "720p60": "720-stream"}) is None


def test_classify_queue_state_uses_the_fixed_1080p_dota_controls():
    assert classify_queue_state(_full_frame("finding")) == "finding"
    assert classify_queue_state(_full_frame("idle")) == "idle"


def test_evaluate_candidate_frames_rejects_non_native_resolution():
    result = evaluate_candidate_frames(
        [np.zeros((720, 1280, 3), dtype=np.uint8)],
        references=[],
        target_state="finding",
    )

    assert result.accepted is False
    assert result.reason == "not_native_1080p"


def test_evaluate_candidate_frames_rejects_a_recompressed_existing_blocker():
    left, top, width, height = FINDING_MATCH_CROP
    source = _full_frame("finding")
    reference = source[top : top + height, left : left + width]

    encoded_ok, encoded = cv2.imencode(
        ".jpg",
        reference,
        [cv2.IMWRITE_JPEG_QUALITY, 45],
    )
    assert encoded_ok
    recompressed = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    result = evaluate_candidate_frames(
        [_embedded_reference(recompressed), _embedded_reference(recompressed)],
        references=[reference],
        target_state="finding",
    )

    assert result.accepted is False
    assert result.reason == "existing_overlay"
    assert result.reference_similarity > 0.98


def test_evaluate_candidate_frames_rejects_an_unknown_static_blocker():
    frame = _full_frame("finding")

    result = evaluate_candidate_frames(
        [frame, frame.copy()],
        references=[],
        target_state="finding",
    )

    assert result.accepted is False
    assert result.reason == "static_capture"


def test_evaluate_candidate_frames_accepts_a_moving_native_finding_menu():
    result = evaluate_candidate_frames(
        [_full_frame("finding"), _full_frame("finding", motion_step=12)],
        references=[],
        target_state="finding",
    )

    assert result.accepted is True
    assert result.reason == "accepted"
    assert result.state == "finding"
    assert result.motion_score > 0.5


def test_evaluate_candidate_frames_can_accept_either_missing_queue_state():
    result = evaluate_candidate_frames(
        [_full_frame("idle"), _full_frame("idle", motion_step=12)],
        references=[],
        target_state="any",
    )

    assert result.accepted is True
    assert result.state == "idle"
