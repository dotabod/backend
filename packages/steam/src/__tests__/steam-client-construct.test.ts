import { describe, expect, it } from 'bun:test'
import { EventEmitter } from 'node:events'
// @ts-expect-error no types
import Dota2 from 'dota2'
import Steam from 'steam'

describe('steam/dota2 constructors do no I/O', () => {
  it('SteamClient is an EventEmitter and has a connect method', () => {
    const client = new Steam.SteamClient()
    expect(client).toBeInstanceOf(EventEmitter)
    // @ts-expect-error no types
    expect(typeof client.connect).toBe('function')
    // @ts-expect-error no types
    expect(typeof client.disconnect).toBe('function')
  })

  it('SteamUser wraps the client without throwing', () => {
    const client = new Steam.SteamClient()
    // @ts-expect-error no types
    const user = new Steam.SteamUser(client)
    expect(user).toBeDefined()
  })

  it('Dota2Client constructs and setMaxListeners works', () => {
    const client = new Steam.SteamClient()
    const dota = new Dota2.Dota2Client(client, false, false)
    expect(dota).toBeInstanceOf(EventEmitter)
    expect(() => dota.setMaxListeners(12)).not.toThrow()
  })
})
