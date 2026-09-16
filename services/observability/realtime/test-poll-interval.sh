#!/usr/bin/env bash
set -euo pipefail

trial_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
psql_command=(psql -X --set ON_ERROR_STOP=1)

# This fixture must use a disposable database. Existing Realtime schemas fail closed.
"${psql_command[@]}" <<'SQL'
CREATE SCHEMA _realtime;
CREATE TABLE _realtime.extensions (
  tenant_external_id text NOT NULL,
  type text NOT NULL,
  settings jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT '2020-01-01T00:00:00Z'
);
INSERT INTO _realtime.extensions (tenant_external_id, type, settings) VALUES
  ('realtime-dev', 'postgres_cdc_rls', '{"poll_interval_ms":100,"poll_max_changes":100,"publication":"supabase_realtime"}'),
  ('another-tenant', 'postgres_cdc_rls', '{"poll_interval_ms":100}'),
  ('realtime-dev', 'other-extension', '{"poll_interval_ms":100}');
SQL

"${psql_command[@]}" -f "$trial_dir/apply-250ms.sql"
"${psql_command[@]}" <<'SQL'
DO $$ BEGIN
  IF (SELECT settings FROM _realtime.extensions WHERE tenant_external_id = 'realtime-dev' AND type = 'postgres_cdc_rls')
      IS DISTINCT FROM '{"poll_interval_ms":250,"poll_max_changes":100,"publication":"supabase_realtime"}'::jsonb THEN
    RAISE EXCEPTION 'Trial did not preserve other settings';
  END IF;
  IF EXISTS (SELECT 1 FROM _realtime.extensions
             WHERE (tenant_external_id <> 'realtime-dev' OR type <> 'postgres_cdc_rls')
               AND (settings <> '{"poll_interval_ms":100}'::jsonb OR updated_at <> '2020-01-01T00:00:00Z')) THEN
    RAISE EXCEPTION 'Trial changed an unrelated extension';
  END IF;
END $$;
UPDATE _realtime.extensions SET updated_at = '2020-01-01T00:00:00Z';
SQL

"${psql_command[@]}" -f "$trial_dir/apply-250ms.sql"
"${psql_command[@]}" <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM _realtime.extensions WHERE updated_at <> '2020-01-01T00:00:00Z') THEN
    RAISE EXCEPTION 'Reapplying the trial was not a no-op';
  END IF;
END $$;
SQL

"${psql_command[@]}" -f "$trial_dir/rollback-100ms.sql"
"${psql_command[@]}" -f "$trial_dir/rollback-100ms.sql"
"${psql_command[@]}" <<'SQL'
DO $$ BEGIN
  IF (SELECT settings FROM _realtime.extensions WHERE tenant_external_id = 'realtime-dev' AND type = 'postgres_cdc_rls')
      IS DISTINCT FROM '{"poll_interval_ms":100,"poll_max_changes":100,"publication":"supabase_realtime"}'::jsonb THEN
    RAISE EXCEPTION 'Rollback did not restore the interval and preserve settings';
  END IF;
END $$;
UPDATE _realtime.extensions SET settings = '{"poll_interval_ms":200}'
WHERE tenant_external_id = 'realtime-dev' AND type = 'postgres_cdc_rls';
SQL

for trial_script in apply-250ms.sql rollback-100ms.sql; do
  if "${psql_command[@]}" -f "$trial_dir/$trial_script"; then
    echo "Unexpected interval was accepted by $trial_script" >&2
    exit 1
  fi
done

"${psql_command[@]}" <<'SQL'
DO $$ BEGIN
  IF (SELECT settings FROM _realtime.extensions WHERE tenant_external_id = 'realtime-dev' AND type = 'postgres_cdc_rls')
      IS DISTINCT FROM '{"poll_interval_ms":200}'::jsonb THEN
    RAISE EXCEPTION 'A rejected trial modified settings';
  END IF;
END $$;
DELETE FROM _realtime.extensions WHERE tenant_external_id = 'realtime-dev' AND type = 'postgres_cdc_rls';
SQL

if "${psql_command[@]}" -f "$trial_dir/apply-250ms.sql"; then
  echo 'Missing tenant was accepted' >&2
  exit 1
fi
