// Test harness for GSI event handlers. Drives `events.emit(...)` directly
// and asserts on captured chat output / redis writes / socket emits.
// Filename intentionally not `.test.ts` so bun's runner ignores it.
import { vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n, PRO_SUB } from '../../../../__tests__/sharedMocks'

export type MatchPlayer = { heroid: number; accountid: number; playerid: number | null }

export const gsiState: {
  // Per-key redis reads. Both RedisClient.getInstance().client.get and
  // redisInstance.redisClient.client.get read from this map. JSON reads
  // (json.get) read from `redisJson` since they return parsed objects.
  redisGet: Record<string, string | null>
  redisJson: Record<string, unknown>
  // Tracks writes for assertion.
  redisJsonSetCalls: Array<{ key: string; path: string; value: unknown }>
  // Roster surfaced via the mocked MatchDataService. Most tests don't care, default empty.
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
  taskIdCounter = 0
}

// --- Mocks ---

vi.doMock('@dotabod/shared-utils', () =>
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
  // Sorted-set stubs used by clipSchedule.ts (scheduleClip / rearmPersistedClips).
  // Errors are caught by clipSchedule's own try/catch, so returning silently is
  // fine for tests that don't exercise the durability path directly.
  zAdd: async () => 0,
  zRem: async () => 0,
  zRangeByScore: async () => [] as string[],
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
const fakeRedisInstance = {
  client: fakeRedisClient,
  getJson: async (key: string) => fakeRedisClient.json.get(key),
  setJson: (key: string, value: unknown) => fakeRedisClient.json.set(key, '$', value),
}
vi.doMock('../../../../db/RedisClient', () => ({
  default: {
    getInstance: () => fakeRedisInstance,
  },
}))

// NOTE: `redisClient` (lowercase, from redisInstance.js) is NOT mocked via
// mock.module. setupMocks.ts monkey-patches `redisClient.client` on the real
// singleton; if we registered a competing mock here, downstream utils that
// already cached the real singleton (e.g. `getRedisNumberValue` loaded via a
// setupMocks chain) would still hit setupMocks's state. Instead, both
// harnesses monkey-patch the same singleton — see `installGsiMocks` below,
// which is called in `beforeEach` to ensure gsi tests own the binding.

// Event handlers route through `MatchDataService` directly. Mock it so the
// existing `gsiState.matchPlayers` (legacy shape) feeds resolveRoster() after
// a slot/heroid field rename — tests don't need to change.
vi.doMock('../../../lib/matchData', () => {
  class FakeMatchDataService {
    async resolveRoster() {
      return {
        players: gsiState.matchPlayers.map((p) => ({
          slot: p.playerid,
          accountId: p.accountid || null,
          heroId: p.heroid || null,
          team: null,
          playerName: null,
          rank: null,
          selected: null,
        })),
        source: 'sourcetv' as const,
        stage: 'in-progress' as const,
        completeness: {
          accountIds: 'all' as const,
          heroIds: 'all' as const,
          teamAssignment: 'none' as const,
          playerNames: 'none' as const,
          ranks: 'none' as const,
        },
        hasAllAccountIds: false,
        hasAllHeroes: false,
      }
    }
    async getAccountIds() {
      return gsiState.matchPlayers
        .map((p) => p.accountid)
        .filter((id): id is number => !!id && id > 0)
    }
    async getHeroesStatus() {
      return undefined
    }
    async getStreamersInMatchCount() {
      return 0
    }
  }
  return {
    MatchDataService: FakeMatchDataService,
    getStreamersInMatch: async () => 0,
  }
})

// `delayedQueue.addTask` fires the callback synchronously so tests can assert
// on the chat output without waiting on real timers. `removeTask` tracks the
// id so tests can verify the bounty / killstreak cancellation path.
//
// We patch the singleton's own methods instead of mocking the module so that
// test files importing the real `DelayedQueue` class (unit/integration tests)
// are not affected — mock.module would replace the class with `class {}`.
let taskIdCounter = 0
const { delayedQueue: realDelayedQueue } = await import('../../../lib/DelayedQueue')

function installDelayedQueueMock() {
  ;(realDelayedQueue as any).addTask = (
    delayMs: number,
    callback: (payload: unknown) => void | Promise<void>,
    payload: unknown = null,
  ) => {
    gsiState.delayedQueueAddCalls.push({ delayMs })
    taskIdCounter += 1
    const id = `task-${taskIdCounter}`
    void callback(payload)
    return id
  }
  ;(realDelayedQueue as any).removeTask = (id: string) => {
    gsiState.delayedQueueRemovedIds.push(id)
    return true
  }
  ;(realDelayedQueue as any).getQueueSize = () => 0
}
installDelayedQueueMock()

await initTestI18n()

const { events } = await import('../../../globalEventEmitter')
const { gsiHandlers } = await import('../../../lib/consts')
const { chatClient } = await import('../../../../twitch/chatClient')
const { server } = await import('../../../server')
const { redisClient } = await import('../../../../db/redisInstance')

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

  installDelayedQueueMock()
}

// Run once at harness load so tests can import + assert without first
// calling `installGsiMocks()` if running gsi tests in isolation.
installGsiMocks()

// Side-effect imports register handlers via `eventHandler.registerEvent`.
await import('../event.aegis_picked_up')
await import('../event.aegis_denied')
await import('../event.roshan_killed')
await import('../event.tip')
await import('../event.bounty_rune_pickup')
await import('../event.generic_event')
await import('../map.paused')
await import('../map.win_team')
await import('../hero.smoked')
await import('../player.killstreak')
await import('../player.deaths')

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
