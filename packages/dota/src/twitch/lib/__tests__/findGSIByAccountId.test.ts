import { describe, expect, it } from 'bun:test'

import { findAccountFromCmd } from '../findGSIByAccountId'

// findAccountFromCmd is exercised three ways: by Twitch chat commands like
// !facet / !gpm / !items on the streamer's own match (default branch), on a
// spectator/tournament feed (spectator branch), or with a player argument
// (args branch — unchanged by this PR).

describe('findAccountFromCmd — default (non-spectator) branch', () => {
  it('returns ourHero=true with the flat hero when accountid is populated', async () => {
    const packet: any = {
      map: { matchid: '123' },
      player: { accountid: 123456, gpm: 400 },
      hero: { id: 74, alive: true, facet: 1 },
      items: { slot0: { name: 'item_tango' } },
    }
    const r = await findAccountFromCmd(packet, [], 'en', 'facet')
    expect(r.ourHero).toBe(true)
    expect(r.hero).toEqual(packet.hero)
    expect(r.accountIdFromArgs).toBe(123456)
  })

  it('still returns the hero when player.accountid is missing (fix for qojqva-live case)', async () => {
    // Brief windows during draft transitions: packet.hero.id is already 74 but
    // packet.player.accountid hasn't arrived. Pre-fix this threw missingMatchData;
    // post-fix we return the hero and let the caller's isValidHero decide.
    const packet: any = {
      map: { matchid: '123' },
      player: {},
      hero: { id: 74, alive: true, facet: 1 },
    }
    const r = await findAccountFromCmd(packet, [], 'en', 'facet')
    expect(r.ourHero).toBe(true)
    expect(r.hero).toEqual(packet.hero)
    expect(r.accountIdFromArgs).toBeUndefined()
  })

  it('returns hero.id=-1 unchanged when the hero is still on the picker', async () => {
    const packet: any = {
      map: { matchid: '123' },
      player: {},
      hero: { id: -1 },
    }
    const r = await findAccountFromCmd(packet, [], 'en', 'facet')
    expect(r.ourHero).toBe(true)
    expect(r.hero?.id).toBe(-1)
    // The caller's isValidHero will reject -1; helper no longer pre-empts.
  })

  it('does not throw on a totally empty packet (caller decides)', async () => {
    const packet: any = { map: { matchid: '123' } }
    const r = await findAccountFromCmd(packet, [], 'en', 'facet')
    expect(r.ourHero).toBe(true)
    expect(r.hero).toBeUndefined()
  })
})

describe('findAccountFromCmd — spectator branch', () => {
  function makeSpectatorPacket(overrides: {
    heroes: Record<string, { id: number; selected_unit?: boolean; facet?: number }>
    accounts: Record<string, number>
  }) {
    return {
      map: { matchid: '999' },
      player: {
        team2: Object.fromEntries(
          Object.entries(overrides.accounts)
            .filter(([k]) => k.startsWith('p2_'))
            .map(([k, v]) => [k.slice(3), { accountid: v }]),
        ),
        team3: Object.fromEntries(
          Object.entries(overrides.accounts)
            .filter(([k]) => k.startsWith('p3_'))
            .map(([k, v]) => [k.slice(3), { accountid: v }]),
        ),
      },
      hero: {
        team2: Object.fromEntries(
          Object.entries(overrides.heroes)
            .filter(([k]) => k.startsWith('p2_'))
            .map(([k, v]) => [k.slice(3), v]),
        ),
        team3: Object.fromEntries(
          Object.entries(overrides.heroes)
            .filter(([k]) => k.startsWith('p3_'))
            .map(([k, v]) => [k.slice(3), v]),
        ),
      },
      items: {
        team2: { player0: {}, player1: {} },
        team3: { player5: {} },
      },
    } as any
  }

  it('returns the selected_unit hero when one is set', async () => {
    const packet = makeSpectatorPacket({
      heroes: {
        p2_player0: { id: 74, facet: 1, selected_unit: false },
        p2_player1: { id: 22, facet: 2, selected_unit: true },
      },
      accounts: { p2_player0: 111, p2_player1: 222 },
    })
    const r = await findAccountFromCmd(packet, [], 'en', 'facet')
    expect(r.ourHero).toBe(false)
    expect(r.accountIdFromArgs).toBe(222)
    expect((r.hero as any)?.id).toBe(22)
  })

  it('falls back to the first hero with a valid id when no selected_unit (fix for VIPTwitchCon case)', async () => {
    const packet = makeSpectatorPacket({
      heroes: {
        p2_player0: { id: 74, facet: 1 },
        p2_player1: { id: 22, facet: 2 },
      },
      accounts: { p2_player0: 111, p2_player1: 222 },
    })
    const r = await findAccountFromCmd(packet, [], 'en', 'facet')
    expect(r.ourHero).toBe(false)
    expect(r.accountIdFromArgs).toBe(111)
    expect((r.hero as any)?.id).toBe(74)
  })

  it('skips heroes with id=-1 when picking the first-valid fallback', async () => {
    const packet = makeSpectatorPacket({
      heroes: {
        p2_player0: { id: -1 },
        p2_player1: { id: 22, facet: 2 },
      },
      accounts: { p2_player0: 111, p2_player1: 222 },
    })
    const r = await findAccountFromCmd(packet, [], 'en', 'facet')
    expect(r.accountIdFromArgs).toBe(222)
    expect((r.hero as any)?.id).toBe(22)
  })

  it('returns undefined hero when every hero is unpicked (caller surfaces the right message)', async () => {
    const packet = makeSpectatorPacket({
      heroes: {
        p2_player0: { id: -1 },
        p2_player1: { id: -1 },
      },
      accounts: { p2_player0: 111, p2_player1: 222 },
    })
    const r = await findAccountFromCmd(packet, [], 'en', 'facet')
    // No firstValidHero → accountIdFromArgs undefined → findSpectatorIdx null →
    // hero stays undefined. Caller's isValidHero will reject and show
    // missingMatchData, which is the correct UX for "literally nothing picked".
    expect(r.hero).toBeUndefined()
  })

  it('respects selected_unit even when a higher-priority hero exists earlier in the list', async () => {
    // Selected unit takes precedence over the first-valid fallback.
    const packet = makeSpectatorPacket({
      heroes: {
        p2_player0: { id: 74, facet: 1 },
        p2_player1: { id: 22, facet: 2, selected_unit: true },
      },
      accounts: { p2_player0: 111, p2_player1: 222 },
    })
    const r = await findAccountFromCmd(packet, [], 'en', 'facet')
    expect(r.accountIdFromArgs).toBe(222)
    expect((r.hero as any)?.id).toBe(22)
  })

  it('finds a hero in team3 when team2 has none', async () => {
    const packet = makeSpectatorPacket({
      heroes: {
        p3_player5: { id: 30, facet: 1 },
      },
      accounts: { p3_player5: 555 },
    })
    const r = await findAccountFromCmd(packet, [], 'en', 'facet')
    expect(r.accountIdFromArgs).toBe(555)
    expect((r.hero as any)?.id).toBe(30)
  })
})
