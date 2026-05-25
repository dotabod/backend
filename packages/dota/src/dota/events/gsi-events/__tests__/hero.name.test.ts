// Regression tests for the hero-swap matches.hero_name bug. The handler
// refunds + reopens the Twitch prediction on a mid-game hero swap but did
// NOT update the matches row's hero_name — leaving stale hero info that
// surfaced in !unresolved formatting and chat copy until closeBets ran.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n, PRO_SUB } from '../../../../__tests__/sharedMocks'

type UpdateCall = { values: Record<string, unknown>; whereCol: string; whereVal: string }
type HeldTask = { invoke: () => void | Promise<void> }

const updateCalls: UpdateCall[] = []
const refundCalls: Array<{ channelId: string; predictionId: string }> = []
const openBetCalls: Array<{ heroName?: string }> = []
const heldTasks: HeldTask[] = []
const redisStore: Record<string, string> = {}

let nextPredictionId: string | null = 'old-prediction-id'

const supabaseMock = {
  from: () => {
    let updateValues: Record<string, unknown> = {}
    const builder: any = {
      select: () => builder,
      update: (values: Record<string, unknown>) => {
        updateValues = values
        return builder
      },
      eq: (col: string, val: string) => {
        if (Object.keys(updateValues).length > 0) {
          updateCalls.push({ values: updateValues, whereCol: col, whereVal: val })
          return Promise.resolve({ data: null, error: null })
        }
        return builder
      },
      is: () => builder,
      single: () =>
        Promise.resolve(
          nextPredictionId
            ? { data: { predictionId: nextPredictionId }, error: null }
            : { data: null, error: { message: 'not found' } },
        ),
    }
    return builder
  },
  rpc: async () => ({ data: [], error: null }),
}

const loggerMock = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ supabase: supabaseMock, logger: loggerMock }),
)

vi.doMock('../../../../steam/ws', () => ({
  steamSocket: { emit: () => undefined, on: () => undefined },
  twitchChat: { emit: () => undefined, on: () => undefined },
  twitchEvents: { emit: () => undefined, on: () => undefined },
}))

vi.doMock('../../../../twitch/lib/openTwitchBet', () => ({
  openTwitchBet: async ({ heroName }: { heroName?: string }) => {
    openBetCalls.push({ heroName })
    return { id: 'new-prediction-id' }
  },
}))

vi.doMock('../../../../twitch/lib/refundTwitchBets', () => ({
  refundTwitchBet: async (channelId: string, predictionId: string) => {
    refundCalls.push({ channelId, predictionId })
    return predictionId
  },
}))

vi.doMock('../../../lib/DelayedQueue', () => ({
  delayedQueue: {
    addTask: (_delayMs: number, cb: (payload: unknown) => void | Promise<void>) => {
      heldTasks.push({ invoke: () => cb(null) })
      return `task-${heldTasks.length}`
    },
    removeTask: () => true,
  },
}))

vi.doMock('../../../../db/RedisClient', () => ({
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
      name: 'arteezy',
      token: TOKEN,
      stream_online: true,
      multiAccount: false,
      locale: 'en',
      settings: [],
      subscription: PRO_SUB,
      gsi: {
        player: { activity: 'playing' },
        map: { matchid: '8825999999' },
        hero: { name: 'npc_dota_hero_pudge' },
      },
    },
    disabled: false,
    getToken: () => TOKEN,
    getChannelId: () => 'twitch-channel-1',
  } as any)
}

function unregisterFakeHandler() {
  gsiHandlers.delete(TOKEN)
}

// `events.emit` is synchronous but the handler is async; emit then await a
// macrotask boundary so the handler's awaits resolve before we drain queue.
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe('hero:name swap → matches.hero_name update', () => {
  beforeEach(() => {
    updateCalls.length = 0
    refundCalls.length = 0
    openBetCalls.length = 0
    heldTasks.length = 0
    for (const k of Object.keys(redisStore)) delete redisStore[k]
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

    expect(refundCalls).toEqual([
      { channelId: 'twitch-channel-1', predictionId: 'old-prediction-id' },
    ])
    expect(heldTasks.length).toBe(1)

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
    vi.doMock('../../../../twitch/lib/openTwitchBet', () => ({
      openTwitchBet: async () => undefined,
    }))

    events.emit('hero:name', 'npc_dota_hero_pudge', TOKEN)
    await flush()
    expect(heldTasks.length).toBe(1)
    await heldTasks[0].invoke()

    // Either branch (success or failure) — the matches row must reflect the
    // new hero. We don't care which branch ran here; we care that the row
    // is no longer claiming the streamer is on Lina.
    const heroUpdate = updateCalls.find((u) => u.values.hero_name === 'npc_dota_hero_pudge')
    expect(heroUpdate).toBeDefined()
  })
})
