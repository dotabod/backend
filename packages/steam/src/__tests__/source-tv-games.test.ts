import { EventEmitter } from 'node:events'

import { Long } from 'mongodb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Dota from '../steam'
import type { SteamMatchDetails } from '../types/steam-match-details'

const getPrototypeMethod = function getPrototypeMethod(
  name: string
): (...args: unknown[]) => unknown {
  const method: unknown = Reflect.get(Dota.prototype, name)
  if (typeof method !== 'function') {
    throw new TypeError(`Expected Dota.prototype.${name} to be a function`)
  }
  return method
}

const makeGame = function makeGame(): SteamMatchDetails {
  return {
    activate_time: 0,
    average_mmr: 9000,
    building_state: 0,
    custom_game_difficulty: 0,
    deactivate_time: 0,
    delay: 0,
    dire_score: 0,
    game_mode: 22,
    game_time: 60,
    last_update_time: 0,
    league_id: 0,
    lobby_id: Long.fromNumber(10),
    lobby_type: 7,
    match_id: Long.fromNumber(20),
    players: [{ account_id: 30, hero_id: 40 }],
    radiant_lead: 0,
    radiant_score: 0,
    series_id: 0,
    server_steam_id: Long.fromNumber(50),
    sort_score: 0,
    spectators: 1,
    team_name_dire: null,
    team_name_radiant: null,
  }
}

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('Dota SourceTV polling', () => {
  it('ignores a bad response before the terminal page', async () => {
    vi.useFakeTimers()
    const dota2 = new EventEmitter()
    const fetchGames = getPrototypeMethod('fetchGames')
    const filterUniqueGames = getPrototypeMethod('filterUniqueGames')
    const receiver = {
      dota2,
      filterUniqueGames,
      isDota2Ready: () => true,
      isSteamClientLoggedOn: () => true,
    }
    const fetchResult: unknown = Reflect.apply(fetchGames, receiver, [])
    if (!(fetchResult instanceof Promise)) {
      throw new TypeError('Expected fetchGames to return a Promise')
    }

    dota2.emit('sourceTVGamesData', null)
    const game = makeGame()

    expect(() =>
      dota2.emit('sourceTVGamesData', {
        game_list: [game],
        league_id: 0,
        specific_games: false,
        start_game: 90,
      })
    ).not.toThrow()
    await expect(fetchResult).resolves.toStrictEqual([game])
  })
})
