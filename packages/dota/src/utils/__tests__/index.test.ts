import { describe, expect, it } from 'bun:test'
import { fmtMSS, is8500Plus, steamID32toSteamID64, steamID64toSteamID32 } from '../index.ts'

describe('steamID conversions', () => {
  it('round-trips a 32-bit id through 64-bit and back', () => {
    const id64 = steamID32toSteamID64(123)
    expect(id64).toBe('76561197960265851')
    expect(steamID64toSteamID32(id64 as string)).toBe(123)
  })

  it('returns null for an empty 64-bit id', () => {
    expect(steamID64toSteamID32('')).toBeNull()
  })
})

describe('fmtMSS', () => {
  it('zero-pads minutes and seconds', () => {
    expect(fmtMSS(0)).toBe('00:00')
    expect(fmtMSS(90)).toBe('01:30')
    expect(fmtMSS(3661)).toBe('61:01')
  })
})

describe('is8500Plus', () => {
  const client = (overrides: Record<string, unknown>) => overrides as any

  it('is true when client mmr exceeds 8500', () => {
    expect(is8500Plus(client({ mmr: 9000, SteamAccount: [] }))).toBe(true)
  })

  it('is true when the matching steam account is at or above 8500', () => {
    expect(
      is8500Plus(client({ mmr: 0, steam32Id: 1, SteamAccount: [{ steam32Id: 1, mmr: 8500 }] })),
    ).toBe(true)
  })

  it('is true when the matching steam account has a leaderboard rank', () => {
    expect(
      is8500Plus(
        client({
          mmr: 0,
          steam32Id: 1,
          SteamAccount: [{ steam32Id: 1, mmr: 100, leaderboard_rank: 42 }],
        }),
      ),
    ).toBe(true)
  })

  it('is false for a normal sub-8500 account', () => {
    expect(
      is8500Plus(client({ mmr: 3000, steam32Id: 1, SteamAccount: [{ steam32Id: 1, mmr: 3000 }] })),
    ).toBe(false)
  })
})
