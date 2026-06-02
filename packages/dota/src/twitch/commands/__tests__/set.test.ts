import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n } from '../../../__tests__/sharedMocks.ts'
import type { MessageType } from '../../lib/CommandHandler.ts'

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

const sayMock = vi.fn()
vi.doMock('../../chatClient', () => ({ chatClient: { say: sayMock } }))

let registeredHandler:
  | ((m: MessageType, args: string[], used: string) => Promise<void> | void)
  | undefined
vi.doMock('../../lib/CommandHandler', () => ({
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
  wearable1: 23683,
  wearable2: 98,
  wearable3: 48,
  wearable4: 4289,
  wearable5: 8626,
  wearable6: 6079,
  wearable15: 766,
}

function makeMessage(gsi: Record<string, unknown> | undefined): MessageType {
  return {
    user: { name: 'viewer', messageId: 'msg-1', permission: 0, userId: 'u-1' },
    content: '!set',
    channel: {
      name: 'streamer',
      id: 'chan-1',
      client: {
        name: 'streamer',
        token: 'user-token-1',
        locale: 'en',
        gsi,
      } as MessageType['channel']['client'],
      settings: {} as MessageType['channel']['settings'],
    },
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
      makeMessage({ map: { matchid: '777' }, hero: { id: 74 }, wearables: WEARABLES }),
      [],
      'set',
    )

    expect(sayMock).toHaveBeenCalledTimes(1)
    const [, text] = sayMock.mock.calls[0]
    expect(text).toContain('Invoker has 4 equipped cosmetics')
    expect(text).toContain('dotabod.com/streamer/set')

    expect(upsertCalls).toHaveLength(1)
    const { table, values, options } = upsertCalls[0]
    expect(table).toBe('cosmetic_loadouts')
    expect(values).toMatchObject({ userId: 'user-token-1', matchId: '777', heroId: 74 })
    expect((values.items as unknown[]).length).toBe(4)
    expect(options).toEqual({ onConflict: 'userId,heroId' })
  })

  it('says not playing when there is no match', async () => {
    await registeredHandler!(makeMessage({ hero: { id: 74 } }), [], 'set')
    expect(sayMock).toHaveBeenCalledTimes(1)
    expect(upsertCalls).toHaveLength(0)
  })

  it('reports no cosmetics when the hero has only base parts', async () => {
    await registeredHandler!(
      makeMessage({ map: { matchid: '777' }, hero: { id: 74 }, wearables: { wearable0: 48 } }),
      [],
      'set',
    )
    const [, text] = sayMock.mock.calls[0]
    expect(text).toContain('no cosmetics equipped')
    expect(upsertCalls).toHaveLength(0)
  })
})
