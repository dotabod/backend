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
DOCKER_CMD=()
DB_CONTAINER=""
LOCAL_PROD_HOST=0
if command -v docker >/dev/null 2>&1; then
  if docker ps >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
  elif sudo -n docker ps >/dev/null 2>&1; then
    DOCKER_CMD=(sudo -n docker)
  fi
fi

if [ "${#DOCKER_CMD[@]}" -gt 0 ]; then
  DOCKER_NAMES=$("${DOCKER_CMD[@]}" ps --format '{{.Names}}')
  if grep -Fxq coolify <<< "$DOCKER_NAMES"; then
    LOCAL_PROD_HOST=1
  fi
  DB_CONTAINER=$(grep "^db-${APP_UUID}" <<< "$DOCKER_NAMES" || true)
fi

HOST_MODE=local
if [ -z "$DB_CONTAINER" ] && [ "$LOCAL_PROD_HOST" -eq 0 ]; then
  HOST_MODE=remote
  DB_CONTAINER=$(ssh oracle "sudo -n docker ps --format '{{.Names}}' | grep '^db-${APP_UUID}'" || true)
fi

if [ -z "$DB_CONTAINER" ]; then
  echo "could not find clip-processor db container for ${APP_UUID}" >&2
  if [ "$LOCAL_PROD_HOST" -eq 1 ]; then
    echo "the production Coolify host is local; the database container is not running" >&2
  else
    echo "checked local Docker first, then the oracle SSH fallback" >&2
  fi
  exit 1
fi

psql_q() {
  if [ "$HOST_MODE" = local ]; then
    printf '%s\n' "$1" | "${DOCKER_CMD[@]}" exec -i "$DB_CONTAINER" \
      psql -U postgres -d clip_processor -p 5439 -f -
  else
    printf '%s\n' "$1" | ssh oracle sudo -n docker exec -i "$DB_CONTAINER" \
      psql -U postgres -d clip_processor -p 5439 -f -
  fi
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
