import { describe, expect, it, vi } from 'vitest'

import { buildSharedUtilsMock, initTestI18n, PRO_SUB } from '../../../__tests__/sharedMocks.ts'
import type { RosterPlayer } from '../../../dota/lib/matchData'
import type { SocketClient } from '../../../types'

const noopLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

vi.doMock(import('@dotabod/shared-utils'), () => buildSharedUtilsMock({ logger: noopLogger, supabase: {} }))

await initTestI18n()

const { clippingDisabledNote } = await import('../clippingNote.ts')

function makeClient(over: Partial<SocketClient> = {}): SocketClient {
  return {
    SteamAccount: [],
    locale: 'en',
    mmr: 9000, // is8500Plus -> true via connected mmr
    settings: [{ key: 'disableAutoClipping', value: true }],
    steam32Id: 1,
    subscription: PRO_SUB,
    ...over,
  } as unknown as SocketClient
}

const blank = { playerName: null, rank: null, selected: null, slot: null, team: null }
const emptyRoster: RosterPlayer[] = [{ ...blank, accountId: null, heroId: null }]
const fullRoster: RosterPlayer[] = [{ ...blank, accountId: null, heroId: 14 }]
// MatchDataService's gsi-self no-data fallback: a single self-player carrying the
// streamer's own hero id (steam32Id 1 here). Must NOT count as a real roster.
const selfOnlyFallback: RosterPlayer[] = [{ ...blank, accountId: 1, heroId: 14 }]

describe('clippingDisabledNote', () => {
  it('returns the note for an 8500+ player with clipping off and no roster', () => {
    const note = clippingDisabledNote(makeClient(), emptyRoster)
    expect(note).toContain('auto-clipping')
  })

  it('returns empty when auto-clipping is enabled', () => {
    const note = clippingDisabledNote(
      makeClient({ settings: [{ key: 'disableAutoClipping', value: false }] }),
      emptyRoster
    )
    expect(note).toBe('')
  })

  it('returns empty for a sub-8500 player (clips are not their data source)', () => {
    const note = clippingDisabledNote(makeClient({ SteamAccount: [], mmr: 5000 }), emptyRoster)
    expect(note).toBe('')
  })

  it('returns empty when a roster of other players was actually detected', () => {
    const note = clippingDisabledNote(makeClient(), fullRoster)
    expect(note).toBe('')
  })

  it('still shows the note when only the self-player fallback is present', () => {
    // The no-clips case (e.g. w33haa): MatchDataService returns just the
    // streamer's own hero (gsi-self source), which must not be mistaken for a real roster.
    const note = clippingDisabledNote(makeClient(), selfOnlyFallback)
    expect(note).toContain('auto-clipping')
  })
})
