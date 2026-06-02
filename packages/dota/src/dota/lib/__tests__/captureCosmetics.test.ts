import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock } from '../../../__tests__/sharedMocks.ts'
import type { SocketClient } from '../../../types'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

const upsertCalls: Array<{ table: string; values: Record<string, unknown>; options?: unknown }> = []
const supabaseMock = {
  from: (table: string) => ({
    upsert: (values: Record<string, unknown>, options?: unknown) => {
      upsertCalls.push({ table, values, options })
      return Promise.resolve({ data: null, error: null })
    },
  }),
}

vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ supabase: supabaseMock, logger: noopLogger }),
)

const { captureCosmetics } = await import('../captureCosmetics.ts')

// hero id 74 = Invoker; wearable0/4/6 are real cosmetics, 48 is a base part.
function clientWith(gsi: Record<string, unknown> | undefined): SocketClient {
  return { name: 'streamer', token: 'user-token-1', locale: 'en', gsi } as unknown as SocketClient
}

describe('captureCosmetics', () => {
  beforeEach(() => {
    upsertCalls.length = 0
  })

  it('snapshots the resolved loadout to cosmetic_loadouts', async () => {
    const items = await captureCosmetics(
      clientWith({
        map: { matchid: '777' },
        hero: { id: 74 },
        wearables: { wearable0: 5867, wearable4: 4289, wearable6: 6079, wearable1: 48 },
      }),
    )

    expect(items).toHaveLength(3)
    expect(upsertCalls).toHaveLength(1)
    const { table, values, options } = upsertCalls[0]
    expect(table).toBe('cosmetic_loadouts')
    expect(values).toMatchObject({ userId: 'user-token-1', matchId: '777', heroId: 74 })
    expect((values.items as unknown[]).length).toBe(3)
    expect(options).toEqual({ onConflict: 'userId,heroId' })
  })

  it('writes nothing without a hero or match', async () => {
    expect(await captureCosmetics(clientWith({ hero: { id: 74 } }))).toEqual([])
    expect(await captureCosmetics(clientWith({ map: { matchid: '777' } }))).toEqual([])
    expect(upsertCalls).toHaveLength(0)
  })

  it('writes nothing when only base parts are equipped', async () => {
    const items = await captureCosmetics(
      clientWith({ map: { matchid: '777' }, hero: { id: 74 }, wearables: { wearable0: 48 } }),
    )
    expect(items).toEqual([])
    expect(upsertCalls).toHaveLength(0)
  })
})
