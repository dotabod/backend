import { beforeEach, describe, expect, it } from 'bun:test'
import { t } from 'i18next'
import { commandHandler, liveGsi, makeMessage, resetState, state } from './setupMocks.ts'

// Profile-link family (opendota, profile) plus the broadcaster-only !friends.
const notLive = t('notLive', { emote: 'PauseChamp', lng: 'en' })
const notPlaying = t('notPlaying', { emote: 'PauseChamp', lng: 'en' })

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe('!opendota', () => {
  it('chats the broadcaster opendota URL with no args', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!opendota' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('opendota.com/players/99999')
  })

  it('falls back to notPlaying when there is no steam id and no live match', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!opendota', clientOverrides: { steam32Id: null } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notPlaying)
  })

  it('chats the player opendota URL from a live match when args are given', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!opendota me', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('opendota.com/players/99999')
  })
})

describe('!profile', () => {
  it('chats the broadcaster dotabuff URL with no args', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!profile' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabuff.com/players/99999')
  })

  it('blocks when the stream is offline', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!profile', clientOverrides: { stream_online: false } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notLive)
  })
})

describe('!friends', () => {
  it('reports noHero when there is no hero in GSI', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!friends', permission: 4 }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('noHero', { lng: 'en' }))
  })

  it('reports notPlaying when a hero exists but there is no live match', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!friends',
        permission: 4,
        clientOverrides: { gsi: { hero: { name: 'npc_dota_hero_antimage' } } as any },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notPlaying)
  })

  it('blocks non-broadcaster permission levels', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!friends', permission: 2, userName: 'modUser' }),
    )
    expect(state.chatSayCalls).toHaveLength(0)
  })
})
