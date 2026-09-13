import { t } from 'i18next'
import { beforeEach, describe, expect, it } from 'vitest'

import { createPacketStub } from '../../../__tests__/shared-mocks.ts'
import { commandHandler, liveGsi, makeMessage, resetState, state } from './setup-mocks.ts'

// !items and !stats read live player data. Ordinary pubs still stop at the disabled
// spectate-friend path, while SourceTV matches can use the server_steam_id already
// published by Valve to request delayed realtime stats.
const valveDisabled = t('matchDataValveDisabled', { lng: 'en' })
const notLive = t('notLive', { emote: 'PauseChamp', lng: 'en' })
const notPlaying = t('notPlaying', { emote: 'PauseChamp', lng: 'en' })

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe('!items', () => {
  it('blocks when the stream is offline', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        clientOverrides: { stream_online: false },
        content: '!items',
      })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notLive)
  })

  it('reports notPlaying when there is no live match id', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!items' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notPlaying)
  })

  it('rejects an unknown hero argument with the active match hero list', async () => {
    state.delayedGame = {
      match: { match_id: '7777777777', server_steam_id: '90292108836096020' },
      players: [
        { accountid: 111, heroid: 2 },
        { accountid: 99_999, heroid: 1 },
      ],
    }

    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { gsi: liveGsi() }, content: '!item distiller' })
    )

    expect(state.chatSayCalls).toHaveLength(1)
    const message = state.chatSayCalls[0].message
    expect(message).toContain('Invalid hero specified')
    expect(message).toContain('Axe')
    expect(message).toContain('Anti-Mage')
    expect(message.trimEnd().endsWith('from')).toBe(false)
  })

  it('rejects a globally valid hero that is not in the current match', async () => {
    state.delayedGame = {
      match: { match_id: '7777777777', server_steam_id: '90292108836096020' },
      players: [
        { accountid: 111, heroid: 2 },
        { accountid: 99_999, heroid: 1 },
      ],
    }

    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { gsi: liveGsi() }, content: '!items pudge' })
    )

    expect(state.chatSayCalls).toHaveLength(1)
    const message = state.chatSayCalls[0].message
    expect(message).toContain('Invalid hero specified')
    expect(message).toContain('Axe')
    expect(message).toContain('Anti-Mage')
    expect(message.trimEnd().endsWith('from')).toBe(false)
  })

  it('reports gameNotFound for a non-numeric match id', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        clientOverrides: { gsi: createPacketStub({ map: { matchid: '0' } }) },
        content: '!items',
      })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('gameNotFound', { lng: 'en' }))
  })

  it('reports the Valve-disabled message for a live non-spectator match', async () => {
    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { gsi: liveGsi() }, content: '!items' })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(valveDisabled)
  })

  it('reports delayed items for the matching account in a SourceTV game', async () => {
    state.delayedGame = {
      match: { match_id: '7777777777', server_steam_id: '90292108836096020' },
      players: [
        { accountid: 111, heroid: 2 },
        { accountid: 99_999, heroid: 1 },
      ],
    }
    state.steamSocketResponse = {
      match: { match_id: '7777777777', server_steam_id: '90292108836096020' },
      teams: [
        {
          players: [
            { accountid: 111, items: [50], team_slot: 0 },
            { accountid: 99_999, items: [1, 16, 16], team_slot: 1 },
          ],
        },
        { players: [] },
      ],
    }

    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { gsi: liveGsi() }, content: '!items' })
    )
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('Blink Dagger · Iron Branch x2')
  })
})

describe('!stats', () => {
  it('reports notPlaying when there is no live match id', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!stats' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notPlaying)
  })

  it('reports the Valve-disabled message for a live non-spectator match', async () => {
    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { gsi: liveGsi() }, content: '!stats' })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(valveDisabled)
  })

  it('routes the !kda alias to the same handler', async () => {
    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { gsi: liveGsi() }, content: '!kda' })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(valveDisabled)
  })

  it('reports delayed stats for the matching account in a SourceTV game', async () => {
    state.delayedGame = {
      match: { match_id: '7777777777', server_steam_id: '90292108836096020' },
      players: [
        { accountid: 111, heroid: 2 },
        { accountid: 99_999, heroid: 1 },
      ],
    }
    state.steamSocketResponse = {
      match: { match_id: '7777777777', server_steam_id: '90292108836096020' },
      teams: [
        {
          players: [
            {
              accountid: 111,
              assists_count: 1,
              death_count: 9,
              denies_count: 0,
              gold: 100,
              kill_count: 0,
              level: 4,
              lh_count: 10,
              net_worth: 900,
              team_slot: 0,
            },
            {
              accountid: 99_999,
              assists_count: 11,
              death_count: 2,
              denies_count: 13,
              gold: 2400,
              kill_count: 7,
              level: 18,
              lh_count: 184,
              net_worth: 12_345,
              team_slot: 1,
            },
          ],
        },
        { players: [] },
      ],
    }

    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { gsi: liveGsi() }, content: '!stats' })
    )
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain(
      'KDA 7/2/11 · LH 184 · DN 13 · G 2400 · NW 12345 · LVL 18'
    )
  })
})
