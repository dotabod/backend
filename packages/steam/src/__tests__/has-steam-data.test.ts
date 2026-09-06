import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { hasSteamData } from '../has-steam-data'
import type { DelayedGames } from '../types/index'

const player = (overrides: Record<string, unknown> = {}) => ({
  accountid: '123',
  heroid: 1,
  items: [],
  team_slot: 0,
  ...overrides,
})

const fiveFull = () => Array.from({ length: 5 }, () => player())

const game = function game(teams: DelayedGames['teams']): DelayedGames {
  return {
    _id: 'x',
    match: { game_mode: 0, lobby_type: 0, match_id: '0', server_steam_id: '0' },
    teams,
  }
}

const originalEnv = process.env.DOTABOD_ENV
beforeAll(() => {
  process.env.DOTABOD_ENV = 'production'
})

afterAll(() => {
  process.env.DOTABOD_ENV = originalEnv
})

describe(hasSteamData, () => {
  it('returns all false for an undefined game', () => {
    const result = hasSteamData()
    expect(result.hasPlayers).toBeFalsy()
    expect(result.hasAccountIds).toBeFalsy()
    expect(result.hasHeroes).toBeFalsy()
  })

  it('returns false when teams are not fully populated', () => {
    const result = hasSteamData(
      game([{ players: fiveFull() }, { players: fiveFull().slice(0, 3) }])
    )
    expect(result.hasPlayers).toBeFalsy()
  })

  it('returns true for two fully populated teams of 5', () => {
    const result = hasSteamData(game([{ players: fiveFull() }, { players: fiveFull() }]))
    expect(result.hasPlayers).toBeTruthy()
    expect(result.hasAccountIds).toBeTruthy()
    expect(result.hasHeroes).toBeTruthy()
  })

  it('flags hasAccountIds=false in prod when any account id is missing', () => {
    const teams = [{ players: fiveFull() }, { players: fiveFull() }]
    teams[1].players[2].accountid = ''
    const result = hasSteamData(game(teams))
    expect(result.hasPlayers).toBeTruthy()
    expect(result.hasAccountIds).toBeFalsy()
  })
})
