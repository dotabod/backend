// Test harness for shared-utils. Mocks supabase, @twurple/auth, and logger so
// each test can drive specific code paths without real network or DB access.
// Filename intentionally not `.test.ts` so bun's runner ignores it.
import { vi } from 'vitest'

export const utilsState: {
  // Recorded supabase writes for assertions.
  upserts: { table: string; values: unknown; options?: unknown }[]
  inserts: { table: string; values: unknown }[]
  updates: {
    table: string
    values: unknown
    filters: { method: string; col: string; val: unknown }[]
  }[]
  // Per-table single() result for select queries.
  selectSingle: Record<string, { data: unknown; error: unknown }>
  // What @twurple/auth's getAppToken should return.
  appToken: { accessToken: string } | null
  // Whether getAppToken should throw.
  appTokenError: unknown
  loggerInfoCalls: { message: string; meta: Record<string, unknown> }[]
  loggerErrorCalls: { message: string; meta: Record<string, unknown> }[]
} = {
  appToken: { accessToken: 'test-app-token' },
  appTokenError: null,
  inserts: [],
  loggerErrorCalls: [],
  loggerInfoCalls: [],
  selectSingle: {},
  updates: [],
  upserts: [],
}

export const resetUtilsState = function resetUtilsState() {
  utilsState.upserts = []
  utilsState.inserts = []
  utilsState.updates = []
  utilsState.selectSingle = {}
  utilsState.appToken = { accessToken: 'test-app-token' }
  utilsState.appTokenError = null
  utilsState.loggerInfoCalls = []
  utilsState.loggerErrorCalls = []
}

const createTableBuilder = function createTableBuilder(table: string) {
  const filters: { method: string; col: string; val: unknown }[] = []
  let updateValues: unknown = null

  const builder: any = {
    eq: (col: string, val: unknown) => {
      filters.push({ col, method: 'eq', val })
      return builder
    },
    insert: async (values: unknown) => {
      utilsState.inserts.push({ table, values })
      return { data: null, error: null }
    },
    select: () => builder,
    single: async () => utilsState.selectSingle[table] ?? { data: null, error: null },
    update: (values: unknown) => {
      updateValues = values
      return updateChain
    },
    upsert: async (values: unknown, options?: unknown) => {
      utilsState.upserts.push({ options, table, values })
      return { data: null, error: null }
    },
  }

  // .update() returns a separate chain that records filters then awaits.
  const updateChain: any = {
    eq: (col: string, val: unknown) => {
      filters.push({ col, method: 'eq', val })
      return updateChain
    },
    is: (col: string, val: unknown) => {
      filters.push({ col, method: 'is', val })
      return updateChain
    },
    then: async (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => {
      utilsState.updates.push({ filters, table, values: updateValues })
      return await Promise.resolve({ data: null, error: null }).then(onFulfilled)
    },
  }

  return builder
}

const supabaseMock = {
  from: (table: string) => createTableBuilder(table),
}

vi.doMock('../src/db/supabase', () => ({
  default: supabaseMock,
  getSupabaseClient: () => supabaseMock,
  supabase: supabaseMock,
}))

vi.doMock('../src/logger', () => ({
  logger: {
    debug: () => {},
    error: (message: string, meta?: Record<string, unknown>) => {
      utilsState.loggerErrorCalls.push({ message, meta: meta ?? {} })
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      utilsState.loggerInfoCalls.push({ message, meta: meta ?? {} })
    },
    warn: () => {},
  },
}))

vi.doMock('@twurple/auth', () => ({
  getAppToken: async () => {
    if (utilsState.appTokenError) {
      throw utilsState.appTokenError
    }
    return utilsState.appToken
  },
}))
