import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from unittest.mock import patch
from uuid import uuid4

import psycopg2
from psycopg2 import sql

from src.postgresql_client import PostgresClient


@unittest.skipUnless(os.environ.get("CLIP_TEST_DATABASE_URL"), "requires an isolated PostgreSQL database")
class QueuePostgresTest(unittest.TestCase):
    def setUp(self):
        database_url = os.environ["CLIP_TEST_DATABASE_URL"]
        schema = f"clip_test_{uuid4().hex}"
        admin = psycopg2.connect(database_url)
        self.addCleanup(admin.close)
        with admin, closing(admin.cursor()) as cursor:
            cursor.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))

        def drop_schema():
            with admin, closing(admin.cursor()) as cursor:
                cursor.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))

        self.addCleanup(drop_schema)
        dsn = psycopg2.extensions.make_dsn(database_url, options=f"-c search_path={schema}")
        with patch.dict(os.environ, DATABASE_URL=dsn):
            self.db = PostgresClient()
        self.assertTrue(self.db.initialize())
        self.addCleanup(self.db._connection_pool.closeall)

    def queue_clip(self, clip_id, match_id):
        request_id, row = self.db.add_to_queue(
            request_type="clip",
            clip_id=clip_id,
            clip_url=f"https://clips.twitch.tv/{clip_id}",
            match_id=match_id,
        )
        self.assertEqual(row["status"], "pending")
        return request_id

    def test_rejected_draft_frame_leaves_the_match_eligible_for_strategy(self):
        match_id = "8916340932"
        clip_url = "https://clips.twitch.tv/example"
        self.assertTrue(self.db.save_clip_result(
            "rejected-draft", clip_url, {"is_draft": False}, match_id=match_id,
        ))
        self.assertEqual(self.db.check_for_match_processing(match_id), {"found": False})
        self.assertTrue(self.db.save_clip_result(
            "rejected-draft", clip_url, {"is_draft": False, "heroes": None}, match_id=match_id,
        ))
        self.assertEqual(self.db.check_for_match_processing(match_id), {"found": False})
        self.assertTrue(self.db.save_clip_result(
            "strategy", clip_url, {"heroes": [{"hero_id": 74}]}, match_id=match_id,
        ))
        self.assertEqual(self.db.check_for_match_processing(match_id), {
            "clip_id": "strategy", "found": True, "status": "completed",
        })

    def test_transient_retry_waits_without_blocking_ready_clips(self):
        waiting = self.queue_clip("transcoding", "1")
        ready = self.queue_clip("ready", "2")
        self.assertTrue(self.db.requeue_for_retry(waiting, delay_seconds=600))
        self.assertEqual(self.db.get_next_pending_request()["request_id"], ready)

    def test_worker_and_sweep_share_six_retry_slots(self):
        request_id = self.queue_clip("delayed", "1")
        permanent = self.queue_clip("rejected", "2")
        self.assertTrue(self.db.update_queue_status(permanent, "failed", failure_reason="permanent"))

        for expected_count in range(5):
            self.assertTrue(self.db.update_queue_status(request_id, "failed", failure_reason="transient"))
            self.assertEqual(
                [(row["request_id"], row["retry_count"]) for row in self.db.fetch_recent_failed_clips()],
                [(request_id, expected_count)],
            )
            self.assertTrue(self.db.requeue_for_retry(request_id, delay_seconds=0))

        self.assertTrue(self.db.update_queue_status(request_id, "failed", failure_reason="transient"))
        with ThreadPoolExecutor(max_workers=2) as workers:
            retries = [workers.submit(self.db.requeue_for_retry, request_id, 0) for _ in range(2)]
            self.assertEqual(sorted(retry.result(timeout=10) for retry in retries), [False, True])

        self.assertTrue(self.db.update_queue_status(request_id, "failed", failure_reason="transient"))
        self.assertEqual(self.db.fetch_recent_failed_clips(), [])
        self.assertFalse(self.db.requeue_for_retry(request_id, delay_seconds=0))
