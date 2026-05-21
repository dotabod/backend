import { beforeEach, describe, expect, it } from 'bun:test'
import { getHeroNameOrColor } from '../../../dota/lib/heroes.ts'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// GSI-reading commands that format output from client.gsi (no DB/network).
// hero id 1 (Anti-Mage) has aghs_desc data, so the aghs/shard valid-hero paths
// always echo the hero name regardless of has_scepter/has_shard.
const HERO_ID = 1
const heroName = getHeroNameOrColor(HERO_ID)

const playingGsi = (extra: Record<string, unknown> = {}) =>
  ({ map: { matchid: '7777777777' }, hero: { id: HERO_ID }, player: {}, ...extra }) as any

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe('!xpm', () => {
  it('blocks when the stream is offline', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!xpm', clientOverrides: { stream_online: false } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('reports 0 xpm when there is no GSI data', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!xpm' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('0')
  })

  it('reports the player xpm from GSI', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!xpm',
        clientOverrides: { gsi: playingGsi({ player: { xpm: 742 } }) },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('742')
  })
})

describe('!d2pt', () => {
  it('chats a dota2protracker build URL with the hero name', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!d2pt', clientOverrides: { gsi: playingGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dota2protracker.com/hero/')
    expect(state.chatSayCalls[0].message).toContain(heroName)
  })
})

describe('!aghs', () => {
  it('reports notPlaying when there is no live match', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!aghs' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('reports gameNotFound when in a match but the hero is invalid', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!aghs',
        clientOverrides: { gsi: { map: { matchid: '7777777777' }, hero: { id: 0 } } as any },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.toLowerCase()).toContain('game')
  })

  it('echoes the hero name for a valid hero in a live match', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!aghs', clientOverrides: { gsi: playingGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain(heroName)
  })
})

describe('!shard', () => {
  it('reports notPlaying when there is no live match', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!shard' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('echoes the hero name for a valid hero in a live match', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!shard', clientOverrides: { gsi: playingGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain(heroName)
  })
})

describe('!facet', () => {
  it('reports notPlaying when there is no live match', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!facet' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('produces a single chat reply for a valid hero in a live match', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!facet',
        clientOverrides: { gsi: playingGsi({ hero: { id: HERO_ID, facet: 1 } }) },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.length).toBeGreaterThan(0)
  })
})

describe('!innate', () => {
  it('reports notPlaying when there is no live match', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!innate' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('reports gameNotFound when in a match but the hero is invalid', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!innate',
        clientOverrides: { gsi: { map: { matchid: '7777777777' }, hero: { id: 0 } } as any },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.toLowerCase()).toContain('game')
  })

  it('produces a single chat reply for a valid hero in a live match', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!innate', clientOverrides: { gsi: playingGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.length).toBeGreaterThan(0)
  })
})
