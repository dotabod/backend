import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSharedUtilsMock } from '../../../../__tests__/sharedMocks.ts'
import type { RosterPlayer } from '../types'

const noopLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

// Rows returned per source, set per test.
let matchesRows: { userId: string | null }[] = []
let steamRows: { userId: string | null }[] = []
// Capture what each source was queried with (null = not queried).
let queriedMatchId: string | null = null
let queriedAccountIds: number[] | null = null

const supabase = {
  from: (table: string) => {
    if (table === 'matches') {
      return {
        select: () => ({
          eq: async (_column: string, matchId: string) => {
            queriedMatchId = matchId
            return { data: matchesRows }
          },
        }),
      }
    }
    // steam_accounts
    return {
      select: () => ({
        in: async (_column: string, ids: number[]) => {
          queriedAccountIds = ids
          return { data: steamRows }
        },
      }),
    }
  },
}

vi.doMock(import('@dotabod/shared-utils'), () => buildSharedUtilsMock({ logger: noopLogger, supabase }))

// getStreamersInMatch can fall through to MatchDataService when no roster
// is provided, which reaches into Mongo. Stub it so tests without roster don't
// hang trying to connect to a real Mongo singleton.
vi.doMock(import('../../../../steam/MongoDBSingleton'), () => ({
  default: {
    close: async () => undefined,
    connect: async () => ({
      collection: () => ({ findOne: async () => null }),
    }),
  },
}))

const { getStreamersInMatch } = await import('../getStreamersInMatch.ts')

const players = (accountIds: number[]): RosterPlayer[] =>
  accountIds.map((accountId) => ({
    accountId: accountId > 0 ? accountId : null,
    heroId: null,
    playerName: null,
    rank: null,
    selected: null,
    slot: null,
    team: null,
  }))

describe('getStreamersInMatch', () => {
  beforeEach(() => {
    matchesRows = []
    steamRows = []
    queriedMatchId = null
    queriedAccountIds = null
  })

  it('counts other live streamers from the matches table at 8500+ (no roster)', async () => {
    matchesRows = [{ userId: 'me' }, { userId: 'a' }, { userId: 'b' }]
    const count = await getStreamersInMatch({ excludeUserId: 'me', matchId: '123' })
    expect(count).toBe(2)
    expect(queriedMatchId).toBe('123')
    expect(queriedAccountIds).toBeNull()
  })

  it('unions matches-table streamers with registered roster users (<8500)', async () => {
    matchesRows = [{ userId: 'a' }]
    steamRows = [{ userId: 'c' }]
    const count = await getStreamersInMatch({
      excludeUserId: 'me',
      matchId: '123',
      players: players([1, 2, 3]),
    })
    expect(count).toBe(2)
    expect(queriedAccountIds).toStrictEqual([1, 2, 3])
  })

  it('dedupes a user appearing in both sources', async () => {
    matchesRows = [{ userId: 'a' }]
    steamRows = [{ userId: 'a' }, { userId: 'b' }]
    const count = await getStreamersInMatch({
      excludeUserId: 'me',
      matchId: '123',
      players: players([1, 2]),
    })
    expect(count).toBe(2)
  })

  it('excludes the broadcaster from both sources', async () => {
    matchesRows = [{ userId: 'me' }, { userId: 'a' }]
    steamRows = [{ userId: 'me' }, { userId: 'a' }]
    const count = await getStreamersInMatch({
      excludeUserId: 'me',
      matchId: '123',
      players: players([1, 2]),
    })
    expect(count).toBe(1)
  })

  it('returns 0 and queries nothing when no matchId and no real account ids', async () => {
    const count = await getStreamersInMatch({ excludeUserId: 'me', players: players([0, 0]) })
    expect(count).toBe(0)
    expect(queriedMatchId).toBeNull()
    expect(queriedAccountIds).toBeNull()
  })

  it('treats matchId "0" as no match', async () => {
    matchesRows = [{ userId: 'a' }]
    const count = await getStreamersInMatch({ excludeUserId: 'me', matchId: '0' })
    expect(count).toBe(0)
    expect(queriedMatchId).toBeNull()
  })

  it('works roster-only when no matchId is available', async () => {
    steamRows = [{ userId: 'a' }]
    const count = await getStreamersInMatch({ excludeUserId: 'me', players: players([5, 7]) })
    expect(count).toBe(1)
    expect(queriedMatchId).toBeNull()
    expect(queriedAccountIds).toStrictEqual([5, 7])
  })

  it('ignores null userIds from either source', async () => {
    matchesRows = [{ userId: null }, { userId: 'a' }]
    steamRows = [{ userId: null }]
    const count = await getStreamersInMatch({
      excludeUserId: 'me',
      matchId: '123',
      players: players([1]),
    })
    expect(count).toBe(1)
  })
})
