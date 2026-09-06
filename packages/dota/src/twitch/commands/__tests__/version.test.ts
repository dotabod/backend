import { beforeEach, describe, expect, it } from 'vitest'

import { createSocketClientStub, initTestI18n } from '../../../__tests__/shared-mocks.ts'
import type { MessageType } from '../../lib/command-handler.ts'
import { fetchSocketVersion, runVersionCommand } from '../version-handler.ts'
import type {
  VersionCommandDependencies,
  VersionSnapshot,
  VersionSocket,
} from '../version-handler.ts'

interface SayCall {
  channel: string
  messageId: string | undefined
  text: string
}

const sayCalls: SayCall[] = []
let versions: VersionSnapshot
const completed = Promise.resolve()

const dependencies: VersionCommandDependencies = {
  getVersions: async () => {
    await completed
    return versions
  },
  say: (channel, text, messageId) => {
    sayCalls.push({ channel, messageId, text })
  },
}

const makeMessage = function makeMessage(): MessageType {
  const client = createSocketClientStub({ locale: 'en' })
  return {
    channel: {
      client,
      id: 'chan-1',
      name: 'streamer',
      settings: client.settings,
    },
    content: '!version',
    user: { messageId: 'msg-1', name: 'viewer', permission: 0, userId: 'u-1' },
  }
}

await initTestI18n()

describe(fetchSocketVersion, () => {
  it('returns the acknowledged commit hash from a connected service', async () => {
    const socket = {
      connected: true,
      timeout: () => ({
        emitWithAck: async () => {
          await completed
          return 'aaaaaaa'
        },
      }),
    } satisfies VersionSocket

    await expect(fetchSocketVersion(socket)).resolves.toBe('aaaaaaa')
  })

  it('does not request a version from a disconnected service', async () => {
    const socket = {
      connected: false,
      timeout: () => {
        throw new Error('A disconnected socket must not emit getVersion')
      },
    } satisfies VersionSocket

    await expect(fetchSocketVersion(socket)).resolves.toBeNull()
  })

  it('returns null when the service does not acknowledge before the timeout', async () => {
    const socket = {
      connected: true,
      timeout: () => ({
        emitWithAck: async () => {
          await completed
          throw new Error('operation has timed out')
        },
      }),
    } satisfies VersionSocket

    await expect(fetchSocketVersion(socket)).resolves.toBeNull()
  })
})

describe('!version — multi-service reporting', () => {
  beforeEach(() => {
    sayCalls.length = 0
    versions = {
      dota: 'aaaaaaa',
      steam: 'aaaaaaa',
      twitchChat: 'aaaaaaa',
      twitchEvents: 'aaaaaaa',
    }
  })

  it('reports one version and a compare URL when every service matches', async () => {
    await runVersionCommand(makeMessage(), dependencies)

    expect(sayCalls).toStrictEqual([
      {
        channel: 'streamer',
        messageId: 'msg-1',
        text: "Server running version aaaaaaa, here's what's missing compared to the latest version: github.com/dotabod/backend/compare/aaaaaaa...master",
      },
    ])
  })

  it('reports each service version and the commit log when versions differ', async () => {
    versions = {
      dota: 'aaaaaaa',
      steam: 'bbbbbbb',
      twitchChat: 'aaaaaaa',
      twitchEvents: 'ccccccc',
    }

    await runVersionCommand(makeMessage(), dependencies)

    expect(sayCalls).toStrictEqual([
      {
        channel: 'streamer',
        messageId: 'msg-1',
        text: "Server running version dota:aaaaaaa, steam:bbbbbbb, twitch-chat:aaaaaaa, twitch-events:ccccccc, here's what's missing compared to the latest version: github.com/dotabod/backend/commits/master",
      },
    ])
  })

  it('marks a disconnected service as unknown', async () => {
    versions.twitchChat = null

    await runVersionCommand(makeMessage(), dependencies)

    expect(sayCalls).toStrictEqual([
      {
        channel: 'streamer',
        messageId: 'msg-1',
        text: "Server running version dota:aaaaaaa, steam:aaaaaaa, twitch-chat:?, twitch-events:aaaaaaa, here's what's missing compared to the latest version: github.com/dotabod/backend/commits/master",
      },
    ])
  })

  it('reports an unknown version when no service has a commit hash', async () => {
    versions = { dota: null, steam: null, twitchChat: null, twitchEvents: null }

    await runVersionCommand(makeMessage(), dependencies)

    expect(sayCalls).toStrictEqual([
      {
        channel: 'streamer',
        messageId: 'msg-1',
        text: "Couldn't find the last git commit, here's the repo github.com/dotabod/backend",
      },
    ])
  })
})
