import { describe, expect, it } from 'bun:test'
import { GsiSpectatorResolver } from '../../resolvers/GsiSpectatorResolver'

const ctx = (gsi: unknown) => ({ gsi: gsi as never, matchId: '12345' })

function spectatorGsi() {
  const team2 = Object.fromEntries(
    [0, 1, 2, 3, 4].map((i) => [`player${i}`, { id: i + 1, selected_unit: false }]),
  )
  const team3 = Object.fromEntries(
    [5, 6, 7, 8, 9].map((i) => [`player${i}`, { id: i + 1, selected_unit: false }]),
  )
  const team2Players = Object.fromEntries(
    [0, 1, 2, 3, 4].map((i) => [`player${i}`, { accountid: 2000 + i, name: `P${i}` }]),
  )
  const team3Players = Object.fromEntries(
    [5, 6, 7, 8, 9].map((i) => [`player${i}`, { accountid: 2000 + i, name: `P${i}` }]),
  )
  return {
    map: { matchid: '12345' },
    player: { team_name: 'spectator', team2: team2Players, team3: team3Players },
    hero: { team2, team3 },
  }
}

describe('GsiSpectatorResolver', () => {
  const r = new GsiSpectatorResolver()

  it('claims spectator GSI', async () => {
    const out = await r.resolve(ctx(spectatorGsi()))
    expect(out?.source).toBe('gsi-spectator')
    expect(out?.matchPlayers.length).toBe(10)
  })

  it('defers (null) for non-spectator GSI', async () => {
    const playing = {
      map: { matchid: '12345' },
      player: { team_name: 'radiant', accountid: '111' },
      hero: { id: 14 },
    }
    expect(await r.resolve(ctx(playing))).toBeNull()
  })

  it('defers when GSI is undefined', async () => {
    expect(await r.resolve(ctx(undefined))).toBeNull()
  })

  it('defers when team2/team3 are missing on hero', async () => {
    const partial = { map: { matchid: '12345' }, player: { team_name: 'spectator' }, hero: {} }
    expect(await r.resolve(ctx(partial))).toBeNull()
  })

  it('self-tags as gsi-spectator (no inference)', async () => {
    const out = await r.resolve(ctx(spectatorGsi()))
    expect(out?.source).toBe('gsi-spectator')
  })
})
