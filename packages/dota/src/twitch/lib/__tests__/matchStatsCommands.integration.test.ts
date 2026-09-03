import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { t } from 'i18next'
import { commandHandler, liveGsi, makeMessage, resetState, state } from './setupMocks.ts'

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
      makeMessage({ content: '!items', clientOverrides: { stream_online: false } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notLive)
  })

  it('reports notPlaying when there is no live match id', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!items' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notPlaying)
  })

  it('reports gameNotFound for a non-numeric match id', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!items',
        clientOverrides: { gsi: { map: { matchid: '0' } } as any },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('gameNotFound', { lng: 'en' }))
  })

  it('reports the Valve-disabled message for a live non-spectator match', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!items', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(valveDisabled)
  })

  it('reports delayed items for the matching account in a SourceTV game', async () => {
    state.delayedGame = {
      match: { match_id: '7777777777', server_steam_id: '90292108836096020' },
      players: [
        { accountid: 111, heroid: 2 },
        { accountid: 99999, heroid: 1 },
      ],
    }
    state.steamSocketResponse = {
      match: { match_id: '7777777777', server_steam_id: '90292108836096020' },
      teams: [
        {
          players: [
            { accountid: 111, team_slot: 0, items: [50] },
            { accountid: 99999, team_slot: 1, items: [1, 16, 16] },
          ],
        },
        { players: [] },
      ],
    }

    await commandHandler.handleMessage(
      makeMessage({ content: '!items', clientOverrides: { gsi: liveGsi() } }),
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
      makeMessage({ content: '!stats', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(valveDisabled)
  })

  it('routes the !kda alias to the same handler', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!kda', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(valveDisabled)
  })

  it('reports delayed stats for the matching account in a SourceTV game', async () => {
    state.delayedGame = {
      match: { match_id: '7777777777', server_steam_id: '90292108836096020' },
      players: [
        { accountid: 111, heroid: 2 },
        { accountid: 99999, heroid: 1 },
      ],
    }
    state.steamSocketResponse = {
      match: { match_id: '7777777777', server_steam_id: '90292108836096020' },
      teams: [
        {
          players: [
            {
              accountid: 111,
              team_slot: 0,
              kill_count: 0,
              death_count: 9,
              assists_count: 1,
              lh_count: 10,
              denies_count: 0,
              gold: 100,
              net_worth: 900,
              level: 4,
            },
            {
              accountid: 99999,
              team_slot: 1,
              kill_count: 7,
              death_count: 2,
              assists_count: 11,
              lh_count: 184,
              denies_count: 13,
              gold: 2400,
              net_worth: 12_345,
              level: 18,
            },
          ],
        },
        { players: [] },
      ],
    }

    await commandHandler.handleMessage(
      makeMessage({ content: '!stats', clientOverrides: { gsi: liveGsi() } }),
    )
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain(
      'KDA 7/2/11 · LH 184 · DN 13 · G 2400 · NW 12345 · LVL 18',
    )
  })
})
