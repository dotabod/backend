import { t } from 'i18next'
import { beforeEach, describe, expect, it } from 'vitest'

import { createPacketStub, flushAsync } from '../../../../__tests__/shared-mocks.ts'
import { getHeroNameOrColor } from '../../../lib/heroes.ts'
import {
  events,
  gsiHandlers,
  gsiState,
  installGsiMocks,
  makeGsiHandler,
  registerHandler,
  resetGsiState,
} from './gsi-mocks.ts'

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
    gsiState.matchPlayers = [{ accountid: 99_999, heroid: 5, playerid: 0 }]

    events.emit('event:aegis_picked_up', { game_time: 600, player_id: 0 }, handler.getToken())
    await flushAsync()

    expect(gsiState.redisJsonSetCalls).toHaveLength(1)
    expect(gsiState.redisJsonSetCalls[0].key).toBe(`${handler.getToken()}:aegis`)
    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message.toLowerCase()).toContain('aegis')
  })

  it('stores the raw event player ID separately from normalized display placement', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.matchPlayers = [
      { accountid: 101, heroid: 1, playerid: 0 },
      { accountid: 102, heroid: 2, playerid: 1 },
      { accountid: 99_999, heroid: 5, playerid: 8 },
    ]
    handler.client.gsi.player.kill_list = { victimid_8: 2 }

    events.emit('event:aegis_picked_up', { game_time: 600, player_id: 8 }, handler.getToken())
    await flushAsync()

    expect(gsiState.redisJsonSetCalls[0].value).toMatchObject({
      eventPlayerId: 8,
      holderKillCountAtPickup: 2,
      playerId: 2,
    })
    expect(gsiState.ioEmitCalls[0].payload).not.toHaveProperty('eventPlayerId')
    expect(gsiState.ioEmitCalls[0].payload).not.toHaveProperty('holderKillCountAtPickup')
  })

  it('uses the player-slot color when sub-8500 and no hero is resolved', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    // No roster (delayedGames no longer carries heroes) → falls back to color.
    gsiState.matchPlayers = []

    events.emit('event:aegis_picked_up', { game_time: 600, player_id: 8 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('aegis.pickup', { heroName: getHeroNameOrColor(0, 8), lng: 'en' })
    )
    expect(gsiState.chatSayCalls[0].message).toContain('Green')
  })

  it('does not guess a color when 8500+ and no hero is resolved', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = []

    events.emit('event:aegis_picked_up', { game_time: 600, player_id: 8 }, handler.getToken())
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
      accountid: 100 + i,
      heroid: 10 + i,
      playerid: null,
    }))

    events.emit('event:aegis_picked_up', { game_time: 600, player_id: 3 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(t('aegis.pickupUnknown', { lng: 'en' }))
    expect(gsiState.chatSayCalls[0].message).not.toContain(getHeroNameOrColor(13, 3))
  })

  it('uses the snatched message when the aegis was snatched', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.matchPlayers = [{ accountid: 99_999, heroid: 5, playerid: 0 }]

    events.emit(
      'event:aegis_picked_up',
      { game_time: 600, player_id: 0, snatched: true },
      handler.getToken()
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('aegis.snatched', { emote: 'PepeLaugh', heroName: getHeroNameOrColor(5, 0), lng: 'en' })
    )
    // snatched flag must survive the handler→redis→message wiring
    expect((gsiState.redisJsonSetCalls[0].value as { snatched: boolean }).snatched).toBeTruthy()
  })

  it('skips when stream is offline', async () => {
    const handler = makeGsiHandler({
      client: { ...makeGsiHandler().client, stream_online: false },
    })
    registerHandler(handler)

    events.emit('event:aegis_picked_up', { game_time: 600, player_id: 0 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
    expect(gsiState.redisJsonSetCalls).toHaveLength(0)
  })

  it('skips when not playing a real match (spectator)', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.player.activity = 'observing'
    registerHandler(handler)

    events.emit('event:aegis_picked_up', { game_time: 600, player_id: 0 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })
})

describe('player:kill_list', () => {
  it('clears aegis when the holder victim key gains a positive kill count', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    const key = `${handler.getToken()}:aegis`
    gsiState.redisJson[key] = {
      eventPlayerId: 8,
      expireDate: new Date(),
      expireS: 300,
      expireTime: '15:00',
      heroName: 'Pudge',
      holderKillCountAtPickup: 0,
      playerId: 2,
      snatched: false,
    }

    events.emit('player:kill_list', { victimid_8: 1 }, handler.getToken())
    await flushAsync()

    expect(gsiState.redisJsonDelCalls).toStrictEqual([key])
    expect(gsiState.ioEmitCalls).toStrictEqual([
      { event: 'aegis-picked-up', payload: {}, token: handler.getToken() },
    ])
  })

  it('does not clear aegis for an unrelated kill count equal to the normalized player ID', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    const key = `${handler.getToken()}:aegis`
    gsiState.redisJson[key] = {
      eventPlayerId: 8,
      expireDate: new Date(),
      expireS: 300,
      expireTime: '15:00',
      heroName: 'Pudge',
      holderKillCountAtPickup: 0,
      playerId: 2,
      snatched: false,
    }

    events.emit('player:kill_list', { victimid_3: 2 }, handler.getToken())
    await flushAsync()

    expect(gsiState.redisJsonDelCalls).toHaveLength(0)
    expect(gsiState.ioEmitCalls).toHaveLength(0)
  })

  it('leaves legacy aegis records without an event player ID to expire normally', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    const key = `${handler.getToken()}:aegis`
    gsiState.redisJson[key] = {
      expireDate: new Date(),
      expireS: 300,
      expireTime: '15:00',
      heroName: 'Pudge',
      playerId: 2,
      snatched: false,
    }

    events.emit('player:kill_list', { victimid_2: 1 }, handler.getToken())
    await flushAsync()

    expect(gsiState.redisJsonDelCalls).toHaveLength(0)
    expect(gsiState.ioEmitCalls).toHaveLength(0)
  })

  it('does not guess for aegis records without a pickup kill-count baseline', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    const key = `${handler.getToken()}:aegis`
    gsiState.redisJson[key] = {
      eventPlayerId: 8,
      expireDate: new Date(),
      expireS: 300,
      expireTime: '15:00',
      heroName: 'Pudge',
      playerId: 2,
      snatched: false,
    }

    events.emit('player:kill_list', { victimid_8: 2 }, handler.getToken())
    await flushAsync()

    expect(gsiState.redisJsonDelCalls).toHaveLength(0)
    expect(gsiState.ioEmitCalls).toHaveLength(0)
  })

  it('ignores a reconnect snapshot equal to the holder kill count at pickup', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    const key = `${handler.getToken()}:aegis`
    gsiState.redisJson[key] = {
      eventPlayerId: 8,
      expireDate: new Date(),
      expireS: 300,
      expireTime: '15:00',
      heroName: 'Pudge',
      holderKillCountAtPickup: 2,
      playerId: 2,
      snatched: false,
    }

    events.emit('player:kill_list', { victimid_8: 2 }, handler.getToken())
    await flushAsync()

    expect(gsiState.redisJsonDelCalls).toHaveLength(0)
    expect(gsiState.ioEmitCalls).toHaveLength(0)
  })

  it('does not emit an overlay clear when redis deletion fails', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    const key = `${handler.getToken()}:aegis`
    gsiState.redisJson[key] = {
      eventPlayerId: 8,
      expireDate: new Date(),
      expireS: 300,
      expireTime: '15:00',
      heroName: 'Pudge',
      holderKillCountAtPickup: 0,
      playerId: 2,
      snatched: false,
    }
    gsiState.redisJsonDelError = new Error('redis unavailable')

    events.emit('player:kill_list', { victimid_8: 1 }, handler.getToken())
    await flushAsync()

    expect(gsiState.redisJsonDelCalls).toStrictEqual([key])
    expect(gsiState.ioEmitCalls).toHaveLength(0)
  })
})

describe('event:aegis_denied', () => {
  it('chats the deny message', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.matchPlayers = [{ accountid: 99_999, heroid: 5, playerid: 0 }]

    events.emit('event:aegis_denied', { game_time: 600, player_id: 0 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('aegis.denied', { emote: 'ICANT', heroName: getHeroNameOrColor(5, 0), lng: 'en' })
    )
  })

  it('uses the player-slot color when sub-8500 and no hero is resolved', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.matchPlayers = []

    events.emit('event:aegis_denied', { game_time: 600, player_id: 8 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('aegis.denied', { emote: 'ICANT', heroName: getHeroNameOrColor(0, 8), lng: 'en' })
    )
    expect(gsiState.chatSayCalls[0].message).toContain('Green')
  })

  it('does not guess a color when 8500+ and no hero is resolved', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = []

    events.emit('event:aegis_denied', { game_time: 600, player_id: 8 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('aegis.deniedUnknown', { emote: 'ICANT', lng: 'en' })
    )
    expect(gsiState.chatSayCalls[0].message).not.toContain('Green')
  })

  it('does not name a hero at 8500+ when the roster has heroes but the player_id is unmatched', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = Array.from({ length: 10 }, (_, i) => ({
      accountid: 100 + i,
      heroid: 10 + i,
      playerid: null,
    }))

    events.emit('event:aegis_denied', { game_time: 600, player_id: 3 }, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('aegis.deniedUnknown', { emote: 'ICANT', lng: 'en' })
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
      t('chatters.pause', { emote: 'PauseChamp', lng: 'en' })
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

    expect(handler.closeBetsCalls).toStrictEqual(['radiant'])
  })

  it('skips closeBets when not in a playable match', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.player.activity = 'observing'
    registerHandler(handler)

    events.emit('map:win_team', 'dire', handler.getToken())
    await flushAsync()

    expect(handler.closeBetsCalls).toStrictEqual([])
  })
})

describe('event:tip', () => {
  it('chats the tip-to-me message when the local player is the receiver', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.matchPlayers = [
      { accountid: 11, heroid: 1, playerid: 0 },
      { accountid: 22, heroid: 2, playerid: 1 },
    ]
    // local player is at slot 1 (the receiver in this tip).
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '1'

    events.emit(
      'event:tip',
      { game_time: 600, player_id: 0, receiver_player_id: 1, sender_player_id: 0 },
      handler.getToken()
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('tip.from', { emote: 'ICANT', heroName: getHeroNameOrColor(1, 0), lng: 'en' })
    )
  })

  it('chats the tip-from-me message when the local player is the sender', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)
    gsiState.matchPlayers = [
      { accountid: 11, heroid: 1, playerid: 0 },
      { accountid: 22, heroid: 2, playerid: 1 },
    ]
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '0'

    events.emit(
      'event:tip',
      { game_time: 600, player_id: 0, receiver_player_id: 1, sender_player_id: 0 },
      handler.getToken()
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('tip.to', { emote: 'PepeLaugh', heroName: getHeroNameOrColor(2, 1), lng: 'en' })
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
      { game_time: 600, receiver_player_id: 1, sender_player_id: 0 },
      handler.getToken()
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('tip.fromUnknown', { emote: 'ICANT', lng: 'en' })
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
      { game_time: 600, receiver_player_id: 1, sender_player_id: 0 },
      handler.getToken()
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('tip.toUnknown', { emote: 'PepeLaugh', lng: 'en' })
    )
  })

  it('omits the tipper name at 8500+ when the roster has heroes but the sender is unmatched', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = Array.from({ length: 10 }, (_, i) => ({
      accountid: 100 + i,
      heroid: 10 + i,
      playerid: null,
    }))
    // local player is the receiver (slot 1)
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '1'

    events.emit(
      'event:tip',
      { game_time: 600, receiver_player_id: 1, sender_player_id: 3 },
      handler.getToken()
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('tip.fromUnknown', { emote: 'ICANT', lng: 'en' })
    )
    expect(gsiState.chatSayCalls[0].message).not.toContain(getHeroNameOrColor(13, 3))
  })

  it('omits the tipped name at 8500+ when the receiver is unmatched (local player is sender)', async () => {
    const handler = makeGsiHandler()
    handler.client.mmr = 9000
    registerHandler(handler)
    gsiState.matchPlayers = Array.from({ length: 10 }, (_, i) => ({
      accountid: 100 + i,
      heroid: 10 + i,
      playerid: null,
    }))
    // local player is the sender (slot 0)
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '0'

    events.emit(
      'event:tip',
      { game_time: 600, receiver_player_id: 4, sender_player_id: 0 },
      handler.getToken()
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('tip.toUnknown', { emote: 'PepeLaugh', lng: 'en' })
    )
    expect(gsiState.chatSayCalls[0].message).not.toContain(getHeroNameOrColor(14, 4))
  })
})

describe('event:bounty_rune_pickup', () => {
  it('chats a bounty pickup for the local team within the 2-minute window', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.map.clock_time = 60
    registerHandler(handler)
    gsiState.matchPlayers = [{ accountid: 11, heroid: 1, playerid: 0 }]
    gsiState.redisGet[`${handler.client.token}:playingTeam`] = 'radiant'

    events.emit(
      'event:bounty_rune_pickup',
      { bounty_value: 40, game_time: 60, player_id: 0, team: 'radiant' },
      handler.getToken()
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('bounties.pickup', {
        bountyValue: 40,
        emote: 'EZ Clap',
        emote2: 'SeemsGood',
        heroNames: getHeroNameOrColor(1, 0),
        lng: 'en',
        totalBounties: 1,
      })
    )
  })

  it('skips a bounty when the picker has no resolved hero (no color guess)', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.map.clock_time = 60
    registerHandler(handler)
    // roster present but the slot has no heroid (delayedGames is heroless now)
    gsiState.matchPlayers = [{ accountid: 11, heroid: undefined, playerid: 0 }]
    gsiState.redisGet[`${handler.client.token}:playingTeam`] = 'radiant'

    events.emit(
      'event:bounty_rune_pickup',
      { bounty_value: 40, game_time: 60, player_id: 0, team: 'radiant' },
      handler.getToken()
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })

  it('skips bounties picked up after the 2-minute window', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.map.clock_time = 200
    registerHandler(handler)
    gsiState.matchPlayers = [{ accountid: 11, heroid: 1, playerid: 0 }]
    gsiState.redisGet[`${handler.client.token}:playingTeam`] = 'radiant'

    events.emit(
      'event:bounty_rune_pickup',
      { bounty_value: 40, game_time: 200, player_id: 0, team: 'radiant' },
      handler.getToken()
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
      accountid: 100 + i,
      heroid: 10 + i,
      playerid: null,
    }))
    gsiState.redisGet[`${handler.client.token}:playingTeam`] = 'radiant'

    events.emit(
      'event:bounty_rune_pickup',
      { bounty_value: 40, game_time: 60, player_id: 3, team: 'radiant' },
      handler.getToken()
    )
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })

  it('skips bounties picked up by the opposing team', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.map.clock_time = 60
    registerHandler(handler)
    gsiState.matchPlayers = [{ accountid: 11, heroid: 1, playerid: 0 }]
    gsiState.redisGet[`${handler.client.token}:playingTeam`] = 'radiant'

    events.emit(
      'event:bounty_rune_pickup',
      { bounty_value: 40, game_time: 60, player_id: 0, team: 'dire' },
      handler.getToken()
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

describe('event:generic_event - smoke activated', () => {
  const smokeEvent = (playerid1: number) => ({
    data: JSON.stringify({
      playerid1,
      playerid2: -1,
      time: 537,
      type: 'CHAT_MESSAGE_SMOKE_ACTIVATED',
      value: 0,
    }),
    event_type: 'generic_event',
    game_time: 600,
  })

  it('sends one message — roasts the streamer — when the team smokes without them', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.player.team_name = 'radiant'
    handler.client.gsi.hero = {
      alive: true,
      id: 25,
      name: 'npc_dota_hero_lina',
      smoked: false,
    }
    registerHandler(handler)
    // Teammate in slot 0 casts it; the streamer is slot 1 and never got the buff.
    gsiState.matchPlayers = [{ accountid: 99_999, heroid: 5, playerid: 0 }]
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '1'

    events.emit('event:generic_event', smokeEvent(0), handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toContain('without you')
  })

  it('stays silent when the streamer is in the smoke (hero:smoked announces instead)', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.player.team_name = 'radiant'
    handler.client.gsi.hero = {
      alive: true,
      id: 25,
      name: 'npc_dota_hero_lina',
      smoked: true,
    }
    registerHandler(handler)
    gsiState.matchPlayers = [{ accountid: 99_999, heroid: 5, playerid: 0 }]
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '1'

    events.emit('event:generic_event', smokeEvent(0), handler.getToken())
    await flushAsync()

    // The "<hero> is smoked!" callout is owned by the hero:smoked handler; this handler only
    // roasts when the streamer is left behind, so it says nothing for an in-smoke streamer.
    expect(gsiState.chatSayCalls).toHaveLength(0)
  })

  it('stays silent when the streamer cast the smoke themselves', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.player.team_name = 'radiant'
    handler.client.gsi.hero = {
      alive: true,
      id: 25,
      name: 'npc_dota_hero_lina',
      smoked: false,
    }
    registerHandler(handler)
    gsiState.matchPlayers = [{ accountid: 99_999, heroid: 5, playerid: 0 }]
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '0'

    events.emit('event:generic_event', smokeEvent(0), handler.getToken())
    await flushAsync()

    // A self-caster is in the smoke by definition — hero:smoked covers it; no roast here.
    expect(gsiState.chatSayCalls).toHaveLength(0)
  })

  it('stays silent when the streamer is dead (not "caught out")', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.player.team_name = 'radiant'
    handler.client.gsi.hero = {
      alive: false,
      id: 25,
      name: 'npc_dota_hero_lina',
      smoked: false,
    }
    registerHandler(handler)
    // Teammate smoked while the streamer is dead — a dead player wasn't left behind and
    // never gets the buff, so neither path has anything to say.
    gsiState.matchPlayers = [{ accountid: 99_999, heroid: 5, playerid: 0 }]
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '1'

    events.emit('event:generic_event', smokeEvent(0), handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })

  it('does not chat when the activator is on the enemy team', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.player.team_name = 'radiant'
    registerHandler(handler)
    // Activator in dire slot 5 — opposite side; Dota would not surface this to
    // the streamer, and we must never leak it even if it did.
    gsiState.matchPlayers = [{ accountid: 99_999, heroid: 5, playerid: 5 }]

    events.emit('event:generic_event', smokeEvent(5), handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })

  it('does not double-post when a teammate smokes the streamer (hero:smoked + team event)', async () => {
    const handler = makeGsiHandler()
    handler.client.gsi.player.team_name = 'radiant'
    handler.client.gsi.hero = {
      alive: true,
      id: 25,
      name: 'npc_dota_hero_lina',
      smoked: true,
    }
    registerHandler(handler)
    gsiState.redisGet[`${handler.getToken()}:playingHero`] = 'npc_dota_hero_lina'
    // Teammate in slot 0 popped it; the streamer (slot 1) is in the smoke.
    gsiState.matchPlayers = [{ accountid: 99_999, heroid: 5, playerid: 0 }]
    gsiState.redisGet[`${handler.getToken()}:playingHeroSlot`] = '1'

    // The same activation reaches both paths: the hero buff flip and the team chat event.
    events.emit('hero:smoked', true, handler.getToken())
    events.emit('event:generic_event', smokeEvent(0), handler.getToken())
    await flushAsync()

    // Exactly one message — the "is smoked!" callout — and no activator/FOMO line.
    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toContain('is smoked')
    expect(gsiState.chatSayCalls[0].message).not.toContain('Smoke of Deceit')
    expect(gsiState.chatSayCalls[0].message).not.toContain('without you')
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
    handler.client.gsi.previously = Object.assign(
      createPacketStub({ map: handler.client.gsi.map }),
      { player: { kill_streak: 5 } }
    )
    registerHandler(handler)

    events.emit('player:kill_streak', 0, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(1)
    expect(gsiState.chatSayCalls[0].message).toBe(
      t('killstreak.lost', { count: 5, emote: 'BibleThump', heroName: 'Lina', lng: 'en' })
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
