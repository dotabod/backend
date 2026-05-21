import { beforeEach, describe, expect, it } from 'bun:test'
import { t } from 'i18next'
import { getHeroNameOrColor, withHeroLink } from '../../../dota/lib/heroes.ts'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// GSI-reading commands that format output from client.gsi (no DB/network).
// hero id 1 (Anti-Mage) has aghs_desc data + an innate, so those valid-hero
// paths always echo the hero name. dotaconstants flags every facet `deprecated`
// (including current in-game ones), so !facet ignores that flag entirely — both
// Anti-Mage and Storm Spirit (id 17) list their facets.
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

  it('lists every facet for the hero when no number is given', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!facet',
        clientOverrides: { gsi: playingGsi({ hero: { id: FACET_HERO_ID } }) },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain(facetHeroName)
    expect(state.chatSayCalls[0].message).toContain('Shock Collar')
    expect(state.chatSayCalls[0].message).toContain('Static Slide')
  })

  // Regression: every Invoker facet is flagged `deprecated: "true"` in
  // dotaconstants. The old `deprecated !== 'true'` filter zeroed the facet count
  // and returned missingMatchData ("Waiting for current match data") for ~84% of
  // heroes. We now list facets regardless of the flag.
  it('lists facets for a hero whose facets are all flagged deprecated', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!facet',
        clientOverrides: { gsi: playingGsi({ hero: { id: 74 } }) },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    const msg = state.chatSayCalls[0].message
    expect(msg).not.toBe(t('missingMatchData', { emote: 'PauseChamp', lng: 'en' }))
    expect(msg).toContain(getHeroNameOrColor(74))
    expect(msg).toContain('Scholar of Koryx')
  })

  // Regression: Drow Ranger's first facet (drow_ranger_high_ground) is a removed
  // facet that lingers in dotaconstants with an empty title. It must not render as
  // a blank "1: " entry; Sidestep is the only real facet and should be listed as 1.
  it('skips facets that have no title', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!facet',
        clientOverrides: { gsi: playingGsi({ hero: { id: 6 } }) },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    const msg = state.chatSayCalls[0].message
    expect(msg).toContain('1: Sidestep')
    expect(msg).not.toContain('2: Sidestep')
  })

  it('reports a specific facet by number', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!facet 2',
        clientOverrides: { gsi: playingGsi({ hero: { id: HERO_ID } }) },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('Mana Thirst')
  })

  it('reports the facet limit when the number exceeds the hero facet count', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!facet 9',
        clientOverrides: { gsi: playingGsi({ hero: { id: HERO_ID } }) },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(
      withHeroLink(t('facetTotalLimit', { lng: 'en', count: 2, heroName }), HERO_ID),
    )
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
