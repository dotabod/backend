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
  })

  it('persists stream_online=false when toggling offline from an online stream', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!offline' }))
    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].values).toMatchObject({
      stream_online: false,
      stream_start_date: null,
    })
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!online', permission: 0, userName: 'viewer' }),
    )
    expect(state.chatSayCalls).toHaveLength(0)
  })
})

describe('!resetwl', () => {
  it('resets the stream start date and confirms', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!resetwl' }))
    await flushAsync()
    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].values).toHaveProperty('stream_start_date')
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

  it('reports overlayMissing when no overlay socket is connected', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!hero', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('overlayMissing', { command: '!hero', lng: 'en' }))
  })
})
