import { beforeEach, describe, expect, it } from 'vite-plus/test'
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
  it('keeps the legacy command but links the broadcaster Dotabod profile', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!opendota' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/streamer')
    expect(state.chatSayCalls[0].message).not.toContain('opendota.com')
  })

  it('still links the Dotabod profile when no steam account is connected', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!opendota', clientOverrides: { steam32Id: null } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/streamer')
  })

  it('links the broadcaster Dotabod profile from a live match when args are given', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!opendota me', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/streamer')
    expect(state.chatSayCalls[0].message).not.toContain('opendota.com')
  })
})

describe('!profile', () => {
  it('chats the broadcaster Dotabod profile with no args', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!profile' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/streamer')
    expect(state.chatSayCalls[0].message).not.toContain('dotabuff.com')
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
