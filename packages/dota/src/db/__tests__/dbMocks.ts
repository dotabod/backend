// Slim test harness for the db/ test suite. Intentionally separate from
// ../../twitch/lib/__tests__/setupMocks.ts to avoid pulling in chat command
// side-effect imports for plain DB unit/integration tests.
//
// Filename ends in `Mocks.ts` (not `.test.ts`) so bun's runner skips it.
import { vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n } from '../../__tests__/sharedMocks'

export type TableResult = { data: unknown; error: unknown } | null

export const dbState: {
  // Per-table query results, keyed by table name. `single()` and direct-await
  // calls both pull from here.
  tableResults: Record<string, TableResult>
  // RPC results, keyed by function name (currently only get_grouped_bets).
  rpcResult: TableResult
  // Recorded writes for assertions.
  inserts: Array<{ table: string; values: unknown }>
  updates: Array<{ table: string; values: unknown; whereCol?: string; whereVal?: unknown }>
  // Logger captures.
  loggerErrorCalls: Array<{ message: string; meta: Record<string, unknown> }>
  loggerInfoCalls: Array<{ message: string; meta: Record<string, unknown> }>
} = {
  tableResults: {},
  rpcResult: null,
  inserts: [],
  updates: [],
  loggerErrorCalls: [],
  loggerInfoCalls: [],
}

export function resetDbState() {
  dbState.tableResults = {}
  dbState.rpcResult = null
  dbState.inserts = []
  dbState.updates = []
  dbState.loggerErrorCalls = []
  dbState.loggerInfoCalls = []
  // Re-assert our mock in case a sibling harness (setupMocks, gsiMocks) replaced
  // @dotabod/shared-utils with a different supabase factory since last test ran.
  reinstallDbMock()
}

function createTableBuilder(table: string) {
  const result = dbState.tableResults[table] ?? { data: null, error: null }
  const builder: any = {
    select: () => builder,
    insert: (values: unknown) => {
      dbState.inserts.push({ table, values })
      return Promise.resolve({ data: null, error: null })
    },
    update: (values: unknown) => ({
      eq: (col: string, val: unknown) => {
        dbState.updates.push({ table, values, whereCol: col, whereVal: val })
        return Promise.resolve({ data: null, error: null })
      },
    }),
    eq: () => builder,
    neq: () => builder,
    is: () => builder,
    not: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => result,
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock
    then: (onFulfilled: (value: TableResult) => unknown) =>
      Promise.resolve(result).then(onFulfilled),
  }
  return builder
}

const supabaseMock = {
  from: (table: string) => createTableBuilder(table),
  rpc: async () => dbState.rpcResult ?? { data: [], error: null },
}

const loggerMock = {
  info: (message: string, meta?: Record<string, unknown>) => {
    dbState.loggerInfoCalls.push({ message, meta: meta ?? {} })
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    dbState.loggerErrorCalls.push({ message, meta: meta ?? {} })
  },
  warn: () => undefined,
  debug: () => undefined,
}

function reinstallDbMock() {
  vi.doMock('@dotabod/shared-utils', () =>
    buildSharedUtilsMock({ supabase: supabaseMock, logger: loggerMock }),
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
