# Observability pivots

Use these only when the normal account/setup-signal checks leave ambiguity, an
incident timestamp is available, or the user asks for New Relic, Vercel, or
Sentry evidence.

## New Relic

New Relic is the primary historical backend source. The Oracle host agent sends:

- `ContainerSample` metrics, faceted by `label.coolify.resourceName` (`dota`,
  `steam`, `twitch-chat`, and `twitch-events`).
- Docker logs as `Log` events with `container_name`.
- The Vercel log drain as `Log` events with `projectName='dotabod'`; common
  `source` values include `lambda`, `build`, and `external`.

The working user API key is `/home/ubuntu/nr.key`, and the operational account is
`3741385`. Never print the key. The bundled `newrelic-summary.sh` uses NerdGraph
directly and returns aggregates only. Prefer it to the installed New Relic CLI;
the current CLI profile is not configured for this key.

New Relic can answer:

- Did the Dota container have samples, CPU/memory pressure, or restarts during
  the exact window?
- Were other users producing Dota business events at that time?
- Do historical logs contain this public Twitch login even if the current
  Docker container has since been replaced?
- Did Vercel serve token-scoped settings/overlay requests for this account, and
  were they `2xx`, `4xx`, or `5xx`?

The last question is especially useful. Vercel `2xx` requests while
`overlay_socket_last_seen_at` stays stale means the page reached Vercel but its
separate connection to `gsi.dotabod.com` did not.

Backend logs can contain `users.id`, which is the GSI token. Never select or dump
raw `message` rows in user-facing output. Query counts, status buckets, and
earliest/latest timestamps. If raw inspection is unavoidable, redact the token
before the tool emits output.

The host no longer runs the Node New Relic APM agent. New Relic therefore does
not provide backend transaction latency, apdex, or HTTP throughput. Do not infer
those from `ContainerSample`. Vercel function log lines can still provide their
own status, duration, region, and request ID.

## Vercel

There is currently no Vercel MCP, authenticated Vercel CLI, or local `.vercel`
project link in this environment. Do not spend time trying those first. The New
Relic Vercel log drain already provides the function/build logs needed for this
support workflow.

Direct Vercel access would add deployment metadata and native log browsing, but
it is not required to distinguish a Vercel page/API failure from a GSI live-route
failure.

## Sentry

The Sentry MCP is authenticated. The production frontend data is currently in
`mgates-llc/dotabod-frontend`. A newer `dotabod/frontend` project exists but had
no recent events when this workflow was verified; do not silently query the
empty project. The backend does not currently initialize a Sentry SDK.

Useful safe pivots:

- Search frontend errors by public `user.username:<twitch-login>`.
- Search recent issues whose culprit is `/overlay/[userId]`,
  `/dashboard/diagnostics`, or the installer/dashboard surface.
- Compare issue first/last-seen timestamps and release with the ticket window.

Sentry is supporting evidence, not a required health check:

- The PowerShell connectivity test runs outside Sentry.
- The browser diagnostics probe catches failures without capturing an exception.
- Installer localhost polling failures are deliberately ignored/suppressed.
- Overlay Session Replay is stopped on `/overlay`.
- User context depends on analytics consent, and OBS overlay errors commonly have
  no Sentry user attached.

Therefore, no Sentry event does not prove the browser, OBS, or Dota connection
worked. Sentry is valuable when it positively identifies a frontend render,
settings, authentication, or API exception.

Do not query Sentry with `user.id` or a raw overlay URL: both contain the GSI
token, and Sentry tool responses echo the search query and dashboard URL.
