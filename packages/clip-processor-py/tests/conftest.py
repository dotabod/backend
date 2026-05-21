"""Shared pytest fixtures and offline import shims for clip-processor-py.

The service depends on heavy native libraries (OpenCV, NumPy, streamlink, ...)
that aren't needed to exercise its pure logic. We stub them in `sys.modules`
*before* any `src/` module is imported so the whole suite runs offline without
those wheels installed. This block runs at conftest import time, which pytest
guarantees happens before collecting/importing the test modules.
"""

from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

import pytest

# api_server.py raises at import time unless an API key is set OR we're in local
# mode. Tests never hit the network, so force local mode before any src import.
os.environ.setdefault("RUN_LOCALLY", "true")

# Native / heavy modules replaced by mocks. The source modules only touch these
# inside image/stream code paths we don't drive directly in these tests.
_STUBBED = ("cv2", "numpy", "tqdm", "streamlink", "pytesseract", "moviepy")
for _name in _STUBBED:
    sys.modules.setdefault(_name, MagicMock())
# streamlink.stream is imported as a submodule; give it a mock too.
sys.modules.setdefault("streamlink.stream", MagicMock())
# tqdm is imported as `from tqdm import tqdm` (a pass-through iterable wrapper).
sys.modules["tqdm"].tqdm = lambda iterable=None, *a, **k: iterable if iterable is not None else iter(())


@pytest.fixture
def mock_cursor():
    """A mock DB cursor usable as a context manager and a plain object."""
    cursor = MagicMock()
    cursor.__enter__ = MagicMock(return_value=cursor)
    cursor.__exit__ = MagicMock(return_value=False)
    return cursor


@pytest.fixture
def db_client(mock_cursor):
    """A PostgresClient with all real connection I/O stubbed out (offline)."""
    from postgresql_client import PostgresClient

    client = PostgresClient()
    client._initialized = True
    conn = MagicMock()
    conn.cursor.return_value = mock_cursor
    client._get_connection = MagicMock(return_value=conn)
    client._return_connection = MagicMock()
    client._test_connection = MagicMock(return_value=True)
    client.initialize = MagicMock(return_value=True)
    client._mock_conn = conn  # exposed for assertions
    return client


@pytest.fixture
def players():
    """Sample detected-players list as produced by hero detection."""
    return [
        {"player_name": "Miracle-", "team": "Radiant", "position": 0},
        {"player_name": "N0tail", "team": "Radiant", "position": 1},
        {"player_name": "Topson", "team": "Dire", "position": 2},
        {"player_name": "Ceb", "team": "Dire", "position": 3},
    ]


@pytest.fixture
def draft_order():
    """Sample draft-order name list (parallel to `players`)."""
    return ["Miracle-", "N0tail", "Topson", "Ceb"]
