import { describe, expect, it } from 'bun:test'

// @ts-expect-error no types
import Dota2 from 'dota2'
import Steam from 'steam'

describe('module loads under bun', () => {
  it('steam exposes SteamClient and SteamUser constructors', () => {
    expect(typeof Steam.SteamClient).toBe('function')
    // @ts-expect-error no types
    expect(typeof Steam.SteamUser).toBe('function')
    expect(Array.isArray(Steam.servers)).toBe(true)
    expect(Steam.servers.length).toBeGreaterThan(0)
  })

  it('dota2 exposes Dota2Client and the schema namespace', () => {
    expect(typeof Dota2.Dota2Client).toBe('function')
    expect(Dota2.schema).toBeDefined()
    expect(Dota2.schema.CMsgSpectateFriendGame).toBeDefined()
    expect(Dota2.schema.CMsgSpectateFriendGameResponse).toBeDefined()
    expect(Dota2.schema.EDOTAGCMsg).toBeDefined()
    expect(typeof Dota2.schema.EDOTAGCMsg.k_EMsgGCSpectateFriendGame).toBe('number')
    expect(typeof Dota2.schema.EDOTAGCMsg.k_EMsgGCSpectateFriendGameResponse).toBe('number')
  })
})
