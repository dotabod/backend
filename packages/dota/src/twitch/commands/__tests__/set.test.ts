import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSharedUtilsMock, initTestI18n } from '../../../__tests__/sharedMocks.ts'
import type { MessageType } from '../../lib/CommandHandler.ts'

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

const sayMock = vi.fn()
vi.doMock(import('../../chatClient'), () => ({ chatClient: { say: sayMock } }))

let registeredHandler:
  | ((m: MessageType, args: string[], used: string) => Promise<void> | void)
  | undefined
vi.doMock(import('../../lib/CommandHandler'), () => ({
  default: {
    registerCommand: (_name: string, opts: { handler: typeof registeredHandler }) => {
      registeredHandler = opts.handler
    },
  },
}))

await initTestI18n()
await import('../set.ts')

// An Invoker (hero id 74) loadout: 4 equipped cosmetics + base/default parts.
const WEARABLES: Record<string, number> = {
  wearable0: 5867,
  wearable1: 23_683,
  wearable15: 766,
  wearable2: 98,
  wearable3: 48,
  wearable4: 4289,
  wearable5: 8626,
  wearable6: 6079,
}

function makeMessage(gsi: Record<string, unknown> | undefined): MessageType {
  return {
    channel: {
      client: {
        gsi,
        locale: 'en',
        name: 'streamer',
        token: 'user-token-1',
      } as MessageType['channel']['client'],
      id: 'chan-1',
      name: 'streamer',
      settings: {} as MessageType['channel']['settings'],
    },
    content: '!set',
    user: { messageId: 'msg-1', name: 'viewer', permission: 0, userId: 'u-1' },
  }
}

describe('!set — equipped cosmetics', () => {
  beforeEach(() => {
    sayMock.mockReset()
    upsertCalls.length = 0
  })

  it('posts the hero + count + link and snapshots the resolved loadout', async () => {
    expect(registeredHandler).toBeDefined()
    await registeredHandler!(
      makeMessage({ hero: { id: 74 }, map: { matchid: '777' }, wearables: WEARABLES }),
      [],
      'set'
    )

    expect(sayMock).toHaveBeenCalledOnce()
    const [, text] = sayMock.mock.calls[0]
    expect(text).toContain('Invoker has 4 equipped cosmetics')
    expect(text).toContain('dotabod.com/streamer/set')

    expect(upsertCalls).toHaveLength(1)
    const { table, values, options } = upsertCalls[0]
    expect(table).toBe('cosmetic_loadouts')
    expect(values).toMatchObject({ heroId: 74, matchId: '777', userId: 'user-token-1' })
    expect(values.items as unknown[]).toHaveLength(4)
    expect(options).toStrictEqual({ onConflict: 'userId,heroId' })
  })

  it('says not playing when there is no match', async () => {
    await registeredHandler!(makeMessage({ hero: { id: 74 } }), [], 'set')
    expect(sayMock).toHaveBeenCalledOnce()
    expect(upsertCalls).toHaveLength(0)
  })

  it('reports no cosmetics when the hero has only base parts', async () => {
    await registeredHandler!(
      makeMessage({ hero: { id: 74 }, map: { matchid: '777' }, wearables: { wearable0: 48 } }),
      [],
      'set'
    )
    const [, text] = sayMock.mock.calls[0]
    expect(text).toContain('no cosmetics equipped')
    expect(upsertCalls).toHaveLength(0)
  })
})
