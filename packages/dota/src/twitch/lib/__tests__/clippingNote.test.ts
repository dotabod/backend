import { describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n, PRO_SUB } from '../../../__tests__/sharedMocks.ts'
import type { Players, SocketClient } from '../../../types'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

vi.doMock('@dotabod/shared-utils', () => buildSharedUtilsMock({ supabase: {}, logger: noopLogger }))

await initTestI18n()

const { clippingDisabledNote, withClippingNote } = await import('../clippingNote.ts')

function makeClient(over: Partial<SocketClient> = {}): SocketClient {
  return {
    locale: 'en',
    mmr: 9000, // is8500Plus -> true via connected mmr
    steam32Id: 1,
    settings: [{ key: 'disableAutoClipping', value: true }],
    subscription: PRO_SUB,
    SteamAccount: [],
    ...over,
  } as unknown as SocketClient
}

const emptyRoster: Players = [{ heroid: undefined, accountid: 0, playerid: null }]
const fullRoster: Players = [{ heroid: 14, accountid: 0, playerid: null }]
// getAccountsFromMatch's no-data fallback: a single self-player carrying the
// streamer's own hero id (steam32Id 1 here). Must NOT count as a real roster.
const selfOnlyFallback: Players = [{ heroid: 14, accountid: 1, playerid: null }]

describe('clippingDisabledNote', () => {
  it('returns the note for an 8500+ player with clipping off and no roster', () => {
    const note = clippingDisabledNote(makeClient(), emptyRoster)
    expect(note).toContain('auto-clipping')
  })

  it('returns empty when auto-clipping is enabled', () => {
    const note = clippingDisabledNote(
      makeClient({ settings: [{ key: 'disableAutoClipping', value: false }] }),
      emptyRoster,
    )
    expect(note).toBe('')
  })

  it('returns empty for a sub-8500 player (clips are not their data source)', () => {
    const note = clippingDisabledNote(makeClient({ mmr: 5000, SteamAccount: [] }), emptyRoster)
    expect(note).toBe('')
  })

  it('returns empty when a roster of other players was actually detected', () => {
    const note = clippingDisabledNote(makeClient(), fullRoster)
    expect(note).toBe('')
  })

  it('still shows the note when only the self-player fallback is present', () => {
    // The no-clips case (e.g. w33haa): getAccountsFromMatch returns just the
    // streamer's own hero, which must not be mistaken for a real roster.
    const note = clippingDisabledNote(makeClient(), selfOnlyFallback)
    expect(note).toContain('auto-clipping')
  })
})

describe('withClippingNote', () => {
  it('appends the note as a postfix when present', () => {
    expect(withClippingNote('No notable players', 'nope')).toBe('No notable players · nope')
  })

  it('returns the text unchanged when the note is empty', () => {
    expect(withClippingNote('No notable players', '')).toBe('No notable players')
  })
})
