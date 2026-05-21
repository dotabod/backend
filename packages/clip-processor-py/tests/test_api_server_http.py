"""HTTP-layer tests for api_server routes via Flask's test client.

These exercise the previously-untested web surface: the image-serving security
checks, the API-key decorator, and the health/metrics/queue-status endpoints.
The `@app.before_request` hook would otherwise run the heavy `initialize_app`
(network + template load), so the fixture marks the app pre-initialized.
"""

from unittest.mock import MagicMock, patch

import pytest

import api_server


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(api_server, "app_initialized", True)
    api_server.app.config.update(TESTING=True)
    return api_server.app.test_client()


# --------------------------------------------------------------------------- #
# /health (no auth)
# --------------------------------------------------------------------------- #
def test_health_ok_without_auth(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"


# --------------------------------------------------------------------------- #
# require_api_key
# --------------------------------------------------------------------------- #
def test_metrics_requires_key_when_not_local(client, monkeypatch):
    monkeypatch.setenv("RUN_LOCALLY", "false")
    monkeypatch.setattr(api_server, "API_KEY", "secret")
    resp = client.get("/metrics")
    assert resp.status_code == 401


def test_metrics_accepts_valid_key(client, monkeypatch):
    monkeypatch.setenv("RUN_LOCALLY", "false")
    monkeypatch.setattr(api_server, "API_KEY", "secret")
    with patch.object(api_server, "psutil") as ps:
        proc = ps.Process.return_value
        proc.cpu_percent.return_value = 1.0
        proc.memory_info.return_value.rss = 1024 * 1024 * 50
        proc.num_threads.return_value = 7
        resp = client.get("/metrics", headers={"X-API-Key": "secret"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["num_threads"] == 7
    assert body["memory_mb"] == 50.0


def test_local_mode_bypasses_auth(client, monkeypatch):
    # conftest sets RUN_LOCALLY=true; metrics should serve with no key.
    with patch.object(api_server, "psutil") as ps:
        proc = ps.Process.return_value
        proc.cpu_percent.return_value = 0.0
        proc.memory_info.return_value.rss = 0
        proc.num_threads.return_value = 1
        resp = client.get("/metrics")
    assert resp.status_code == 200


# --------------------------------------------------------------------------- #
# /queue/status/<request_id>
# --------------------------------------------------------------------------- #
def test_queue_status_not_found(client):
    db = MagicMock()
    db.get_queue_status.return_value = None
    with patch.object(api_server, "db_client", db):
        resp = client.get("/queue/status/req-x")
    assert resp.status_code == 404


def test_queue_status_pending(client):
    db = MagicMock()
    db.get_queue_status.return_value = {"status": "pending", "position": 3, "clip_id": "c1"}
    with patch.object(api_server, "db_client", db):
        resp = client.get("/queue/status/req-1")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["status"] == "pending"
    assert body["position"] == 3


def test_queue_status_completed_attaches_clip_result(client):
    db = MagicMock()
    db.get_queue_status.return_value = {
        "status": "completed", "request_type": "clip", "result_id": "c1",
    }
    db.get_clip_result.return_value = {"players": [{"player_name": "x"}]}
    with patch.object(api_server, "db_client", db):
        resp = client.get("/queue/status/req-2")
    assert resp.status_code == 200
    assert resp.get_json()["result"]["players"] == [{"player_name": "x"}]


# --------------------------------------------------------------------------- #
# /images/<filename> security
# --------------------------------------------------------------------------- #
def test_serve_image_rejects_dotdot(client):
    resp = client.get("/images/foo..jpg")
    assert resp.status_code == 400


def test_serve_image_rejects_bad_extension(client):
    resp = client.get("/images/evil.exe")
    assert resp.status_code == 400


def test_serve_image_404_for_missing_file(client, tmp_path):
    with patch.object(api_server, "IMAGE_DIR", tmp_path):
        resp = client.get("/images/missing.jpg")
    assert resp.status_code == 404


def test_serve_image_serves_existing_file_with_security_headers(client, tmp_path):
    img = tmp_path / "good.jpg"
    img.write_bytes(b"\xff\xd8\xff\xe0jpegbytes")
    with patch.object(api_server, "IMAGE_DIR", tmp_path):
        resp = client.get("/images/good.jpg")
    assert resp.status_code == 200
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert "no-store" in resp.headers["Cache-Control"]
