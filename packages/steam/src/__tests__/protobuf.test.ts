import Long from 'long'
import { describe, expect, it } from 'vitest'

import {
  spectateFriendGameCodec,
  spectateFriendGameResponseCodec,
} from '../utils/dota2-protobuf.ts'

describe('protobufjs@4 + bytebuffer@5 round-trip under bun', () => {
  it('encodes and decodes CMsgSpectateFriendGame', () => {
    const steamId = Long.fromString('76561198000000001')
    const buffer = spectateFriendGameCodec.encode({
      live: true,
      steamId,
    })
    const decoded = spectateFriendGameCodec.decode(buffer)

    expect({ bufferLength: buffer.length, decoded }).toStrictEqual({
      bufferLength: 11,
      decoded: { live: true, steamId: '76561198000000001' },
    })
  })

  it('encodes and decodes CMsgSpectateFriendGameResponse', () => {
    const buffer = spectateFriendGameResponseCodec.encode({
      serverSteamId: Long.fromString('90071996842377217'),
      watchLiveResult: 1,
    })
    const decoded = spectateFriendGameResponseCodec.decode(buffer)

    expect(decoded).toStrictEqual({ serverSteamId: '90071996842377217', watchLiveResult: 1 })
  })
})
