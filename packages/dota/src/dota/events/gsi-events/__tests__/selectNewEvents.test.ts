import { describe, expect, it } from 'bun:test'
import { type DotaEvent, DotaEventTypes } from '../../../../types'
import { selectNewEvents } from '../selectNewEvents'

// Characterizes the events[] sliding-window dedup that handleNewEvents (newdata.ts)
// relies on. This is the contract any GSI-ingestion rewrite (worker offload /
// multi-process sharding / coalescing) must preserve: every tick's events[] must
// flow through here, and each distinct (game_time,event_type) emits exactly once.

// Minimal DotaEvent — selectNewEvents only reads game_time + event_type.
const ev = (game_time: number, event_type: DotaEventTypes): DotaEvent =>
  ({ game_time, event_type }) as DotaEvent

describe('selectNewEvents — basic selection', () => {
  it('returns all incoming events when nothing has been seen', () => {
    const incoming = [ev(60, DotaEventTypes.BountyPickup), ev(61, DotaEventTypes.RoshanKilled)]
    expect(selectNewEvents([], incoming)).toEqual(incoming)
  })

  it('preserves input order', () => {
    const a = ev(10, DotaEventTypes.Tip)
    const b = ev(20, DotaEventTypes.AegisPickedUp)
    const c = ev(30, DotaEventTypes.RoshanKilled)
    expect(selectNewEvents([], [a, b, c])).toEqual([a, b, c])
  })

  it('returns [] for empty or undefined incoming', () => {
    expect(selectNewEvents([], [])).toEqual([])
    expect(selectNewEvents([], undefined)).toEqual([])
    expect(selectNewEvents([ev(1, DotaEventTypes.Tip)], undefined)).toEqual([])
  })
})

describe('selectNewEvents — dedup across ticks (the sliding window)', () => {
  it('does not re-select an event already seen on a prior tick', () => {
    const seen = [ev(60, DotaEventTypes.BountyPickup)]
    const incoming = [ev(60, DotaEventTypes.BountyPickup), ev(75, DotaEventTypes.RoshanKilled)]
    // The duplicate bounty (same game_time+type) is filtered; only roshan is new.
    expect(selectNewEvents(seen, incoming)).toEqual([ev(75, DotaEventTypes.RoshanKilled)])
  })

  it('treats same event_type at a different game_time as distinct', () => {
    const seen = [ev(60, DotaEventTypes.BountyPickup)]
    const incoming = [ev(180, DotaEventTypes.BountyPickup)]
    expect(selectNewEvents(seen, incoming)).toEqual([ev(180, DotaEventTypes.BountyPickup)])
  })

  it('treats same game_time with a different event_type as distinct', () => {
    const seen = [ev(60, DotaEventTypes.BountyPickup)]
    const incoming = [ev(60, DotaEventTypes.AegisPickedUp)]
    expect(selectNewEvents(seen, incoming)).toEqual([ev(60, DotaEventTypes.AegisPickedUp)])
  })

  it('simulates a normal multi-tick stream: each event emits exactly once', () => {
    let seen: DotaEvent[] = []
    const emitted: string[] = []
    const processTick = (incoming: DotaEvent[]) => {
      const fresh = selectNewEvents(seen, incoming)
      seen = [...seen, ...fresh]
      for (const e of fresh) emitted.push(`${e.game_time}-${e.event_type}`)
    }

    const bounty = ev(60, DotaEventTypes.BountyPickup)
    const rosh = ev(75, DotaEventTypes.RoshanKilled)
    // Sliding window: bounty appears in tick 1 AND tick 2 (Valve repeats it);
    // rosh appears only in tick 2.
    processTick([bounty]) // tick 1
    processTick([bounty, rosh]) // tick 2 (bounty repeated, rosh new)
    processTick([rosh]) // tick 3 (rosh repeated)

    expect(emitted).toEqual(['60-bounty_rune_pickup', '75-roshan_killed'])
  })
})

describe('selectNewEvents — SAFETY CONTRACT: dropping a tick loses one-shot events', () => {
  // This is the bounty-rune concern, encoded as an executable guard. It documents
  // WHY a rewrite must never skip a tick's events[]: if an event appears in only
  // one tick and that tick is not fed through selectNewEvents, it is gone.
  it('loses a one-shot event that appeared only in a skipped tick', () => {
    let seen: DotaEvent[] = []
    const emitted: string[] = []
    const processTick = (incoming: DotaEvent[]) => {
      const fresh = selectNewEvents(seen, incoming)
      seen = [...seen, ...fresh]
      for (const e of fresh) emitted.push(`${e.game_time}-${e.event_type}`)
    }

    const bountyOnlyInTick2 = ev(60, DotaEventTypes.BountyPickup)
    processTick([]) // tick 1: nothing
    // tick 2 SKIPPED — the rewrite dropped/coalesced it without feeding events[]
    processTick([ev(120, DotaEventTypes.RoshanKilled)]) // tick 3: window no longer carries the bounty

    // The bounty is permanently lost — proving every tick's events[] must be processed.
    expect(emitted).not.toContain('60-bounty_rune_pickup')
    expect(emitted).toEqual(['120-roshan_killed'])

    // Contrast: had tick 2 been processed, the bounty would have emitted.
    let seen2: DotaEvent[] = []
    const emitted2: string[] = []
    const processTick2 = (incoming: DotaEvent[]) => {
      const fresh = selectNewEvents(seen2, incoming)
      seen2 = [...seen2, ...fresh]
      for (const e of fresh) emitted2.push(`${e.game_time}-${e.event_type}`)
    }
    processTick2([])
    processTick2([bountyOnlyInTick2]) // tick 2 NOT skipped
    processTick2([ev(120, DotaEventTypes.RoshanKilled)])
    expect(emitted2).toEqual(['60-bounty_rune_pickup', '120-roshan_killed'])
  })
})
