import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n } from '../../__tests__/sharedMocks.ts'
import type { RosterPlayer } from '../../dota/lib/matchData'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

vi.doMock('@dotabod/shared-utils', () => buildSharedUtilsMock({ supabase: {}, logger: noopLogger }))

vi.doMock('@dotabod/profanity-filter', () => ({
  moderateText: async (text: string) => text,
}))

// Mongo yields no game mode and no DB-stored notable players, so output reflects
// only the players passed in.
vi.doMock('../MongoDBSingleton', () => ({
  default: {
    connect: async () => ({
      collection: () => ({
        findOne: async () => null,
        find: () => ({ toArray: async () => [] }),
      }),
    }),
    close: async () => undefined,
  },
}))

// getPlayers / calculateAvg are only reached on the non-draft path. Stub them so
// importing notableplayers doesn't pull in their transitive deps (steam socket).
const getPlayersMock = vi.fn(async () => ({
  matchPlayers: [] as RosterPlayer[],
  accountIds: [] as number[],
  gameMode: undefined,
}))
vi.doMock('../../dota/lib/getPlayers', () => ({ getPlayers: getPlayersMock }))
vi.doMock('../../dota/lib/calculateAvg', () => ({ calculateAvg: async () => 'Divine' }))
const getSteamPlayerSummariesMock = vi.fn(async () => new Map())
vi.doMock('../playerSummaries', () => ({
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

const blank = { slot: null, team: null, rank: null, selected: null }
const draftPlayers: RosterPlayer[] = [
  { ...blank, heroId: null, accountId: null, playerName: 'Dendi' },
  { ...blank, heroId: null, accountId: null, playerName: 'Puppey' },
  { ...blank, heroId: null, accountId: null, playerName: 'N0tail' },
]

describe('notablePlayers — draft-only (heroes pending)', () => {
  it('renders names without hero suffix and a waiting note', async () => {
    const result = await notablePlayers({
      locale: 'en',
      twitchChannelId: 'chan',
      currentMatchId: '123',
      players: draftPlayers,
      steam32Id: null,
      heroesStatus: 'waiting',
    })

    expect(result.description).toBe('[waiting on heroes]: Dendi · Puppey · N0tail')
    expect(result.description).not.toContain('(')
    // The draft path must not call getPlayers / calculateAvg.
    expect(getPlayersMock).not.toHaveBeenCalled()
  })

  it('uses the "heroes not found" note when status is failed', async () => {
    const result = await notablePlayers({
      locale: 'en',
      twitchChannelId: 'chan',
      currentMatchId: '123',
      players: draftPlayers,
      steam32Id: null,
      heroesStatus: 'failed',
    })

    expect(result.description).toBe('[heroes not found]: Dendi · Puppey · N0tail')
  })
})

describe('notablePlayers — normal path (heroes known)', () => {
  it('uses Steam identities instead of OCR for every SourceTV account', async () => {
    getPlayersMock.mockResolvedValueOnce({
      matchPlayers: [
        { ...blank, slot: 0, heroId: 1, accountId: 123, playerName: 'Wrong OCR name' },
        { ...blank, slot: 1, heroId: 2, accountId: 456, playerName: null },
      ],
      accountIds: [123, 456],
      gameMode: undefined,
    })
    getSteamPlayerSummariesMock.mockResolvedValueOnce(
      new Map([
        [123, { personaName: 'Steam One', countryCode: 'SE' }],
        [456, { personaName: 'Steam Two', countryCode: null }],
      ]),
    )

    const result = await notablePlayers({
      locale: 'en',
      twitchChannelId: 'chan',
      currentMatchId: '123',
      players: undefined,
      enableFlags: true,
      steam32Id: null,
      rosterSource: 'sourcetv',
    })

    expect(result.description).toBe('[Divine avg]: 🇸🇪 Steam One (Anti-Mage) · Steam Two (Axe)')
    expect(result.playerList.map((player) => player.name)).toEqual(['Steam One', 'Steam Two'])
    expect(result.playerList.map((player) => player.country_code)).toEqual(['SE', ''])
  })

  it('keeps the "Name (Hero)" format and avg header', async () => {
    getPlayersMock.mockResolvedValueOnce({
      matchPlayers: [{ ...blank, slot: 0, heroId: 1, accountId: 123, playerName: 'Bob' }],
      accountIds: [123],
      gameMode: undefined,
    })

    const result = await notablePlayers({
      locale: 'en',
      twitchChannelId: 'chan',
      currentMatchId: '123',
      players: undefined,
      steam32Id: null,
    })

    expect(result.description).toBe('[Divine avg]: Bob (Anti-Mage)')
  })

  it('keeps a vision-detected hero whose name OCR came back empty', async () => {
    // High-MMR vision path: the Vision API never provides account ids (accountid 0),
    // so the notable-player lookup can never match. A confidently-detected hero
    // whose name OCR missed (Techies in match 8821057580) must still appear,
    // falling back to a "Player N" label rather than vanishing from the roster.
    getPlayersMock.mockResolvedValueOnce({
      matchPlayers: [
        { ...blank, heroId: 1, accountId: null, playerName: 'Named' },
        { ...blank, heroId: 2, accountId: null, playerName: null },
      ],
      accountIds: [0, 0],
      gameMode: undefined,
    })

    const result = await notablePlayers({
      locale: 'en',
      twitchChannelId: 'chan',
      currentMatchId: '123',
      players: undefined,
      steam32Id: null,
    })

    expect(result.playerList).toHaveLength(2)
    expect(result.playerList[0].name).toBe('Named')
    const nameless = result.playerList[1]
    expect(nameless.name).toBe('Player 2')
    expect(nameless.heroName).not.toBe('?')
  })
})
