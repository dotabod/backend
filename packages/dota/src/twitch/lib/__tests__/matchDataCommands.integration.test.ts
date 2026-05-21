import { beforeEach, describe, expect, it } from 'bun:test'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// Commands that read live match data from the (mocked) MongoDB delayedGames
// collection via state.delayedGame.
const LOBBY_TYPE_RANKED = 7

const liveGsi = () => ({ map: { matchid: '7777777777' } }) as any

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe('!spectators', () => {
  it('blocks when the stream is offline', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!spectators', clientOverrides: { stream_online: false } }),
    )
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('reports notPlaying when there is no live match id', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!spectators' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('reports missingMatchData when Mongo has no row for the match', async () => {
    state.delayedGame = null
    await commandHandler.handleMessage(
      makeMessage({ content: '!spectators', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('reports the spectator count from Mongo', async () => {
    state.delayedGame = { spectators: 137 }
    await commandHandler.handleMessage(
      makeMessage({ content: '!spectators', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('137')
  })
})

describe('!ranked', () => {
  it('reports unknownSteam when there is no steam32Id', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!ranked', clientOverrides: { steam32Id: null } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.toLowerCase()).toContain('steam')
  })

  it('reports ranked_no for a non-match lobby id of 0', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!ranked',
        clientOverrides: { gsi: { map: { matchid: '0' } } as any },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
  })

  it('reports ranked yes when the Mongo lobby_type is ranked', async () => {
    state.delayedGame = { match: { lobby_type: LOBBY_TYPE_RANKED } }
    await commandHandler.handleMessage(
      makeMessage({ content: '!ranked', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
  })

  it('reports ranked no when the Mongo lobby_type is unranked', async () => {
    state.delayedGame = { match: { lobby_type: 0 } }
    await commandHandler.handleMessage(
      makeMessage({ content: '!ranked', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
  })

  it('reports missingMatchData when Mongo has no row', async () => {
    state.delayedGame = null
    await commandHandler.handleMessage(
      makeMessage({ content: '!ranked', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })
})
