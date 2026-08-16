---
name: hubspot-discord-support
description: Operate and extend the Dotabod support pipeline that posts HubSpot tickets into the Discord #🆘help forum and replies to customers from Discord. Use this whenever the work touches HubSpot tickets, workflows, custom code actions, the Conversations/inbox API, the ticket→Discord embed, the /reply slash command, or a support ticket that did not show up in Discord — and also when someone asks to change what appears in a ticket post, add a support intake path, wire a Discord interaction endpoint, or debug "the ticket bot". Contains verified portal/channel/actor IDs and the failure modes that cost real debugging time.
---

# HubSpot ↔ Discord support pipeline

Support tickets live in HubSpot; the team lives in Discord. This skill covers the
bridge between them: what is built, where the live code actually runs, and the
specific ways this integration lies to you when something is wrong.

Read `references/api-gotchas.md` before writing any HubSpot or Discord API call —
most of the expensive mistakes here return a `200` and fail anyway.

## What exists today

**Direction 1 — ticket → Discord (LIVE).** A HubSpot workflow custom code action
posts every newly created ticket into the `🆘help` forum as a thread.

- Workflow "Support ticket -> Discord #help", id `1863181160`, `isEnabled: true`
- Runs on HubSpot's infrastructure, _not_ ours — no Vercel route, no service
- Repo reference copy: `frontend/scripts/hubspot/ticket-to-discord.js`

That file does not execute. It is a hand-maintained mirror of what is pasted into
the HubSpot UI, and the two were in sync as of 2026-08-16. Editing one without the
other is the likeliest way this drifts, so change both together and confirm with
`scripts/hs.sh flow 1863181160`, which prints the live source to diff against.

**Direction 2 — Discord → customer (code written, NOT deployed).** A `/reply`
slash command (id `1535337732522385559`, registered guild-scoped) lets staff answer
from inside the ticket thread; HubSpot emails the customer on the original
conversation so their reply threads back correctly.

The handler and its tests exist in the frontend repo, but the Discord Interactions
Endpoint URL has never been set, so nothing receives them yet. Matt rejected
hosting it on Vercel. See "Hosting the interactions endpoint" below before
proposing anywhere to put it.

Two things must be settled before this ships. It needs a non-Vercel host, and the
draft has a known bug: it assumes every thread has a repliable email address, but
chat-widget threads carry an opaque id instead — and most real tickets in this
portal come from chat. `references/discord-interactions.md` has the fix.

## Why the trigger is on the HubSpot side

Tickets arrive three ways, and only two touch code we control:

| Source                 | Path                        | Our code sees it |
| ---------------------- | --------------------------- | ---------------- |
| `/contact` form        | browser → `api.hsforms.com` | no, client-side  |
| `/dashboard/help` form | same form `a394f067-…`      | no, client-side  |
| inbound email / chat   | straight into HubSpot       | no               |

Both forms post directly from the browser to HubSpot, so a server-side hook in our
app would see none of them, and email intake would be invisible no matter what we
built. Anything that must fire "on every ticket" therefore belongs in a HubSpot
workflow. If someone proposes catching tickets in a Next.js route or a webhook on
our side, this table is the reason it will silently miss most of them.

## The privacy constraint

`🆘help` is readable by the whole server — roughly 1,100 members. The reporter's
email must never reach the embed. The action deliberately looks up the associated
contact's `twitch_username` and `dotabod_subscription` instead, and anyone who
genuinely needs the address clicks the embed title through to HubSpot.

When changing the embed, check the shape of what you are adding, not just the field
name: the ticket **body** is user free-text and people paste their own email into
it. Post to a test thread and grep the outgoing payload for `@` before shipping. If
the requirement ever becomes "we need the email visible", the correct fix is
pointing the webhook at a private staff channel, which is a config change and not a
code change.

## Working on the live workflow

`scripts/hs.sh` wraps the authenticated calls; it reads the token from Doppler so
nothing lands in shell history.

```sh
scripts/hs.sh flow 1863181160      # live action source + secrets + runtime + enabled
scripts/hs.sh scopes               # confirm tickets/automation/conversations still work
scripts/hs.sh ticket 20945080930   # ticket, thread id, contact association
scripts/hs.sh thread 20945080930   # who opened it, and whether they are repliable
scripts/hs.sh messages 8828369843  # messages with real delivery statusType
```

Runtime facts for the custom code action: Node 20, **20 s timeout**, 128 MB,
`axios` preinstalled. Give every HTTP call an explicit timeout — axios defaults to
waiting forever, and a hung call burns the whole budget and looks like a workflow
bug rather than a network one.

Rethrowing on failure is deliberate: HubSpot then retries `429`/`5xx` for up to
three days. Swallowing the error turns a recoverable Discord blip into a silently
lost ticket. Conversely, `callback()` must run on the success path or the action
times out.

The action takes `inputFields: []` on purpose. Reading the ticket server-side by
`event.object.objectId` means it behaves identically no matter which intake path
created the ticket, and it survives someone reshuffling the workflow's input
mapping in the UI.

## Hosting the interactions endpoint

Discord verifies an interaction by sending a signed request and requiring a
**synchronous** signed response. That single requirement decides the hosting
question:

- **HubSpot cannot host it.** HubSpot runs code only on its own triggers and offers
  no inbound HTTP endpoint. This is worth stating plainly when asked, because
  "put it in the workflow too" is a natural guess and it is not possible.
- **Vercel is ruled out by preference**, not capability. Matt asked for it off
  Vercel; do not quietly reintroduce it.
- **oracle or alex both work.** oracle already serves `gsi.dotabod.com` from
  `packages/dota/src/dota/GSIServer.ts` (Express, port 5120, behind Traefik with
  Let's Encrypt), which makes it the shortest path to a public HTTPS route.

The one real obstacle in GSIServer is that `app.use(json({ limit: '1mb' }))`
(line ~99, `json` imported as a named export from `express`) consumes the request
stream, and the Ed25519 signature covers the exact bytes Discord sent. Verified
fix — keep the parsed body _and_ the raw bytes:

```ts
app.use(
  json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      ;(req as any).rawBody = buf.toString()
    },
  }),
)
```

Proven locally: a valid signature returns `200 {"type":1}` and a tampered one
returns `401`. `references/discord-interactions.md` has the full verifier, the
role-gating rationale, and the endpoint-registration order.

## Identifiers

Verified live. Prefer reading them from here over rediscovering them; several are
not derivable from any API.

| Thing                                                      | Value                                        |
| ---------------------------------------------------------- | -------------------------------------------- |
| HubSpot portal                                             | `39771134`                                   |
| Workflow "Support ticket -> Discord #help"                 | `1863181160`                                 |
| Hsforms form (both contact + help pages)                   | `a394f067-5026-42bd-8e2d-c556ffd6499f`       |
| Discord guild                                              | `1039887907705593876`                        |
| `#🆘help` forum (type 15, `flags: 0` so tags optional)     | `1068261003986468935`                        |
| Dotabod application/bot                                    | `1257770764468228128`                        |
| `/reply` command                                           | `1535337732522385559`                        |
| Roles allowed to `/reply` (God Mode, Community Manager 🌐) | `1041465470911529044`, `1074881475691945984` |
| HubSpot sender actor (Matthew Gates)                       | `A-83558473`                                 |
| Email channel / sending account                            | `1002` / `1183400053`                        |

Secrets, and where each lives:

| Secret                                            | Home                                                     |
| ------------------------------------------------- | -------------------------------------------------------- |
| `HUBSPOT_TICKET_TOKEN`, `DISCORD_SUPPORT_WEBHOOK` | on the HubSpot action itself — not Doppler, not the repo |
| `HUBSPOT_PRIVATE_APP_TOKEN`                       | Doppler `dotabod-frontend/prd`                           |
| `DISCORD_BOT_TOKEN`                               | Doppler `discord-bot/prd`                                |

The HubSpot token is service key **"Dotabod Chat"** (`40319672`), prefix
`pat-na1-1fd8a`. There is a similarly-named private app "Dotabod Supabase"
(`8575935`, prefix `pat-na1-f1b33`) that is _not_ this integration — check the
prefix before adding scopes to anything, because the two are easy to confuse and
scopes cannot be read back from the API to catch the error afterwards.

Ignore `~/hubspotPA.key` — it is expired (reports "expired 20665 days ago", i.e.
epoch 0) and is not a `pat-na1-` token at all.

## Verifying a change

The pipeline crosses two vendors, so local reasoning proves very little. What
actually catches problems:

1. Post a sample embed to the webhook first and look at the rendered thread. This
   costs seconds and catches formatting problems while nothing is live.
2. Use HubSpot's **Test** button on the code action against a real ticket id — it
   exercises the real Discord call without enrolling anything.
3. Submit through `/contact` for the form path, then **send an actual email** to
   the support address. Email is the path a form-only design can never cover and
   the whole reason the trigger lives in HubSpot.
4. Force a ticket with no associated contact — the typical first-time emailer —
   and confirm it still posts as `unknown` rather than failing.
5. Read Workflow → History for failed executions; `console.error` output lands
   there and is the only log you get.

Then clean up: delete the test threads and archive the test tickets. Test posts in
`🆘help` are visible to the entire server.

## Reference files

- `references/api-gotchas.md` — every failure that cost real time here: the
  successful-looking responses, the races, the wrong-shaped requests. Read before
  writing HubSpot or Discord calls.
- `references/discord-interactions.md` — signature verification, role gating,
  thread→ticket resolution, and the order endpoint registration must happen in.
- `scripts/hs.sh` — authenticated HubSpot reads (flow, ticket, thread, scopes).
