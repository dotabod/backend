// Twitch drop codes that keep the bot silent in a channel until the streamer
// changes something (a chat mode, a ban, an unacknowledged warning). Every other
// code affects one message or clears on its own (AutoMod holds, slow and
// unique-chat mode, timeouts, duplicates, rate limits), so disabling for it would
// leave the streamer disabled for a reason that no longer applies.
const BLOCKING_DROP_CODES = new Set([
  'banned_phone_alias',
  'emote_only_mode',
  'followers_only_mode',
  'subs_only_mode',
  'user_warned',
])

export const isBlockingDropReason = function isBlockingDropReason(
  code: string | undefined
): boolean {
  return code !== undefined && BLOCKING_DROP_CODES.has(code)
}
