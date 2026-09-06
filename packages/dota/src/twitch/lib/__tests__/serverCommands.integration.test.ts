import { t } from 'i18next'
import { beforeEach, describe, expect, it } from 'vitest'

import { flushAsync } from '../../../__tests__/sharedMocks.ts'
import { commandHandler, liveGsi, makeMessage, resetState, state } from './setupMocks.ts'

// Commands that talk to the overlay through the (stubbed) socket.io server.
// The harness injects an io whose fetchSockets() returns [], so overlay-
// dependent paths take their empty branch deterministically.

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe('!count', () => {
  it('reports gsi + overlay connection counts', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!count' }))
    expect(state.chatSayCalls).toHaveLength(1)
    // Overlay socket count is 0 (stub fetchSockets returns []) -> the _zero branch.
    expect(state.chatSayCalls[0].message).toContain(
      t('connections.overlay', { count: 0, lng: 'en' })
    )
  })
})

describe('!refresh', () => {
  it('confirms the overlay refresh for a mod', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!refresh' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('refresh', { lng: 'en' }))
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!refresh', permission: 0, userName: 'viewer' })
    )
    expect(state.chatSayCalls).toHaveLength(0)
  })
})

describe('!online / !offline', () => {
  it('only announces status when the stream is already online', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!online' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.updateCalls).toHaveLength(0)
    expect(state.socketEmitCalls).toContainEqual({
      args: ['mutate'],
      event: 'refresh-settings',
      room: 'token-abc',
    })
    expect(state.streamStatusEffectCalls).toStrictEqual(['socket'])
  })

  it('persists stream_online=false when toggling offline from an online stream', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!offline' }))
    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].values).toMatchObject({
      stream_online: false,
      stream_start_date: null,
    })
    expect(state.socketEmitCalls).toContainEqual({
      args: ['mutate'],
      event: 'refresh-settings',
      room: 'token-abc',
    })
    expect(state.streamStatusEffectCalls).toStrictEqual(['update', 'socket'])
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!online', permission: 0, userName: 'viewer' })
    )
    expect(state.chatSayCalls).toHaveLength(0)
  })
})

describe('!resetwl', () => {
  it('stores a WL-only reset marker and confirms', async () => {
    const message = makeMessage({ content: '!resetwl' })
    await commandHandler.handleMessage(message)
    await flushAsync()
    expect(state.updateCalls).toHaveLength(0)
    expect(state.upsertCalls).toHaveLength(1)
    expect(state.upsertCalls[0]).toStrictEqual({
      options: { onConflict: 'userId, key' },
      values: {
        key: 'wlResetAt',
        updated_at: expect.any(String),
        userId: 'token-abc',
        value: expect.any(String),
      },
    })
    expect(message.channel.client.settings).toContainEqual({
      key: 'wlResetAt',
      value: expect.any(String),
    })
    expect(state.emitWLUpdateCalls).toBe(1)
    expect(state.chatSayCalls).toHaveLength(2)
    expect(state.chatSayCalls[0].message).toBe(t('refresh', { lng: 'en' }))
    expect(state.chatSayCalls[1].message).toBe(t('resetwl', { channel: '#streamer', lng: 'en' }))
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!resetwl', permission: 0, userName: 'viewer' })
    )
    await flushAsync()
    expect(state.updateCalls).toHaveLength(0)
    expect(state.upsertCalls).toHaveLength(0)
  })
})

describe('!hero', () => {
  it('blocks via the onlyOnline gate when the stream is offline', async () => {
    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { stream_online: false }, content: '!hero' })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('notLive', { emote: 'PauseChamp', lng: 'en' }))
  })

  it('reports notPlaying when there is no live match id', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!hero' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('notPlaying', { emote: 'PauseChamp', lng: 'en' }))
  })

  it('uses tracked match history when no overlay socket is connected', async () => {
    state.recentList = [
      { hero_name: 'npc_dota_hero_antimage', matchId: '1', won: true },
      { hero_name: 'npc_dota_hero_antimage', matchId: '2', won: true },
      { hero_name: 'npc_dota_hero_antimage', matchId: '3', won: false },
    ]
    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { gsi: liveGsi() }, content: '!hero' })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(
      t('herostats.winrateStreamer', {
        count: 3,
        heroName: 'Anti-Mage',
        lng: 'en',
        timeperiod: t('herostats.timeperiod.days', { count: 30, lng: 'en' }),
        winrate: 67,
      })
    )
  })

  it.each([
    [
      'spectating',
      {
        hero: {
          team2: { player0: { id: 1, selected_unit: true } },
          team3: {},
        },
        map: {
          game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
          matchid: '8980144969',
          win_team: 'none',
        },
        player: {
          activity: 'watching',
          team2: { player0: { accountid: 99_999 } },
          team3: {},
          team_name: 'spectator',
        },
      },
    ],
    [
      'Hero Demo',
      {
        hero: { id: 1 },
        map: {
          customgamename: 'hero_demo',
          game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
          matchid: '0',
          win_team: 'none',
        },
        player: { accountid: 99_999, activity: 'playing' },
      },
    ],
  ])('uses the selected hero history while %s', async (_label, gsi) => {
    state.recentList = [
      { hero_name: 'npc_dota_hero_antimage', matchId: '1', won: true },
      { hero_name: 'npc_dota_hero_antimage', matchId: '2', won: false },
    ]

    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { gsi } as any, content: '!hero' })
    )

    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('Anti-Mage')
    expect(state.chatSayCalls[0].message).not.toBe(
      t('notPlaying', { emote: 'PauseChamp', lng: 'en' })
    )
  })
})
