import { describe, expect, it, mock } from 'bun:test'
import { buildSharedUtilsMock, initTestI18n } from '../../__tests__/sharedMocks.ts'
import type { Players } from '../../types'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

mock.module('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ supabase: {}, logger: noopLogger }),
)

mock.module('@dotabod/profanity-filter', () => ({
  moderateText: async (text: string) => text,
}))

// Mongo yields no game mode and no DB-stored notable players, so output reflects
// only the players passed in.
mock.module('../MongoDBSingleton', () => ({
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
const getPlayersMock = mock(async () => ({
  matchPlayers: [] as Players,
  accountIds: [] as number[],
  gameMode: undefined,
}))
mock.module('../../dota/lib/getPlayers', () => ({ getPlayers: getPlayersMock }))
mock.module('../../dota/lib/calculateAvg', () => ({ calculateAvg: async () => 'Divine' }))

await initTestI18n()

const { notablePlayers } = await import('../notableplayers.ts')

const draftPlayers: Players = [
  { heroid: undefined, accountid: 0, playerid: null, player_name: 'Dendi' },
  { heroid: undefined, accountid: 0, playerid: null, player_name: 'Puppey' },
  { heroid: undefined, accountid: 0, playerid: null, player_name: 'N0tail' },
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
  it('keeps the "Name (Hero)" format and avg header', async () => {
    getPlayersMock.mockResolvedValueOnce({
      matchPlayers: [{ heroid: 1, accountid: 123, playerid: 0, player_name: 'Bob' }],
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
        { heroid: 1, accountid: 0, playerid: null, player_name: 'Named' },
        { heroid: 2, accountid: 0, playerid: null },
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
