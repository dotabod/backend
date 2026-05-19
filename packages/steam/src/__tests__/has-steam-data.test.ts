import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { hasSteamData } from '../hasSteamData'
import type { DelayedGames } from '../types/index'

const player = (overrides: Record<string, unknown> = {}) => ({
  items: [],
  heroid: 1,
  accountid: '123',
  team_slot: 0,
  ...overrides,
})

const fiveFull = () => Array.from({ length: 5 }, () => player())

function game(teams: DelayedGames['teams']): DelayedGames {
  return {
    _id: 'x',
    match: { server_steam_id: '0', match_id: '0', game_mode: 0, lobby_type: 0 },
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

describe('hasSteamData', () => {
  it('returns all false for an undefined game', () => {
    const result = hasSteamData(undefined)
    expect(result.hasPlayers).toBe(false)
    expect(result.hasAccountIds).toBe(false)
    expect(result.hasHeroes).toBe(false)
  })

  it('returns false when teams are not fully populated', () => {
    const result = hasSteamData(
      game([{ players: fiveFull() }, { players: fiveFull().slice(0, 3) }]),
    )
    expect(result.hasPlayers).toBe(false)
  })

  it('returns true for two fully populated teams of 5', () => {
    const result = hasSteamData(game([{ players: fiveFull() }, { players: fiveFull() }]))
    expect(result.hasPlayers).toBe(true)
    expect(result.hasAccountIds).toBe(true)
    expect(result.hasHeroes).toBe(true)
  })

  it('flags hasAccountIds=false in prod when any account id is missing', () => {
    const teams = [{ players: fiveFull() }, { players: fiveFull() }]
    teams[1].players[2].accountid = ''
    const result = hasSteamData(game(teams))
    expect(result.hasPlayers).toBe(true)
    expect(result.hasAccountIds).toBe(false)
  })
})
