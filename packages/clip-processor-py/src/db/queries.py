from __future__ import annotations
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple

from psycopg2.extras import RealDictCursor

from .connection import get_connection, return_connection, test_connection

logger = logging.getLogger(__name__)


def initialize_db(results_table: str, queue_table: str) -> bool:
    """Create necessary tables if they do not exist."""
    conn = None
    try:
        if not test_connection():
            logger.error("Failed to connect to PostgreSQL")
            return False
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {results_table} (
                id SERIAL PRIMARY KEY,
                clip_id TEXT UNIQUE NOT NULL,
                clip_url TEXT NOT NULL,
                results JSONB NOT NULL,
                processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                processing_time_seconds FLOAT,
                match_id TEXT,
                facets JSONB
            );
            """
        )
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {queue_table} (
                id SERIAL PRIMARY KEY,
                request_id TEXT UNIQUE NOT NULL,
                clip_id TEXT,
                clip_url TEXT,
                stream_username TEXT,
                num_frames INTEGER DEFAULT 3,
                debug BOOLEAN DEFAULT FALSE,
                force BOOLEAN DEFAULT FALSE,
                include_image BOOLEAN DEFAULT TRUE,
                request_type TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                position INTEGER,
                estimated_completion_time TIMESTAMP,
                estimated_wait_seconds INTEGER,
                result_id TEXT,
                match_id TEXT
            );
            """
        )
        cursor.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{results_table}_clip_id ON {results_table} (clip_id);"
        )
        cursor.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{queue_table}_request_id ON {queue_table} (request_id);"
        )
        cursor.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{queue_table}_status ON {queue_table} (status);"
        )
        cursor.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{queue_table}_position ON {queue_table} (position);"
        )
        conn.commit()
        cursor.close()
        return True
    except Exception as e:
        logger.error(f"Error initializing PostgreSQL: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            return_connection(conn)


def get_clip_result(results_table: str, clip_id: str) -> Optional[Dict[str, Any]]:
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            f"SELECT results, facets FROM {results_table} WHERE clip_id = %s ORDER BY processed_at DESC LIMIT 1",
            (clip_id,),
        )
        row = cursor.fetchone()
        cursor.close()
        if row:
            result = row["results"]
            facets = row["facets"]
            if facets and "players" in result:
                for player in result["players"]:
                    team = player["team"].lower()
                    pos = player["position"]
                    for hero_facet in facets[team]:
                        if hero_facet["position"] == pos:
                            player["facet"] = hero_facet["facet"]
                            break
            if facets and "heroes" in result:
                for hero in result["heroes"]:
                    team = hero["team"].lower()
                    pos = hero["position"] + 1
                    for hero_facet in facets[team]:
                        if hero_facet["position"] == pos:
                            hero["facet"] = hero_facet["facet"]
                            break
            return result
        return None
    except Exception as e:
        logger.error(f"Error getting clip result: {e}")
        return None
    finally:
        if conn:
            return_connection(conn)


def get_clip_result_by_match_id(results_table: str, match_id: str) -> Optional[Dict[str, Any]]:
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            f"SELECT clip_id, clip_url, results, facets FROM {results_table} WHERE match_id = %s ORDER BY processed_at DESC LIMIT 1",
            (match_id,),
        )
        row = cursor.fetchone()
        cursor.close()
        if row:
            result = row["results"]
            facets = row["facets"]
            if isinstance(result, dict):
                result["clip_id"] = row["clip_id"]
                result["clip_url"] = row["clip_url"]
            if facets and "players" in result:
                for player in result["players"]:
                    team = player["team"].lower()
                    pos = player["position"]
                    for hero_facet in facets[team]:
                        if hero_facet["position"] == pos:
                            player["facet"] = hero_facet["facet"]
                            break
            if facets and "heroes" in result:
                for hero in result["heroes"]:
                    team = hero["team"].lower()
                    pos = hero["position"] + 1
                    for hero_facet in facets[team]:
                        if hero_facet["position"] == pos:
                            hero["facet"] = hero_facet["facet"]
                            break
            return result
        return None
    except Exception as e:
        logger.error(f"Error getting clip result by match ID: {e}")
        return None
    finally:
        if conn:
            return_connection(conn)


def check_for_match_processing(results_table: str, queue_table: str, match_id: str) -> Optional[Dict[str, Any]]:
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            f"SELECT clip_id FROM {results_table} WHERE match_id = %s ORDER BY processed_at DESC LIMIT 1",
            (match_id,),
        )
        result_row = cursor.fetchone()
        if result_row:
            cursor.close()
            return {"found": True, "status": "completed", "clip_id": result_row["clip_id"]}
        cursor.execute(
            f"SELECT request_id, clip_id, status FROM {queue_table} WHERE match_id = %s AND status IN ('pending','processing') ORDER BY CASE WHEN status='processing' THEN 0 WHEN status='pending' THEN 1 END, created_at ASC LIMIT 1",
            (match_id,),
        )
        queue_row = cursor.fetchone()
        if queue_row:
            cursor.close()
            return {
                "found": True,
                "status": queue_row["status"],
                "clip_id": queue_row.get("clip_id"),
                "request_id": queue_row["request_id"],
            }
        cursor.execute(
            f"SELECT request_id, clip_id FROM {queue_table} WHERE match_id = %s AND status = 'failed' ORDER BY completed_at DESC LIMIT 1",
            (match_id,),
        )
        failed_row = cursor.fetchone()
        cursor.close()
        if failed_row:
            return {
                "found": True,
                "status": "failed",
                "clip_id": failed_row.get("clip_id"),
                "request_id": failed_row["request_id"],
            }
        return {"found": False}
    except Exception as e:
        logger.error(f"Error checking match processing: {e}")
        return None
    finally:
        if conn:
            return_connection(conn)


def save_clip_result(results_table: str, clip_id: str, clip_url: str, result: Dict[str, Any], processing_time_seconds: Optional[float] = None, match_id: Optional[str] = None) -> bool:
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        facets = {"radiant": [], "dire": []}
        if "players" in result:
            for player in result["players"]:
                if "facet" in player:
                    facets[player["team"].lower()].append({"position": player["position"], "facet": player["facet"]})
        cursor.execute(
            f"INSERT INTO {results_table} (clip_id, clip_url, results, processing_time_seconds, match_id, facets, processed_at) VALUES (%s, %s, %s, %s, %s, %s, NOW()) ON CONFLICT (clip_id) DO UPDATE SET clip_url = EXCLUDED.clip_url, results = EXCLUDED.results, processing_time_seconds = EXCLUDED.processing_time_seconds, match_id = EXCLUDED.match_id, facets = EXCLUDED.facets, processed_at = NOW()",
            (
                clip_id,
                clip_url,
                json.dumps(result),
                processing_time_seconds,
                match_id,
                json.dumps(facets) if facets["radiant"] or facets["dire"] else None,
            ),
        )
        conn.commit()
        cursor.close()
        return True
    except Exception as e:
        logger.error(f"Error saving clip result: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            return_connection(conn)


def get_average_processing_time(results_table: str, queue_table: str, request_type: str = "clip") -> float:
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        if request_type == "stream":
            query = f"SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_time FROM {queue_table} WHERE request_type = 'stream' AND status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL"
        else:
            query = f"SELECT AVG(processing_time_seconds) as avg_time FROM {results_table} WHERE processing_time_seconds IS NOT NULL"
        cursor.execute(query)
        result = cursor.fetchone()
        cursor.close()
        if result and result[0] is not None:
            return float(result[0])
        return 15.0 if request_type == "clip" else 25.0
    except Exception as e:
        logger.error(f"Error getting average processing time: {e}")
        return 15.0 if request_type == "clip" else 25.0
    finally:
        if conn:
            return_connection(conn)


def is_request_in_queue(queue_table: str, request_type: str, clip_id: Optional[str] = None, stream_username: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if request_type == "clip" and not clip_id:
        return None
    if request_type == "stream" and not stream_username:
        return None
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        query = None
        params = None
        if request_type == "clip":
            query = f"SELECT * FROM {queue_table} WHERE request_type = 'clip' AND clip_id = %s AND status in ('pending','processing') ORDER BY created_at DESC LIMIT 1"
            params = (clip_id,)
        elif request_type == "stream":
            query = f"SELECT * FROM {queue_table} WHERE request_type = 'stream' AND stream_username = %s AND status in ('pending','processing') ORDER BY created_at DESC LIMIT 1"
            params = (stream_username,)
        if query and params:
            cursor.execute(query, params)
            queue_entry = cursor.fetchone()
            cursor.close()
            if queue_entry:
                return dict(queue_entry)
        return None
    except Exception as e:
        logger.error(f"Error checking queue: {e}")
        return None
    finally:
        if conn:
            return_connection(conn)


def add_to_queue(results_table: str, queue_table: str, request_type: str, clip_id: Optional[str] = None, clip_url: Optional[str] = None, stream_username: Optional[str] = None, num_frames: int = 3, debug: bool = False, force: bool = False, include_image: bool = True, match_id: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
    if request_type not in ("clip", "stream"):
        return str(__import__('uuid').uuid4()), {}
    if request_type == "clip" and not clip_url:
        return str(__import__('uuid').uuid4()), {}
    if request_type == "stream" and not stream_username:
        return str(__import__('uuid').uuid4()), {}
    request_id = str(__import__('uuid').uuid4())
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        if request_type == "clip" and clip_id:
            cursor.execute(
                f"SELECT * FROM {queue_table} WHERE clip_id = %s AND status IN ('pending','processing') LIMIT 1",
                (clip_id,),
            )
            existing = cursor.fetchone()
            if existing:
                cursor.close()
                return existing["request_id"], dict(existing)
        elif request_type == "stream" and stream_username:
            cursor.execute(
                f"SELECT * FROM {queue_table} WHERE stream_username = %s AND status IN ('pending','processing') LIMIT 1",
                (stream_username,),
            )
            existing = cursor.fetchone()
            if existing:
                cursor.close()
                return existing["request_id"], dict(existing)
        cursor.execute(f"SELECT COUNT(*) FROM {queue_table} WHERE status = 'pending'")
        position = cursor.fetchone()["count"] + 1
        avg_time = get_average_processing_time(results_table, queue_table, request_type)
        estimated_wait_seconds = position * avg_time
        now = datetime.now()
        estimated_completion_time = now + timedelta(seconds=estimated_wait_seconds)
        cursor.execute(
            f"INSERT INTO {queue_table} (request_id, clip_id, clip_url, stream_username, num_frames, debug, force, include_image, request_type, status, created_at, position, estimated_completion_time, estimated_wait_seconds, match_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
            (
                request_id,
                clip_id,
                clip_url,
                stream_username,
                num_frames,
                debug,
                force,
                include_image,
                request_type,
                "pending",
                now,
                position,
                estimated_completion_time,
                estimated_wait_seconds,
                match_id,
            ),
        )
        result = cursor.fetchone()
        conn.commit()
        cursor.close()
        return request_id, dict(result)
    except Exception as e:
        logger.error(f"Error adding to queue: {e}")
        if conn:
            conn.rollback()
        return request_id, {}
    finally:
        if conn:
            return_connection(conn)


def update_queue_status(queue_table: str, request_id: str, status: str, result_id: Optional[str] = None) -> bool:
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now()
        if status == "processing":
            cursor.execute(
                f"UPDATE {queue_table} SET status = %s, started_at = %s WHERE request_id = %s",
                (status, now, request_id),
            )
        elif status in ("completed", "failed"):
            cursor.execute(
                f"UPDATE {queue_table} SET status = %s, completed_at = %s, result_id = %s WHERE request_id = %s",
                (status, now, result_id, request_id),
            )
        else:
            cursor.execute(
                f"UPDATE {queue_table} SET status = %s WHERE request_id = %s",
                (status, request_id),
            )
        if status in ("completed", "failed"):
            cursor.execute(
                f"UPDATE {queue_table} SET position = position - 1 WHERE status = 'pending' AND position > 1"
            )
        conn.commit()
        cursor.close()
        return True
    except Exception as e:
        logger.error(f"Error updating queue status: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            return_connection(conn)


def get_queue_status(queue_table: str, request_id: str) -> Optional[Dict[str, Any]]:
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            f"SELECT * FROM {queue_table} WHERE request_id = %s",
            (request_id,),
        )
        queue_info = cursor.fetchone()
        cursor.close()
        if queue_info:
            queue_dict = dict(queue_info)
            for key, value in queue_dict.items():
                if isinstance(value, datetime):
                    queue_dict[key] = value.isoformat()
            return queue_dict
        return None
    except Exception as e:
        logger.error(f"Error getting queue status: {e}")
        return None
    finally:
        if conn:
            return_connection(conn)


def get_next_pending_request(queue_table: str) -> Optional[Dict[str, Any]]:
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            f"SELECT * FROM {queue_table} WHERE status = 'pending' ORDER BY position ASC LIMIT 1"
        )
        request = cursor.fetchone()
        cursor.close()
        if request:
            return dict(request)
        return None
    except Exception as e:
        logger.error(f"Error getting next pending request: {e}")
        return None
    finally:
        if conn:
            return_connection(conn)


def is_queue_processing(queue_table: str) -> bool:
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT COUNT(*) FROM {queue_table} WHERE status = 'processing'"
        )
        count = cursor.fetchone()[0]
        cursor.close()
        return count > 0
    except Exception as e:
        logger.error(f"Error checking if queue is processing: {e}")
        return False
    finally:
        if conn:
            return_connection(conn)
