// Regression tests for the hero-swap matches.hero_name bug. The handler
// refunds + reopens the Twitch prediction on a mid-game hero swap but did
// NOT update the matches row's hero_name — leaving stale hero info that
// surfaced in !unresolved formatting and chat copy until closeBets ran.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSharedUtilsMock, initTestI18n, PRO_SUB } from '../../../../__tests__/sharedMocks'

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

let nextPredictionId: string | null = 'old-prediction-id'

const supabaseMock = {
  from: () => {
    let updateValues: Record<string, unknown> = {}
    const builder: any = {
      eq: (col: string, val: string) => {
        if (Object.keys(updateValues).length > 0) {
          updateCalls.push({ values: updateValues, whereCol: col, whereVal: val })
          return Promise.resolve({ data: null, error: null })
        }
        return builder
      },
      is: () => builder,
      select: () => builder,
      single: async () =>
        nextPredictionId
          ? { data: { predictionId: nextPredictionId }, error: null }
          : { data: null, error: { message: 'not found' } },
      update: (values: Record<string, unknown>) => {
        updateValues = values
        return builder
      },
    }
    return builder
  },
  rpc: async () => ({ data: [], error: null }),
}

const loggerMock = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

vi.doMock(import('@dotabod/shared-utils'), () =>
  buildSharedUtilsMock({ logger: loggerMock, supabase: supabaseMock })
)

vi.doMock(import('../../../../steam/ws'), () => ({
  steamSocket: { emit: () => {}, on: () => {} },
  twitchChat: { emit: () => {}, on: () => {} },
  twitchEvents: { emit: () => {}, on: () => {} },
}))

vi.doMock(import('../../../../twitch/lib/openTwitchBet'), () => ({
  openTwitchBet: async ({ heroName }: { heroName?: string }) => {
    openBetCalls.push({ heroName })
    return { id: 'new-prediction-id' }
  },
}))

vi.doMock(import('../../../../twitch/lib/refundTwitchBets'), () => ({
  refundTwitchBet: async (channelId: string, predictionId: string) => {
    refundCalls.push({ channelId, predictionId })
    return predictionId
  },
}))

vi.doMock(import('../../../lib/DelayedQueue'), () => ({
  delayedQueue: {
    addTask: (_delayMs: number, cb: (payload: unknown) => void | Promise<void>) => {
      heldTasks.push({ invoke: () => cb(null) })
      return `task-${heldTasks.length}`
    },
    removeTask: () => true,
  },
}))

vi.doMock(import('../../../../db/RedisClient'), () => ({
  default: {
    getInstance: () => ({
      client: {
        get: async (key: string) => redisStore[key] ?? null,
        set: async (key: string, val: string) => {
          redisStore[key] = val
          return 'OK'
        },
      },
    }),
  },
}))

await initTestI18n()

// Import the handler module to register it on the global event emitter.
await import('../hero.name')

const { events } = await import('../../../globalEventEmitter')
const { gsiHandlers } = await import('../../../lib/consts')

const TOKEN = 'token-arteezy'

function registerFakeHandler() {
  gsiHandlers.set(TOKEN, {
    client: {
      gsi: {
        hero: { name: 'npc_dota_hero_pudge' },
        map: { matchid: '8825999999' },
        player: { activity: 'playing' },
      },
      locale: 'en',
      multiAccount: false,
      name: 'arteezy',
      settings: [],
      stream_online: true,
      subscription: PRO_SUB,
      token: TOKEN,
    },
    disabled: false,
    getChannelId: () => 'twitch-channel-1',
    getToken: () => TOKEN,
  } as any)
}

function unregisterFakeHandler() {
  gsiHandlers.delete(TOKEN)
}

// `events.emit` is synchronous but the handler is async; emit then await a
// macrotask boundary so the handler's awaits resolve before we drain queue.
const flush = async () =>{  await new Promise<void>((r) => setTimeout(r, 0)); }

describe('hero:name swap → matches.hero_name update', () => {
  beforeEach(() => {
    updateCalls.length = 0
    refundCalls.length = 0
    openBetCalls.length = 0
    heldTasks.length = 0
    for (const k of Object.keys(redisStore)) {
      delete redisStore[k]
    }
    nextPredictionId = 'old-prediction-id'
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
    openBetCalls.length = 0
    // Make the reopen "fail" by returning no id — simulate openTwitchBet
    // returning undefined on error (the real fn does this on caught errors).
    vi.doMock(import('../../../../twitch/lib/openTwitchBet'), () => ({
      openTwitchBet: async () => {},
    }))

    events.emit('hero:name', 'npc_dota_hero_pudge', TOKEN)
    await flush()
    expect(heldTasks).toHaveLength(1)
    await heldTasks[0].invoke()

    // Either branch (success or failure) — the matches row must reflect the
    // new hero. We don't care which branch ran here; we care that the row
    // is no longer claiming the streamer is on Lina.
    const heroUpdate = updateCalls.find((u) => u.values.hero_name === 'npc_dota_hero_pudge')
    expect(heroUpdate).toBeDefined()
  })
})
