import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSharedUtilsMock } from '../../../__tests__/shared-mocks.ts'
import type { SocketClient } from '../../../types'

const noopLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

const upsertCalls: { table: string; values: Record<string, unknown>; options?: unknown }[] = []
const supabaseMock = {
  from: (table: string) => ({
    upsert: async (values: Record<string, unknown>, options?: unknown) => {
      upsertCalls.push({ options, table, values })
      return { data: null, error: null }
    },
  }),
}

vi.doMock(import('@dotabod/shared-utils'), () =>
  buildSharedUtilsMock({ logger: noopLogger, supabase: supabaseMock })
)

const { captureCosmetics } = await import('../capture-cosmetics.ts')

// hero id 74 = Invoker; wearable0/4/6 are real cosmetics, 48 is a base part.
const clientWith = function clientWith(gsi: Record<string, unknown> | undefined): SocketClient {
  return { gsi, locale: 'en', name: 'streamer', token: 'user-token-1' } as unknown as SocketClient
}

describe('captureCosmetics', () => {
  beforeEach(() => {
    upsertCalls.length = 0
  })

  it('snapshots the resolved loadout to cosmetic_loadouts', async () => {
    const items = await captureCosmetics(
      clientWith({
        hero: { id: 74 },
        map: { matchid: '777' },
        wearables: { wearable0: 5867, wearable1: 48, wearable4: 4289, wearable6: 6079 },
      })
    )

    expect(items).toHaveLength(3)
    expect(upsertCalls).toHaveLength(1)
    const { table, values, options } = upsertCalls[0]
    expect(table).toBe('cosmetic_loadouts')
    expect(values).toMatchObject({ heroId: 74, matchId: '777', userId: 'user-token-1' })
    expect(values.items as unknown[]).toHaveLength(3)
    expect(options).toStrictEqual({ onConflict: 'userId,heroId' })
  })

  it('writes nothing without a hero or match', async () => {
    await expect(captureCosmetics(clientWith({ hero: { id: 74 } }))).resolves.toStrictEqual([])
    await expect(captureCosmetics(clientWith({ map: { matchid: '777' } }))).resolves.toStrictEqual(
      []
    )
    expect(upsertCalls).toHaveLength(0)
  })

  it('writes nothing when only base parts are equipped', async () => {
    const items = await captureCosmetics(
      clientWith({ hero: { id: 74 }, map: { matchid: '777' }, wearables: { wearable0: 48 } })
    )
    expect(items).toStrictEqual([])
    expect(upsertCalls).toHaveLength(0)
  })
})
