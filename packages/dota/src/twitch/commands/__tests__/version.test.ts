import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n } from '../../../__tests__/sharedMocks.ts'
import type { MessageType } from '../../lib/CommandHandler.ts'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

type FakeSocket = {
  connected: boolean
  emit: (event: string, ack: (commitHash: string | null) => void) => void
}

const sockets = {
  steam: { connected: true, hash: 'aaaaaaa' as string | null },
  chat: { connected: true, hash: 'aaaaaaa' as string | null },
  events: { connected: true, hash: 'aaaaaaa' as string | null },
}

function makeSocket(target: { connected: boolean; hash: string | null }): FakeSocket {
  return {
    get connected() {
      return target.connected
    },
    set connected(v: boolean) {
      target.connected = v
    },
    emit: (_event: string, ack: (commitHash: string | null) => void) => {
      ack(target.hash)
    },
  }
}

vi.doMock('@dotabod/shared-utils', () => buildSharedUtilsMock({ supabase: {}, logger: noopLogger }))

vi.doMock('../../../steam/ws', () => ({
  steamSocket: makeSocket(sockets.steam),
  twitchChat: makeSocket(sockets.chat),
  twitchEvents: makeSocket(sockets.events),
}))

const sayMock = vi.fn()
vi.doMock('../../chatClient', () => ({
  chatClient: { say: sayMock },
}))

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

// Import after mocks so registerCommand fires against the mock.
await import('../version.ts')

const baseMessage: MessageType = {
  user: { name: 'tester', messageId: 'msg-1', permission: 0, userId: 'u-1' },
  content: '!version',
  channel: {
    name: 'tester',
    id: 'chan-1',
    client: { locale: 'en' } as MessageType['channel']['client'],
    settings: {} as MessageType['channel']['settings'],
  },
}

describe('!version — multi-service reporting', () => {
  beforeEach(() => {
    sayMock.mockReset()
    sockets.steam.connected = true
    sockets.chat.connected = true
    sockets.events.connected = true
    sockets.steam.hash = 'aaaaaaa'
    sockets.chat.hash = 'aaaaaaa'
    sockets.events.hash = 'aaaaaaa'
    process.env.COMMIT_HASH = 'aaaaaaa'
  })

  it('reports a single version + compare URL when all 4 services match', async () => {
    expect(registeredHandler).toBeDefined()
    await registeredHandler!(baseMessage, [], 'version')

    expect(sayMock).toHaveBeenCalledTimes(1)
    const [, text] = sayMock.mock.calls[0]
    expect(text).toContain('Server running version aaaaaaa')
    expect(text).toContain('github.com/dotabod/backend/compare/aaaaaaa...master')
  })

  it('lists per-service versions and a commits URL when SHAs differ', async () => {
    sockets.steam.hash = 'bbbbbbb'
    sockets.events.hash = 'ccccccc'
    process.env.COMMIT_HASH = 'aaaaaaa'

    await registeredHandler!(baseMessage, [], 'version')

    const [, text] = sayMock.mock.calls[0]
    expect(text).toContain('dota:aaaaaaa')
    expect(text).toContain('steam:bbbbbbb')
    expect(text).toContain('twitch-chat:aaaaaaa')
    expect(text).toContain('twitch-events:ccccccc')
    expect(text).toContain('github.com/dotabod/backend/commits/master')
    expect(text).not.toContain('/compare/')
  })

  it('renders "?" for a disconnected service', async () => {
    sockets.chat.connected = false

    await registeredHandler!(baseMessage, [], 'version')

    const [, text] = sayMock.mock.calls[0]
    expect(text).toContain('twitch-chat:?')
  })

  it('falls back to version.unknown when COMMIT_HASH is unset and no peer responds', async () => {
    delete process.env.COMMIT_HASH
    sockets.steam.connected = false
    sockets.chat.connected = false
    sockets.events.connected = false

    await registeredHandler!(baseMessage, [], 'version')

    const [, text] = sayMock.mock.calls[0]
    expect(text).toContain("Couldn't find the last git commit")
    expect(text).toContain('github.com/dotabod/backend')
  })
})
