// Test harness for GSI event handlers. Drives `events.emit(...)` directly
// and asserts on captured chat output / redis writes / socket emits.
// Filename intentionally not `.test.ts` so bun's runner ignores it.
import { vi } from 'vitest'

import {
  buildSharedUtilsMock,
  createGsiHandlerStub,
  createPacketStub,
  createSocketClientStub,
  initTestI18n,
  PRO_SUB,
} from '../../../../__tests__/shared-mocks'
import type { Packet, SocketClient } from '../../../../types'
import type { GSIHandlerType } from '../../../gsi-handler-types'

export interface MatchPlayer {
  heroid: number | undefined
  accountid: number
  playerid: number | null
}

export const gsiState: {
  // Per-key redis reads. Both RedisClient.getInstance().client.get and
  // redisInstance.redisClient.client.get read from this map. JSON reads
  // (json.get) read from `redisJson` since they return parsed objects.
  redisGet: Record<string, string | null>
  redisJson: Record<string, unknown>
  // Tracks writes for assertion.
  redisJsonSetCalls: { key: string; path: string; value: unknown }[]
  redisJsonDelCalls: string[]
  redisJsonDelError: Error | null
  // Roster surfaced via the mocked MatchDataService. Most tests don't care, default empty.
  matchPlayers: MatchPlayer[]
  // Captured chatClient.say calls.
  chatSayCalls: { channel: string; message: string }[]
  // Captured server.io.to(token).emit(event, payload).
  ioEmitCalls: { token: string; event: string; payload: unknown }[]
  // Captured delayedQueue.addTask payloads (after the callback fires).
  delayedQueueAddCalls: { delayMs: number }[]
  delayedQueueRemovedIds: string[]
} = {
  chatSayCalls: [],
  delayedQueueAddCalls: [],
  delayedQueueRemovedIds: [],
  ioEmitCalls: [],
  matchPlayers: [],
  redisGet: {},
  redisJson: {},
  redisJsonDelCalls: [],
  redisJsonDelError: null,
  redisJsonSetCalls: [],
}

export const resetGsiState = function resetGsiState() {
  gsiState.redisGet = {}
  gsiState.redisJson = {}
  gsiState.redisJsonSetCalls = []
  gsiState.redisJsonDelCalls = []
  gsiState.redisJsonDelError = null
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
    logger: { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} },
    supabase: {
      from: () => ({}),
      rpc: async () => await Promise.resolve({ data: [], error: null }),
    },
  })
)

// RedisClient is a class with a getInstance() static method. The handlers call
// `RedisClient.getInstance().client.json.set/get` and `.client.get`.
const fakeRedisClient = {
  get: async (key: string) => await Promise.resolve(gsiState.redisGet[key] ?? null),
  set: async () => await Promise.resolve('OK'),
  // Sorted-set stubs used by clipSchedule.ts (scheduleClip / rearmPersistedClips).
  // Errors are caught by clipSchedule's own try/catch, so returning silently is
  // fine for tests that don't exercise the durability path directly.
  zAdd: async () => await Promise.resolve(0),
  zRem: async () => await Promise.resolve(0),
  zRangeByScore: async () => await Promise.resolve([] as string[]),
  json: {
    del: async (key: string) => {
      gsiState.redisJsonDelCalls.push(key)
      if (gsiState.redisJsonDelError) {
        return await Promise.reject(gsiState.redisJsonDelError)
      }
      delete gsiState.redisJson[key]
      return await Promise.resolve(1)
    },
    get: async (key: string) => await Promise.resolve(gsiState.redisJson[key] ?? null),
    set: async (key: string, path: string, value: unknown) => {
      // Clone at write time. Handlers commonly mutate `res` after json.set
      // (e.g. generateRoshanMessage recalculates expireS), and storing the
      // raw reference would let those post-call mutations bleed back into
      // recorded test state.
      const snapshot = JSON.parse(JSON.stringify(value))
      gsiState.redisJsonSetCalls.push({ key, path, value: snapshot })
      gsiState.redisJson[key] = snapshot
      return await Promise.resolve('OK')
    },
  },
}
const fakeRedisInstance = {
  client: fakeRedisClient,
  getJson: async (key: string) => await fakeRedisClient.json.get(key),
  setJson: async (key: string, value: unknown) => await fakeRedisClient.json.set(key, '$', value),
}
vi.doMock('../../../../db/redis-client', () => ({
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
      return await Promise.resolve({
        completeness: {
          accountIds: 'all' as const,
          heroIds: 'all' as const,
          playerNames: 'none' as const,
          ranks: 'none' as const,
          teamAssignment: 'none' as const,
        },
        hasAllAccountIds: false,
        hasAllHeroes: false,
        players: gsiState.matchPlayers.map((p) => ({
          accountId: p.accountid || null,
          heroId: p.heroid ?? null,
          playerName: null,
          rank: null,
          selected: null,
          slot: p.playerid,
          team: null,
        })),
        source: 'sourcetv' as const,
        stage: 'in-progress' as const,
      })
    }
    async getAccountIds() {
      return await Promise.resolve(
        gsiState.matchPlayers.map((p) => p.accountid).filter((id): id is number => !!id && id > 0)
      )
    }
    async getHeroesStatus() {
      return await Promise.resolve()
    }
    async getStreamersInMatchCount() {
      return await Promise.resolve(0)
    }
    async resolveHeroNameForSlot({ eventPlayerId }: { eventPlayerId: number }) {
      const p = gsiState.matchPlayers.find((mp) => mp.playerid === eventPlayerId)
      return await Promise.resolve({
        name: p?.heroid !== undefined && p.heroid !== 0 ? `hero_${p.heroid}` : null,
        resolvedFromRoster: p !== undefined,
      })
    }
  }
  return {
    MatchDataService: FakeMatchDataService,
    getStreamersInMatch: async () => await Promise.resolve(0),
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
const { delayedQueue: realDelayedQueue } = await import('../../../lib/delayed-queue')

const installDelayedQueueMock = function installDelayedQueueMock() {
  Object.defineProperties(realDelayedQueue, {
    addTask: {
      configurable: true,
      value: (
        delayMs: number,
        callback: (payload: unknown) => void | Promise<void>,
        payload: unknown = null
      ) => {
        gsiState.delayedQueueAddCalls.push({ delayMs })
        taskIdCounter += 1
        const id = `task-${taskIdCounter}`
        void callback(payload)
        return id
      },
    },
    getQueueSize: { configurable: true, value: () => 0 },
    removeTask: {
      configurable: true,
      value: (id: string) => {
        gsiState.delayedQueueRemovedIds.push(id)
        return true
      },
    },
  })
}
installDelayedQueueMock()

await initTestI18n()

const { events } = await import('../../../global-event-emitter')
const { gsiHandlers } = await import('../../../lib/consts')
const { chatClient } = await import('../../../../twitch/chat-client')
const { server } = await import('../../../server')
const { redisClient } = await import('../../../../db/redis-instance')

// Re-install chatClient + server patches each time. setupMocks.ts in the
// twitch suite ALSO monkey-patches chatClient.say at its module load time;
// because mock.module / monkey-patches are process-wide, whichever harness
// loads last wins. Calling this in `beforeEach` from gsi tests guarantees
// the gsi patches are active for the test about to run.
export const installGsiMocks = function installGsiMocks() {
  chatClient.say = (channel: string, message: string) => {
    gsiState.chatSayCalls.push({ channel, message })
  }

  Object.assign(redisClient, { client: fakeRedisClient })

  server.setServer({
    io: {
      fetchSockets: async () => await Promise.resolve([]),
      to: (token: string) => ({
        emit: (event: string, payload: unknown) => {
          gsiState.ioEmitCalls.push({ event, payload, token })
        },
      }),
    },
  })

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
await import('../player.kill_list')

export { events, gsiHandlers }

type TestPacket = Packet & {
  hero: NonNullable<Packet['hero']>
  map: NonNullable<Packet['map']>
  player: NonNullable<Packet['player']>
}

type TestClient = SocketClient & { gsi: TestPacket }

export type GsiHandlerLike = Omit<GSIHandlerType, 'client'> & {
  client: TestClient
  closeBetsCalls: ('radiant' | 'dire' | null)[]
}

export const makeGsiHandler = function makeGsiHandler(
  overrides: Partial<GsiHandlerLike> = {}
): GsiHandlerLike {
  const token = 'token-gsi-1'
  const closeBetsCalls: ('radiant' | 'dire' | null)[] = []
  const { client: clientOverride, ...handlerOverrides } = overrides
  const gsi = createPacketStub({
    hero: { id: 25, name: 'npc_dota_hero_lina' },
    map: { clock_time: 600, game_time: 600, matchid: '7777777777' },
    player: { activity: 'playing', team_name: 'radiant' },
  })
  const client =
    clientOverride ??
    createSocketClientStub({
      gsi,
      locale: 'en',
      multiAccount: undefined,
      name: 'streamer',
      settings: [],
      stream_online: true,
      subscription: PRO_SUB,
      token,
    })
  const handler = createGsiHandlerStub(client, {
    addSecondsToNow: (seconds) => new Date(Date.now() + seconds * 1000),
    bountyHeroNames: [],
    closeBets: async (winningTeam = null) => {
      closeBetsCalls.push(winningTeam)
      await Promise.resolve()
    },
    disabled: false,
    getToken: () => token,
    ...handlerOverrides,
  })
  return Object.assign(handler, { client, closeBetsCalls })
}

export const registerHandler = function registerHandler(handler: GsiHandlerLike) {
  gsiHandlers.set(handler.getToken(), handler)
}
