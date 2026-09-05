import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSharedUtilsMock, initTestI18n } from '../../__tests__/sharedMocks.ts'
import type { RosterPlayer } from '../../dota/lib/matchData'

const noopLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

vi.doMock(import('@dotabod/shared-utils'), () =>
  buildSharedUtilsMock({ logger: noopLogger, supabase: {} })
)

vi.doMock(import('@dotabod/profanity-filter'), () => ({
  moderateText: async (text: string) => text,
}))

// Mongo yields no game mode and no DB-stored notable players, so output reflects
// only the players passed in.
vi.doMock(import('../MongoDBSingleton'), () => ({
  default: {
    close: async () => {},
    connect: async () => ({
      collection: () => ({
        find: () => ({ toArray: async () => [] }),
        findOne: async () => null,
      }),
    }),
  },
}))

// getPlayers / calculateAvg are only reached on the non-draft path. Stub them so
// importing notableplayers doesn't pull in their transitive deps (steam socket).
const getPlayersMock = vi.fn(async () => ({
  accountIds: [] as number[],
  gameMode: undefined,
  matchPlayers: [] as RosterPlayer[],
}))
vi.doMock(import('../../dota/lib/getPlayers'), () => ({ getPlayers: getPlayersMock }))
vi.doMock(import('../../dota/lib/calculateAvg'), () => ({ calculateAvg: async () => 'Divine' }))
const getSteamPlayerSummariesMock = vi.fn(async () => new Map())
vi.doMock(import('../playerSummaries'), () => ({
  getSteamPlayerSummaries: getSteamPlayerSummariesMock,
}))

await initTestI18n()

const { notablePlayers } = await import('../notableplayers.ts')

afterEach(() => {
  getSteamPlayerSummariesMock.mockReset()
  getSteamPlayerSummariesMock.mockResolvedValue(new Map())
})

// getPlayersMock is stateful; clear call history before each test so randomized
// test ordering doesn't bleed mockResolvedValueOnce calls across describes.
beforeEach(() => {
  getPlayersMock.mockClear()
})

const blank = { rank: null, selected: null, slot: null, team: null }
const draftPlayers: RosterPlayer[] = [
  { ...blank, accountId: null, heroId: null, playerName: 'Dendi' },
  { ...blank, accountId: null, heroId: null, playerName: 'Puppey' },
  { ...blank, accountId: null, heroId: null, playerName: 'N0tail' },
]

describe('notablePlayers — draft-only (heroes pending)', () => {
  it('renders names without hero suffix and a waiting note', async () => {
    const result = await notablePlayers({
      currentMatchId: '123',
      heroesStatus: 'waiting',
      locale: 'en',
      players: draftPlayers,
      steam32Id: null,
      twitchChannelId: 'chan',
    })

    expect(result.description).toBe('[waiting on heroes]: Dendi · Puppey · N0tail')
    expect(result.description).not.toContain('(')
    // The draft path must not call getPlayers / calculateAvg.
    expect(getPlayersMock).not.toHaveBeenCalled()
  })

  it('uses the "heroes not found" note when status is failed', async () => {
    const result = await notablePlayers({
      currentMatchId: '123',
      heroesStatus: 'failed',
      locale: 'en',
      players: draftPlayers,
      steam32Id: null,
      twitchChannelId: 'chan',
    })

    expect(result.description).toBe('[heroes not found]: Dendi · Puppey · N0tail')
  })
})

describe('notablePlayers — normal path (heroes known)', () => {
  it('uses Steam identities instead of OCR for every SourceTV account', async () => {
    getPlayersMock.mockResolvedValueOnce({
      accountIds: [123, 456],
      gameMode: undefined,
      matchPlayers: [
        { ...blank, accountId: 123, heroId: 1, playerName: 'Wrong OCR name', slot: 0 },
        { ...blank, accountId: 456, heroId: 2, playerName: null, slot: 1 },
      ],
    })
    getSteamPlayerSummariesMock.mockResolvedValueOnce(
      new Map([
        [123, { countryCode: 'SE', personaName: 'Steam One' }],
        [456, { countryCode: null, personaName: 'Steam Two' }],
      ])
    )

    const result = await notablePlayers({
      currentMatchId: '123',
      enableFlags: true,
      locale: 'en',
      players: undefined,
      rosterSource: 'sourcetv',
      steam32Id: null,
      twitchChannelId: 'chan',
    })

    expect(result.description).toBe('[Divine avg]: 🇸🇪 Steam One (Anti-Mage) · Steam Two (Axe)')
    expect(result.playerList.map((player) => player.name)).toStrictEqual(['Steam One', 'Steam Two'])
    expect(result.playerList.map((player) => player.country_code)).toStrictEqual(['SE', ''])
  })

  it('keeps the "Name (Hero)" format and avg header', async () => {
    getPlayersMock.mockResolvedValueOnce({
      accountIds: [123],
      gameMode: undefined,
      matchPlayers: [{ ...blank, accountId: 123, heroId: 1, playerName: 'Bob', slot: 0 }],
    })

    const result = await notablePlayers({
      currentMatchId: '123',
      locale: 'en',
      players: undefined,
      steam32Id: null,
      twitchChannelId: 'chan',
    })

    expect(result.description).toBe('[Divine avg]: Bob (Anti-Mage)')
  })

  it('keeps a vision-detected hero whose name OCR came back empty', async () => {
    // High-MMR vision path: the Vision API never provides account ids (accountid 0),
    // so the notable-player lookup can never match. A confidently-detected hero
    // whose name OCR missed (Techies in match 8821057580) must still appear,
    // falling back to a "Player N" label rather than vanishing from the roster.
    getPlayersMock.mockResolvedValueOnce({
      accountIds: [0, 0],
      gameMode: undefined,
      matchPlayers: [
        { ...blank, accountId: null, heroId: 1, playerName: 'Named' },
        { ...blank, accountId: null, heroId: 2, playerName: null },
      ],
    })

    const result = await notablePlayers({
      currentMatchId: '123',
      locale: 'en',
      players: undefined,
      steam32Id: null,
      twitchChannelId: 'chan',
    })

    expect(result.playerList).toHaveLength(2)
    expect(result.playerList[0].name).toBe('Named')
    const nameless = result.playerList[1]
    expect(nameless.name).toBe('Player 2')
    expect(nameless.heroName).not.toBe('?')
  })
})
