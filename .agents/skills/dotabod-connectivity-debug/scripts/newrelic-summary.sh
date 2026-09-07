#!/usr/bin/env bash

set -euo pipefail

DB_CONTAINER='supabase-db-kk4wckkck0ogo0c8ookwsks0'
NR_ACCOUNT_ID=${NR_ACCOUNT_ID:-3741385}
NR_API_KEY_FILE=${NR_API_KEY_FILE:-/home/ubuntu/nr.key}

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: $0 <twitch-login> <since> [until]" >&2
  exit 2
fi

login=${1,,}
since_value=$2
until_value=${3:-}

echo '[new-relic]'

if [[ ! $login =~ ^[a-z0-9_]{1,25}$ ]]; then
  echo 'available=no reason=invalid_login'
  exit 0
fi

if [[ ! -s $NR_API_KEY_FILE ]]; then
  echo 'available=no reason=missing_api_key'
  exit 0
fi

for command_name in curl docker jq sudo; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "available=no reason=missing_$command_name"
    exit 0
  fi
done

format_nr_time() {
  local value=$1
  if [[ $value =~ ^([0-9]{1,4})(m|h|d)$ ]]; then
    local amount=${BASH_REMATCH[1]}
    local unit=${BASH_REMATCH[2]}
    case $unit in
      m) printf '%s minutes ago' "$amount" ;;
      h) printf '%s hours ago' "$amount" ;;
      d) printf '%s days ago' "$amount" ;;
    esac
    return
  fi

  if [[ $value =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    printf "'%s'" "$value"
    return
  fi

  return 1
}

if ! nr_since=$(format_nr_time "$since_value"); then
  echo 'available=no reason=unsupported_time_window'
  exit 0
fi

time_clause="SINCE $nr_since"
if [[ -n $until_value ]]; then
  if ! nr_until=$(format_nr_time "$until_value"); then
    echo 'available=no reason=unsupported_until_time'
    exit 0
  fi
  time_clause+=" UNTIL $nr_until"
fi

user_token=$(sudo -n docker exec -i "$DB_CONTAINER" \
  psql -U postgres -d postgres -tA \
  -c "select id from public.users where lower(name) = '$login' limit 1;")

if [[ -z $user_token ]]; then
  echo 'available=no reason=account_not_found'
  exit 0
fi

IFS= read -r nr_api_key < "$NR_API_KEY_FILE"

run_nrql() {
  local query=$1
  local payload response
  payload=$(jq -cn --arg query "$query" --argjson account_id "$NR_ACCOUNT_ID" '{
    query: "query($accountId: Int!, $nrql: Nrql!) { actor { account(id: $accountId) { nrql(query: $nrql, timeout: 30) { results } } } }",
    variables: { accountId: $account_id, nrql: $query }
  }')
  response=$(curl -fsS --max-time 40 \
    -H "API-Key: $nr_api_key" \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    'https://api.newrelic.com/graphql')
  if ! jq -e '.errors == null and .data.actor.account.nrql.results != null' \
    >/dev/null <<<"$response"; then
    return 1
  fi
  jq -c '.data.actor.account.nrql.results' <<<"$response"
}

metrics_query="
  FROM ContainerSample
  SELECT
    count(*) AS samples,
    average(cpuPercent) AS avgCpuPercent,
    max(cpuPercent) AS maxCpuPercent,
    max(memoryUsageBytes) AS maxMemoryBytes,
    max(restartCount) AS maxRestartCount
  WHERE label.coolify.resourceName = 'dota'
  $time_clause
"

logs_query="
  FROM Log
  SELECT
    count(*) AS logs,
    filter(count(*), WHERE level = 'error') AS errors,
    filter(count(*), WHERE
      message LIKE '%[BETS] Begin opening bets%'
      OR message LIKE '%Map win team%'
      OR message LIKE '%clip created%'
    ) AS businessEvents
  WHERE container_name = 'dota'
  $time_clause
"

user_query="
  FROM Log
  SELECT
    count(*) AS usernameHits,
    filter(count(*), WHERE container_name = 'dota') AS dotaUsernameHits,
    filter(count(*), WHERE container_name = 'twitch-chat') AS twitchUsernameHits,
    filter(count(*), WHERE projectName = 'dotabod') AS vercelUsernameHits,
    earliest(timestamp) AS earliestTimestamp,
    latest(timestamp) AS latestTimestamp
  WHERE message LIKE '%$login%'
  $time_clause
"

vercel_query="
  FROM Log
  SELECT
    count(*) AS tokenScopedHits,
    filter(count(*), WHERE message LIKE '%status=2%') AS http2xx,
    filter(count(*), WHERE message LIKE '%status=4%') AS http4xx,
    filter(count(*), WHERE message LIKE '%status=5%') AS http5xx,
    earliest(timestamp) AS earliestTimestamp,
    latest(timestamp) AS latestTimestamp
  WHERE projectName = 'dotabod'
    AND message LIKE '%$user_token%'
  $time_clause
"

if ! metrics_json=$(run_nrql "$metrics_query") \
  || ! logs_json=$(run_nrql "$logs_query") \
  || ! user_json=$(run_nrql "$user_query") \
  || ! vercel_json=$(run_nrql "$vercel_query"); then
  echo 'available=no reason=nerdgraph_query_failed'
  exit 0
fi

format_epoch_ms() {
  local value=$1
  if [[ ! $value =~ ^[0-9]+$ || $value == 0 ]]; then
    echo 'never'
    return
  fi
  date -u -d "@$((value / 1000))" '+%Y-%m-%dT%H:%M:%SZ'
}

json_value() {
  local json=$1
  local field=$2
  jq -r --arg field "$field" '.[0][$field] // 0' <<<"$json"
}

user_earliest=$(json_value "$user_json" earliestTimestamp)
user_latest=$(json_value "$user_json" latestTimestamp)
vercel_earliest=$(json_value "$vercel_json" earliestTimestamp)
vercel_latest=$(json_value "$vercel_json" latestTimestamp)

echo 'available=yes'
echo "account_id=$NR_ACCOUNT_ID"
echo "dota_samples=$(json_value "$metrics_json" samples)"
echo "dota_avg_cpu_percent=$(json_value "$metrics_json" avgCpuPercent)"
echo "dota_max_cpu_percent=$(json_value "$metrics_json" maxCpuPercent)"
echo "dota_max_memory_bytes=$(json_value "$metrics_json" maxMemoryBytes)"
echo "dota_max_restart_count=$(json_value "$metrics_json" maxRestartCount)"
echo "dota_log_count=$(json_value "$logs_json" logs)"
echo "dota_error_log_count=$(json_value "$logs_json" errors)"
echo "dota_business_event_count=$(json_value "$logs_json" businessEvents)"
echo "username_log_hits=$(json_value "$user_json" usernameHits)"
echo "username_dota_hits=$(json_value "$user_json" dotaUsernameHits)"
echo "username_twitch_hits=$(json_value "$user_json" twitchUsernameHits)"
echo "username_vercel_hits=$(json_value "$user_json" vercelUsernameHits)"
echo "username_first_seen=$(format_epoch_ms "$user_earliest")"
echo "username_last_seen=$(format_epoch_ms "$user_latest")"
echo "vercel_token_scoped_hits=$(json_value "$vercel_json" tokenScopedHits)"
echo "vercel_token_scoped_2xx=$(json_value "$vercel_json" http2xx)"
echo "vercel_token_scoped_4xx=$(json_value "$vercel_json" http4xx)"
echo "vercel_token_scoped_5xx=$(json_value "$vercel_json" http5xx)"
echo "vercel_token_first_seen=$(format_epoch_ms "$vercel_earliest")"
echo "vercel_token_last_seen=$(format_epoch_ms "$vercel_latest")"
