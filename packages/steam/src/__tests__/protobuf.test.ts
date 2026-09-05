// @ts-expect-error no types
import Dota2 from 'dota2'
import Long from 'long'
import { describe, expect, it } from 'vitest'

describe('protobufjs@4 + bytebuffer@5 round-trip under bun', () => {
  it('encodes and decodes CMsgSpectateFriendGame', () => {
    const steamId = Long.fromString('76561198000000001')
    const msg = new Dota2.schema.CMsgSpectateFriendGame({
      live: true,
      steam_id: steamId,
    })
    const buf = msg.toBuffer()
    expect(Buffer.isBuffer(buf) || buf instanceof Uint8Array).toBeTruthy()
    expect(buf.length).toBeGreaterThan(0)

    const decoded = Dota2.schema.CMsgSpectateFriendGame.decode(buf)
    expect(decoded.live).toBeTruthy()
    expect(decoded.steam_id.toString()).toBe('76561198000000001')
  })

  it('encodes and decodes CMsgSpectateFriendGameResponse', () => {
    const msg = new Dota2.schema.CMsgSpectateFriendGameResponse({
      server_steamid: Long.fromString('90071996842377217'),
      watch_live_result: 1,
    })
    const buf = msg.toBuffer()
    const decoded = Dota2.schema.CMsgSpectateFriendGameResponse.decode(buf)
    expect(decoded.server_steamid.toString()).toBe('90071996842377217')
    expect(decoded.watch_live_result).toBe(1)
  })
})
