// Regression coverage for commit b14e8d6b ("fix(account-sharing): stop silent
// re-enable of manually-disabled bots").
//
// The bug: checkAccountSharing called `trackDisableReason`, which unconditionally
// upserts settings.value=false — for commandDisable that means "commands enabled".
// So a streamer who had !toggle'd the bot off would have it silently re-enabled
// the moment account sharing was detected.
//
// The fix swapped to `commandDisable.recordNotification`, which inserts the
// audit row WITHOUT touching the settings row. These tests pin that behavior.
import { setTimeout as delay } from 'node:timers/promises'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildSharedUtilsMock,
  createGsiHandlerStub,
  createPacketStub,
  createSocketClientStub,
  initTestI18n,
} from '../../../../__tests__/shared-mocks'
import type { SocketClient } from '../../../../types'

type SharedUtilsMockOptions = Parameters<typeof buildSharedUtilsMock>[0]
type CommandDisableMock = NonNullable<SharedUtilsMockOptions['commandDisable']>
type CommandDisableMetadata = NonNullable<Parameters<CommandDisableMock['disable']>[2]>
type CommandDisableReason = Parameters<CommandDisableMock['disable']>[1]
type CommandEnableOptions = NonNullable<Parameters<CommandDisableMock['enable']>[1]>
type LoggerMetadata = NonNullable<Parameters<SharedUtilsMockOptions['logger']['info']>[1]>
type TrackDisableMock = NonNullable<SharedUtilsMockOptions['trackDisableReason']>
type TrackDisableMetadata = NonNullable<Parameters<TrackDisableMock>[3]>
type TrackDisableOptions = NonNullable<Parameters<TrackDisableMock>[4]>

type FacadeCall =
  | {
      kind: 'disable'
      metadata?: CommandDisableMetadata
      reason: CommandDisableReason
      userId: string
    }
  | { kind: 'enable'; opts?: CommandEnableOptions; userId: string }
  | {
      kind: 'recordNotification'
      metadata?: CommandDisableMetadata
      reason: CommandDisableReason
      userId: string
    }

interface TrackCall {
  metadata?: TrackDisableMetadata
  opts?: TrackDisableOptions
  reason: Parameters<TrackDisableMock>[2]
  settingKey: Parameters<TrackDisableMock>[1]
  userId: Parameters<TrackDisableMock>[0]
}

interface HarnessState {
  commandDisableCalls: FacadeCall[]
  loggerErrorCalls: { message: string; meta?: LoggerMetadata }[]
  loggerWarnCalls: { message: string; meta?: LoggerMetadata }[]
  redisGetReturn: string | null
  redisSetExCalls: { key: string; ttl: number; value: string }[]
  sayCalls: { message: string }[]
  trackDisableReasonCalls: TrackCall[]
}

const state: HarnessState = {
  commandDisableCalls: [],
  loggerErrorCalls: [],
  loggerWarnCalls: [],
  redisGetReturn: null,
  redisSetExCalls: [],
  sayCalls: [],
  trackDisableReasonCalls: [],
}

const resetState = function resetState() {
  state.redisGetReturn = null
  state.redisSetExCalls = []
  state.commandDisableCalls = []
  state.trackDisableReasonCalls = []
  state.sayCalls = []
  state.loggerWarnCalls = []
  state.loggerErrorCalls = []
}

interface EmptyListQueryResult {
  data: never[]
  error: null
}

interface EmptyMutationResult {
  data: null
  error: null
}

interface SupabaseBuilder {
  delete: () => SupabaseBuilder
  eq: () => SupabaseBuilder
  gte: () => SupabaseBuilder
  insert: () => Promise<EmptyMutationResult>
  is: () => SupabaseBuilder
  limit: () => Promise<EmptyListQueryResult>
  lte: () => SupabaseBuilder
  neq: () => SupabaseBuilder
  not: () => SupabaseBuilder
  order: () => SupabaseBuilder
  select: () => SupabaseBuilder
  single: () => Promise<EmptyMutationResult>
  update: () => SupabaseBuilder
  upsert: () => Promise<EmptyMutationResult>
}

// Chainable no-op supabase so transitive loads (CommandHandler bootstrap, etc.)
// don't crash on .from(...).select(...).eq(...).
const makeChainableSupabase = function makeChainableSupabase() {
  const builder: SupabaseBuilder = Object.assign(
    Promise.resolve<EmptyListQueryResult>({ data: [], error: null }),
    {
      delete: () => builder,
      eq: () => builder,
      gte: () => builder,
      insert: async () => await Promise.resolve({ data: null, error: null }),
      is: () => builder,
      limit: async () => await Promise.resolve({ data: [], error: null }),
      lte: () => builder,
      neq: () => builder,
      not: () => builder,
      order: () => builder,
      select: () => builder,
      single: async () => await Promise.resolve({ data: null, error: null }),
      update: () => builder,
      upsert: async () => await Promise.resolve({ data: null, error: null }),
    }
  )
  return {
    from: () => builder,
    rpc: async () => await Promise.resolve({ data: [], error: null }),
  }
}

vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({
    commandDisable: {
      disable: async (userId, reason, metadata) => {
        state.commandDisableCalls.push({ kind: 'disable', metadata, reason, userId })
        await Promise.resolve()
      },
      enable: async (userId, opts) => {
        state.commandDisableCalls.push({ kind: 'enable', opts, userId })
        await Promise.resolve()
      },
      recordNotification: async (userId, reason, metadata) => {
        state.commandDisableCalls.push({ kind: 'recordNotification', metadata, reason, userId })
        await Promise.resolve()
      },
    },
    logger: {
      debug: () => {},
      error: (message: string, meta?: LoggerMetadata) => {
        state.loggerErrorCalls.push({ message, meta })
      },
      info: () => {},
      warn: (message: string, meta?: LoggerMetadata) => {
        state.loggerWarnCalls.push({ message, meta })
      },
    },
    supabase: makeChainableSupabase(),
    trackDisableReason: async (userId, settingKey, reason, metadata, opts) => {
      state.trackDisableReasonCalls.push({ metadata, opts, reason, settingKey, userId })
      await Promise.resolve()
    },
  })
)

// Replace `say` so we capture chat output (the "blocked" warning) and so the
// real implementation's chatClient / settings lookups don't bootstrap. Path is
// relative to this test file; vitest resolves it to the same file `newdata.ts`
// imports as `../../say` from its own location.
vi.doMock(import('../../../say'), () => ({
  say: (_client: SocketClient, message: string) => {
    state.sayCalls.push({ message })
  },
}))

await initTestI18n()

const { redisClient } = await import('../../../../db/redis-instance')
const installRedisClient = function installRedisClient(shouldThrow = false) {
  Object.assign(redisClient, {
    client: {
      get: async () => {
        if (shouldThrow) {
          return await Promise.reject(new Error('redis down'))
        }
        return await Promise.resolve(state.redisGetReturn)
      },
      setEx: async (key: string, ttl: number, value: string) => {
        state.redisSetExCalls.push({ key, ttl, value })
        return await Promise.resolve('OK')
      },
    },
  })
}
installRedisClient()

const { checkAccountSharing, __resetAccountSharingLogCacheForTests } = await import('../newdata')
const { events, newData, processChanges, recoverMultiAccount } =
  await import('../../../global-event-emitter')
const { gsiHandlers } = await import('../../../lib/consts')
const eventHandlerModule = await import('../../event-handler')
const eventHandler = eventHandlerModule.default

let gameplayHandlerCalls = 0
let winTeamHandlerCalls = 0
eventHandler.registerEvent('test:multi-account-gameplay', {
  handler: () => {
    gameplayHandlerCalls += 1
  },
})
eventHandler.registerEvent('map:win_team', {
  handler: () => {
    winTeamHandlerCalls += 1
  },
})

const baseClient = () =>
  createSocketClientStub({
    gsi: createPacketStub({ player: { name: 'Streamer' } }),
    locale: 'en',
    steam32Id: 11_111,
    token: 'token-abc',
  })

describe('account sharing safeguards', () => {
  beforeEach(() => {
    resetState()
    __resetAccountSharingLogCacheForTests()
    gsiHandlers.clear()
    gameplayHandlerCalls = 0
    winTeamHandlerCalls = 0
  })

  describe('newdata multi-account recovery gate', () => {
    it('runs Steam recovery for a blocked client and returns before gameplay processing if blocked', async () => {
      let recoveryCalls = 0
      let gameplayCalls = 0
      const token = 'blocked-token'
      const client = createSocketClientStub({
        gsi: createPacketStub(),
        multiAccount: 440_614_454,
        name: 'blocked',
        stream_online: true,
        token,
      })
      const handler = createGsiHandlerStub(client, {
        disabled: false,
        setupOBSBlockers: async () => {
          gameplayCalls += 1
          await Promise.resolve()
        },
        updateSteam32Id: async () => {
          recoveryCalls += 1
          await Promise.resolve()
        },
      })
      gsiHandlers.set(token, handler)

      events.emit('newdata', {}, token)
      events.emit('test:multi-account-gameplay', {}, token)
      await delay(0)

      expect(recoveryCalls).toBe(1)
      expect(gameplayCalls).toBe(0)
      expect(gameplayHandlerCalls).toBe(0)
    })

    it('recovers before dispatching a one-shot win transition from the same request', async () => {
      const token = 'recovering-token'
      const order: string[] = []
      const client = createSocketClientStub({
        gsi: createPacketStub(),
        multiAccount: 440_614_454,
        name: 'recovering',
        stream_online: true,
        token,
      })
      const handler = createGsiHandlerStub(client, {
        disabled: false,
        setupOBSBlockers: async () => {
          await Promise.resolve()
        },
        updateSteam32Id: async () => {
          order.push('recover')
          delete handler.client.multiAccount
          await Promise.resolve()
        },
      })
      gsiHandlers.set(token, handler)

      const currentMap = {
        clock_time: 1,
        customgamename: '',
        daytime: true,
        dire_score: 0,
        game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
        game_time: 1,
        matchid: 'match-1',
        name: 'start',
        nightstalker_night: false,
        paused: false,
        radiant_score: 1,
        ward_purchase_cooldown: 0,
        win_team: 'radiant',
      }
      const req: Parameters<typeof recoverMultiAccount>[0] = {
        body: createPacketStub({
          auth: { token },
          map: currentMap,
          previously: createPacketStub({
            map: { ...currentMap, win_team: 'none' },
          }),
        }),
      }
      const res: Parameters<typeof recoverMultiAccount>[1] = {
        json: () => res,
        status: () => res,
      }

      await recoverMultiAccount(req, res, () => {
        processChanges('previously')(req, res, () => {
          processChanges('added')(req, res, () => {
            newData(req, res)
          })
        })
      })
      order.push(winTeamHandlerCalls ? 'win' : 'missing-win')

      expect(order).toStrictEqual(['recover', 'win'])
      expect(winTeamHandlerCalls).toBe(1)
    })
  })

  describe('checkAccountSharing', () => {
    it('returns false and writes the first Steam id without flagging sharing', async () => {
      // Redis has no prior steam ids → the function should seed the cache and allow.
      const blocked = await checkAccountSharing(baseClient(), 'match-1')

      expect(blocked).toBeFalsy()
      expect(state.redisSetExCalls).toHaveLength(1)
      expect(JSON.parse(state.redisSetExCalls[0].value)).toStrictEqual(['11111'])
      expect(state.commandDisableCalls).toHaveLength(0)
      expect(state.sayCalls).toHaveLength(0)
    })

    it('returns false for the PRIMARY (first) steam id even after a second id appears', async () => {
      // Primary is the first id; secondary requests are blocked, but the primary itself stays allowed.
      state.redisGetReturn = JSON.stringify(['11111', '22222'])
      const blocked = await checkAccountSharing(baseClient(), 'match-1')

      expect(blocked).toBeFalsy()
      expect(state.commandDisableCalls).toHaveLength(0)
    })

    it('records an ACCOUNT_SHARING notification via the facade and blocks a secondary steam id', async () => {
      state.redisGetReturn = JSON.stringify(['22222'])
      const blocked = await checkAccountSharing(baseClient(), 'match-1')

      expect(blocked).toBeTruthy()
      // The fix: recordNotification must be used, NOT disable or trackDisableReason.
      expect(state.commandDisableCalls).toHaveLength(1)
      expect(state.commandDisableCalls[0]).toMatchObject({
        kind: 'recordNotification',
        reason: 'ACCOUNT_SHARING',
        userId: 'token-abc',
      })
      const [call] = state.commandDisableCalls
      expect(call?.kind).toBe('recordNotification')
      if (call?.kind !== 'recordNotification') {
        throw new Error('Expected a recordNotification call')
      }
      expect(call.metadata).toMatchObject({
        blocked_steam32_id: '11111',
        primary_steam32_id: '22222',
      })
    })

    it('does NOT call commandDisable.disable or trackDisableReason — that would re-enable a manually-disabled bot (commit b14e8d6b)', async () => {
      state.redisGetReturn = JSON.stringify(['22222'])
      await checkAccountSharing(baseClient(), 'match-1')

      expect(state.commandDisableCalls.some((c) => c.kind === 'disable')).toBeFalsy()
      expect(state.trackDisableReasonCalls).toHaveLength(0)
    })

    it('rate-limits repeated notifications: second block within the interval does not re-record', async () => {
      state.redisGetReturn = JSON.stringify(['22222'])
      await checkAccountSharing(baseClient(), 'match-1')
      await checkAccountSharing(baseClient(), 'match-1')

      // Two blocks, but only one notification + one chat warning.
      expect(state.commandDisableCalls).toHaveLength(1)
      expect(state.sayCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('returns false when redis throws — fail-open so a redis outage cannot block GSI', async () => {
      installRedisClient(true)

      const blocked = await checkAccountSharing(baseClient(), 'match-1')

      expect(blocked).toBeFalsy()
      expect(state.loggerErrorCalls.length).toBeGreaterThanOrEqual(1)
      expect(state.commandDisableCalls).toHaveLength(0)

      // Restore client for subsequent tests.
      installRedisClient()
    })
  })
})
