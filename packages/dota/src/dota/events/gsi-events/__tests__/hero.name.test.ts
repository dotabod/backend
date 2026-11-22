import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildSharedUtilsMock,
  createGsiHandlerStub,
  createPacketStub,
  createSocketClientStub,
  initTestI18n,
  PRO_SUB,
} from '../../../../__tests__/shared-mocks'

interface UpdateCall {
  values: Record<string, unknown>
  whereCol: string
  whereVal: string
}
interface HeldTask {
  invoke: () => void | Promise<void>
}

const updateCalls: UpdateCall[] = []
const refundCalls: { channelId: string; predictionId: string }[] = []
const openBetCalls: { heroName?: string }[] = []
const heldTasks: HeldTask[] = []
const redisStore: Record<string, string> = {}

let newPredictionId: string | null = 'new-prediction-id'
let matchCanBeUpdated = true

const supabaseMock = {
  from: () => {
    let updateValues: Record<string, unknown> = {}
    const builder: unknown = {
      eq: (col: string, val: string) => {
        if (Object.keys(updateValues).length > 0) {
          updateCalls.push({ values: updateValues, whereCol: col, whereVal: val })
        }
        return builder
      },
      is: () => builder,
      maybeSingle: async () =>
        await Promise.resolve({
          data: matchCanBeUpdated ? { id: 'match-row' } : null,
          error: null,
        }),
      select: () => builder,
      single: async () =>
        await Promise.resolve({
          data: { id: 'match-row', predictionId: 'old-prediction-id' },
          error: null,
        }),
      update: (values: Record<string, unknown>) => {
        updateValues = values
        return builder
      },
    }
    return builder
  },
  rpc: async () => await Promise.resolve({ data: [], error: null }),
}

const loggerMock = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ logger: loggerMock, supabase: supabaseMock })
)

vi.doMock('../../../../steam/ws', () => ({
  steamSocket: { emit: () => {}, on: () => {} },
  twitchChat: { emit: () => {}, on: () => {} },
  twitchEvents: { emit: () => {}, on: () => {} },
}))

vi.doMock('../../../../twitch/lib/open-twitch-bet', () => ({
  openTwitchBet: async ({ heroName }: { heroName?: string }) => {
    openBetCalls.push({ heroName })
    return await Promise.resolve(newPredictionId === null ? undefined : { id: newPredictionId })
  },
}))

vi.doMock('../../../../twitch/lib/refund-twitch-bets', () => ({
  refundTwitchBet: async (channelId: string, predictionId: string) => {
    refundCalls.push({ channelId, predictionId })
    return await Promise.resolve(predictionId)
  },
}))

vi.doMock('../../../lib/delayed-queue', () => ({
  delayedQueue: {
    addTask: (_delayMs: number, cb: (payload: unknown) => void | Promise<void>) => {
      heldTasks.push({ invoke: async () => await Promise.resolve(cb(null)) })
      return `task-${heldTasks.length}`
    },
    removeTask: () => true,
  },
}))

vi.doMock('../../../../db/redis-client', () => ({
  default: {
    getInstance: () => ({
      client: {
        get: async (key: string) => await Promise.resolve(redisStore[key] ?? null),
        set: async (key: string, val: string) => {
          redisStore[key] = val
          return await Promise.resolve('OK')
        },
      },
    }),
  },
}))

await initTestI18n()

// Import the handler module to register it on the global event emitter.
await import('../hero.name')

const { cancelHeroSwap } = await import('../../../lib/hero-swap-prediction.js')
const { events } = await import('../../../global-event-emitter')
const { gsiHandlers } = await import('../../../lib/consts')

const TOKEN = 'token-arteezy'

const registerFakeHandler = function registerFakeHandler() {
  const client = createSocketClientStub({
    gsi: createPacketStub({
      hero: { name: 'npc_dota_hero_pudge' },
      map: { matchid: '8825999999' },
      player: { activity: 'playing' },
    }),
    locale: 'en',
    name: 'arteezy',
    settings: [],
    stream_online: true,
    subscription: PRO_SUB,
    token: TOKEN,
  })
  gsiHandlers.set(
    TOKEN,
    createGsiHandlerStub(client, {
      disabled: false,
      getChannelId: () => 'twitch-channel-1',
      getToken: () => TOKEN,
    })
  )
}

const unregisterFakeHandler = function unregisterFakeHandler() {
  gsiHandlers.delete(TOKEN)
}

// `events.emit` is synchronous but the handler is async; emit then await a
// macrotask boundary so the handler's awaits resolve before we drain queue.
const flush = async () => {
  await new Promise<void>((r) => setTimeout(r, 0))
}

describe('hero:name swap → matches.hero_name update', () => {
  beforeEach(() => {
    updateCalls.length = 0
    refundCalls.length = 0
    openBetCalls.length = 0
    heldTasks.length = 0
    for (const k of Object.keys(redisStore)) {
      delete redisStore[k]
    }
    newPredictionId = 'new-prediction-id'
    matchCanBeUpdated = true
    registerFakeHandler()
    // Pre-state: openBets has already set the Redis keys for the original hero.
    redisStore[`${TOKEN}:playingHero`] = 'npc_dota_hero_lina'
    redisStore[`${TOKEN}:matchId`] = '8825999999'
  })

  afterEach(() => {
    unregisterFakeHandler()
  })

  it('updates matches.hero_name to the new pick when the swap succeeds (not just predictionId)', async () => {
    events.emit('hero:name', 'npc_dota_hero_pudge', TOKEN)
    await flush()

    expect(refundCalls).toStrictEqual([
      { channelId: 'twitch-channel-1', predictionId: 'old-prediction-id' },
    ])
    expect(heldTasks).toHaveLength(1)

    await heldTasks[0].invoke()

    // The success branch should rewrite predictionId AND hero_name on the row.
    const successUpdate = updateCalls.find((u) => u.values.predictionId === 'new-prediction-id')
    expect(successUpdate).toBeDefined()
    expect(successUpdate?.values.hero_name).toBe('npc_dota_hero_pudge')
  })

  it('updates matches.hero_name even when the reopen fails (predictionId nulled out)', async () => {
    newPredictionId = null

    events.emit('hero:name', 'npc_dota_hero_pudge', TOKEN)
    await flush()
    expect(heldTasks).toHaveLength(1)
    await heldTasks[0].invoke()

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].values).toMatchObject({
      hero_name: 'npc_dota_hero_pudge',
      predictionId: null,
    })
  })

  it('does not reopen a refunded prediction after the match session resets', async () => {
    events.emit('hero:name', 'npc_dota_hero_pudge', TOKEN)
    await flush()
    expect(refundCalls).toHaveLength(1)
    expect(heldTasks).toHaveLength(1)

    const handler = gsiHandlers.get(TOKEN)
    if (handler === undefined) {
      throw new Error('Expected a GSI handler')
    }
    cancelHeroSwap(handler)
    await heldTasks[0].invoke()

    expect(openBetCalls).toHaveLength(0)
    expect(updateCalls).toHaveLength(0)
  })

  it('reopens only for the last hero when a streamer swaps twice during the delay', async () => {
    events.emit('hero:name', 'npc_dota_hero_pudge', TOKEN)
    await flush()
    events.emit('hero:name', 'npc_dota_hero_axe', TOKEN)
    await flush()

    expect(heldTasks).toHaveLength(2)
    await heldTasks[0].invoke()
    await heldTasks[1].invoke()

    expect(openBetCalls).toStrictEqual([{ heroName: 'Axe' }])
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].values).toMatchObject({ hero_name: 'npc_dota_hero_axe' })
  })

  it('refunds the replacement if the match closes before the replacement can be saved', async () => {
    events.emit('hero:name', 'npc_dota_hero_pudge', TOKEN)
    await flush()

    matchCanBeUpdated = false
    await heldTasks[0].invoke()

    expect(refundCalls).toStrictEqual([
      { channelId: 'twitch-channel-1', predictionId: 'old-prediction-id' },
      { channelId: 'twitch-channel-1', predictionId: 'new-prediction-id' },
    ])
  })
})
