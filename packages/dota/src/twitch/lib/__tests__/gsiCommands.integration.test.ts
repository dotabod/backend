import { beforeEach, describe, expect, it } from 'bun:test'
import { t } from 'i18next'
import { getHeroNameOrColor } from '../../../dota/lib/heroes.ts'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// GSI-reading commands that format output from client.gsi (no DB/network).
// hero id 1 (Anti-Mage) has aghs_desc data + an innate, so those valid-hero
// paths always echo the hero name. Its facets are all flagged deprecated in
// dotaconstants, so for the !facet happy path we use Storm Spirit (id 17),
// which has a live (non-deprecated) facet.
const HERO_ID = 1
const heroName = getHeroNameOrColor(HERO_ID)
const FACET_HERO_ID = 17
const facetHeroName = getHeroNameOrColor(FACET_HERO_ID)
const notLive = t('notLive', { emote: 'PauseChamp', lng: 'en' })
const notPlaying = t('notPlaying', { emote: 'PauseChamp', lng: 'en' })
const gameNotFound = t('gameNotFound', { lng: 'en' })

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
    expect(state.chatSayCalls[0].message).toBe(notLive)
  })

  it('reports 0 xpm when there is no GSI data', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!xpm' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(
      t('xpm', { heroName: getHeroNameOrColor(0), num: 0, lng: 'en' }),
    )
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
    expect(state.chatSayCalls[0].message).toBe(notPlaying)
  })

  it('reports gameNotFound when in a match but the hero is invalid', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!aghs',
        clientOverrides: { gsi: { map: { matchid: '7777777777' }, hero: { id: 0 } } as any },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(gameNotFound)
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
    expect(state.chatSayCalls[0].message).toBe(notPlaying)
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
    expect(state.chatSayCalls[0].message).toBe(notPlaying)
  })

  it('reports the selected facet for a hero with a live facet', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!facet',
        clientOverrides: { gsi: playingGsi({ hero: { id: FACET_HERO_ID, facet: 1 } }) },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain(facetHeroName)
    expect(state.chatSayCalls[0].message).toContain('Shock Collar')
  })
})

describe('!innate', () => {
  it('reports notPlaying when there is no live match', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!innate' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notPlaying)
  })

  it('reports gameNotFound when in a match but the hero is invalid', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!innate',
        clientOverrides: { gsi: { map: { matchid: '7777777777' }, hero: { id: 0 } } as any },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('gameNotFound', { lng: 'en' }))
  })

  it("reports the hero's innate for a valid hero in a live match", async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!innate', clientOverrides: { gsi: playingGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain(heroName)
    expect(state.chatSayCalls[0].message).toContain('Persecutor')
  })
})
