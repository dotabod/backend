import { describe, expect, it, vi } from 'vitest'

import {
  buildSharedUtilsMock,
  createSocketClientStub,
  initTestI18n,
} from '../../__tests__/shared-mocks.ts'

const noopLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

// Mutable holders so each test controls what Supabase and the delayedGames cache
// return without re-registering the process-wide module mocks.
let supabaseMatchRow: { matchId: number } | null = null
let delayedGamesRows: { match: { match_id: string } }[] = []

const createDelayedGamesCursor = function createDelayedGamesCursor() {
  const cursor = {
    limit: () => cursor,
    sort: () => cursor,
    toArray: async () => await Promise.resolve(delayedGamesRows),
  }
  return cursor
}

const supabaseChain: unknown = {
  eq: () => supabaseChain,
  from: () => supabaseChain,
  limit: () => supabaseChain,
  not: () => supabaseChain,
  order: () => supabaseChain,
  select: () => supabaseChain,
  single: async () => await Promise.resolve({ data: supabaseMatchRow }),
}

vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ logger: noopLogger, supabase: supabaseChain })
)

vi.doMock('../mongo-db-singleton', () => ({
  default: {
    close: () => {},
    connect: async () =>
      await Promise.resolve({
        collection: () => ({
          find: createDelayedGamesCursor,
          findOne: async () => await Promise.resolve(null),
        }),
      }),
  },
}))

await initTestI18n()

const lastgame = (await import('../lastgame.ts')).default

const normalClient = createSocketClientStub({
  SteamAccount: [{ leaderboard_rank: null, mmr: 3000, name: null, steam32Id: 86_745_912 }],
  mmr: 3000,
  name: 'streamer',
  steam32Id: 86_745_912,
})

const highMmrClient = createSocketClientStub({
  SteamAccount: [{ leaderboard_rank: null, mmr: 9000, name: null, steam32Id: 86_745_912 }],
  mmr: 9000,
  name: 'streamer',
  steam32Id: 86_745_912,
})

describe('lastgame — not-playing "last game" link', () => {
  it('links match history when Supabase has a finished match', async () => {
    supabaseMatchRow = { matchId: 8_821_057_580 }
    delayedGamesRows = [{ match: { match_id: '8516216993' } }]

    const desc = await lastgame({
      client: normalClient,
      currentMatchId: undefined,
      currentPlayers: [],
      locale: 'en',
      steam32Id: 86_745_912,
    })

    expect(desc).toContain('dotabod.com/streamer/matches')
  })

  it('links match history when only the delayedGames cache has a match', async () => {
    supabaseMatchRow = null
    delayedGamesRows = [{ match: { match_id: '8516216993' } }]

    const desc = await lastgame({
      client: normalClient,
      currentMatchId: undefined,
      currentPlayers: [],
      locale: 'en',
      steam32Id: 86_745_912,
    })

    expect(desc).toContain('dotabod.com/streamer/matches')
  })

  it('keeps the first-party match-history link for 8500+ clients', async () => {
    supabaseMatchRow = { matchId: 8_821_057_580 }
    delayedGamesRows = [{ match: { match_id: '8516216993' } }]

    const desc = await lastgame({
      client: highMmrClient,
      currentMatchId: undefined,
      currentPlayers: [],
      locale: 'en',
      steam32Id: 86_745_912,
    })

    expect(desc).toContain('dotabod.com/streamer/matches')
  })
})
