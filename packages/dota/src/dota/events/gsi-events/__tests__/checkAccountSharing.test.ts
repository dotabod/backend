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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSharedUtilsMock, initTestI18n } from '../../../../__tests__/sharedMocks'

type FacadeCall =
  | { kind: 'disable'; userId: string; reason: string; metadata?: Record<string, unknown> }
  | { kind: 'enable'; userId: string; opts?: { reason?: string; autoResolved?: boolean } }
  | {
      kind: 'recordNotification'
      userId: string
      reason: string
      metadata?: Record<string, unknown>
    }

interface TrackCall {
  userId: string
  settingKey: string
  reason: string
  metadata?: Record<string, unknown>
  opts?: { disabledValue?: boolean }
}

const state: {
  redisGetReturn: string | null
  redisSetExCalls: { key: string; ttl: number; value: string }[]
  commandDisableCalls: FacadeCall[]
  trackDisableReasonCalls: TrackCall[]
  sayCalls: { message: string }[]
  loggerWarnCalls: { message: string; meta?: Record<string, unknown> }[]
  loggerErrorCalls: { message: string; meta?: Record<string, unknown> }[]
} = {
  commandDisableCalls: [],
  loggerErrorCalls: [],
  loggerWarnCalls: [],
  redisGetReturn: null,
  redisSetExCalls: [],
  sayCalls: [],
  trackDisableReasonCalls: [],
}

function resetState() {
  state.redisGetReturn = null
  state.redisSetExCalls = []
  state.commandDisableCalls = []
  state.trackDisableReasonCalls = []
  state.sayCalls = []
  state.loggerWarnCalls = []
  state.loggerErrorCalls = []
}

// Chainable no-op supabase so transitive loads (CommandHandler bootstrap, etc.)
// don't crash on .from(...).select(...).eq(...).
function makeChainableSupabase() {
  const builder: any = {
    delete: () => builder,
    eq: () => builder,
    gte: () => builder,
    insert:  async () => Promise.resolve({ data: null, error: null }),
    is: () => builder,
    limit:  async () => Promise.resolve({ data: [], error: null }),
    lte: () => builder,
    neq: () => builder,
    not: () => builder,
    order: () => builder,
    select: () => builder,
    single: async () => ({ data: null, error: null }),
    then:  async (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled),
    update: () => builder,
    upsert:  async () => Promise.resolve({ data: null, error: null }),
  }
  return { from: () => builder, rpc: async () => ({ data: [], error: null }) }
}

vi.doMock(import('@dotabod/shared-utils'), () =>
  buildSharedUtilsMock({
    commandDisable: {
      disable: async (userId, reason, metadata) => {
        state.commandDisableCalls.push({ kind: 'disable', userId, reason, metadata })
      },
      enable: async (userId, opts) => {
        state.commandDisableCalls.push({ kind: 'enable', userId, opts })
      },
      recordNotification: async (userId, reason, metadata) => {
        state.commandDisableCalls.push({ kind: 'recordNotification', userId, reason, metadata })
      },
    },
    logger: {
      debug: () => undefined,
      error: (message: string, meta?: Record<string, unknown>) => {
        state.loggerErrorCalls.push({ message, meta })
      },
      info: () => undefined,
      warn: (message: string, meta?: Record<string, unknown>) => {
        state.loggerWarnCalls.push({ message, meta })
      },
    },
    supabase: makeChainableSupabase(),
    trackDisableReason: async (userId, settingKey, reason, metadata, opts) => {
      state.trackDisableReasonCalls.push({ userId, settingKey, reason, metadata, opts })
    },
  })
)

// Replace `say` so we capture chat output (the "blocked" warning) and so the
// real implementation's chatClient / settings lookups don't bootstrap. Path is
// relative to this test file; vitest resolves it to the same file `newdata.ts`
// imports as `../../say` from its own location.
vi.doMock(import('../../../say'), () => ({
  say: (_client: unknown, message: string) => {
    state.sayCalls.push({ message })
  },
}))

await initTestI18n()

const { redisClient } = await import('../../../../db/redisInstance')
;(redisClient as any).client = {
  get: async (_key: string) => state.redisGetReturn,
  setEx: async (key: string, ttl: number, value: string) => {
    state.redisSetExCalls.push({ key, ttl, value })
    return 'OK'
  },
}

const { checkAccountSharing, __resetAccountSharingLogCacheForTests } = await import('../newdata')
const { events, newData, processChanges, recoverMultiAccount } =
  await import('../../../globalEventEmitter')
const { gsiHandlers } = await import('../../../lib/consts')
const eventHandler = (await import('../../EventHandler')).default

let gameplayHandlerCalls = 0
let winTeamHandlerCalls = 0
eventHandler.registerEvent('test:multi-account-gameplay', {
  handler: () => {
    gameplayHandlerCalls++
  },
})
eventHandler.registerEvent('map:win_team', {
  handler: () => {
    winTeamHandlerCalls++
  },
})

const baseClient = () =>
  ({
    gsi: { player: { name: 'Streamer' } },
    locale: 'en',
    steam32Id: 11111,
    token: 'token-abc',
  }) as any

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
    const handler: any = {
      client: {
        gsi: {},
        multiAccount: 440614454,
        name: 'blocked',
        settings: [],
        stream_online: true,
        token,
      },
      disabled: false,
      setupOBSBlockers: async () => {
        gameplayCalls++
      },
      updateSteam32Id: async () => {
        recoveryCalls++
      },
    }
    gsiHandlers.set(token, handler)

    events.emit('newdata', {}, token)
    events.emit('test:multi-account-gameplay', {}, token)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(recoveryCalls).toBe(1)
    expect(gameplayCalls).toBe(0)
    expect(gameplayHandlerCalls).toBe(0)
  })

  it('recovers before dispatching a one-shot win transition from the same request', async () => {
    const token = 'recovering-token'
    const order: string[] = []
    const handler: any = {
      client: {
        gsi: {},
        multiAccount: 440614454,
        name: 'recovering',
        settings: [],
        stream_online: true,
        token,
      },
      disabled: false,
      setupOBSBlockers: async () => undefined,
      updateSteam32Id: async () => {
        order.push('recover')
        handler.client.multiAccount = undefined
      },
    }
    gsiHandlers.set(token, handler)

    const req = {
      body: {
        auth: { token },
        map: { win_team: 'radiant' },
        previously: { map: { win_team: 'none' } },
      },
    } as never
    const res = { status: () => ({ json: () => {} }) } as never

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
    expect((state.commandDisableCalls[0] as any).metadata).toMatchObject({
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
    ;(redisClient as any).client = {
      get: async () => {
        throw new Error('redis down')
      },
      setEx: async () => 'OK',
    }

    const blocked = await checkAccountSharing(baseClient(), 'match-1')

    expect(blocked).toBeFalsy()
    expect(state.loggerErrorCalls.length).toBeGreaterThanOrEqual(1)
    expect(state.commandDisableCalls).toHaveLength(0)

    // Restore client for subsequent tests.
    ;(redisClient as any).client = {
      get: async () => state.redisGetReturn,
      setEx: async (key: string, ttl: number, value: string) => {
        state.redisSetExCalls.push({ key, ttl, value })
        return 'OK'
      },
    }
  })
})
