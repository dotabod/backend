import { afterEach, describe, expect, it } from 'vitest'

import { DBSettings } from '../../../settings.ts'
import {
  findGSIHandlerByTwitchId,
  findUserByName,
  findUserByTwitchId,
  getTokenFromTwitchId,
} from '../connected-streamers.ts'
import { gsiHandlers, twitchIdToToken, twitchNameToToken } from '../consts.ts'
import { DelayedCommands } from '../delayed-commands.ts'
import { findItem } from '../find-item.ts'
import { getSpectatorPlayers } from '../get-spectator-players.ts'
import { isArcade } from '../is-arcade.ts'
import { isSpectator } from '../is-spectator.ts'

describe(findItem, () => {
  const inv = (names: string[]) =>
    Object.fromEntries(names.map((name, i) => [`slot${i}`, { name }])) as any

  it('returns false when there is no item data', () => {
    expect(findItem({ data: undefined, itemName: 'item_blink' })).toBeFalsy()
  })

  it('returns false when the inventory is not a full 17 slots', () => {
    expect(
      findItem({ data: { items: inv(['item_blink']) } as any, itemName: 'item_blink' })
    ).toBeFalsy()
  })

  it('finds a matching item in the first 6 backpack slots', () => {
    const names = Array.from({ length: 17 }, (_, i) => (i === 2 ? 'item_blink' : 'empty'))
    expect(findItem({ data: { items: inv(names) } as any, itemName: 'item_blink' })).toStrictEqual([
      { name: 'item_blink' },
    ])
  })

  it('ignores items beyond slot 6 unless searchStashAlso is set', () => {
    const names = Array.from({ length: 17 }, (_, i) => (i === 7 ? 'item_blink' : 'empty'))
    expect(findItem({ data: { items: inv(names) } as any, itemName: 'item_blink' })).toBeFalsy()
    expect(
      findItem({
        data: { items: inv(names) } as any,
        itemName: 'item_blink',
        searchStashAlso: true,
      })
    ).toStrictEqual([{ name: 'item_blink' }])
  })
})

describe(isArcade, () => {
  it('is false without gsi or custom game name', () => {
    expect(isArcade()).toBeFalsy()
    expect(isArcade({ map: { customgamename: '' } } as any)).toBeFalsy()
  })

  it('is true for a custom game', () => {
    expect(isArcade({ map: { customgamename: 'overthrow' } } as any)).toBeTruthy()
  })
})

describe(isSpectator, () => {
  it('is false for a normal player packet', () => {
    expect(isSpectator()).toBeFalsy()
    expect(isSpectator({ player: { team_name: 'radiant' } } as any)).toBeFalsy()
  })

  it('is true when spectating (team_name or team2 structure)', () => {
    expect(isSpectator({ player: { team_name: 'spectator' } } as any)).toBeTruthy()
    expect(isSpectator({ player: { team2: {} } } as any)).toBeTruthy()
  })
})

describe(getSpectatorPlayers, () => {
  it('returns [] without spectator team data', () => {
    expect(getSpectatorPlayers()).toStrictEqual([])
    expect(getSpectatorPlayers({ hero: {} } as any)).toStrictEqual([])
  })

  it('flattens team2 + team3 hero/player data with a selected flag', () => {
    const gsi = {
      hero: {
        team2: { player0: { id: 1, selected_unit: true } },
        team3: { player5: { id: 2 } },
      },
      player: {
        team2: { player0: { accountid: '111' } },
        team3: { player5: { accountid: '222' } },
      },
    } as any

    const players = getSpectatorPlayers(gsi)
    expect(players).toHaveLength(2)
    // playerid must be the numeric slot parsed from the "playerN" key (not NaN)
    expect(players[0]).toMatchObject({ accountid: 111, heroid: 1, playerid: 0, selected: true })
    expect(players[1]).toMatchObject({ accountid: 222, heroid: 2, playerid: 5, selected: false })
  })
})

describe(DelayedCommands, () => {
  it('maps specific chat triggers to their settings keys', () => {
    expect(DelayedCommands).toContainEqual({ command: '!np', key: DBSettings.commandNP })
    expect(DelayedCommands).toContainEqual({ command: '!gm', key: DBSettings.commandGM })
    // Both !items and !stats are gated by the same setting.
    expect(DelayedCommands).toContainEqual({ command: '!items', key: DBSettings.commandItems })
    expect(DelayedCommands).toContainEqual({ command: '!stats', key: DBSettings.commandItems })
  })

  it('has no duplicate command triggers', () => {
    const commands = DelayedCommands.map((c) => c.command)
    expect(new Set(commands).size).toBe(commands.length)
  })
})

describe('connectedStreamers lookups', () => {
  const TOKEN = 'pure-helpers-token'
  const TWITCH_ID = 'pure-helpers-twitch-id'
  const NAME = 'pure-helpers-name'

  afterEach(() => {
    gsiHandlers.delete(TOKEN)
    twitchIdToToken.delete(TWITCH_ID)
    twitchNameToToken.delete(NAME)
  })

  it('returns null when nothing is registered', () => {
    expect(getTokenFromTwitchId(null)).toBeNull()
    expect(getTokenFromTwitchId('missing')).toBeNull()
    expect(findUserByName('missing')).toBeNull()
    expect(findGSIHandlerByTwitchId('missing')).toBeNull()
  })

  it('resolves a token only when both the id map and a live handler exist', () => {
    twitchIdToToken.set(TWITCH_ID, TOKEN)
    // Mapping present but no handler yet -> still null.
    expect(getTokenFromTwitchId(TWITCH_ID)).toBeNull()

    const client = { name: NAME } as any
    gsiHandlers.set(TOKEN, { client } as any)
    twitchNameToToken.set(NAME, TOKEN)

    expect(getTokenFromTwitchId(TWITCH_ID)).toBe(TOKEN)
    expect(findUserByTwitchId(TWITCH_ID)).toBe(client)
    expect(findUserByName(NAME)).toBe(client)
    expect(findGSIHandlerByTwitchId(TWITCH_ID)).toMatchObject({ client })
  })
})
