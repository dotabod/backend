import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { t } from 'i18next'
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
      t('connections.overlay', { lng: 'en', count: 0 }),
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
      makeMessage({ content: '!refresh', permission: 0, userName: 'viewer' }),
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
      room: 'token-abc',
      event: 'refresh-settings',
      args: ['mutate'],
    })
    expect(state.streamStatusEffectCalls).toEqual(['socket'])
  })

  it('persists stream_online=false when toggling offline from an online stream', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!offline' }))
    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].values).toMatchObject({
      stream_online: false,
      stream_start_date: null,
    })
    expect(state.socketEmitCalls).toContainEqual({
      room: 'token-abc',
      event: 'refresh-settings',
      args: ['mutate'],
    })
    expect(state.streamStatusEffectCalls).toEqual(['update', 'socket'])
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!online', permission: 0, userName: 'viewer' }),
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
    expect(state.upsertCalls[0]).toEqual({
      values: {
        key: 'wlResetAt',
        userId: 'token-abc',
        updated_at: expect.any(String),
        value: expect.any(String),
      },
      options: { onConflict: 'userId, key' },
    })
    expect(message.channel.client.settings).toContainEqual({
      key: 'wlResetAt',
      value: expect.any(String),
    })
    expect(state.emitWLUpdateCalls).toBe(1)
    expect(state.chatSayCalls).toHaveLength(2)
    expect(state.chatSayCalls[0].message).toBe(t('refresh', { lng: 'en' }))
    expect(state.chatSayCalls[1].message).toBe(t('resetwl', { lng: 'en', channel: '#streamer' }))
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!resetwl', permission: 0, userName: 'viewer' }),
    )
    await flushAsync()
    expect(state.updateCalls).toHaveLength(0)
    expect(state.upsertCalls).toHaveLength(0)
  })
})

describe('!hero', () => {
  it('blocks via the onlyOnline gate when the stream is offline', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!hero', clientOverrides: { stream_online: false } }),
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
      { matchId: '1', hero_name: 'npc_dota_hero_antimage', won: true },
      { matchId: '2', hero_name: 'npc_dota_hero_antimage', won: true },
      { matchId: '3', hero_name: 'npc_dota_hero_antimage', won: false },
    ]
    await commandHandler.handleMessage(
      makeMessage({ content: '!hero', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(
      t('herostats.winrateStreamer', {
        lng: 'en',
        heroName: 'Anti-Mage',
        winrate: 67,
        timeperiod: t('herostats.timeperiod.days', { count: 30, lng: 'en' }),
        count: 3,
      }),
    )
  })

  it.each([
    [
      'spectating',
      {
        map: {
          matchid: '8980144969',
          game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
          win_team: 'none',
        },
        player: {
          activity: 'watching',
          team_name: 'spectator',
          team2: { player0: { accountid: 99999 } },
          team3: {},
        },
        hero: {
          team2: { player0: { id: 1, selected_unit: true } },
          team3: {},
        },
      },
    ],
    [
      'Hero Demo',
      {
        map: {
          customgamename: 'hero_demo',
          matchid: '0',
          game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
          win_team: 'none',
        },
        player: { accountid: 99999, activity: 'playing' },
        hero: { id: 1 },
      },
    ],
  ])('uses the selected hero history while %s', async (_label, gsi) => {
    state.recentList = [
      { matchId: '1', hero_name: 'npc_dota_hero_antimage', won: true },
      { matchId: '2', hero_name: 'npc_dota_hero_antimage', won: false },
    ]

    await commandHandler.handleMessage(
      makeMessage({ content: '!hero', clientOverrides: { gsi } as any }),
    )

    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('Anti-Mage')
    expect(state.chatSayCalls[0].message).not.toBe(
      t('notPlaying', { emote: 'PauseChamp', lng: 'en' }),
    )
  })
})
