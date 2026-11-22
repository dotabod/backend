---
name: realtime-watcher
description: Verify reconnect and channel teardown changes to the twitch-events Supabase Realtime watcher.
---

# Realtime watcher

Run the CI workflow on your feature branch when editing `setupAccountWatcher` in
`packages/twitch-events/src/watcher.ts`. The **Model-check the Realtime watcher** step runs
`bash verification/realtime-watcher/check.sh` using the pinned TLC 1.7.4 jar. Read the
result with /statechart.

A channel may schedule one replacement and may only remove itself. In
[#622](https://github.com/dotabod/backend/pull/622), Supabase emitted `CLOSED` inside
`removeChannel`. The nested callback removed the same channel again until the process
crashed. The earlier shared reconnect state also let a late callback from a retired
channel tear down its replacement.

In `verification/realtime-watcher/RealtimeWatcher.tla`, `ReportFailure` begins
teardown. Assigning `retired` before calling `removeChannel` is synchronous, so the
model sets `retry` in the same transition. `ReturnFromRemoveChannel` ends synchronous
teardown and `RetryTimerFires` starts the next attempt. A late status can come from any
previous channel. TLC explores up to three channel attempts and checks that each is
removed at most once and only by its own status callback. The model covers channels
that were created, regardless of whether subscription setup succeeded. It does not
cover database payloads, failures before a channel is created, retry timing, or delivery
of missed events. The watcher tests exercise synchronous and delayed `CLOSED` through
the real watcher callback.

The check requires both counterexamples. A second removal during teardown identifies
the #622 ordering bug. A failure reported by channel 1 that retires channel 2
identifies shared state that should belong to the original attempt. If a fixed run
finds either trace, compare the retirement and callback ordering in the implementation
with the model before changing either one.

Coverage was synchronized at `a145dc41e5a0f82b995a26f4370a44db9b453b81`. Move this
commit forward after comparing the model transitions with the updated watcher and
rerunning the fixed and historical configurations. Use /maintain-formal-verification-skill
when the watcher changes.
