import { afterEach, describe, expect, it } from 'bun:test'
import { DBSettings } from '../../../settings.ts'
import {
  findGSIHandlerByTwitchId,
  findUserByName,
  findUserByTwitchId,
  getTokenFromTwitchId,
} from '../connectedStreamers.ts'
import { gsiHandlers, twitchIdToToken, twitchNameToToken } from '../consts.ts'
import { DelayedCommands } from '../DelayedCommands.ts'
import { findItem } from '../findItem.ts'
import { getSpectatorPlayers } from '../getSpectatorPlayers.ts'
import { isArcade } from '../isArcade.ts'
import { isSpectator } from '../isSpectator.ts'

describe('findItem', () => {
  const inv = (names: string[]) =>
    Object.fromEntries(names.map((name, i) => [`slot${i}`, { name }])) as any

  it('returns false when there is no item data', () => {
    expect(findItem({ itemName: 'item_blink', data: undefined })).toBe(false)
  })

  it('returns false when the inventory is not a full 17 slots', () => {
    expect(findItem({ itemName: 'item_blink', data: { items: inv(['item_blink']) } as any })).toBe(
      false,
    )
  })

  it('finds a matching item in the first 6 backpack slots', () => {
    const names = Array.from({ length: 17 }, (_, i) => (i === 2 ? 'item_blink' : 'empty'))
    expect(findItem({ itemName: 'item_blink', data: { items: inv(names) } as any })).toEqual([
      { name: 'item_blink' },
    ])
  })

  it('ignores items beyond slot 6 unless searchStashAlso is set', () => {
    const names = Array.from({ length: 17 }, (_, i) => (i === 7 ? 'item_blink' : 'empty'))
    expect(findItem({ itemName: 'item_blink', data: { items: inv(names) } as any })).toBe(false)
    expect(
      findItem({
        itemName: 'item_blink',
        searchStashAlso: true,
        data: { items: inv(names) } as any,
      }),
    ).toEqual([{ name: 'item_blink' }])
  })
})

describe('isArcade', () => {
  it('is false without gsi or custom game name', () => {
    expect(isArcade(undefined)).toBe(false)
    expect(isArcade({ map: { customgamename: '' } } as any)).toBe(false)
  })

  it('is true for a custom game', () => {
    expect(isArcade({ map: { customgamename: 'overthrow' } } as any)).toBe(true)
  })
})

describe('isSpectator', () => {
  it('is false for a normal player packet', () => {
    expect(isSpectator(undefined)).toBe(false)
    expect(isSpectator({ player: { team_name: 'radiant' } } as any)).toBe(false)
  })

  it('is true when spectating (team_name or team2 structure)', () => {
    expect(isSpectator({ player: { team_name: 'spectator' } } as any)).toBe(true)
    expect(isSpectator({ player: { team2: {} } } as any)).toBe(true)
  })
})

describe('getSpectatorPlayers', () => {
  it('returns [] without spectator team data', () => {
    expect(getSpectatorPlayers(undefined)).toEqual([])
    expect(getSpectatorPlayers({ hero: {} } as any)).toEqual([])
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
    expect(players[0]).toMatchObject({ heroid: 1, accountid: 111, playerid: 0, selected: true })
    expect(players[1]).toMatchObject({ heroid: 2, accountid: 222, playerid: 5, selected: false })
  })
})

describe('DelayedCommands', () => {
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
