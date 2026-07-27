#!/usr/bin/env bash
# Dump the clip-processor's full record for one match: every queue attempt and
# every cached detection result.
#
# Usage: scripts/clip-debug/query_match.sh <matchId>
#
# Note: draft rows (only_draft=t) are always marked 'failed' even when they
# succeed — check clip_results for the real outcome.
set -euo pipefail

MATCH_ID="${1:?usage: query_match.sh <matchId>}"
APP_UUID="jw4o88gkk8ogkccowk4s84ck"

# `|| true` matters: under `set -e` a non-matching grep exits non-zero and would kill the
# script here, so the friendly message below would never print — which is exactly the case
# it exists for (the container suffix changes on every redeploy).
DB_CONTAINER=$(ssh oracle "sudo docker ps --format '{{.Names}}' | grep '^db-${APP_UUID}'" || true)
if [ -z "$DB_CONTAINER" ]; then
  echo "could not find clip-processor db container for ${APP_UUID}" >&2
  echo "check it is running: ssh oracle 'sudo docker ps | grep ${APP_UUID}'" >&2
  exit 1
fi

psql_q() {
  ssh oracle "sudo docker exec -i ${DB_CONTAINER} psql -U postgres -d clip_processor -p 5439 -c \"$1\""
}

echo "=== processing_queue (every attempt) ==="
psql_q "select id, clip_id, request_type, only_draft, status, retry_count,
               created_at, completed_at
        from processing_queue
        where match_id = '${MATCH_ID}'
        order by created_at"

echo
echo "=== clip_results (cached detections) ==="
psql_q "select clip_id,
               results->>'is_draft'          as is_draft,
               results->>'detection_source'  as source,
               jsonb_array_length(coalesce(results->'heroes', '[]'::jsonb)) as n_heroes,
               results->'draft_alignment'->'mapping' as alignment,
               processed_at
        from clip_results
        where match_id = '${MATCH_ID}'
        order by processed_at"
