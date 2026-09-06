import { describe, expect, it } from 'vitest'

import { GsiSpectatorResolver } from '../../resolvers/gsi-spectator-resolver'

const ctx = (gsi?: unknown) => ({ gsi: gsi as never, matchId: '12345' })

const spectatorGsi = function spectatorGsi() {
  const team2 = Object.fromEntries(
    [0, 1, 2, 3, 4].map((i) => [`player${i}`, { id: i + 1, selected_unit: false }])
  )
  const team3 = Object.fromEntries(
    [5, 6, 7, 8, 9].map((i) => [`player${i}`, { id: i + 1, selected_unit: false }])
  )
  const team2Players = Object.fromEntries(
    [0, 1, 2, 3, 4].map((i) => [`player${i}`, { accountid: 2000 + i, name: `P${i}` }])
  )
  const team3Players = Object.fromEntries(
    [5, 6, 7, 8, 9].map((i) => [`player${i}`, { accountid: 2000 + i, name: `P${i}` }])
  )
  return {
    hero: { team2, team3 },
    map: { matchid: '12345' },
    player: { team2: team2Players, team3: team3Players, team_name: 'spectator' },
  }
}

describe(GsiSpectatorResolver, () => {
  const r = new GsiSpectatorResolver()

  it('claims spectator GSI', async () => {
    const out = await r.resolve(ctx(spectatorGsi()))
    expect(out?.source).toBe('gsi-spectator')
    expect(out?.matchPlayers.length).toBe(10)
  })

  it('defers (null) for non-spectator GSI', async () => {
    const playing = {
      hero: { id: 14 },
      map: { matchid: '12345' },
      player: { accountid: '111', team_name: 'radiant' },
    }
    await expect(r.resolve(ctx(playing))).resolves.toBeNull()
  })

  it('defers when GSI is undefined', async () => {
    await expect(r.resolve(ctx())).resolves.toBeNull()
  })

  it('defers when team2/team3 are missing on hero', async () => {
    const partial = { hero: {}, map: { matchid: '12345' }, player: { team_name: 'spectator' } }
    await expect(r.resolve(ctx(partial))).resolves.toBeNull()
  })

  it('self-tags as gsi-spectator (no inference)', async () => {
    const out = await r.resolve(ctx(spectatorGsi()))
    expect(out?.source).toBe('gsi-spectator')
  })
})
