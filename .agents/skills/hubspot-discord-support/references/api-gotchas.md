# API gotchas

Everything here was hit for real while building this pipeline. The unifying theme:
**both vendors return success for things that did not succeed.** Budget your
skepticism accordingly — a `200` from either API is the start of verification, not
the end of it.

- [HubSpot: a 200 does not mean delivered](#hubspot-a-200-does-not-mean-delivered)
- [HubSpot: statusType is nested, not top-level](#hubspot-statustype-is-nested-not-top-level)
- [HubSpot: not every thread can be replied to by email](#hubspot-not-every-thread-can-be-replied-to-by-email)
- [HubSpot: the contact association race](#hubspot-the-contact-association-race)
- [HubSpot: replies need explicit recipients](#hubspot-replies-need-explicit-recipients)
- [HubSpot: the bundled SDK is not the SDK you know](#hubspot-the-bundled-sdk-is-not-the-sdk-you-know)
- [HubSpot: scopes are UI-only and unreadable](#hubspot-scopes-are-ui-only-and-unreadable)
- [Discord: forum webhooks need thread_name in the body](#discord-forum-webhooks-need-thread_name-in-the-body)
- [Doppler: env overrides must come after the double dash](#doppler-env-overrides-must-come-after-the-double-dash)
- [Driving the HubSpot UI in a browser](#driving-the-hubspot-ui-in-a-browser)

## HubSpot: a 200 does not mean delivered

Posting a message to a conversation thread returns `200` with a full message object
even when the email is never delivered. Delivery status lives in **`statusType`** on
the message, and it can be `FAILED` on a response you already treated as success.

This bit hard during reply testing: the API said OK, the customer got nothing. The
actual cause turned out not to be code at all — `matt@dotabod.com` forwards to a
Gmail account, so sending to that same Gmail was a self-send loop and HubSpot
bounced it. Three addresses isolated it in a minute:

| To                             | Result                                              |
| ------------------------------ | --------------------------------------------------- |
| `techleed@gmail.com`           | `EMAIL_BOUNCED`                                     |
| `techleed+replytest@gmail.com` | `EMAIL_BOUNCED` (plus-addressing does not dodge it) |
| `techleed@hotmail.com`         | `SENT`                                              |

Two lessons worth keeping. First, when testing outbound email always use an address
on a _different_ provider from the sending domain, or you will debug your own
forwarding rules and think you found an API bug. Second, if the code ever needs to
report "the customer received this", read `statusType` — the resolved promise alone
cannot support that claim, and telling staff a reply sent when it bounced is worse
than showing an error.

## HubSpot: statusType is nested, not top-level

Following on from the above: the field is at **`message.status.statusType`**, not
`message.statusType`. Reading the top-level key returns `undefined`, which is
falsy — so a naive `if (msg.statusType === 'FAILED')` never fires and every message
looks fine forever. Verified against a live thread:

```json
{ "direction": "INCOMING", "status": { "statusType": "RECEIVED" }, ... }
```

This is the worst shape of bug in this integration: a delivery check that silently
always passes is more dangerous than no check, because it justifies telling staff
the customer received something.

## HubSpot: not every thread can be replied to by email

A thread's sender carries a `deliveryIdentifier.type`, and only
**`HS_EMAIL_ADDRESS`** is an address you can email back. Chat-widget threads
(`channelId: 1000`) instead carry `CHANNEL_SPECIFIC_OPAQUE_ID` — a hash like
`47903638b4494fcfa3e0ad2d321dc794`, not a contact detail:

| Origin       | `channelId` | `deliveryIdentifier.type`    | Repliable by email |
| ------------ | ----------- | ---------------------------- | ------------------ |
| email / form | `1002`      | `HS_EMAIL_ADDRESS`           | yes                |
| chat widget  | `1000`      | `CHANNEL_SPECIFIC_OPAQUE_ID` | no                 |

Real tickets in this portal are chat-originated, so this is not a hypothetical. Any
reply path must check the identifier type and say "this ticket came from chat, reply
in HubSpot" rather than passing an opaque id where an address is expected — that
would either 400 or, worse, appear to send.

Useful side effect: the opaque id is not PII, so chat threads leak nothing if
logged. Email threads do — treat the two differently.

## HubSpot: the contact association race

On form submission the ticket row appears **before** its contact association does.
Measured directly: absent at t=0, present a few seconds later. A single read at
trigger time reports every new reporter as `unknown`.

The fix in the live action is three attempts with 3 s sleeps, breaking as soon as an
association appears. That fits comfortably in the 20 s action budget. Do not
"simplify" this loop away — the failure it prevents is silent and only shows up as
degraded data in Discord, not as an error anywhere.

## HubSpot: replies need explicit recipients

`POST /conversations/v3/conversations/threads/{id}/messages` on the email channel
returns `400 NO_RECIPIENT_ON_MESSAGE` unless you pass a `recipients` array. It does
not infer the recipient from the thread, even though the thread plainly has one.

Send the reply to whoever actually opened the thread — read the address off the
**INCOMING** message's `senders[0].deliveryIdentifier.value` rather than the contact
record's email. The two can differ (aliases, someone writing in on behalf of another
account), and replying to the contact record's address can send the conversation to
someone who was never part of it.

Sending also requires `senderActorId`, `channelId`, and `channelAccountId`. There is
no endpoint that derives these — they were read off a real agent-sent reply in the
shared inbox, which is why they are pinned as constants in the skill's identifier
table.

## HubSpot: the bundled SDK is not the SDK you know

The custom code sandbox ships `@hubspot/api-client` v11, where
`client.crm.tickets.associationsApi` is **undefined**. The symptom is a runtime
"Cannot read properties of undefined (reading 'getAll')" in the workflow history,
which reads like a null-check bug rather than a missing API surface.

Direct REST via `axios` avoids the whole question and is what the live action uses —
`associations=contacts` on the ticket GET returns the association inline, so it is
also one request instead of two. Prefer plain REST in the sandbox generally: you get
the documented shape rather than whatever the pinned SDK version wraps it in.

## HubSpot: scopes are UI-only and unreadable

Scopes cannot be added _or read back_ through the API for private apps and service
keys. `GET /oauth/v1/access-tokens/{token}` returns empty for these tokens, so there
is no way to confirm a scope from the outside.

The practical consequence: verify scopes by making a real call and reading the
status code. `scripts/hs.sh scopes` does exactly this against tickets, automation,
and conversations.

This is also how the wrong app got edited once — scopes were added to "Dotabod
Supabase" (`pat-na1-f1b33`) instead of the "Dotabod Chat" service key
(`pat-na1-1fd8a`) that the integration actually uses, and nothing about the API
surfaced the mistake. Check the token prefix in Doppler before opening any scopes
screen. That stray app still carries unused `tickets` + `automation` scopes worth
reverting.

## Discord: forum webhooks need thread_name in the body

Posting to a forum channel webhook fails with `400` code `220001` — "Webhooks posted
to forum channels must have a thread_name or thread_id" — if `thread_name` is passed
as a **query string** parameter. It belongs in the **JSON body** alongside `embeds`.

The query-string form appears in a lot of older material and was in the original
plan for this project, so it is an easy one to reintroduce from memory.

Related: the plain HubSpot "Send a webhook" action emits flat JSON only and cannot
express Discord's nested `embeds[]`. That limitation is the reason this integration
needs a custom code action rather than the no-code webhook action.

## Doppler: env overrides must come after the double dash

`doppler run -- env VAR=x pnpm dev` works; putting `env VAR=x` before `doppler run`
does not, because Doppler's value wins. When overriding a secret for a local test,
the override has to be applied inside the command Doppler wraps.

## Driving the HubSpot UI in a browser

Some steps genuinely have no API (scopes, pasting action code), so they get done by
driving the browser. Two things reliably waste time there:

**Synthetic clicks do not register.** HubSpot's React components ignore
`element.click()`. Dispatch the full pointer sequence with coordinates —
`pointerover, pointerdown, mousedown, pointerup, mouseup, click` — or use a real
click tool against a snapshot uid.

**Saves hide behind confirm dialogs.** Several saves appear to do nothing because a
"Save changes?" or "Test action?" modal is waiting. Screenshot after every save and
handle the dialog rather than assuming the click took effect. This is the difference
between "the change did not apply" and "the change was never submitted", and they
look identical from the API side afterwards.
