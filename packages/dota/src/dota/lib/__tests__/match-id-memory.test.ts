import { describe, expect, it } from 'vitest'

import { MatchIdMemory } from '../match-id-memory'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

describe(MatchIdMemory, () => {
  it('remembers a match id until its horizon elapses', () => {
    let now = 0
    const memory = new MatchIdMemory({ now: () => now, ttlMs: HOUR_MS })

    memory.add('match-1')
    expect(memory.has('match-1')).toBeTruthy()

    now = HOUR_MS - 1
    expect(memory.has('match-1')).toBeTruthy()

    // The horizon itself is exclusive, matching the Steam summary cache's expiry check.
    now = HOUR_MS
    expect(memory.has('match-1')).toBeFalsy()
  })

  it('drops an expired entry on read so it stops occupying the map', () => {
    let now = 0
    const memory = new MatchIdMemory({ now: () => now, ttlMs: HOUR_MS })

    memory.add('match-1')
    now = HOUR_MS + 1
    memory.has('match-1')

    expect(memory.size).toBe(0)
  })

  it('removes entries that expired while their match ids were never asked about again', () => {
    let now = 0
    const memory = new MatchIdMemory({ now: () => now, ttlMs: HOUR_MS })

    memory.add('match-1')
    memory.add('match-2')
    now = HOUR_MS + 1
    memory.add('match-3')

    expect(memory.size).toBe(1)
  })

  it('keeps the newest entries once the capacity backstop is reached', () => {
    const memory = new MatchIdMemory({ maxEntries: 2, now: () => 0 })

    memory.add('match-1')
    memory.add('match-2')
    memory.add('match-3')

    expect({
      first: memory.has('match-1'),
      second: memory.has('match-2'),
      size: memory.size,
      third: memory.has('match-3'),
    }).toStrictEqual({ first: false, second: true, size: 2, third: true })
  })

  it('refuses to remember a packet that carries no match id', () => {
    const memory = new MatchIdMemory({ now: () => 0 })

    memory.add('')

    expect({ remembered: memory.has(''), size: memory.size }).toStrictEqual({
      remembered: false,
      size: 0,
    })
  })

  it('refreshes the horizon and expiry order when a match id is re-added', () => {
    let now = 0
    const memory = new MatchIdMemory({ now: () => now, ttlMs: HOUR_MS })

    memory.add('match-1')
    now = 30 * MINUTE_MS
    memory.add('match-2')
    now = 45 * MINUTE_MS
    memory.add('match-1')

    // match-2 expires at 1h30, the re-added match-1 at 1h45.
    now = 95 * MINUTE_MS
    expect({ first: memory.has('match-1'), second: memory.has('match-2') }).toStrictEqual({
      first: true,
      second: false,
    })
  })
})
