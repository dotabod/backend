import { beforeEach, describe, expect, it } from 'bun:test'
import { flushAsync } from '../../../../__tests__/sharedMocks.ts'
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

  it('skips when stream is offline', async () => {
    const handler = makeGsiHandler({ client: { ...makeGsiHandler().client, stream_online: false } })
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
    expect(gsiState.chatSayCalls[0].message).toContain('ICANT')
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
    const handler = makeGsiHandler({ client: { ...makeGsiHandler().client, stream_online: false } })
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
    expect(gsiState.chatSayCalls[0].message).toContain('PauseChamp')
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
    const handler = makeGsiHandler({ client: { ...makeGsiHandler().client, stream_online: false } })
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
    expect(gsiState.chatSayCalls[0].message).toContain('ICANT')
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
    expect(gsiState.chatSayCalls[0].message).toContain('PepeLaugh')
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
    expect(gsiState.chatSayCalls[0].message.toLowerCase()).toMatch(/bount|gold|rune/)
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
    expect(gsiState.chatSayCalls[0].message).toContain('BibleThump')
  })

  it('skips streaks of 3 or less (no chat output)', async () => {
    const handler = makeGsiHandler()
    registerHandler(handler)

    events.emit('player:kill_streak', 2, handler.getToken())
    await flushAsync()

    expect(gsiState.chatSayCalls).toHaveLength(0)
  })
})
