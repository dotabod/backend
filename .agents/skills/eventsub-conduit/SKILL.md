---
name: eventsub-conduit
description: Verify Twitch-chat conduit initialization when the Socket.IO link to twitch-events reconnects.
---

# Twitch-chat conduit initialization

Dispatch `ci.yml` against a feature branch after editing `createEventSubInitializer`
in `packages/twitch-chat/src/event-sub-initializer.ts` or its integration in
`packages/twitch-chat/src/conduit-setup.ts`. The **Model-check Twitch chat conduit
initialization** step runs `bash verification/eventsub-conduit/check.sh` with pinned
TLC 1.7.4. Read the model results with /statechart.

In [#610](https://github.com/dotabod/backend/pull/610), twitch-chat reconnected while
the original conduit request was pending. The in-flight guard discarded the connect
event. When the first request timed out, the service stayed down until a restart.
The watchdog now covers failures that need a timer to retry. A reconnect during an
attempt schedules the next attempt as soon as the old one settles if initialization
is still needed.

In `EventSubConduit.tla`, `Connect` models the event callback and `Disconnect`
updates the Socket.IO connection status. `Settle` models initialization returning
and the synchronous part of `finally`, through the start of any pending attempt.
TLC explores up to three starts and checks that a reconnect during initialization
cannot leave the connected service idle and uninitialized. The model assumes a pending
request eventually settles. It covers connection event order and excludes watchdog
timing, Twitch shard updates, and Twitch socket recovery after initialization. The
Socket.IO integration test drops a real transport, waits for reconnect and then
releases the initial request to exercise the same ordering in TypeScript.

CI requires the historical model to violate `NoLostReconnect`. Its shortest trace
is connect, disconnect, reconnect while initializing, then failed initialization.
If the current model produces that trace, compare the handling of the pending reconnect
when initialization settles. If the integration test fails before the initial
request, inspect the Socket.IO listener setup.

The model was synchronized with code at
`bd41f7fff51e13aee0bf106a6f50a0dcecb1a295`. Move the recorded commit forward after
checking that the transitions describe the updated code and rerunning both model
configurations. Use /maintain-formal-verification-skill when this code changes.
