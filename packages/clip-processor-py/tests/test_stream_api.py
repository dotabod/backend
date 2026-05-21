"""HTTP tests for the stream-processor management API (stream_api.py).

The real StreamManager (asyncio + cv2 capture) is never started; we patch the
module-global `manager` with a MagicMock and stub `save_config`/`init_manager`
so no files are written and no threads spawn. cv2/numpy/waitress are stubbed
offline via conftest.
"""

from unittest.mock import MagicMock, patch

import pytest

import stream_api


def _mock_manager(running=True):
    mgr = MagicMock()
    mgr.running = running
    mgr.get_stats.return_value = {
        "uptime": 12, "streams": 2, "active": 1,
        "total_captures": 10, "successful_captures": 8, "failed_captures": 2,
        "dota_matches_found": 3, "success_rate": 80.0,
    }
    mgr.get_all_streams.return_value = {
        "alice": {"captures": 5, "successful_captures": 4, "dota_matches": 1, "frame_paths": ["/t/a.jpg"]},
    }
    return mgr


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(stream_api, "config", {
        "capture_interval": 3, "max_concurrent": 100, "quality": "720p", "streams": {},
    })
    monkeypatch.setattr(stream_api, "save_config", MagicMock())
    stream_api.app.config.update(TESTING=True)
    return stream_api.app.test_client()


@pytest.fixture
def managed(client, monkeypatch):
    mgr = _mock_manager()
    monkeypatch.setattr(stream_api, "manager", mgr)
    return client, mgr


# --------------------------------------------------------------------------- #
# 503 when manager not initialized
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("method, path", [
    ("get", "/api/status"),
    ("get", "/api/streams"),
    ("get", "/api/streams/alice"),
    ("post", "/api/streams"),
    ("delete", "/api/streams/alice"),
    ("put", "/api/streams/alice/priority"),
    ("post", "/api/streams/bulk"),
    ("get", "/api/metrics"),
])
def test_routes_503_when_manager_uninitialized(client, monkeypatch, method, path):
    monkeypatch.setattr(stream_api, "manager", None)
    resp = getattr(client, method)(path, json={})
    assert resp.status_code == 503


# --------------------------------------------------------------------------- #
# status / streams
# --------------------------------------------------------------------------- #
def test_status_running(managed):
    client, _ = managed
    resp = client.get("/api/status")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["status"] == "running"
    assert body["stats"]["uptime"] == 12
    assert body["config"]["total_streams"] == 0


def test_streams_filters_frame_paths(managed):
    client, _ = managed
    resp = client.get("/api/streams")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["total"] == 1
    assert "frame_paths" not in body["streams"]["alice"]
    assert body["streams"]["alice"]["captures"] == 5


def test_get_stream_not_found(managed):
    client, mgr = managed
    mgr.get_stream_status.return_value = None
    resp = client.get("/api/streams/ghost")
    assert resp.status_code == 404


def test_get_stream_returns_frame_urls(managed, tmp_path):
    client, mgr = managed
    frame = tmp_path / "alice_1.jpg"
    frame.write_bytes(b"x")
    mgr.get_stream_status.return_value = {"captures": 1, "frame_paths": [str(frame)]}
    resp = client.get("/api/streams/alice")
    assert resp.status_code == 200
    body = resp.get_json()
    assert "frame_paths" not in body
    assert body["frames"] == ["/api/frames/alice/alice_1.jpg"]


# --------------------------------------------------------------------------- #
# add / remove / priority
# --------------------------------------------------------------------------- #
def test_add_stream_missing_username_400(managed):
    client, _ = managed
    resp = client.post("/api/streams", json={"priority": 2})
    assert resp.status_code == 400


def test_add_stream_registers_and_persists(managed):
    client, mgr = managed
    resp = client.post("/api/streams", json={"username": "bob", "priority": 2})
    assert resp.status_code == 200
    mgr.add_stream.assert_called_once_with("bob", 2)
    assert stream_api.config["streams"]["bob"]["priority"] == 2


def test_remove_stream(managed):
    client, mgr = managed
    stream_api.config["streams"]["bob"] = {"priority": 5}
    resp = client.delete("/api/streams/bob")
    assert resp.status_code == 200
    mgr.remove_stream.assert_called_once_with("bob")
    assert "bob" not in stream_api.config["streams"]


def test_update_priority_missing_field_400(managed):
    client, _ = managed
    resp = client.put("/api/streams/bob/priority", json={})
    assert resp.status_code == 400


def test_update_priority_updates_manager_and_config(managed):
    client, mgr = managed
    stream_api.config["streams"]["bob"] = {"priority": 5}
    resp = client.put("/api/streams/bob/priority", json={"priority": 1})
    assert resp.status_code == 200
    mgr.update_priority.assert_called_once_with("bob", 1)
    assert stream_api.config["streams"]["bob"]["priority"] == 1


# --------------------------------------------------------------------------- #
# config
# --------------------------------------------------------------------------- #
def test_get_config(client):
    resp = client.get("/api/config")
    assert resp.status_code == 200
    assert resp.get_json()["quality"] == "720p"


def test_update_config_no_data_400(client):
    resp = client.put("/api/config", json={})
    assert resp.status_code == 400


def test_update_config_applies_and_reinits(client):
    with patch.object(stream_api, "init_manager") as init:
        resp = client.put("/api/config", json={"capture_interval": 7, "quality": "1080p"})
    assert resp.status_code == 200
    assert stream_api.config["capture_interval"] == 7
    assert stream_api.config["quality"] == "1080p"
    init.assert_called_once()


# --------------------------------------------------------------------------- #
# frames serving (existence checked before ownership)
# --------------------------------------------------------------------------- #
def test_get_frame_404_when_missing(client, monkeypatch, tmp_path):
    monkeypatch.setattr(stream_api, "FRAMES_DIR", tmp_path)
    resp = client.get("/api/frames/alice/missing.jpg")
    assert resp.status_code == 404


def test_get_frame_403_for_other_users_frame(client, monkeypatch, tmp_path):
    monkeypatch.setattr(stream_api, "FRAMES_DIR", tmp_path)
    (tmp_path / "bob_1.jpg").write_bytes(b"x")
    resp = client.get("/api/frames/alice/bob_1.jpg")
    assert resp.status_code == 403


def test_get_frame_serves_owned_frame(client, monkeypatch, tmp_path):
    monkeypatch.setattr(stream_api, "FRAMES_DIR", tmp_path)
    (tmp_path / "alice_1.jpg").write_bytes(b"\xff\xd8\xffjpeg")
    resp = client.get("/api/frames/alice/alice_1.jpg")
    assert resp.status_code == 200


# --------------------------------------------------------------------------- #
# restart / bulk / metrics
# --------------------------------------------------------------------------- #
def test_restart_calls_init(client):
    with patch.object(stream_api, "init_manager") as init:
        resp = client.post("/api/restart")
    assert resp.status_code == 200
    init.assert_called_once()


def test_bulk_add_invalid_payload_400(managed):
    client, _ = managed
    resp = client.post("/api/streams/bulk", json={"streams": "notalist"})
    assert resp.status_code == 400


def test_bulk_add_mixes_strings_and_dicts(managed):
    client, mgr = managed
    resp = client.post("/api/streams/bulk", json={"streams": [
        "alice", {"username": "bob", "priority": 1}, {"bad": "entry"}, 42,
    ]})
    assert resp.status_code == 200
    assert "Added 2 streams" in resp.get_json()["message"]
    assert mgr.add_stream.call_count == 2
    assert set(stream_api.config["streams"]) == {"alice", "bob"}


def test_metrics_prometheus_text(managed):
    client, _ = managed
    resp = client.get("/api/metrics")
    assert resp.status_code == 200
    assert resp.mimetype == "text/plain"
    text = resp.get_data(as_text=True)
    assert "stream_processor_uptime_seconds 12" in text
    assert 'stream_processor_stream_captures_total{stream="alice"} 5' in text
