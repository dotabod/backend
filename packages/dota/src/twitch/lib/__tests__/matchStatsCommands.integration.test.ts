import { beforeEach, describe, expect, it } from 'bun:test'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// !items and !stats read live player data. Since ENABLE_SPECTATE_FRIEND_GAME
// is false (Valve disabled the live-spectate proto), the non-spectator path
// short-circuits to the "Valve disabled" message before touching Redis/steam.
const liveGsi = () =>
  ({ map: { matchid: '7777777777' }, player: { accountid: 99999 }, hero: { id: 1 } }) as any

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
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('reports notPlaying when there is no live match id', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!items' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('reports gameNotFound for a non-numeric match id', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!items',
        clientOverrides: { gsi: { map: { matchid: '0' } } as any },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.toLowerCase()).toContain('game')
  })

  it('reports the Valve-disabled message for a live non-spectator match', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!items', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('Valve disabled')
  })
})

describe('!stats', () => {
  it('reports notPlaying when there is no live match id', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!stats' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('reports the Valve-disabled message for a live non-spectator match', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!stats', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('Valve disabled')
  })

  it('routes the !kda alias to the same handler', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!kda', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('Valve disabled')
  })
})
