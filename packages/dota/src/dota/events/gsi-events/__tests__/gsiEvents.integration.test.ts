import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { t } from 'i18next'
import { flushAsync } from '../../../../__tests__/sharedMocks.ts'
import { getHeroNameOrColor } from '../../../lib/heroes.ts'
import {
  events,
  gsiHandlers,
  gsiState,
  installGsiMocks,
  makeGsiHandler,
  registerHandler,
  resetGsiState,
} from './gsiMocks.ts'

// Drives GSI event handlers via `events.emit(...)` and asserts on the
// captured side effects (chat output, redis writes, socket emits).
// These complement the live-Supabase integration tests in
// `event.aegis.test.ts` / `map.win_team.test.ts` which hit a real DB.

beforeEach(() => {
  resetGsiState()
  gsiHandlers.clear()
  installGsiMocks()
})

describe('event:aegis_picked_up', () => {
  it('writes aegis state to redis and chats the pickup message', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.matchPlayers = [{ heroid: 5, accountid: 99999, playerid: 0 }]

    events.emit('event:aegis_picked_up', { player_id: 0, game_time: 600 }, handler.getToken())
    await flushAsync()

    expect(gsiState.redisJsonSetCalls).toHaveLength(1)
    expect(gsiState.redisJsonSetCalls[0].key).toBe(`${handler.getToken()}:aegis`)
    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message.toLowerCase()).toContain('aegis')
  })

  it('uses the player-slot color when sub-8500 and no hero is resolved', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    // No roster (delayedGames no longer carries heroes) → falls back to color.
    gsiState.matchPlayers = []

    events.emit('event:aegis_picked_up', { player_id: 8, game_time: 600 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('aegis.pickup', { lng: 'en', heroName: getHeroNameOrColor(0, 8) }),
    )
    expect(gsiState.chatSayCalls[0].message).toContain('Green')
  })

  it('does not guess a color when 8500+ and no hero is resolved', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = []

    events.emit('event:aegis_picked_up', { player_id: 8, game_time: 600 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(t('aegis.pickupUnknown', { lng: 'en' }))
    expect(gsiState.chatSayCalls[0].message).not.toContain('Green')
  })

  // Regression: 8500+ with a 10-row roster where playerids are all null (Vision
  // returned heroes without draft alignment) — pre-fix the gate `heroid || !high`
  // emitted `getHeroNameOrColor(matchPlayers[3].heroid, 3)` since `heroid` was
  // truthy at the array-index fallback, naming the wrong hero on stream.
  it('does not name a hero at 8500+ when the roster has heroes but the player_id is unmatched', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = Array.from({ length: 10 }, (_, i) => ({
      heroid: 10 + i,
      accountid: 100 + i,
      playerid: null,
    }))

    events.emit('event:aegis_picked_up', { player_id: 3, game_time: 600 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(t('aegis.pickupUnknown', { lng: 'en' }))
    expect(gsiState.chatSayCalls[0].message).not.toContain(getHeroNameOrColor(13, 3))
  })

  it('uses the snatched message when the aegis was snatched', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.matchPlayers = [{ heroid: 5, accountid: 99999, playerid: 0 }]

    events.emit(
      'event:aegis_picked_up',
      { player_id: 0, game_time: 600, snatched: true },
      handler.getToken(),
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('aegis.snatched', { emote: 'PepeLaugh', lng: 'en', heroName: getHeroNameOrColor(5, 0) }),
    )
    // snatched flag must survive the handler→redis→message wiring
    expect((gsiState.redisJsonSetCalls[0].value as { snatched: boolean }).snatched).toBe(true)
  })

  it('skips when stream is offline', async () => {
    const handler = makeGsiHandler({
      client: { ...makeGsiHandler().client, stream_online: false },
    })
    registerHandler(handler)

    events.emit('event:aegis_picked_up', { player_id: 0, game_time: 600 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
    expect(gsiState.redisJsonSetCalls).toHaveLength(0)
  })

  it('skips when not playing a real match (spectator)', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.player.activity = 'observing'
    registerHandler(handler)

    events.emit('event:aegis_picked_up', { player_id: 0, game_time: 600 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })
})

describe('event:aegis_denied', () => {
  it('chats the deny message', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.matchPlayers = [{ heroid: 5, accountid: 99999, playerid: 0 }]

    events.emit('event:aegis_denied', { player_id: 0, game_time: 600 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('aegis.denied', { lng: 'en', heroName: getHeroNameOrColor(5, 0), emote: 'ICANT' }),
    )
  })

  it('uses the player-slot color when sub-8500 and no hero is resolved', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.matchPlayers = []

    events.emit('event:aegis_denied', { player_id: 8, game_time: 600 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('aegis.denied', { lng: 'en', heroName: getHeroNameOrColor(0, 8), emote: 'ICANT' }),
    )
    expect(gsiState.chatSayCalls[0].message).toContain('Green')
  })

  it('does not guess a color when 8500+ and no hero is resolved', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = []

    events.emit('event:aegis_denied', { player_id: 8, game_time: 600 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('aegis.deniedUnknown', { lng: 'en', emote: 'ICANT' }),
    )
    expect(gsiState.chatSayCalls[0].message).not.toContain('Green')
  })

  it('does not name a hero at 8500+ when the roster has heroes but the player_id is unmatched', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = Array.from({ length: 10 }, (_, i) => ({
      heroid: 10 + i,
      accountid: 100 + i,
      playerid: null,
    }))

    events.emit('event:aegis_denied', { player_id: 3, game_time: 600 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('aegis.deniedUnknown', { lng: 'en', emote: 'ICANT' }),
    )
    expect(gsiState.chatSayCalls[0].message).not.toContain(getHeroNameOrColor(13, 3))
  })
})

describe('event:roshan_killed', () => {
  it('writes roshan state to redis with incremented count', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.redisJson[`${handler.getToken()}:roshan`] = { count: 2 }

    events.emit('event:roshan_killed', { game_time: 600 }, handler.getToken())
    await flushAsync()

    expect(gsiState.redisJsonSetCalls).toHaveLength(1)
    expect((gsiState.redisJsonSetCalls[0].value as { count: number }).count).toBe(3)
  })

  it('halves the respawn window in turbo mode (gameMode 23)', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.redisGet[`${handler.getToken()}:matchId`] = '7777777777'
    gsiState.redisGet['7777777777:token-gsi-1:gameMode'] = '23'

    events.emit('event:roshan_killed', { game_time: 600 }, handler.getToken())
    await flushAsync()

    const value = gsiState.redisJsonSetCalls[0].value as { minS: number; maxS: number }
    // Non-turbo: minS = 8min, maxS = 11min. Turbo (gameMode 23) halves both.
    expect(value.minS).toBe(240)
    expect(value.maxS).toBe(330)
  })

  it('skips when stream is offline', async () => {
    const handler = makeGsiHandler({
      client: { ...makeGsiHandler().client, stream_online: false },
    })
    registerHandler(handler)

    events.emit('event:roshan_killed', { game_time: 600 }, handler.getToken())
    await flushAsync()

    expect(gsiState.redisJsonSetCalls).toHaveLength(0)
    expect(gsiState.chatSayCalls).toHaveLength(0)
  })
})

describe('map:paused', () => {
  it('emits the paused event to the socket and chats when paused=true', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)

    events.emit('map:paused', true, handler.getToken())
    await flushAsync()

    expect(gsiState.ioEmitCalls).toHaveLength(1)
    expect(gsiState.ioEmitCalls[0]).toMatchObject({ event: 'paused', payload: true })
    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('chatters.pause', { emote: 'PauseChamp', lng: 'en' }),
    )
  })

  it('emits socket but no chat when paused=false', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)

    events.emit('map:paused', false, handler.getToken())
    await flushAsync()

    expect(gsiState.ioEmitCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls).toHaveLength(0)
  })

  it('skips entirely when stream is offline', async () => {
    const handler = makeGsiHandler({
      client: { ...makeGsiHandler().client, stream_online: false },
    })
    registerHandler(handler)

    events.emit('map:paused', true, handler.getToken())
    await flushAsync()

    expect(gsiState.ioEmitCalls).toHaveLength(0)
    expect(gsiState.chatSayCalls).toHaveLength(0)
  })
})

describe('map:win_team', () => {
  it('calls closeBets with the winning team', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)

    events.emit('map:win_team', 'radiant', handler.getToken())
    await flushAsync()

    expect(handler.closeBetsCalls).toEqual(['radiant'])
  })

  it('skips closeBets when not in a playable match', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.player.activity = 'observing'
    registerHandler(handler)

    events.emit('map:win_team', 'dire', handler.getToken())
    await flushAsync()

    expect(handler.closeBetsCalls).toEqual([])
  })
})

describe('event:tip', () => {
  it('chats the tip-to-me message when the local player is the receiver', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.matchPlayers = [
      { heroid: 1, accountid: 11, playerid: 0 },
      { heroid: 2, accountid: 22, playerid: 1 },
    ]
    // local player is at slot 1 (the receiver in this tip).
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '1'

    events.emit(
      'event:tip',
      { sender_player_id: 0, receiver_player_id: 1, player_id: 0, game_time: 600 },
      handler.getToken(),
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('tip.from', { emote: 'ICANT', lng: 'en', heroName: getHeroNameOrColor(1, 0) }),
    )
  })

  it('chats the tip-from-me message when the local player is the sender', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.matchPlayers = [
      { heroid: 1, accountid: 11, playerid: 0 },
      { heroid: 2, accountid: 22, playerid: 1 },
    ]
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '0'

    events.emit(
      'event:tip',
      { sender_player_id: 0, receiver_player_id: 1, player_id: 0, game_time: 600 },
      handler.getToken(),
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('tip.to', { emote: 'PepeLaugh', lng: 'en', heroName: getHeroNameOrColor(2, 1) }),
    )
  })

  it('omits the tipper name when 8500+ and no hero is resolved', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = []
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '1'

    events.emit(
      'event:tip',
      { sender_player_id: 0, receiver_player_id: 1, game_time: 600 },
      handler.getToken(),
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('tip.fromUnknown', { emote: 'ICANT', lng: 'en' }),
    )
  })

  it('omits the tipped name when 8500+ sender (local) and no hero is resolved', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = []
    // local player is the sender (slot 0)
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '0'

    events.emit(
      'event:tip',
      { sender_player_id: 0, receiver_player_id: 1, game_time: 600 },
      handler.getToken(),
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('tip.toUnknown', { emote: 'PepeLaugh', lng: 'en' }),
    )
  })

  it('omits the tipper name at 8500+ when the roster has heroes but the sender is unmatched', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = Array.from({ length: 10 }, (_, i) => ({
      heroid: 10 + i,
      accountid: 100 + i,
      playerid: null,
    }))
    // local player is the receiver (slot 1)
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '1'

    events.emit(
      'event:tip',
      { sender_player_id: 3, receiver_player_id: 1, game_time: 600 },
      handler.getToken(),
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('tip.fromUnknown', { emote: 'ICANT', lng: 'en' }),
    )
    expect(gsiState.chatSayCalls[0].message).not.toContain(getHeroNameOrColor(13, 3))
  })

  it('omits the tipped name at 8500+ when the receiver is unmatched (local player is sender)', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = Array.from({ length: 10 }, (_, i) => ({
      heroid: 10 + i,
      accountid: 100 + i,
      playerid: null,
    }))
    // local player is the sender (slot 0)
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '0'

    events.emit(
      'event:tip',
      { sender_player_id: 0, receiver_player_id: 4, game_time: 600 },
      handler.getToken(),
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('tip.toUnknown', { emote: 'PepeLaugh', lng: 'en' }),
    )
    expect(gsiState.chatSayCalls[0].message).not.toContain(getHeroNameOrColor(14, 4))
  })
})

describe('event:bounty_rune_pickup', () => {
  it('chats a bounty pickup for the local team within the 2-minute window', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.map.clock_time = 60
    registerHandler(handler)
    gsiState.matchPlayers = [{ heroid: 1, accountid: 11, playerid: 0 }]
    gsiState.redisGet[`${handler.client.token}:playingTeam`] = 'radiant'

    events.emit(
      'event:bounty_rune_pickup',
      { player_id: 0, team: 'radiant', bounty_value: 40, game_time: 60 },
      handler.getToken(),
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('bounties.pickup', {
        emote: 'EZ Clap',
        emote2: 'SeemsGood',
        lng: 'en',
        bountyValue: 40,
        totalBounties: 1,
        heroNames: getHeroNameOrColor(1, 0),
      }),
    )
  })

  it('skips a bounty when the picker has no resolved hero (no color guess)', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.map.clock_time = 60
    registerHandler(handler)
    // roster present but the slot has no heroid (delayedGames is heroless now)
    gsiState.matchPlayers = [{ heroid: undefined as unknown as number, accountid: 11, playerid: 0 }]
    gsiState.redisGet[`${handler.client.token}:playingTeam`] = 'radiant'

    events.emit(
      'event:bounty_rune_pickup',
      { player_id: 0, team: 'radiant', bounty_value: 40, game_time: 60 },
      handler.getToken(),
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })

  it('skips bounties picked up after the 2-minute window', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.map.clock_time = 200
    registerHandler(handler)
    gsiState.matchPlayers = [{ heroid: 1, accountid: 11, playerid: 0 }]
    gsiState.redisGet[`${handler.client.token}:playingTeam`] = 'radiant'

    events.emit(
      'event:bounty_rune_pickup',
      { player_id: 0, team: 'radiant', bounty_value: 40, game_time: 200 },
      handler.getToken(),
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })

  it('skips an 8500+ bounty when the roster has heroes but the picker is unmatched', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    handler.client.gsi.map.clock_time = 60
    registerHandler(handler)
    gsiState.matchPlayers = Array.from({ length: 10 }, (_, i) => ({
      heroid: 10 + i,
      accountid: 100 + i,
      playerid: null,
    }))
    gsiState.redisGet[`${handler.client.token}:playingTeam`] = 'radiant'

    events.emit(
      'event:bounty_rune_pickup',
      { player_id: 3, team: 'radiant', bounty_value: 40, game_time: 60 },
      handler.getToken(),
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })

  it('skips bounties picked up by the opposing team', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.map.clock_time = 60
    registerHandler(handler)
    gsiState.matchPlayers = [{ heroid: 1, accountid: 11, playerid: 0 }]
    gsiState.redisGet[`${handler.client.token}:playingTeam`] = 'radiant'

    events.emit(
      'event:bounty_rune_pickup',
      { player_id: 0, team: 'dire', bounty_value: 40, game_time: 60 },
      handler.getToken(),
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })
})

describe('hero:smoked', () => {
  it('chats the smoked message when isSmoked=true', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.redisGet[`${handler.getToken()}:playingHero`] = 'npc_dota_hero_lina'

    events.emit('hero:smoked', true, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toContain('Shush')
  })

  it('does not chat when isSmoked=false (smoke wears off)', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)

    events.emit('hero:smoked', false, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })
})

describe('player:kill_streak', () => {
  it('chats killstreak.won when streak rises above 3', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.redisGet[`${handler.getToken()}:playingHero`] = 'npc_dota_hero_lina'

    events.emit('player:kill_streak', 4, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toContain('POGGIES')
  })

  it('chats killstreak.lost when the previous streak was >= 3 and current is 0', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.previously = { player: { kill_streak: 5 } }
    registerHandler(handler)

    events.emit('player:kill_streak', 0, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('killstreak.lost', { emote: 'BibleThump', count: 5, heroName: 'Lina', lng: 'en' }),
    )
  })

  it('skips streaks of 3 or less (no chat output)', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)

    events.emit('player:kill_streak', 2, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })
})
