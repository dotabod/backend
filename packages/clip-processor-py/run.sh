#!/usr/bin/env bash
set -euo pipefail

# Starts a local Postgres container for clip-processor-py development.
# Matches the default DATABASE_URL expected by PostgresClient:
#   postgresql://postgres:postgres@localhost:5439/clip_processor

CONTAINER_NAME="clipproc-postgres"
IMAGE="postgres:14"
HOST_PORT="5439"
CONTAINER_PORT="5432"
DB_NAME="clip_processor"
DB_USER="postgres"
DB_PASS="postgres"
VOLUME_NAME="clipproc-postgres-data"

log() { echo "[run.sh] $*"; }

ensure_docker() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if command -v colima >/dev/null 2>&1; then
    log "Docker daemon not accessible. Checking Colima..."
    if ! colima status >/dev/null 2>&1; then
      log "Colima not running. Starting Colima..."
      # Allow custom args to avoid disk shrink issues (e.g., --disk 100)
      COLIMA_ARGS=${COLIMA_ARGS:-}
      if ! colima start ${COLIMA_ARGS}; then
        log "Colima failed to start with default args. Retrying with --disk 100..."
        if ! colima start --disk 100; then
          log "Colima still failed to start. You can try:"
          log "  colima stop && colima start --disk 100"
          log "  or start Docker Desktop manually."
          exit 1
        fi
      fi
    fi

    # Try to set DOCKER_HOST to Colima's socket
    COLIMA_SOCKET=$(colima ssh -- echo -n "$HOME/.colima/default/docker.sock")
    if [ -n "$COLIMA_SOCKET" ] && [ -S "$COLIMA_SOCKET" ]; then
      export DOCKER_HOST="unix://$COLIMA_SOCKET"
    fi
  fi

  if ! docker info >/dev/null 2>&1; then
    log "Docker daemon still not available. Start Docker Desktop or Colima."
    exit 1
  fi
}

start_postgres() {
  # Create volume if missing
  if ! docker volume ls --format '{{.Name}}' | grep -q "^${VOLUME_NAME}$"; then
    docker volume create "$VOLUME_NAME" >/dev/null
  fi

  # If container exists
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    # If running, do nothing
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
      log "Postgres container already running: ${CONTAINER_NAME}"
    else
      log "Starting existing Postgres container: ${CONTAINER_NAME}"
      docker start "$CONTAINER_NAME" >/dev/null
    fi
  else
    log "Starting new Postgres container on localhost:${HOST_PORT}"
    docker run -d --name "$CONTAINER_NAME" \
      -e POSTGRES_DB="$DB_NAME" \
      -e POSTGRES_USER="$DB_USER" \
      -e POSTGRES_PASSWORD="$DB_PASS" \
      -p 127.0.0.1:${HOST_PORT}:${CONTAINER_PORT} \
      -v "$VOLUME_NAME:/var/lib/postgresql/data" \
      "$IMAGE" \
      >/dev/null
  fi

  # Wait for readiness
  log "Waiting for Postgres to become ready..."
  for i in {1..30}; do
    if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
    log "Postgres did not become ready in time. Check container logs: docker logs ${CONTAINER_NAME}"
    exit 1
  fi
}

print_info() {
  echo
  log "Postgres is ready. Connection details:"
  echo "  Host:     localhost"
  echo "  Port:     ${HOST_PORT}"
  echo "  User:     ${DB_USER}"
  echo "  Password: ${DB_PASS}"
  echo "  Database: ${DB_NAME}"
  echo
  echo "  DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:${HOST_PORT}/${DB_NAME}"
  echo
}

main() {
  ensure_docker
  start_postgres
  print_info
}

main "$@"
