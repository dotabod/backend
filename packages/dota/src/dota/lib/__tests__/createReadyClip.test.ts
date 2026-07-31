import { describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock } from '../../../__tests__/sharedMocks.ts'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

// createReadyClip only touches `logger` from shared-utils; the Twitch ApiClient
// is passed in, so a no-op surface keeps the test fully offline.
vi.doMock('@dotabod/shared-utils', () => buildSharedUtilsMock({ supabase: {}, logger: noopLogger }))

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
  // Clip creation goes through `callApi` rather than `clips.createClip` because
  // Twurple can't send Twitch's `duration` parameter; capture the queries so tests
  // can assert what was actually requested.
  const createQueries: Array<Record<string, string>> = []
  const api = {
    callApi: async ({ query }: { query: Record<string, string> }) => {
      createCalls += 1
      createQueries.push(query)
      if (opts.createThrowsOn?.includes(createCalls)) {
        throw new Error('createClip boom')
      }
      const id = opts.clipIds[createCalls - 1]
      if (id === undefined) throw new Error('ran out of fake clip ids')
      return { data: [{ id }] }
    },
    clips: {
      getClipById: async (id: string) => {
        getCalls.push(id)
        const duration = opts.durations[id] ?? 0
        return { duration }
      },
    },
  }
  return {
    createQueries,
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

  it('sends durationSeconds to Twitch so the clip is wider than the 30s default', async () => {
    const { api, createQueries } = fakeApi({
      clipIds: ['clip-a'],
      durations: { 'clip-a': 60 },
    })

    await createReadyClip(api, 'acct', { ...FAST_OPTS, durationSeconds: 60 }, '[Test]', {})

    expect(createQueries[0]).toEqual({ broadcaster_id: 'acct', duration: '60' })
  })

  it('omits duration entirely when unset, leaving Twitch on its default', async () => {
    const { api, createQueries } = fakeApi({
      clipIds: ['clip-a'],
      durations: { 'clip-a': 29 },
    })

    await createReadyClip(api, 'acct', FAST_OPTS, '[Test]', {})

    expect(createQueries[0]).toEqual({ broadcaster_id: 'acct' })
  })

  it('waits initialDelayMs after creating the clip before the first poll', async () => {
    // Helix reports duration > 0 before the renditions exist on the CDN, so the
    // gameplay path defers the first poll past that observed ~10-13s window.
    const { api, getGetCalls } = fakeApi({
      clipIds: ['clip-a'],
      durations: { 'clip-a': 29 },
    })

    const start = Date.now()
    const result = await createReadyClip(
      api,
      'acct',
      { ...FAST_OPTS, initialDelayMs: 50 },
      '[Test]',
      {},
    )

    expect(result).toBe('clip-a')
    expect(getGetCalls()).toHaveLength(1) // ready on the first (delayed) poll
    expect(Date.now() - start).toBeGreaterThanOrEqual(40)
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

  it('bails immediately without retry when Twitch returns 404 Channel offline', async () => {
    // Twurple raises HttpStatusCodeError with statusCode 404 + body when the
    // broadcaster isn't live. Retrying spams the error log without recourse.
    let createCalls = 0
    const offlineError: Error & { statusCode?: number; body?: string } = Object.assign(
      new Error('Channel offline.'),
      {
        statusCode: 404,
        body: '{"error":"Not Found","status":404,"message":"Channel offline."}',
      },
    )
    const api = {
      callApi: async () => {
        createCalls += 1
        throw offlineError
      },
      clips: {
        getClipById: async () => ({ duration: 0 }),
      },
    } as any

    const result = await createReadyClip(api, 'acct', FAST_OPTS, '[Test]', {})

    expect(result).toBeNull()
    expect(createCalls).toBe(1) // no retries — does not consume maxAttempts
  })

  it('bails immediately without retry when the token is missing the clips:edit scope', async () => {
    // Twurple's AuthProvider raises this when the broadcaster never granted
    // clips:edit. It "can not be upgraded" mid-loop, so retrying just spams the
    // error log — short-circuit instead.
    let createCalls = 0
    const scopeError = new Error(
      'This token does not have any of the requested scopes (clips:edit) and can not be upgraded.',
    )
    const api = {
      callApi: async () => {
        createCalls += 1
        throw scopeError
      },
      clips: {
        getClipById: async () => ({ duration: 0 }),
      },
    } as any

    const result = await createReadyClip(api, 'acct', FAST_OPTS, '[Test]', {})

    expect(result).toBeNull()
    expect(createCalls).toBe(1) // no retries — does not consume maxAttempts
  })

  it('catches a clip that only transcodes after several polls (draft window)', async () => {
    // Twitch transcode takes ~15s; the draft path's old 2-poll (~8s) window
    // abandoned the clip mid-transcode and failed ~100% of the time. The clip
    // here reports duration 0 for the first 3 polls, then transcodes on the 4th.
    let polls = 0
    const api = {
      callApi: async () => ({ data: [{ id: 'slow' }] }),
      clips: {
        getClipById: async (_id: string) => {
          polls += 1
          return { duration: polls >= 4 ? 30 : 0 }
        },
      },
    } as any

    // Draft-like opts: 5 polls is a long enough window to reach the 4th poll.
    const result = await createReadyClip(
      api,
      'acct',
      { maxAttempts: 2, pollAttempts: 5, pollIntervalMs: 1 },
      '[Test]',
      {},
    )

    expect(result).toBe('slow') // the original clip, not a recreation
    expect(polls).toBe(4) // returned as soon as it transcoded
  })

  it('abandons the same slow clip with the old too-short window', async () => {
    // Same ~15s transcode, but the old draft window (2 polls) gives up before
    // the clip is ready and recreates — proving the window length was the bug.
    let createCalls = 0
    const perClipPolls: Record<string, number> = {}
    const api = {
      callApi: async () => {
        createCalls += 1
        return { data: [{ id: `clip-${createCalls}` }] }
      },
      clips: {
        getClipById: async (id: string) => {
          perClipPolls[id] = (perClipPolls[id] ?? 0) + 1
          // Each fresh clip needs 4 polls to transcode; 2 polls never reaches it.
          return { duration: perClipPolls[id] >= 4 ? 30 : 0 }
        },
      },
    } as any

    const result = await createReadyClip(
      api,
      'acct',
      { maxAttempts: 2, pollAttempts: 2, pollIntervalMs: 1 },
      '[Test]',
      {},
    )

    expect(result).toBeNull() // never caught a transcode within 2 polls
    expect(createCalls).toBe(2) // burned both attempts recreating
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
