// Test harness for shared-utils. Mocks supabase, @twurple/auth, and logger so
// each test can drive specific code paths without real network or DB access.
// Filename intentionally not `.test.ts` so bun's runner ignores it.
import { mock } from 'bun:test'

export const utilsState: {
  // Recorded supabase writes for assertions.
  upserts: Array<{ table: string; values: unknown; options?: unknown }>
  inserts: Array<{ table: string; values: unknown }>
  updates: Array<{
    table: string
    values: unknown
    filters: Array<{ method: string; col: string; val: unknown }>
  }>
  // Per-table single() result for select queries.
  selectSingle: Record<string, { data: unknown; error: unknown }>
  // What @twurple/auth's getAppToken should return.
  appToken: { accessToken: string } | null
  // Whether getAppToken should throw.
  appTokenError: unknown
  loggerInfoCalls: Array<{ message: string; meta: Record<string, unknown> }>
  loggerErrorCalls: Array<{ message: string; meta: Record<string, unknown> }>
} = {
  upserts: [],
  inserts: [],
  updates: [],
  selectSingle: {},
  appToken: { accessToken: 'test-app-token' },
  appTokenError: null,
  loggerInfoCalls: [],
  loggerErrorCalls: [],
}

export function resetUtilsState() {
  utilsState.upserts = []
  utilsState.inserts = []
  utilsState.updates = []
  utilsState.selectSingle = {}
  utilsState.appToken = { accessToken: 'test-app-token' }
  utilsState.appTokenError = null
  utilsState.loggerInfoCalls = []
  utilsState.loggerErrorCalls = []
}

function createTableBuilder(table: string) {
  const filters: Array<{ method: string; col: string; val: unknown }> = []
  let updateValues: unknown = null

  const builder: any = {
    select: () => builder,
    upsert: (values: unknown, options?: unknown) => {
      utilsState.upserts.push({ table, values, options })
      return Promise.resolve({ data: null, error: null })
    },
    insert: (values: unknown) => {
      utilsState.inserts.push({ table, values })
      return Promise.resolve({ data: null, error: null })
    },
    update: (values: unknown) => {
      updateValues = values
      return updateChain
    },
    eq: (col: string, val: unknown) => {
      filters.push({ method: 'eq', col, val })
      return builder
    },
    single: async () => utilsState.selectSingle[table] ?? { data: null, error: null },
  }

  // .update() returns a separate chain that records filters then awaits.
  const updateChain: any = {
    eq: (col: string, val: unknown) => {
      filters.push({ method: 'eq', col, val })
      return updateChain
    },
    is: (col: string, val: unknown) => {
      filters.push({ method: 'is', col, val })
      return updateChain
    },
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock
    then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => {
      utilsState.updates.push({ table, values: updateValues, filters })
      return Promise.resolve({ data: null, error: null }).then(onFulfilled)
    },
  }

  return builder
}

const supabaseMock = {
  from: (table: string) => createTableBuilder(table),
}

mock.module('../src/db/supabase.js', () => ({
  default: supabaseMock,
  supabase: supabaseMock,
  getSupabaseClient: () => supabaseMock,
}))

mock.module('../src/logger.js', () => ({
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => {
      utilsState.loggerInfoCalls.push({ message, meta: meta ?? {} })
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      utilsState.loggerErrorCalls.push({ message, meta: meta ?? {} })
    },
    warn: () => undefined,
    debug: () => undefined,
  },
}))

mock.module('@twurple/auth', () => ({
  getAppToken: async () => {
    if (utilsState.appTokenError) throw utilsState.appTokenError
    return utilsState.appToken
  },
}))
