import { beforeEach, describe, expect, it } from 'vitest'

import {
  createPacketStub,
  createSocketClientStub,
  initTestI18n,
} from '../../../__tests__/shared-mocks.ts'
import type { ResolvedCosmetic } from '../../../dota/lib/cosmetics.ts'
import type { Packet, SocketClient } from '../../../types.ts'
import type { MessageType } from '../../lib/command-handler.ts'
import { runSetCommand } from '../set-handler.ts'

interface SayCall {
  channel: string
  messageId: string | undefined
  text: string
}

const equippedCosmetics = [
  { defindex: 5867, marketable: true, name: 'Dark Artistry Cape', slot: 'back' },
  { defindex: 4289, marketable: true, name: 'Magus Accord', slot: 'arms' },
  { defindex: 6079, marketable: true, name: 'World Chasm Artifact', slot: 'weapon' },
  { defindex: 8626, marketable: true, name: 'Heir of Menace', slot: 'head' },
] satisfies ResolvedCosmetic[]

const capturedClients: SocketClient[] = []
const sayCalls: SayCall[] = []
let cosmeticsToReturn: ResolvedCosmetic[] = []

const dependencies = {
  captureCosmetics: async (client: SocketClient) => {
    capturedClients.push(client)
    return await Promise.resolve(cosmeticsToReturn)
  },
  say: (channel: string, text: string, messageId?: string) => {
    sayCalls.push({ channel, messageId, text })
  },
}

const makeMessage = function makeMessage(gsi: Packet): MessageType {
  const client = createSocketClientStub({
    gsi,
    name: 'streamer',
    token: 'user-token-1',
  })
  return {
    channel: {
      client,
      id: 'chan-1',
      name: 'streamer',
      settings: client.settings,
    },
    content: '!set',
    user: { messageId: 'msg-1', name: 'viewer', permission: 0, userId: 'u-1' },
  }
}

await initTestI18n()

describe('!set — equipped cosmetics', () => {
  beforeEach(() => {
    capturedClients.length = 0
    cosmeticsToReturn = []
    sayCalls.length = 0
  })

  it('reports the hero, equipped count, and loadout link', async () => {
    cosmeticsToReturn = equippedCosmetics
    const message = makeMessage(createPacketStub({ hero: { id: 74 }, map: { matchid: '777' } }))

    await runSetCommand(message, dependencies)

    expect(capturedClients).toStrictEqual([message.channel.client])
    expect(sayCalls).toStrictEqual([
      {
        channel: 'streamer',
        messageId: 'msg-1',
        text: 'Invoker has 4 equipped cosmetics → dotabod.com/streamer/set',
      },
    ])
  })

  it('reports that the streamer is not playing before resolving cosmetics', async () => {
    await runSetCommand(makeMessage(createPacketStub({ hero: { id: 74 } })), dependencies)

    expect(capturedClients).toStrictEqual([])
    expect(sayCalls).toStrictEqual([
      { channel: 'streamer', messageId: 'msg-1', text: 'Not playing PauseChamp' },
    ])
  })

  it('reports an empty loadout when no equipped cosmetics resolve', async () => {
    const message = makeMessage(createPacketStub({ hero: { id: 74 }, map: { matchid: '777' } }))

    await runSetCommand(message, dependencies)

    expect(capturedClients).toStrictEqual([message.channel.client])
    expect(sayCalls).toStrictEqual([
      { channel: 'streamer', messageId: 'msg-1', text: 'Invoker has no cosmetics equipped' },
    ])
  })
})
