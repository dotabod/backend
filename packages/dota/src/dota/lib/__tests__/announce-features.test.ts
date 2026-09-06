// The feature announcer fires a "this feature is new" chat message + dashboard notification at
// a relevant GSI moment, once per streamer, gated by the master/per-feature toggles and capped
// at one feature per match. Drives the real getValueOrDefault + isPlayingMatch; mocks supabase
// (durable flag + notification), redis (per-match guard), say, and EventHandler. Each test uses
// a fresh token so the module-level once-ever cache doesn't leak across cases.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildSharedUtilsMock,
  createGsiHandlerStub,
  createPacketStub,
  createSocketClientStub,
  initTestI18n,
} from '../../../__tests__/shared-mocks'
import type { GSIHandlerType } from '../../gsi-handler-types'

const loggerMock = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

// Durable settings flag (ON CONFLICT DO NOTHING → only first insert returns a row) +
// notifications insert.
const settingsInserted = new Set<string>()
const notificationInserts: Record<string, unknown>[] = []
let nextUpsertError: unknown = null
const supabaseMock = {
  from: (table: string) => ({
    insert: async (row: Record<string, unknown>) => {
      if (table === 'notifications') {
        notificationInserts.push(row)
      }
      return await Promise.resolve({ error: null })
    },
    upsert: (values: { userId: string; key: string }) => ({
      select: async () => {
        if (nextUpsertError !== null) {
          const error = nextUpsertError
          nextUpsertError = null
          return await Promise.resolve({ data: null, error })
        }
        const k = `${values.userId}:${values.key}`
        const firstTime = !settingsInserted.has(k)
        settingsInserted.add(k)
        return await Promise.resolve({ data: firstTime ? [{ key: values.key }] : [], error: null })
      },
    }),
  }),
}
vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ logger: loggerMock, supabase: supabaseMock })
)

const redisStore: Record<string, string> = {}
vi.doMock('../../../db/redis-client', () => ({
  default: {
    getInstance: () => ({
      client: {
        get: async (key: string) => await Promise.resolve(redisStore[key] ?? null),
        set: async (key: string, val: string) => {
          redisStore[key] = val
          return await Promise.resolve('OK')
        },
      },
    }),
  },
}))

const sayMock = vi.fn()
vi.doMock(import('../../say'), () => ({ say: sayMock }))

const registeredTriggers: string[] = []
vi.doMock(import('../../events/event-handler'), () => ({
  default: { registerEvent: (name: string) => registeredTriggers.push(name) },
}))

await initTestI18n()
const { dispatchFeatureAnnouncements, registerFeatureAnnouncers, isFeatureEnabled } =
  await import('../announce-features')

const INVOKER_ID = 74
interface Setting {
  key: string
  value: unknown
}
let tokenCounter = 0
const freshToken = () => `user-${(tokenCounter += 1)}`

const makeDotaClient = function makeDotaClient(opts: {
  token: string
  matchid?: string
  settings?: Setting[]
  playing?: boolean
  stream_online?: boolean
}): GSIHandlerType {
  const { token, matchid = 'm1', settings = [], playing = true, stream_online = true } = opts
  const client = createSocketClientStub({
    gsi: createPacketStub({
      hero: { id: INVOKER_ID },
      map: { matchid },
      player: playing ? { activity: 'playing' } : {},
    }),
    locale: 'en',
    name: 'streamer',
    settings,
    stream_online,
    subscription: undefined,
    token,
  })
  return createGsiHandlerStub(client)
}

const messages = () => sayMock.mock.calls.map((c) => String(c[1]))

describe('feature announcer', () => {
  beforeEach(() => {
    sayMock.mockReset()
    notificationInserts.length = 0
    settingsInserted.clear()
    registeredTriggers.length = 0
    nextUpsertError = null
    for (const k of Object.keys(redisStore)) {
      delete redisStore[k]
    }
  })

  it('registers a listener for each distinct trigger', () => {
    registerFeatureAnnouncers()
    expect(registeredTriggers).toContain('hero:id')
  })

  it('announces a new feature in chat + dashboard by default (master on), once', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(makeDotaClient({ token }), 'hero:id', INVOKER_ID)

    expect(sayMock).toHaveBeenCalledOnce()
    expect(messages()[0]).toContain('dotabod.com/dashboard/whats-new')
    expect(settingsInserted.has(`${token}:featureAnnounced:cosmetics`)).toBeTruthy()
    expect(notificationInserts).toHaveLength(1)
    expect(notificationInserts[0]).toMatchObject({ type: 'NEW_FEATURE', userId: token })
    expect(redisStore[`${token}:featureAnnouncedMatch`]).toBe('m1')
  })

  it('announces a feature at most once ever (across matches)', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ matchid: 'm1', token }),
      'hero:id',
      INVOKER_ID
    )
    await dispatchFeatureAnnouncements(
      makeDotaClient({ matchid: 'm2', token }),
      'hero:id',
      INVOKER_ID
    )

    expect(sayMock).toHaveBeenCalledOnce()
    expect(notificationInserts).toHaveLength(1)
  })

  it('does not announce twice in the same match', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ matchid: 'm1', token }),
      'hero:id',
      INVOKER_ID
    )
    sayMock.mockClear()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ matchid: 'm1', token }),
      'hero:id',
      INVOKER_ID
    )

    expect(sayMock).not.toHaveBeenCalled()
  })

  it('stays silent when the master toggle is off and the feature is untouched', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ settings: [{ key: 'autoOptInNewFeatures', value: false }], token }),
      'hero:id',
      INVOKER_ID
    )

    expect(sayMock).not.toHaveBeenCalled()
    expect(notificationInserts).toHaveLength(0)
  })

  it('announces when the per-feature toggle is explicitly on, even with master off', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({
        settings: [
          { key: 'autoOptInNewFeatures', value: false },
          { key: 'cosmeticsAnnounce', value: true },
        ],
        token,
      }),
      'hero:id',
      INVOKER_ID
    )

    expect(sayMock).toHaveBeenCalledOnce()
  })

  it('stays silent when the per-feature toggle is explicitly off, even with master on', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ settings: [{ key: 'cosmeticsAnnounce', value: false }], token }),
      'hero:id',
      INVOKER_ID
    )

    expect(sayMock).not.toHaveBeenCalled()
  })

  it('does nothing when not in a playing match', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ playing: false, token }),
      'hero:id',
      INVOKER_ID
    )

    expect(sayMock).not.toHaveBeenCalled()
  })

  it('does nothing (and persists no flag) when the stream is offline', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ stream_online: false, token }),
      'hero:id',
      INVOKER_ID
    )
    expect(sayMock).not.toHaveBeenCalled()
    expect(settingsInserted.size).toBe(0)
  })

  it('does not announce or cache on a transient upsert error, and retries next trigger', async () => {
    const token = freshToken()
    nextUpsertError = { message: 'db down' }
    await dispatchFeatureAnnouncements(
      makeDotaClient({ matchid: 'm1', token }),
      'hero:id',
      INVOKER_ID
    )
    expect(sayMock).not.toHaveBeenCalled()
    expect(notificationInserts).toHaveLength(0)

    // Error cleared; the next trigger succeeds (the in-memory cache must NOT block it).
    await dispatchFeatureAnnouncements(
      makeDotaClient({ matchid: 'm2', token }),
      'hero:id',
      INVOKER_ID
    )
    expect(sayMock).toHaveBeenCalledOnce()
  })

  it('isFeatureEnabled: untouched follows master, explicit choice wins', () => {
    const c = (settings: Setting[]) => createSocketClientStub({ settings, subscription: undefined })
    expect(isFeatureEnabled(c([]), 'cosmeticsAnnounce')).toBeTruthy()
    expect(
      isFeatureEnabled(c([{ key: 'autoOptInNewFeatures', value: false }]), 'cosmeticsAnnounce')
    ).toBeFalsy()
    expect(
      isFeatureEnabled(
        c([
          { key: 'autoOptInNewFeatures', value: false },
          { key: 'cosmeticsAnnounce', value: true },
        ]),
        'cosmeticsAnnounce'
      )
    ).toBeTruthy()
  })
})
