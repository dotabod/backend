// The hero:id handler hands off to announceCapturedCosmetics: it snapshots the played hero's
// cosmetics and announces the captured set in chat — but only once the hero is publicly visible
// (strategy phase onward), so a pick is never tipped to stream snipers. Whether it announces
// follows the new-feature gate: an explicit cosmeticsAnnounce wins, else the autoOptInNewFeatures
// master (default on). The one-time "this feature is new" notice lives elsewhere
// (announceFeatures.ts). These tests drive the handler directly, bypassing the stream_online gate
// in EventHandler, so they also exercise the anti-snipe state gate end-to-end.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSharedUtilsMock, initTestI18n } from '../../../../__tests__/sharedMocks'

const loggerMock = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}
// captureCosmetics is mocked below, so nothing in this path actually hits supabase.
const supabaseMock = {
  from: () => ({ upsert: async () => ({ data: null, error: null }) }),
}
vi.doMock(import('@dotabod/shared-utils'), () =>
  buildSharedUtilsMock({ logger: loggerMock, supabase: supabaseMock })
)

// In-memory Redis so the per-match announce dedupe is exercised for real.
const redisStore: Record<string, string> = {}
vi.doMock(import('../../../../db/RedisClient'), () => ({
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

// Control the resolved loadout returned by the (real, elsewhere-tested) capture.
let capturedItems: unknown[] = []
const captureMock = vi.fn(async () => capturedItems)
vi.doMock(import('../../../lib/captureCosmetics'), () => ({ captureCosmetics: captureMock }))

// Capture say() calls instead of hitting the real chat/delay pipeline.
const sayMock = vi.fn()
vi.doMock(import('../../../say'), () => ({ say: sayMock }))

// Capture the registered handler instead of wiring the global event emitter.
let registeredHandler: ((dotaClient: any, heroId: number) => Promise<void> | void) | undefined
vi.doMock(import('../../EventHandler'), () => ({
  default: {
    registerEvent: (_name: string, opts: { handler: typeof registeredHandler }) => {
      registeredHandler = opts.handler
    },
  },
}))

await initTestI18n()
await import('../hero.id')

const TOKEN = 'user-token-1'
const INVOKER_ID = 74
interface Setting {
  key: string
  value: unknown
}

function makeDotaClient(
  overrides: {
    stream_online?: boolean
    matchid?: string
    settings?: Setting[]
    gameState?: string
  } = {}
): { client: any } {
  const {
    stream_online = true,
    matchid = '777',
    settings = [],
    // Default to a state where every hero is locked in and visible, so the anti-snipe gate
    // lets the announce through. Hero-selection cases pass an unsafe state explicitly.
    gameState = 'DOTA_GAMERULES_STATE_STRATEGY_TIME',
  } = overrides
  return {
    client: {
      gsi: {
        hero: { id: INVOKER_ID },
        map: { game_state: gameState, matchid },
        player: { activity: 'playing' },
      },
      locale: 'en',
      name: 'streamer',
      settings,
      stream_online,
      subscription: undefined,
      token: TOKEN,
    },
  }
}

const messages = () => sayMock.mock.calls.map((c) => String(c[1]))

describe('hero:id — cosmetic set announce', () => {
  beforeEach(() => {
    captureMock.mockClear()
    sayMock.mockReset()
    for (const k of Object.keys(redisStore)) {
      delete redisStore[k]
    }
    capturedItems = [{ defindex: 1 }, { defindex: 2 }, { defindex: 3 }, { defindex: 4 }]
  })

  it('is registered for the hero:id event', () => {
    expect(registeredHandler).toBeDefined()
  })

  it('announces the captured set (hero + count + link) by default while live', async () => {
    await registeredHandler!(makeDotaClient(), INVOKER_ID)

    expect(captureMock).toHaveBeenCalledOnce()
    expect(sayMock).toHaveBeenCalledOnce()
    const [cosmetics] = messages()
    expect(cosmetics).toContain('Playing Invoker Pog new card unlocked')
    expect(cosmetics).toContain('4 cosmetics')
    expect(cosmetics).toContain('dotabod.com/streamer/set')
    expect(redisStore[`${TOKEN}:cosmeticsAnnounced`]).toBe(`777:${INVOKER_ID}`)
  })

  it('does not re-announce for the same match + hero (reconnect safe)', async () => {
    await registeredHandler!(makeDotaClient(), INVOKER_ID)
    sayMock.mockClear()
    await registeredHandler!(makeDotaClient(), INVOKER_ID)

    expect(captureMock).toHaveBeenCalledTimes(2) // capture always runs
    expect(sayMock).not.toHaveBeenCalled()
  })

  it('announces again in a new match', async () => {
    await registeredHandler!(makeDotaClient({ matchid: '777' }), INVOKER_ID)
    await registeredHandler!(makeDotaClient({ matchid: '888' }), INVOKER_ID)

    expect(sayMock).toHaveBeenCalledTimes(2)
  })

  it('stays silent when the master toggle is off and the feature is untouched', async () => {
    await registeredHandler!(
      makeDotaClient({ settings: [{ key: 'autoOptInNewFeatures', value: false }] }),
      INVOKER_ID
    )

    expect(captureMock).toHaveBeenCalledOnce()
    expect(sayMock).not.toHaveBeenCalled()
  })

  it('announces when explicitly enabled even with the master toggle off', async () => {
    await registeredHandler!(
      makeDotaClient({
        settings: [
          { key: 'autoOptInNewFeatures', value: false },
          { key: 'cosmeticsAnnounce', value: true },
        ],
      }),
      INVOKER_ID
    )

    expect(messages().some((m) => m.includes('Playing Invoker Pog new card unlocked'))).toBeTruthy()
  })

  it('stays silent when explicitly disabled even with the master toggle on', async () => {
    await registeredHandler!(
      makeDotaClient({ settings: [{ key: 'cosmeticsAnnounce', value: false }] }),
      INVOKER_ID
    )

    expect(captureMock).toHaveBeenCalledOnce()
    expect(sayMock).not.toHaveBeenCalled()
  })

  it('skips capture and stays silent while offline (live-only feature)', async () => {
    await registeredHandler!(makeDotaClient({ stream_online: false }), INVOKER_ID)

    expect(captureMock).not.toHaveBeenCalled()
    expect(sayMock).not.toHaveBeenCalled()
  })

  it('holds the reveal during hero selection so it never tips stream snipers', async () => {
    await registeredHandler!(
      makeDotaClient({ gameState: 'DOTA_GAMERULES_STATE_HERO_SELECTION' }),
      INVOKER_ID
    )

    // Nothing leaks before strategy phase — no snapshot, no chat. The strategy-time
    // map:game_state trigger is what releases the announcement once everyone's locked in.
    expect(captureMock).not.toHaveBeenCalled()
    expect(sayMock).not.toHaveBeenCalled()
  })

  it('captures but stays silent when the hero has no resolved cosmetics', async () => {
    capturedItems = []
    await registeredHandler!(makeDotaClient(), INVOKER_ID)

    expect(captureMock).toHaveBeenCalledOnce()
    expect(sayMock).not.toHaveBeenCalled()
  })
})
