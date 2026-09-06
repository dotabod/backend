import { describe, expect, it } from 'vitest'

import type { DelayedGames } from '../../../../../types'
import type { ResolverContext } from '../../resolvers/roster-resolver'
import { SourceTvResolver } from '../../resolvers/source-tv-resolver'

const ctx = (matchId?: string): ResolverContext => ({ gsi: undefined, matchId })

const MATCH: DelayedGames['match'] = {
  game_mode: 22,
  lobby_type: 7,
  match_id: '12345',
  server_steam_id: '1',
}

const makeTeamPlayer = function makeTeamPlayer(
  accountid: number,
  heroid: number,
  playerid: number
): DelayedGames['teams'][number]['players'][number] {
  return {
    abilities: [],
    accountid,
    assists_count: 0,
    death_count: 0,
    denies_count: 0,
    gold: 0,
    heroid,
    items: [],
    kill_count: 0,
    level: 1,
    lh_count: 0,
    name: `player-${playerid}`,
    net_worth: 0,
    playerid,
    team: playerid < 5 ? 2 : 3,
    team_slot: playerid % 5,
    x: 0,
    y: 0,
  }
}

const withDoc = function withDoc(doc: DelayedGames | null) {
  return new SourceTvResolver(async () => await Promise.resolve(doc))
}

describe(SourceTvResolver, () => {
  it('defers when matchId is undefined (no fetch)', async () => {
    let calls = 0
    const r = new SourceTvResolver(async () => {
      calls += 1
      return await Promise.resolve(null)
    })
    const out = await r.resolve(ctx())
    expect(out).toBeNull()
    expect(calls).toBe(0)
  })

  it('defers when fetcher returns null doc', async () => {
    await expect(withDoc(null).resolve(ctx('12345'))).resolves.toBeNull()
  })

  it('claims a flat-players[] SourceTV doc', async () => {
    const doc: DelayedGames = {
      match: MATCH,
      players: [
        { accountid: '1001', heroid: 1 },
        { accountid: '1002', heroid: 2 },
      ],
      teams: [],
    }
    const out = await withDoc(doc).resolve(ctx('12345'))
    expect(out?.source).toBe('sourcetv')
    expect(out?.matchPlayers.length).toBe(2)
    expect(out?.matchPlayers[0].accountid).toBe(1001)
  })

  it('claims a teams[]-shape doc (2 teams × 5 players)', async () => {
    const doc: DelayedGames = {
      match: MATCH,
      players: [],
      teams: [
        {
          players: Array.from({ length: 5 }, (_, i) => makeTeamPlayer(1000 + i, i + 1, i)),
        },
        {
          players: Array.from({ length: 5 }, (_, i) => makeTeamPlayer(2000 + i, 100 + i, i + 5)),
        },
      ],
    }
    const out = await withDoc(doc).resolve(ctx('12345'))
    expect(out?.source).toBe('sourcetv')
    expect(out?.matchPlayers.length).toBe(10)
  })

  it('defers on an empty doc (no teams, no players)', async () => {
    const doc: DelayedGames = { match: MATCH, players: [], teams: [] }
    await expect(withDoc(doc).resolve(ctx('12345'))).resolves.toBeNull()
  })
})
