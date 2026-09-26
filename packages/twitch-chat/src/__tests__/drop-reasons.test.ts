import { describe, expect, it } from 'vitest'

import { isBlockingDropReason } from '../drop-reasons.ts'

describe(isBlockingDropReason, () => {
  it.each([
    'banned_phone_alias',
    'emote_only_mode',
    'followers_only_mode',
    'subs_only_mode',
    'user_warned',
  ])('disables the bot for %s', (code) => {
    expect(isBlockingDropReason(code)).toBeTruthy()
  })

  // Prod 2026-09-26: 104 streamers were disabled for timeouts and one-off drops
  // like these, and stayed disabled after the cause had passed.
  it.each([
    'automod_held',
    'channel_settings',
    'channel_suspended',
    'duplicate_message',
    'msg_duplicate',
    'msg_rejected',
    'rate_limited',
    'send_error',
    'slow_mode',
    'unique_mode',
    'user_being_disabled',
    'user_timed_out',
    undefined,
  ])('keeps the bot enabled for %s', (code) => {
    expect(isBlockingDropReason(code)).toBeFalsy()
  })
})
