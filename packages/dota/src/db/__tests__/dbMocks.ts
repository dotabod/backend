// Slim test harness for the db/ test suite. Intentionally separate from
// ../../twitch/lib/__tests__/setupMocks.ts to avoid pulling in chat command
// side-effect imports for plain DB unit/integration tests.
//
// Filename ends in `Mocks.ts` (not `.test.ts`) so bun's runner skips it.
import { vi } from 'vitest'

import { buildSharedUtilsMock, initTestI18n } from '../../__tests__/sharedMocks'

export type TableResult = { data: unknown; error: unknown } | null

export const dbState: {
  // Per-table query results, keyed by table name. `single()` and direct-await
  // calls both pull from here.
  tableResults: Record<string, TableResult>
  // RPC results, keyed by function name (currently only get_grouped_bets).
  rpcResult: TableResult
  rpcCalls: { name: string; args: Record<string, unknown> }[]
  gteCalls: { table: string; column: string; value: unknown }[]
  // Recorded writes for assertions.
  inserts: { table: string; values: unknown }[]
  updates: { table: string; values: unknown; whereCol?: string; whereVal?: unknown }[]
  upserts: { table: string; values: unknown; options?: unknown }[]
  // Logger captures.
  loggerErrorCalls: { message: string; meta: Record<string, unknown> }[]
  loggerInfoCalls: { message: string; meta: Record<string, unknown> }[]
  loggerWarnCalls: { message: string; meta: Record<string, unknown> }[]
} = {
  gteCalls: [],
  inserts: [],
  loggerErrorCalls: [],
  loggerInfoCalls: [],
  loggerWarnCalls: [],
  rpcCalls: [],
  rpcResult: null,
  tableResults: {},
  updates: [],
  upserts: [],
}

export function resetDbState() {
  dbState.tableResults = {}
  dbState.rpcResult = null
  dbState.rpcCalls = []
  dbState.gteCalls = []
  dbState.inserts = []
  dbState.updates = []
  dbState.upserts = []
  dbState.loggerErrorCalls = []
  dbState.loggerInfoCalls = []
  dbState.loggerWarnCalls = []
  // Re-assert our mock in case a sibling harness (setupMocks, gsiMocks) replaced
  // @dotabod/shared-utils with a different supabase factory since last test ran.
  reinstallDbMock()
}

function createTableBuilder(table: string) {
  const result = dbState.tableResults[table] ?? { data: null, error: null }
  const builder: any = {
    eq: () => builder,
    gte: (column: string, value: unknown) => {
      dbState.gteCalls.push({ column, table, value })
      return builder
    },
    in: () => builder,
    insert: async (values: unknown) => {
      dbState.inserts.push({ table, values })
      return { data: null, error: null }
    },
    is: () => builder,
    limit: () => builder,
    lte: () => builder,
    neq: () => builder,
    not: () => builder,
    order: () => builder,
    select: () => builder,
    single: async () => result,
    then: async (onFulfilled: (value: TableResult) => unknown) =>
      await Promise.resolve(result).then(onFulfilled),
    update: (values: unknown) => ({
      eq: async (col: string, val: unknown) => {
        dbState.updates.push({ table, values, whereCol: col, whereVal: val })
        return { data: null, error: null }
      },
    }),
    upsert: async (values: unknown, options?: unknown) => {
      dbState.upserts.push({ options, table, values })
      return { data: null, error: null }
    },
  }
  return builder
}

const supabaseMock = {
  from: (table: string) => createTableBuilder(table),
  rpc: async (name: string, args: Record<string, unknown>) => {
    dbState.rpcCalls.push({ args, name })
    return dbState.rpcResult ?? { data: [], error: null }
  },
}

const loggerMock = {
  debug: () => {},
  error: (message: string, meta?: Record<string, unknown>) => {
    dbState.loggerErrorCalls.push({ message, meta: meta ?? {} })
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    dbState.loggerInfoCalls.push({ message, meta: meta ?? {} })
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    dbState.loggerWarnCalls.push({ message, meta: meta ?? {} })
  },
}

function reinstallDbMock() {
  vi.doMock(import('@dotabod/shared-utils'), () =>
    buildSharedUtilsMock({ logger: loggerMock, supabase: supabaseMock })
  )
}
reinstallDbMock()

await initTestI18n()

// Stub the GSIHandler constructor so getDBUser can build a handler without
// pulling in real Dota wiring. Returns the minimal shape that getDBUser stores
// in `gsiHandlers`: just enough that the cache-hit branch returns the client.
const { setGSIHandlerConstructor } = await import('../../dota/GSIHandlerFactory')
setGSIHandlerConstructor((client) => ({ client }) as any)

// Re-export the module-level Maps so each test can reset them in beforeEach.
// getDBUser mutates these singletons directly.
export const { gsiHandlers, invalidTokens, lookingupToken, twitchIdToToken, twitchNameToToken } =
  await import('../../dota/lib/consts')

export function resetUserCaches() {
  gsiHandlers.clear()
  invalidTokens.clear()
  lookingupToken.clear()
  twitchIdToToken.clear()
  twitchNameToToken.clear()
}
