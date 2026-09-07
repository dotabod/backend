#!/usr/bin/env bash

set -euo pipefail

DB_CONTAINER='supabase-db-kk4wckkck0ogo0c8ookwsks0'
DOTA_CONTAINER='i8gccg8'
TWITCH_CHAT_CONTAINER='zwgkg48'
TWITCH_EVENTS_CONTAINER='zwg4g4c'
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

usage() {
  echo "Usage: $0 <twitch-login> [docker-since] [docker-until]" >&2
}

if [[ $# -lt 1 || $# -gt 3 ]]; then
  usage
  exit 2
fi

login=${1,,}
log_window=${2:-24h}
log_until=${3:-}

if [[ ! $login =~ ^[a-z0-9_]{1,25}$ ]]; then
  echo 'Invalid Twitch login.' >&2
  exit 2
fi

for command_name in curl docker rg sudo; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

for container_name in \
  "$DB_CONTAINER" \
  "$DOTA_CONTAINER" \
  "$TWITCH_CHAT_CONTAINER" \
  "$TWITCH_EVENTS_CONTAINER"; do
  if ! sudo -n docker inspect "$container_name" >/dev/null 2>&1; then
    echo "Required production container is unavailable locally: $container_name" >&2
    exit 1
  fi
done

psql_query() {
  sudo -n docker exec -i "$DB_CONTAINER" \
    psql -U postgres -d postgres -tA -F '|' -c "$1"
}

docker_logs() {
  local container_name=$1
  local log_args=(--since "$log_window")
  if [[ -n $log_until ]]; then
    log_args+=(--until "$log_until")
  fi
  sudo -n docker logs "${log_args[@]}" "$container_name"
}

account_row=$(psql_query "
  select
    u.id,
    u.name,
    coalesce(u.stream_online, false),
    coalesce(u.stream_start_date::text, ''),
    coalesce(u.updated_at::text, ''),
    coalesce(a.\"providerAccountId\", '')
  from public.users u
  left join public.accounts a
    on a.\"userId\" = u.id and a.provider = 'twitch'
  where lower(coalesce(u.name, '')) = '$login'
     or lower(coalesce(u.\"twitchUsername\", '')) = '$login'
     or lower(coalesce(u.\"displayName\", '')) = '$login'
  limit 1;
")

if [[ -z $account_row ]]; then
  echo "account=not_found login=$login"
  exit 3
fi

IFS='|' read -r user_token canonical_login stream_online stream_started_at \
  user_updated_at twitch_id <<<"$account_row"

echo '[account]'
echo "login=$canonical_login"
echo "database_stream_online=$stream_online"
echo "stored_stream_started_at=${stream_started_at:-never}"
echo "stored_user_updated_at=${user_updated_at:-unknown}"
echo "twitch_account_linked=$([[ -n $twitch_id ]] && echo yes || echo no)"

echo
echo '[twitch-now]'
if [[ -n $twitch_id ]]; then
  twitch_now=$(sudo -n docker exec "$TWITCH_EVENTS_CONTAINER" node -e '
    const twitchId = process.argv[1]
    try {
      const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: process.env.TWITCH_CLIENT_ID,
          client_secret: process.env.TWITCH_CLIENT_SECRET,
          grant_type: "client_credentials",
        }),
      })
      if (!tokenResponse.ok) throw new Error(`token HTTP ${tokenResponse.status}`)
      const token = await tokenResponse.json()
      const response = await fetch(`https://api.twitch.tv/helix/streams?user_id=${twitchId}`, {
        headers: {
          "Client-ID": process.env.TWITCH_CLIENT_ID,
          Authorization: `Bearer ${token.access_token}`,
        },
      })
      if (!response.ok) throw new Error(`streams HTTP ${response.status}`)
      const body = await response.json()
      const stream = body.data?.[0]
      console.log(stream ? `live started_at=${stream.started_at}` : "offline")
    } catch (error) {
      console.log(`unavailable reason=${error.message}`)
    }
  ' "$twitch_id")
  echo "$twitch_now"
else
  echo 'unavailable reason=no_twitch_account'
fi

declare -A signals=()
while IFS='|' read -r key timestamp; do
  [[ -n $key ]] && signals["$key"]=$timestamp
done < <(psql_query "
  select key, updated_at::text
  from public.settings
  where \"userId\" = '$user_token'
    and key in (
      'gsi_first_seen_at',
      'gsi_last_seen_at',
      'overlay_first_seen_at',
      'overlay_page_last_seen_at',
      'overlay_socket_last_seen_at'
    )
  order by key;
")

echo
echo '[setup-signals]'
for key in \
  gsi_first_seen_at \
  gsi_last_seen_at \
  overlay_first_seen_at \
  overlay_page_last_seen_at \
  overlay_socket_last_seen_at; do
  echo "$key=${signals[$key]:-never}"
done

latest_match=$(psql_query "
  select \"matchId\", created_at::text, coalesce(hero_name, '')
  from public.matches
  where \"userId\" = '$user_token'
  order by created_at desc
  limit 1;
")

echo
echo '[latest-match]'
if [[ -n $latest_match ]]; then
  IFS='|' read -r match_id match_created_at hero_name <<<"$latest_match"
  echo "match_id=$match_id"
  echo "created_at=$match_created_at"
  echo "hero=${hero_name:-unknown}"
else
  echo 'never'
fi

config_status=$(curl -sS --max-time 15 -I -o /dev/null -w '%{http_code}' \
  "https://dotabod.com/api/install/$user_token" || true)
health_result=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}|%{size_download}' \
  'https://gsi.dotabod.com/' || true)
payload_result=$(curl -sS --max-time 25 -o /dev/null -w '%{http_code}|%{size_download}' \
  'https://gsi.dotabod.com/diagnostics/payload' || true)

echo
echo '[public-endpoints-from-oracle]'
echo "config_http=${config_status:-failed}"
echo "gsi_health_http_bytes=${health_result:-failed}"
echo "gsi_payload_http_bytes=${payload_result:-failed} expected_bytes=65536"

echo
echo '[service-health]'
sudo -n docker inspect "$DOTA_CONTAINER" \
  --format 'dota status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restarts={{.RestartCount}} started={{.State.StartedAt}} oom={{.State.OOMKilled}}'

global_event_count=$(docker_logs "$DOTA_CONTAINER" 2>&1 \
  | rg -c '\[BETS\] Begin opening bets|Map win team|\[(Draft |In-Game )?Clip\] clip created' || true)
user_event_count=$(docker_logs "$DOTA_CONTAINER" 2>&1 \
  | rg -ic "\"(name|channel)\":\"$canonical_login\"" || true)

echo
echo '[log-window]'
echo "since=$log_window"
echo "until=${log_until:-now}"
echo "global_gsi_business_events=${global_event_count:-0}"
echo "user_named_dota_events=${user_event_count:-0}"
echo 'note=user_named_dota_events=0 is weak evidence; setup signals are authoritative'

echo
echo '[twitch-events-for-user]'
if [[ -z $twitch_id ]]; then
  echo 'none (no linked Twitch account)'
else
  twitch_lines=$(docker_logs "$TWITCH_CHAT_CONTAINER" 2>&1 \
    | rg "$twitch_id" \
    | rg 'just went online|received offline event|updated online event|updated offline event|updateUserEvent' \
    | tail -n 20 \
    | sed "s/$twitch_id/[twitch-id]/g" || true)
  if [[ -n $twitch_lines ]]; then
    echo "$twitch_lines"
  else
    echo 'none in window'
  fi
fi

echo
nr_args=("$canonical_login" "$log_window")
if [[ -n $log_until ]]; then
  nr_args+=("$log_until")
fi
if ! bash "$SCRIPT_DIR/newrelic-summary.sh" "${nr_args[@]}"; then
  echo '[new-relic]'
  echo 'available=no reason=query_failed'
fi
