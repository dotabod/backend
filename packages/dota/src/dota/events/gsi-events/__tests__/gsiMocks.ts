// Test harness for GSI event handlers. Drives `events.emit(...)` directly
// and asserts on captured chat output / redis writes / socket emits.
// Filename intentionally not `.test.ts` so bun's runner ignores it.
import { mock } from 'bun:test'
import { buildSharedUtilsMock, initTestI18n, PRO_SUB } from '../../../../__tests__/sharedMocks.ts'

export type MatchPlayer = { heroid: number; accountid: number; playerid: number | null }

export const gsiState: {
  // Per-key redis reads. Both RedisClient.getInstance().client.get and
  // redisInstance.redisClient.client.get read from this map. JSON reads
  // (json.get) read from `redisJson` since they return parsed objects.
  redisGet: Record<string, string | null>
  redisJson: Record<string, unknown>
  // Tracks writes for assertion.
  redisJsonSetCalls: Array<{ key: string; path: string; value: unknown }>
  // What getAccountsFromMatch returns. Most tests don't care, default empty.
  matchPlayers: MatchPlayer[]
  // Captured chatClient.say calls.
  chatSayCalls: Array<{ channel: string; message: string }>
  // Captured server.io.to(token).emit(event, payload).
  ioEmitCalls: Array<{ token: string; event: string; payload: unknown }>
  // Captured delayedQueue.addTask payloads (after the callback fires).
  delayedQueueAddCalls: Array<{ delayMs: number }>
  delayedQueueRemovedIds: string[]
} = {
  redisGet: {},
  redisJson: {},
  redisJsonSetCalls: [],
  matchPlayers: [],
  chatSayCalls: [],
  ioEmitCalls: [],
  delayedQueueAddCalls: [],
  delayedQueueRemovedIds: [],
}

export function resetGsiState() {
  gsiState.redisGet = {}
  gsiState.redisJson = {}
  gsiState.redisJsonSetCalls = []
  gsiState.matchPlayers = []
  gsiState.chatSayCalls = []
  gsiState.ioEmitCalls = []
  gsiState.delayedQueueAddCalls = []
  gsiState.delayedQueueRemovedIds = []
}

// --- Mocks ---

mock.module('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({
    supabase: { from: () => ({}), rpc: async () => ({ data: [], error: null }) },
    logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
  }),
)

// RedisClient is a class with a getInstance() static method. The handlers call
// `RedisClient.getInstance().client.json.set/get` and `.client.get`.
const fakeRedisClient = {
  get: async (key: string) => gsiState.redisGet[key] ?? null,
  set: async () => 'OK',
  json: {
    get: async (key: string) => gsiState.redisJson[key] ?? null,
    set: async (key: string, path: string, value: unknown) => {
      // Clone at write time. Handlers commonly mutate `res` after json.set
      // (e.g. generateRoshanMessage recalculates expireS), and storing the
      // raw reference would let those post-call mutations bleed back into
      // recorded test state.
      const snapshot = JSON.parse(JSON.stringify(value))
      gsiState.redisJsonSetCalls.push({ key, path, value: snapshot })
      gsiState.redisJson[key] = snapshot
      return 'OK'
    },
  },
}
mock.module('../../../../db/RedisClient.js', () => ({
  default: {
    getInstance: () => ({ client: fakeRedisClient }),
  },
}))

// NOTE: `redisClient` (lowercase, from redisInstance.js) is NOT mocked via
// mock.module. setupMocks.ts monkey-patches `redisClient.client` on the real
// singleton; if we registered a competing mock here, downstream utils that
// already cached the real singleton (e.g. `getRedisNumberValue` loaded via a
// setupMocks chain) would still hit setupMocks's state. Instead, both
// harnesses monkey-patch the same singleton — see `installGsiMocks` below,
// which is called in `beforeEach` to ensure gsi tests own the binding.

mock.module('../../../lib/getAccountsFromMatch.js', () => ({
  getAccountsFromMatch: async () => ({ matchPlayers: gsiState.matchPlayers }),
}))

// `delayedQueue.addTask` fires the callback synchronously so tests can assert
// on the chat output without waiting on real timers. `removeTask` tracks the
// id so tests can verify the bounty / killstreak cancellation path.
let taskIdCounter = 0
const fakeDelayedQueue = {
  addTask: (
    delayMs: number,
    callback: (payload: unknown) => void | Promise<void>,
    payload: unknown = null,
  ) => {
    gsiState.delayedQueueAddCalls.push({ delayMs })
    taskIdCounter += 1
    const id = `task-${taskIdCounter}`
    void callback(payload)
    return id
  },
  removeTask: (id: string) => {
    gsiState.delayedQueueRemovedIds.push(id)
    return true
  },
  getQueueSize: () => 0,
}
mock.module('../../../lib/DelayedQueue.js', () => ({
  delayedQueue: fakeDelayedQueue,
  DelayedQueue: class {},
}))

await initTestI18n()

const { events } = await import('../../../globalEventEmitter.js')
const { gsiHandlers } = await import('../../../lib/consts.js')
const { chatClient } = await import('../../../../twitch/chatClient.js')
const { server } = await import('../../../server.js')
const { redisClient } = await import('../../../../db/redisInstance.js')

// Re-install chatClient + server patches each time. setupMocks.ts in the
// twitch suite ALSO monkey-patches chatClient.say at its module load time;
// because mock.module / monkey-patches are process-wide, whichever harness
// loads last wins. Calling this in `beforeEach` from gsi tests guarantees
// the gsi patches are active for the test about to run.
export function installGsiMocks() {
  chatClient.say = (async (channel: string, message: string) => {
    gsiState.chatSayCalls.push({ channel, message })
  }) as any

  ;(redisClient as any).client = fakeRedisClient

  server.setServer({
    io: {
      to: (token: string) => ({
        emit: (event: string, payload: unknown) => {
          gsiState.ioEmitCalls.push({ token, event, payload })
        },
      }),
    },
  } as any)
}

// Run once at harness load so tests can import + assert without first
// calling `installGsiMocks()` if running gsi tests in isolation.
installGsiMocks()

// Side-effect imports register handlers via `eventHandler.registerEvent`.
await import('../event.aegis_picked_up.js')
await import('../event.aegis_denied.js')
await import('../event.roshan_killed.js')
await import('../event.tip.js')
await import('../event.bounty_rune_pickup.js')
await import('../map.paused.js')
await import('../map.win_team.js')
await import('../hero.smoked.js')
await import('../player.killstreak.js')

export { events, gsiHandlers }

export type GsiHandlerLike = {
  client: any
  disabled: boolean
  getToken: () => string
  addSecondsToNow: (s: number) => Date
  bountyHeroNames: string[]
  bountyTaskId?: string
  killstreakTaskId?: string
  closeBets: (winningTeam?: string) => Promise<void>
  closeBetsCalls: Array<string | undefined>
}

export function makeGsiHandler(overrides: Partial<GsiHandlerLike> = {}): GsiHandlerLike {
  const token = 'token-gsi-1'
  const closeBetsCalls: Array<string | undefined> = []
  return {
    client: {
      name: 'streamer',
      token,
      stream_online: true,
      multiAccount: false,
      locale: 'en',
      settings: [],
      subscription: PRO_SUB,
      // Default gsi: a playable match. Individual tests can override.
      gsi: {
        player: { activity: 'playing', team_name: 'radiant' },
        map: { matchid: '7777777777', clock_time: 600, game_time: 600 },
        hero: { name: 'npc_dota_hero_lina' },
      },
    },
    disabled: false,
    getToken: () => token,
    addSecondsToNow: (s: number) => new Date(Date.now() + s * 1000),
    bountyHeroNames: [],
    closeBets: async (winningTeam) => {
      closeBetsCalls.push(winningTeam)
    },
    closeBetsCalls,
    ...overrides,
  }
}

export function registerHandler(handler: GsiHandlerLike) {
  gsiHandlers.set(handler.getToken(), handler as any)
}
