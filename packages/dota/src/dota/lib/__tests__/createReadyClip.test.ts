import { describe, expect, it, mock } from 'bun:test'
import { buildSharedUtilsMock } from '../../../__tests__/sharedMocks.ts'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

// createReadyClip only touches `logger` from shared-utils; the Twitch ApiClient
// is passed in, so a no-op surface keeps the test fully offline.
mock.module('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ supabase: {}, logger: noopLogger }),
)

const { createReadyClip } = await import('../createReadyClip.ts')

// Build a fake Twurple ApiClient whose createClip returns the given ids in order
// and whose getClipById reports a duration per clip id (0 = never transcodes).
function fakeApi(opts: {
  clipIds: string[]
  durations: Record<string, number>
  createThrowsOn?: number[]
}) {
  let createCalls = 0
  const getCalls: string[] = []
  const api = {
    clips: {
      createClip: async () => {
        createCalls += 1
        if (opts.createThrowsOn?.includes(createCalls)) {
          throw new Error('createClip boom')
        }
        const id = opts.clipIds[createCalls - 1]
        if (id === undefined) throw new Error('ran out of fake clip ids')
        return id
      },
      getClipById: async (id: string) => {
        getCalls.push(id)
        const duration = opts.durations[id] ?? 0
        return { duration }
      },
    },
  }
  return {
    api: api as any,
    getCreateCalls: () => createCalls,
    getGetCalls: () => getCalls,
  }
}

const FAST_OPTS = { maxAttempts: 3, pollAttempts: 3, pollIntervalMs: 1 }

describe('createReadyClip', () => {
  it('returns the clip id when the first clip is ready immediately', async () => {
    const { api, getCreateCalls } = fakeApi({
      clipIds: ['clip-a'],
      durations: { 'clip-a': 29 },
    })

    const result = await createReadyClip(api, 'acct', FAST_OPTS, '[Test]', {})

    expect(result).toBe('clip-a')
    expect(getCreateCalls()).toBe(1)
  })

  it('recreates a new clip when the first never transcodes', async () => {
    const { api, getCreateCalls } = fakeApi({
      clipIds: ['dud', 'good'],
      durations: { dud: 0, good: 30 },
    })

    const result = await createReadyClip(api, 'acct', FAST_OPTS, '[Test]', {})

    expect(result).toBe('good')
    expect(getCreateCalls()).toBe(2)
  })

  it('returns null after exhausting maxAttempts on all-dud clips', async () => {
    const { api, getCreateCalls } = fakeApi({
      clipIds: ['d1', 'd2', 'd3'],
      durations: { d1: 0, d2: 0, d3: 0 },
    })

    const result = await createReadyClip(api, 'acct', FAST_OPTS, '[Test]', {})

    expect(result).toBeNull()
    expect(getCreateCalls()).toBe(3)
  })

  it('continues to the next attempt when createClip throws', async () => {
    const { api, getCreateCalls } = fakeApi({
      clipIds: ['ignored', 'good'],
      durations: { good: 30 },
      createThrowsOn: [1],
    })

    const result = await createReadyClip(api, 'acct', FAST_OPTS, '[Test]', {})

    expect(result).toBe('good')
    expect(getCreateCalls()).toBe(2)
  })

  it('stops early and returns null once the deadline is exceeded', async () => {
    const { api, getCreateCalls } = fakeApi({
      clipIds: ['dud', 'd2', 'd3', 'd4', 'd5'],
      durations: {},
    })

    // First clip is a dud; the deadline (5ms) trips during the poll sleep (20ms),
    // so we bail out long before exhausting maxAttempts (5).
    const result = await createReadyClip(
      api,
      'acct',
      { maxAttempts: 5, pollAttempts: 3, pollIntervalMs: 20, deadlineMs: 5 },
      '[Test]',
      {},
    )

    expect(result).toBeNull()
    expect(getCreateCalls()).toBe(1)
  })
})
