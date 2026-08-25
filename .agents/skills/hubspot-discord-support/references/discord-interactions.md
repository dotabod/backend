# Discord interactions endpoint

Everything needed to stand up the `/reply` receiver. The code exists and is tested
in the frontend repo (`src/pages/api/discord/interactions.ts`,
`src/lib/hubspot-conversations.ts`, 9 passing tests); what remains is hosting it
somewhere that is not Vercel and pointing Discord at it.

## Signature verification

Discord signs every interaction with Ed25519 over `timestamp + rawBody`, so the
handler needs the **exact bytes** — a re-serialized parsed body will not verify,
because key order and whitespace are not guaranteed to round-trip.

Node's crypto can do this without a dependency. Discord gives you a bare 32-byte
public key in hex, so it needs the SubjectPublicKeyInfo DER prefix to become a key
object:

```js
function verifySignature(rawBody, signature, timestamp) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  if (!publicKey || !signature || !timestamp) return false
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'), // Ed25519 SPKI prefix
        Buffer.from(publicKey, 'hex'),
      ]),
      format: 'der',
      type: 'spki',
    })
    return crypto.verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}
```

**Bad signatures must return `401`.** This is not merely good hygiene: Discord
validates a new endpoint URL by deliberately sending invalid signatures and
expecting rejection. An endpoint that answers `200` to everything will fail
registration.

On Express, where a global `json()` middleware would already have drained the
stream, capture the raw bytes as it parses — the `verify` hook runs before parsing
and does not interfere with it:

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

Verified against `packages/dota`: valid → `200 {"type":1}`, tampered → `401`. On
Next.js pages API the equivalent is `export const config = { api: { bodyParser: false } }`
plus reading the stream manually.

## Role gating belongs on the server

Discord offers per-command permissions in its UI, and they are not sufficient here.
The interactions endpoint is a public URL — anyone who finds it can POST to it — and
the UI permissions are a convenience any server admin can loosen. So the allowed
role check runs in the handler, against `body.member.roles`:

```js
const ALLOWED_ROLE_IDS = ['1041465470911529044', '1074881475691945984']
const roles = body.member?.roles || []
if (!roles.some((r) => ALLOWED_ROLE_IDS.includes(r))) {
  /* refuse, ephemeral */
}
```

Refusals and errors go back **ephemeral** (`flags: 1 << 6`) so a failed attempt does
not clutter the customer-facing thread. The success confirmation is deliberately
_not_ ephemeral — the thread should show what was sent to the customer and by whom,
otherwise staff cannot tell whether someone already answered.

## Resolving a thread back to its ticket

There is no stored mapping between Discord threads and HubSpot tickets, and none is
needed. The workflow's embed sets `url` to the HubSpot ticket page, so the id is
already in the thread's starter message.

For a forum thread, the starter message shares the thread's own id, which makes the
lookup a single request:

```js
const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${channelId}`, {
  headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
})
const url = (await res.json()).embeds?.[0]?.url
const ticketId = url?.match(/\/ticket\/(\d+)/)?.[1] ?? null
```

Requires Read Message History on the channel. The consequence worth knowing: this
only works for threads the workflow created. `/reply` in an unrelated thread should
say so plainly rather than guessing at a ticket.

## Known gap in the current draft

`getTicketThread()` in `src/lib/hubspot-conversations.ts` reads the recipient as:

```js
const recipientEmail = incoming?.senders?.[0]?.deliveryIdentifier?.value
```

It never checks `deliveryIdentifier.type`. Chat-widget threads carry
`CHANNEL_SPECIFIC_OPAQUE_ID` — a hash, not an address — so this returns a non-email
string and the reply attempt fails or misdelivers. Real tickets in this portal are
chat-originated, so this will be hit immediately on deploy.

Fix before shipping: require `type === 'HS_EMAIL_ADDRESS'`, return `null` otherwise,
and have `/reply` say the ticket came from chat and must be answered in HubSpot. See
`api-gotchas.md` for the channel/identifier table.

## Registration order

Discord probes the URL the moment you save it, so **the endpoint must be live and
answering before you set it**. Setting it first fails validation and is a confusing
place to start debugging.

1. Deploy the handler with `DISCORD_PUBLIC_KEY` and `HUBSPOT_PRIVATE_APP_TOKEN`
   available to it (for oracle: Doppler `dotabod-backend/prd`).
2. Confirm it is reachable over HTTPS and returns `401` to an unsigned POST.
3. Set the Interactions Endpoint URL in the app's settings, e.g.
   `https://gsi.dotabod.com/discord/interactions`.
4. Run `/reply` in a real ticket thread and confirm both the Discord confirmation
   and the customer's email — checking `statusType`, per `api-gotchas.md`.

The `/reply` command itself is already registered guild-scoped
(`1535337732522385559`), so no command registration step is needed. Guild-scoped
commands appear immediately, unlike global ones which propagate slowly — worth
keeping guild-scoped while iterating.

## Interaction response shapes

| Constant                      | Value    | Meaning                                         |
| ----------------------------- | -------- | ----------------------------------------------- |
| `PING`                        | type `1` | Discord's liveness probe — answer `{ type: 1 }` |
| `APPLICATION_COMMAND`         | type `2` | a slash command invocation                      |
| `CHANNEL_MESSAGE_WITH_SOURCE` | type `4` | reply with a message                            |
| `EPHEMERAL`                   | `1 << 6` | flag: only the invoker sees it                  |

Every command must be answered within **3 seconds**. The HubSpot round trip here
fits comfortably, but if a future command grows slower, the answer is a deferred
response (type `5`) followed by a webhook edit — not a longer synchronous handler,
which Discord will simply time out and show as "the application did not respond".
