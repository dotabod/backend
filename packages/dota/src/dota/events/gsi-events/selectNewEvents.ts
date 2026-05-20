import type { DotaEvent } from '../../../types'

// Deduplicates incoming GSI events against already-seen events by
// `${game_time}-${event_type}`, returning only the unseen ones in input order.
// Pure: mutates neither argument.
//
// Correctness note for the GSI ingestion pipeline: Dota's `data.events[]` is a
// sliding window — a one-shot event (bounty rune, roshan, aegis, tip, kill) may
// appear in only a single tick's payload. This dedup only prevents re-emitting
// an event already seen on a PRIOR tick; it cannot recover an event from a tick
// that was never processed. Any pipeline change that skips/coalesces ticks must
// still feed every tick's `events[]` through here, or one-shot events are lost.
export function selectNewEvents(
  seen: ReadonlyArray<Pick<DotaEvent, 'game_time' | 'event_type'>>,
  incoming: ReadonlyArray<DotaEvent> | undefined,
): DotaEvent[] {
  if (!incoming?.length) return []
  const seenSet = new Set(seen.map((e) => `${e.game_time}-${e.event_type}`))
  return incoming.filter((e) => !seenSet.has(`${e.game_time}-${e.event_type}`))
}
