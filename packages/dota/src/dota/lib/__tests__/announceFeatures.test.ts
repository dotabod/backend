// The feature announcer fires a "this feature is new" chat message + dashboard notification at
// a relevant GSI moment, once per streamer, gated by the master/per-feature toggles and capped
// at one feature per match. Drives the real getValueOrDefault + isPlayingMatch; mocks supabase
// (durable flag + notification), redis (per-match guard), say, and EventHandler. Each test uses
// a fresh token so the module-level once-ever cache doesn't leak across cases.
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n } from '../../../__tests__/sharedMocks'

const loggerMock = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

// Durable settings flag (ON CONFLICT DO NOTHING → only first insert returns a row) +
// notifications insert.
const settingsInserted = new Set<string>()
const notificationInserts: Array<Record<string, unknown>> = []
let nextUpsertError: unknown = null
const supabaseMock = {
  from: (table: string) => ({
    upsert: (values: { userId: string; key: string }) => ({
      select: () => {
        if (nextUpsertError) {
          const error = nextUpsertError
          nextUpsertError = null
          return Promise.resolve({ data: null, error })
        }
        const k = `${values.userId}:${values.key}`
        const firstTime = !settingsInserted.has(k)
        settingsInserted.add(k)
        return Promise.resolve({ data: firstTime ? [{ key: values.key }] : [], error: null })
      },
    }),
    insert: (row: Record<string, unknown>) => {
      if (table === 'notifications') notificationInserts.push(row)
      return Promise.resolve({ error: null })
    },
  }),
}
vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ supabase: supabaseMock, logger: loggerMock }),
)

const redisStore: Record<string, string> = {}
vi.doMock('../../../db/RedisClient', () => ({
  default: {
    getInstance: () => ({
      client: {
        get: async (key: string) => redisStore[key] ?? null,
        set: async (key: string, val: string) => {
          redisStore[key] = val
          return 'OK'
        },
      },
    }),
  },
}))

const sayMock = vi.fn()
vi.doMock('../../say', () => ({ say: sayMock }))

const registeredTriggers: string[] = []
vi.doMock('../../events/EventHandler', () => ({
  default: { registerEvent: (name: string) => registeredTriggers.push(name) },
}))

await initTestI18n()
const { dispatchFeatureAnnouncements, registerFeatureAnnouncers, isFeatureEnabled } =
  await import('../announceFeatures')

const INVOKER_ID = 74
type Setting = { key: string; value: unknown }
let tokenCounter = 0
const freshToken = () => `user-${(tokenCounter += 1)}`

function makeDotaClient(opts: {
  token: string
  matchid?: string
  settings?: Setting[]
  playing?: boolean
}): any {
  const { token, matchid = 'm1', settings = [], playing = true } = opts
  return {
    client: {
      name: 'streamer',
      token,
      locale: 'en',
      subscription: undefined,
      settings,
      gsi: {
        player: playing ? { activity: 'playing' } : {},
        map: { matchid },
        hero: { id: INVOKER_ID },
      },
    },
  }
}

const messages = () => sayMock.mock.calls.map((c) => String(c[1]))

describe('feature announcer', () => {
  beforeEach(() => {
    sayMock.mockReset()
    notificationInserts.length = 0
    settingsInserted.clear()
    registeredTriggers.length = 0
    nextUpsertError = null
    for (const k of Object.keys(redisStore)) delete redisStore[k]
  })

  it('registers a listener for each distinct trigger', () => {
    registerFeatureAnnouncers()
    expect(registeredTriggers).toContain('hero:id')
  })

  it('announces a new feature in chat + dashboard by default (master on), once', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(makeDotaClient({ token }), 'hero:id', INVOKER_ID)

    expect(sayMock).toHaveBeenCalledTimes(1)
    expect(messages()[0]).toContain('dotabod.com/dashboard/whats-new')
    expect(settingsInserted.has(`${token}:featureAnnounced:cosmetics`)).toBe(true)
    expect(notificationInserts).toHaveLength(1)
    expect(notificationInserts[0]).toMatchObject({ userId: token, type: 'NEW_FEATURE' })
    expect(redisStore[`${token}:featureAnnouncedMatch`]).toBe('m1')
  })

  it('announces a feature at most once ever (across matches)', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ token, matchid: 'm1' }),
      'hero:id',
      INVOKER_ID,
    )
    await dispatchFeatureAnnouncements(
      makeDotaClient({ token, matchid: 'm2' }),
      'hero:id',
      INVOKER_ID,
    )

    expect(sayMock).toHaveBeenCalledTimes(1)
    expect(notificationInserts).toHaveLength(1)
  })

  it('does not announce twice in the same match', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ token, matchid: 'm1' }),
      'hero:id',
      INVOKER_ID,
    )
    sayMock.mockClear()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ token, matchid: 'm1' }),
      'hero:id',
      INVOKER_ID,
    )

    expect(sayMock).not.toHaveBeenCalled()
  })

  it('stays silent when the master toggle is off and the feature is untouched', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ token, settings: [{ key: 'autoOptInNewFeatures', value: false }] }),
      'hero:id',
      INVOKER_ID,
    )

    expect(sayMock).not.toHaveBeenCalled()
    expect(notificationInserts).toHaveLength(0)
  })

  it('announces when the per-feature toggle is explicitly on, even with master off', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({
        token,
        settings: [
          { key: 'autoOptInNewFeatures', value: false },
          { key: 'cosmeticsAnnounce', value: true },
        ],
      }),
      'hero:id',
      INVOKER_ID,
    )

    expect(sayMock).toHaveBeenCalledTimes(1)
  })

  it('stays silent when the per-feature toggle is explicitly off, even with master on', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ token, settings: [{ key: 'cosmeticsAnnounce', value: false }] }),
      'hero:id',
      INVOKER_ID,
    )

    expect(sayMock).not.toHaveBeenCalled()
  })

  it('does nothing when not in a playing match', async () => {
    const token = freshToken()
    await dispatchFeatureAnnouncements(
      makeDotaClient({ token, playing: false }),
      'hero:id',
      INVOKER_ID,
    )

    expect(sayMock).not.toHaveBeenCalled()
  })

  it('does not announce or cache on a transient upsert error, and retries next trigger', async () => {
    const token = freshToken()
    nextUpsertError = { message: 'db down' }
    await dispatchFeatureAnnouncements(
      makeDotaClient({ token, matchid: 'm1' }),
      'hero:id',
      INVOKER_ID,
    )
    expect(sayMock).not.toHaveBeenCalled()
    expect(notificationInserts).toHaveLength(0)

    // Error cleared; the next trigger succeeds (the in-memory cache must NOT block it).
    await dispatchFeatureAnnouncements(
      makeDotaClient({ token, matchid: 'm2' }),
      'hero:id',
      INVOKER_ID,
    )
    expect(sayMock).toHaveBeenCalledTimes(1)
  })

  it('isFeatureEnabled: untouched follows master, explicit choice wins', () => {
    const c = (settings: Setting[]) => ({ settings, subscription: undefined }) as any
    expect(isFeatureEnabled(c([]), 'cosmeticsAnnounce')).toBe(true)
    expect(
      isFeatureEnabled(c([{ key: 'autoOptInNewFeatures', value: false }]), 'cosmeticsAnnounce'),
    ).toBe(false)
    expect(
      isFeatureEnabled(
        c([
          { key: 'autoOptInNewFeatures', value: false },
          { key: 'cosmeticsAnnounce', value: true },
        ]),
        'cosmeticsAnnounce',
      ),
    ).toBe(true)
  })
})
