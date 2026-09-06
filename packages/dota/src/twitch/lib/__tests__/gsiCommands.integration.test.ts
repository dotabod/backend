import { t } from 'i18next'
import { beforeEach, describe, expect, it } from 'vitest'

import { getHeroNameOrColor } from '../../../dota/lib/heroes.ts'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// GSI-reading commands that format output from client.gsi (no DB/network).
// hero id 1 (Anti-Mage) has aghs_desc data + an innate, so those valid-hero
// paths always echo the hero name.
const HERO_ID = 1
const heroName = getHeroNameOrColor(HERO_ID)
const notLive = t('notLive', { emote: 'PauseChamp', lng: 'en' })
const notPlaying = t('notPlaying', { emote: 'PauseChamp', lng: 'en' })
const gameNotFound = t('gameNotFound', { lng: 'en' })

const playingGsi = (extra: Record<string, unknown> = {}) =>
  ({
    hero: { id: HERO_ID },
    map: {
      game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      matchid: '7777777777',
      win_team: 'none',
    },
    player: { activity: 'playing' },
    ...extra,
  }) as any

const heroDemoGsi = () =>
  ({
    hero: { id: HERO_ID },
    map: {
      customgamename: 'hero_demo',
      game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      matchid: '0',
      win_team: 'none',
    },
    player: { accountid: 99_999, activity: 'playing' },
  }) as any

const spectatorGsi = () =>
  ({
    hero: {
      team2: { player0: { id: HERO_ID, selected_unit: true } },
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
  }) as any

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe('!xpm', () => {
  it('blocks when the stream is offline', async () => {
    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { stream_online: false }, content: '!xpm' })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notLive)
  })

  it('reports 0 xpm when there is no GSI data', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!xpm' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(
      t('xpm', { heroName: getHeroNameOrColor(0), lng: 'en', num: 0 })
    )
  })

  it('reports the player xpm from GSI', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        clientOverrides: { gsi: playingGsi({ player: { xpm: 742 } }) },
        content: '!xpm',
      })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('742')
  })
})

describe('!d2pt', () => {
  it('chats a dota2protracker build URL with the hero name', async () => {
    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { gsi: playingGsi() }, content: '!d2pt' })
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
        clientOverrides: { gsi: playingGsi({ hero: { id: 0 } }) },
        content: '!aghs',
      })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(gameNotFound)
  })

  it('echoes the hero name for a valid hero in a live match', async () => {
    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { gsi: playingGsi() }, content: '!aghs' })
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
      makeMessage({ clientOverrides: { gsi: playingGsi() }, content: '!shard' })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain(heroName)
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
        clientOverrides: {
          gsi: playingGsi({ hero: { id: 0 } }),
          gsiUpdatedAt: Date.now(),
        },
        content: '!innate',
      })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('gameNotFound', { lng: 'en' }))
  })

  it("reports the hero's innate for a valid hero in a live match", async () => {
    await commandHandler.handleMessage(
      makeMessage({
        clientOverrides: { gsi: playingGsi(), gsiUpdatedAt: Date.now() },
        content: '!innate',
      })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain(heroName)
    expect(state.chatSayCalls[0].message).toContain('Persecutor')
  })

  it.each(['!aghs', '!shard', '!innate'])(
    '%s reports notPlaying instead of using a stale hero',
    async (content) => {
      await commandHandler.handleMessage(
        makeMessage({
          clientOverrides: { gsi: playingGsi(), gsiUpdatedAt: Date.now() - 120_000 },
          content,
        })
      )
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toBe(notPlaying)
    }
  )

  it.each(['!aghs', '!shard', '!innate'])(
    '%s uses the selected hero while spectating a live match',
    async (content) => {
      await commandHandler.handleMessage(
        makeMessage({ clientOverrides: { gsi: spectatorGsi() }, content })
      )
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toContain(heroName)
    }
  )

  it.each(['!aghs', '!shard', '!innate'])(
    '%s uses the current hero in Hero Demo instead of saying not playing',
    async (content) => {
      await commandHandler.handleMessage(
        makeMessage({ clientOverrides: { gsi: heroDemoGsi() }, content })
      )
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toContain(heroName)
    }
  )
})
