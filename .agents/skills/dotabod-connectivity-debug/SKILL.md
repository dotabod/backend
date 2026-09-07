---
name: dotabod-connectivity-debug
description: Diagnose a Dotabod streamer's blank or "not streaming" OBS overlay, missing Dota GSI data, or PowerShell installer connectivity failure by correlating account state, setup signals, Twitch events, service health, and live endpoints. Use for read-only support investigations; not for wrong in-game event attribution or changing a support ticket.
---

# Dotabod Connectivity Debug

Use the bundled helper first. It produces the account, Twitch, setup-signal, endpoint,
and global-service evidence without printing the user's GSI token:

```sh
bash .agents/skills/dotabod-connectivity-debug/scripts/diagnose.sh \
  <twitch-login> [log-window] [log-until]
```

`log-window` is a Docker `--since` value such as `24h` or
`2026-09-07T03:30:00Z`; it defaults to `24h`. Add an absolute `log-until`
timestamp when the ticket supplies a reliable incident window.

The helper also adds safe New Relic aggregates when `/home/ubuntu/nr.key` is
available. For manual New Relic pivots, Vercel-log interpretation, or Sentry,
read [references/observability.md](references/observability.md). Read it only
when the incident time is known, the ordinary evidence is ambiguous, or the
user explicitly asks for those systems.

This is a read-only workflow. A pasted HubSpot/Discord ticket does not require the
HubSpot support skill unless the task needs ticket metadata, a reply, or another
ticket-side action.

## Evidence hierarchy

Prefer the persisted setup signals over grepping for the username. Successful GSI
POSTs are not logged per packet, so a missing username in the Dota logs proves
nothing.

| Signal | What it proves |
| --- | --- |
| `overlay_page_last_seen_at` | The OBS/browser overlay page reached the frontend |
| `overlay_socket_last_seen_at` | The overlay opened an authenticated live socket to `gsi.dotabod.com` |
| `gsi_last_seen_at` | A valid authenticated Dota GSI packet reached the backend, even if the stream was offline |
| `stream_online` plus Twitch event lines | Whether the Twitch online/offline pipeline updated the account |
| latest `matches.created_at` | Corroborating history only; no match is expected if the user did not play |
| New Relic token-scoped Vercel request counts | Whether Vercel served this overlay/account during the incident without printing its secret URL |

`gsi_last_seen_at`, `overlay_page_last_seen_at`, and
`overlay_socket_last_seen_at` were added in September 2026. Their absence does not
erase older first-seen history; interpret them only for incidents after rollout.

The `users.id` value is also the GSI authentication token. Never print it, paste it
into a response, or include it in raw diagnostic output. The helper keeps it
internal.

## Classify the failure

Use the smallest conclusion supported by the evidence:

| Evidence | Likely issue |
| --- | --- |
| Config endpoint is `200`, GSI health is `200`, the diagnostic payload is `200/65536`, global users are processing, but both user socket and GSI signals are stale; installer reports it cannot connect | The user's PC/ISP/system proxy cannot reliably route to `gsi.dotabod.com`. Manual config installation will not help because Dota and OBS use the same route. Recommend system-wide Cloudflare WARP, zapret where appropriate, or another system-wide VPN; browser extensions do not cover Dota or OBS. |
| New Relic shows token-scoped Vercel requests returning `2xx` while the overlay socket remains stale | The overlay reached Vercel, but its separate live connection to `gsi.dotabod.com` did not. This rules against a general Vercel/page-delivery failure and strengthens the GSI route diagnosis. |
| Overlay page is fresh but overlay socket is stale | OBS loaded the page but cannot establish the GSI live connection. Treat as a network route/proxy block. |
| Overlay socket is fresh but GSI is stale | OBS is connected; Dota is not sending. Check that the cfg is installed in the active Steam library, restart Dota, and test hero demo. |
| GSI is fresh but `stream_online=false` while Twitch is actually live | Twitch EventSub/account-state problem. Inspect online/offline events and subscription health. Do not blame the cfg. |
| Config endpoint is not `200` for an existing account | Account/install API problem. Diagnose the frontend install route. |
| GSI health/payload fail, the Dota container restarted or is unhealthy, and global GSI business events stop in the same incident window | Platform-side outage. |

Do not call a platform outage from Cloudflare tunnel messages alone. `EOF`, closed
connection, and `context canceled` entries are noisy under normal GSI traffic. At
the incident time, compare them with container health/restarts and global Dota
business events such as bet openings, win events, and clip creation.

The PowerShell installer deliberately tests three health requests plus a complete
64 KiB transfer through the Windows web stack. Its message that the PC cannot
reliably reach the live server is strong client-route evidence. Testing the same
URLs from Oracle proves current server health, not connectivity from the user's
PC.

## Escalate only when needed

- If the streamer is currently live/in-game and the packet contents themselves
  matter, use `dota-gsi-live-debug`. Do not run a 60-90 second capture merely to
  diagnose a missing connection from an offline streamer.
- If a ticket supplies an exact timestamp, inspect a narrow Dota log window around
  it and confirm other users were processing GSI. Remember that the displayed
  ticket time may not be UTC.
- Do not resubscribe EventSub, change database state, restart a service, or reply to
  the customer unless the user asks for that action.
