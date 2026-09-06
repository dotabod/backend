import { setTimeout as sleep } from 'node:timers/promises'

import { describe, expect, it } from 'vitest'

import type {
  ClipLogContext,
  ClipQuery,
  CreateReadyClipDependencies,
} from '../create-ready-clip.ts'
import { createReadyClip } from '../create-ready-clip.ts'

const noopLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

const dependencies = {
  logger: noopLogger,
  wait: async (milliseconds: number) => {
    await sleep(milliseconds)
  },
} satisfies CreateReadyClipDependencies

const LOG_CONTEXT = { name: 'test', state: 'test' } satisfies ClipLogContext

// Build a fake Twurple ApiClient whose createClip returns the given ids in order
// and whose getClipById reports a duration per clip id (0 = never transcodes).
const fakeApi = function fakeApi(opts: {
  clipIds: string[]
  durations: Record<string, number>
  createThrowsOn?: number[]
}) {
  let createCalls = 0
  const getCalls: string[] = []
  // Clip creation goes through `callApi` rather than `clips.createClip` because
  // Twurple can't send Twitch's `duration` parameter; capture the queries so tests
  // can assert what was actually requested.
  const createQueries: ClipQuery[] = []
  const api = {
    callApi: async ({ query }: { query: ClipQuery }) => {
      createCalls += 1
      createQueries.push(query)
      if (opts.createThrowsOn?.includes(createCalls) === true) {
        return await Promise.reject(new Error('createClip boom'))
      }
      const id = opts.clipIds[createCalls - 1]
      if (id === undefined) {
        return await Promise.reject(new Error('ran out of fake clip ids'))
      }
      return await Promise.resolve({ data: [{ id }] })
    },
    clips: {
      getClipById: async (id: string) => {
        getCalls.push(id)
        const duration = opts.durations[id] ?? 0
        return await Promise.resolve({ duration })
      },
    },
  }
  return {
    api,
    createQueries,
    getCreateCalls: () => createCalls,
    getGetCalls: () => getCalls,
  }
}

const FAST_OPTS = { maxAttempts: 3, pollAttempts: 3, pollIntervalMs: 1 }

describe(createReadyClip, () => {
  it('returns the clip id when the first clip is ready immediately', async () => {
    const { api, getCreateCalls } = fakeApi({
      clipIds: ['clip-a'],
      durations: { 'clip-a': 29 },
    })

    const result = await createReadyClip(
      api,
      'acct',
      FAST_OPTS,
      '[Test]',
      LOG_CONTEXT,
      dependencies
    )

    expect(result).toBe('clip-a')
    expect(getCreateCalls()).toBe(1)
  })

  it('sends durationSeconds to Twitch so the clip is wider than the 30s default', async () => {
    const { api, createQueries } = fakeApi({
      clipIds: ['clip-a'],
      durations: { 'clip-a': 60 },
    })

    await createReadyClip(
      api,
      'acct',
      { ...FAST_OPTS, durationSeconds: 60 },
      '[Test]',
      LOG_CONTEXT,
      dependencies
    )

    expect(createQueries[0]).toStrictEqual({ broadcaster_id: 'acct', duration: '60' })
  })

  it('omits duration entirely when unset, leaving Twitch on its default', async () => {
    const { api, createQueries } = fakeApi({
      clipIds: ['clip-a'],
      durations: { 'clip-a': 29 },
    })

    await createReadyClip(api, 'acct', FAST_OPTS, '[Test]', LOG_CONTEXT, dependencies)

    expect(createQueries[0]).toStrictEqual({ broadcaster_id: 'acct' })
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
      LOG_CONTEXT,
      dependencies
    )

    expect(result).toBe('clip-a')
    // ready on the first (delayed) poll
    expect(getGetCalls()).toHaveLength(1)
    expect(Date.now() - start).toBeGreaterThanOrEqual(40)
  })

  it('recreates a new clip when the first never transcodes', async () => {
    const { api, getCreateCalls } = fakeApi({
      clipIds: ['dud', 'good'],
      durations: { dud: 0, good: 30 },
    })

    const result = await createReadyClip(
      api,
      'acct',
      FAST_OPTS,
      '[Test]',
      LOG_CONTEXT,
      dependencies
    )

    expect(result).toBe('good')
    expect(getCreateCalls()).toBe(2)
  })

  it('returns null after exhausting maxAttempts on all-dud clips', async () => {
    const { api, getCreateCalls } = fakeApi({
      clipIds: ['d1', 'd2', 'd3'],
      durations: { d1: 0, d2: 0, d3: 0 },
    })

    const result = await createReadyClip(
      api,
      'acct',
      FAST_OPTS,
      '[Test]',
      LOG_CONTEXT,
      dependencies
    )

    expect(result).toBeNull()
    expect(getCreateCalls()).toBe(3)
  })

  it('continues to the next attempt when createClip throws', async () => {
    const { api, getCreateCalls } = fakeApi({
      clipIds: ['ignored', 'good'],
      createThrowsOn: [1],
      durations: { good: 30 },
    })

    const result = await createReadyClip(
      api,
      'acct',
      FAST_OPTS,
      '[Test]',
      LOG_CONTEXT,
      dependencies
    )

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
        body: '{"error":"Not Found","status":404,"message":"Channel offline."}',
        statusCode: 404,
      }
    )
    const api = {
      callApi: async () => {
        createCalls += 1
        return await Promise.reject(offlineError)
      },
      clips: {
        getClipById: async () => await Promise.resolve({ duration: 0 }),
      },
    }

    const result = await createReadyClip(
      api,
      'acct',
      FAST_OPTS,
      '[Test]',
      LOG_CONTEXT,
      dependencies
    )

    expect(result).toBeNull()
    // no retries — does not consume maxAttempts
    expect(createCalls).toBe(1)
  })

  it('bails immediately without retry when the token is missing the clips:edit scope', async () => {
    // Twurple's AuthProvider raises this when the broadcaster never granted
    // clips:edit. It "can not be upgraded" mid-loop, so retrying just spams the
    // error log — short-circuit instead.
    let createCalls = 0
    const scopeError = new Error(
      'This token does not have any of the requested scopes (clips:edit) and can not be upgraded.'
    )
    const api = {
      callApi: async () => {
        createCalls += 1
        return await Promise.reject(scopeError)
      },
      clips: {
        getClipById: async () => await Promise.resolve({ duration: 0 }),
      },
    }

    const result = await createReadyClip(
      api,
      'acct',
      FAST_OPTS,
      '[Test]',
      LOG_CONTEXT,
      dependencies
    )

    expect(result).toBeNull()
    // no retries — does not consume maxAttempts
    expect(createCalls).toBe(1)
  })

  it('catches a clip that only transcodes after several polls (draft window)', async () => {
    // Twitch transcode takes ~15s; the draft path's old 2-poll (~8s) window
    // abandoned the clip mid-transcode and failed ~100% of the time. The clip
    // here reports duration 0 for the first 3 polls, then transcodes on the 4th.
    let polls = 0
    const api = {
      callApi: async () => await Promise.resolve({ data: [{ id: 'slow' }] }),
      clips: {
        getClipById: async () => {
          polls += 1
          return await Promise.resolve({ duration: polls >= 4 ? 30 : 0 })
        },
      },
    }

    // Draft-like opts: 5 polls is a long enough window to reach the 4th poll.
    const result = await createReadyClip(
      api,
      'acct',
      { maxAttempts: 2, pollAttempts: 5, pollIntervalMs: 1 },
      '[Test]',
      LOG_CONTEXT,
      dependencies
    )

    // the original clip, not a recreation
    expect(result).toBe('slow')
    // returned as soon as it transcoded
    expect(polls).toBe(4)
  })

  it('abandons the same slow clip with the old too-short window', async () => {
    // Same ~15s transcode, but the old draft window (2 polls) gives up before
    // the clip is ready and recreates — proving the window length was the bug.
    let createCalls = 0
    const perClipPolls: Record<string, number> = {}
    const api = {
      callApi: async () => {
        createCalls += 1
        return await Promise.resolve({ data: [{ id: `clip-${createCalls}` }] })
      },
      clips: {
        getClipById: async (id: string) => {
          perClipPolls[id] = (perClipPolls[id] ?? 0) + 1
          // Each fresh clip needs 4 polls to transcode; 2 polls never reaches it.
          return await Promise.resolve({ duration: perClipPolls[id] >= 4 ? 30 : 0 })
        },
      },
    }

    const result = await createReadyClip(
      api,
      'acct',
      { maxAttempts: 2, pollAttempts: 2, pollIntervalMs: 1 },
      '[Test]',
      LOG_CONTEXT,
      dependencies
    )

    // never caught a transcode within 2 polls
    expect(result).toBeNull()
    // burned both attempts recreating
    expect(createCalls).toBe(2)
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
      { deadlineMs: 5, maxAttempts: 5, pollAttempts: 3, pollIntervalMs: 20 },
      '[Test]',
      LOG_CONTEXT,
      dependencies
    )

    expect(result).toBeNull()
    expect(getCreateCalls()).toBe(1)
  })
})
