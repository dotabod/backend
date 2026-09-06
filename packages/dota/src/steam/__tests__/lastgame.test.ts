import { describe, expect, it, vi } from 'vitest'

import { buildSharedUtilsMock, initTestI18n } from '../../__tests__/shared-mocks.ts'

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

const supabaseChain: any = {
  eq: () => supabaseChain,
  from: () => supabaseChain,
  limit: () => supabaseChain,
  not: () => supabaseChain,
  order: () => supabaseChain,
  select: () => supabaseChain,
  single: async () => ({ data: supabaseMatchRow }),
}

vi.doMock(import('@dotabod/shared-utils'), () =>
  buildSharedUtilsMock({ logger: noopLogger, supabase: supabaseChain })
)

vi.doMock(import('../mongo-db-singleton'), () => ({
  default: {
    close: async () => {},
    connect: async () => ({
      collection: () => ({
        find: () => ({ toArray: async () => delayedGamesRows }),
        findOne: async () => null,
      }),
    }),
  },
}))

await initTestI18n()

const lastgame = (await import('../lastgame.ts')).default

const normalClient = {
  SteamAccount: [{ mmr: 3000, steam32Id: 86_745_912 }],
  mmr: 3000,
  name: 'streamer',
  steam32Id: 86_745_912,
} as any

const highMmrClient = {
  SteamAccount: [{ mmr: 9000, steam32Id: 86_745_912 }],
  mmr: 9000,
  name: 'streamer',
  steam32Id: 86_745_912,
} as any

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
