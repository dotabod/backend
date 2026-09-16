The settings access filter removes only successful `POST /rest/v1/settings` requests from the local Supabase Logflare copy of Kong access logs. It retains errors, other methods and paths, and events with incomplete metadata. Query strings do not affect path matching. It does not modify the Docker logs that Fluent Bit forwards to New Relic.

This is a reviewed configuration fragment for the Coolify-managed Vector configuration, not an automatically deployed replacement. It matches the existing `kong_logs` transform's parsed request fields and integer status codes. The test topology is only for isolated verification; do not deploy it.

Before rollout, confirm actual New Relic receipt of representative Kong events and collect a representative method/path/status baseline. Filtering is appropriate only while that complete copy remains available and local successful settings logs are not required for support.

In the managed Vector configuration, add the `kong_settings_access` transform from `settings-access-filter.yaml` alongside the existing transforms. Change only the `logflare_kong` sink's inputs:

```yaml
inputs:
  - kong_settings_access
  - kong_err
```

Keep the existing `kong_logs` parser, `kong_err` route, sink credentials, and other sinks unchanged. Do not load this fragment alongside another definition of the same transform. Validate the complete assembled configuration in an isolated environment before an authorized Vector-only restart. This PR does not change production.

GitHub CI runs the native Vector unit tests using `timberio/vector:0.53.0-alpine`, matching production. The equivalent command on an isolated runner is:

```sh
docker run --rm \
  -v "$PWD/services/observability/vector:/config:ro" \
  timberio/vector:0.53.0-alpine \
  test /config/settings-access-filter.yaml /config/settings-access-filter.test.yaml
```

After rollout, verify at 30 minutes and 24 hours that successful settings writes disappear only from local Logflare, errors and unrelated paths remain, and New Relic still receives the full stream. Compare Vector errors/retries and Logflare insert/WAL rates at comparable request rates. A shorter retention window or database rewrite is not part of this change.

Rollback restores the sink's first input to `kong_logs`, validates the configuration, and restarts Vector. Entries omitted from Logflare during the trial are not backfilled; New Relic is the retained copy.
