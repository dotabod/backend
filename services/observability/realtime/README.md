These scripts prepare a reversible 100→250 ms Supabase Realtime polling trial for the existing `realtime-dev` tenant. They are not application migrations and are not executed by deployment. No production setting changes when this PR merges.

Realtime 2.76.5 waits only after an empty poll; a poll that returns changes immediately triggers another. A 250 ms interval reduces the idle ceiling from ten to four polls per second. It adds at most 150 ms to the interval portion of idle detection delay, not to all end-to-end delivery latency. Busy polling savings will be smaller.

Before applying the trial:

- Verify watcher reconnection and reconciliation of account/settings/stream changes missed during a reload in an isolated environment. A successful socket reconnect is not proof of recovered state. This PR does not implement or certify that application recovery.
- Record matched quiet and busy baselines: Postgres CPU, change-reading calls/rows/execution time, commit-to-receipt latency, and replication-slot lag. Identify statements by database, user, top-level flag, and query ID.
- Save the current tenant settings privately and obtain authorization for the configuration change and tenant reload. The scripts deliberately reject missing, duplicate, or unexpected tenant configuration.

On an authorized administration host, use a connection explicitly targeting the Supabase `postgres` database and `psql -X --set ON_ERROR_STOP=1 --file apply-250ms.sql`. Avoid exposing connection passwords in shell history or process arguments. The guarded transaction changes only the numeric polling interval, preserves all other settings, and treats a repeated application as a no-op. Lock and statement timeouts bound waiting.

The configuration row alone does not update a running poller. Use the supported tenant reload operation or an authorized Realtime hard restart after the database change. Verify the effective interval from observed idle polling and require all consumers to reconnect and recover state. Do not start a second Dota, Steam, or Twitch service instance.

Compare similar change rates over quiet and busy windows. Proposed keep criteria are at least 25% fewer change-reading calls and 15% less statement execution time, less than 200 ms added p95 delivery latency, and no missed state, sustained slot lag, or reconnect errors. Execution time includes waits and is not CPU time. Measure database CPU separately.

If the trial fails those gates, apply `rollback-100ms.sql` with the same `ON_ERROR_STOP` option and reload again. Rollback accepts only the original or trial value and does not overwrite unexpected concurrent operator changes. Do not tune log ingestion in the same measurement window.

GitHub CI runs `test-poll-interval.sh` against a disposable PostgreSQL service, checking scope, setting preservation, idempotence, rollback, and rejection of unexpected or missing configuration. Do not run the fixture against a real Supabase database or run tests on the production host.
