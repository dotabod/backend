import { describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n } from '../../__tests__/sharedMocks.ts'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

// Mutable holders so each test controls what Supabase and the delayedGames cache
// return without re-registering the process-wide module mocks.
let supabaseMatchRow: { matchId: number } | null = null
let delayedGamesRows: Array<{ match: { match_id: string } }> = []

const supabaseChain: any = {
  from: () => supabaseChain,
  select: () => supabaseChain,
  eq: () => supabaseChain,
  not: () => supabaseChain,
  order: () => supabaseChain,
  limit: () => supabaseChain,
  single: async () => ({ data: supabaseMatchRow }),
}

vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ supabase: supabaseChain, logger: noopLogger }),
)

vi.doMock('../MongoDBSingleton', () => ({
  default: {
    connect: async () => ({
      collection: () => ({
        find: () => ({ toArray: async () => delayedGamesRows }),
        findOne: async () => null,
      }),
    }),
    close: async () => undefined,
  },
}))

await initTestI18n()

const lastgame = (await import('../lastgame.ts')).default

const normalClient = {
  mmr: 3000,
  steam32Id: 86745912,
  SteamAccount: [{ steam32Id: 86745912, mmr: 3000 }],
} as any

const highMmrClient = {
  mmr: 9000,
  steam32Id: 86745912,
  SteamAccount: [{ steam32Id: 86745912, mmr: 9000 }],
} as any

describe('lastgame — not-playing "last game" link', () => {
  it('uses the Supabase match id, not the stale delayedGames cache', async () => {
    // The 8500+ bug: delayedGames holds a stale older match for Immortal players
    // (Valve realtime API never saves their recent games), so the link must come
    // from Supabase, the source of truth for their finished matches.
    supabaseMatchRow = { matchId: 8821057580 }
    delayedGamesRows = [{ match: { match_id: '8516216993' } }]

    const desc = await lastgame({
      locale: 'en',
      steam32Id: 86745912,
      client: normalClient,
      currentMatchId: undefined,
      currentPlayers: [],
    })

    expect(desc).toContain('dotabuff.com/matches/8821057580')
    expect(desc).not.toContain('8516216993')
  })

  it('falls back to the delayedGames cache when Supabase has nothing', async () => {
    supabaseMatchRow = null
    delayedGamesRows = [{ match: { match_id: '8516216993' } }]

    const desc = await lastgame({
      locale: 'en',
      steam32Id: 86745912,
      client: normalClient,
      currentMatchId: undefined,
      currentPlayers: [],
    })

    expect(desc).toContain('dotabuff.com/matches/8516216993')
  })

  it('omits the dotabuff link entirely for 8500+ clients', async () => {
    supabaseMatchRow = { matchId: 8821057580 }
    delayedGamesRows = [{ match: { match_id: '8516216993' } }]

    const desc = await lastgame({
      locale: 'en',
      steam32Id: 86745912,
      client: highMmrClient,
      currentMatchId: undefined,
      currentPlayers: [],
    })

    expect(desc).not.toContain('dotabuff.com/matches/')
  })
})
