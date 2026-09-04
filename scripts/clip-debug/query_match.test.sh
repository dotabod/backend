#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CALL_LOG="$(mktemp)"
trap 'rm -f "$CALL_LOG"' EXIT

docker() {
  printf 'docker %s\n' "$*" >> "$CALL_LOG"
  case "$1" in
    ps)
      printf '%s\n' "$MOCK_DOCKER_NAMES"
      ;;
    exec)
      printf '%s\n' 'query result'
      ;;
  esac
}

sudo() {
  if [ "${1:-}" = '-n' ]; then
    shift
  fi
  "$@"
}

ssh() {
  printf 'ssh %s\n' "$*" >> "$CALL_LOG"
  return 99
}

export CALL_LOG
export MOCK_DOCKER_NAMES='db-jw4o88gkk8ogkccowk4s84ck-local'
export -f docker sudo ssh

output=$(bash "$SCRIPT_DIR/query_match.sh" 8916275620)

grep -q 'processing_queue' <<< "$output"
grep -q 'clip_results' <<< "$output"
if grep -q '^ssh ' "$CALL_LOG"; then
  echo 'query_match.sh used SSH even though the production Docker containers were local' >&2
  exit 1
fi

> "$CALL_LOG"
export MOCK_DOCKER_NAMES='coolify'
set +e
output=$(bash "$SCRIPT_DIR/query_match.sh" 8916275620 2>&1)
status=$?
set -e

if [ "$status" -eq 0 ]; then
  echo 'query_match.sh succeeded without the local production database container' >&2
  exit 1
fi
if grep -q '^ssh ' "$CALL_LOG"; then
  echo 'query_match.sh used SSH even though the production Coolify host was local' >&2
  exit 1
fi
grep -q 'production Coolify host is local' <<< "$output"

echo 'query_match local routing: ok'
