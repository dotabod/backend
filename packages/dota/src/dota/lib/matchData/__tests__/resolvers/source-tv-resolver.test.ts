import { describe, expect, it } from 'vitest'

import type { DelayedGames } from '../../../../../types'
import { SourceTvResolver } from '../../resolvers/source-tv-resolver'

const ctx = (matchId: string | undefined) => ({ gsi: undefined, matchId })

const withDoc = function withDoc(doc: DelayedGames | null) {
  return new SourceTvResolver(async () => doc)
}

describe(SourceTvResolver, () => {
  it('defers when matchId is undefined (no fetch)', async () => {
    let calls = 0
    const r = new SourceTvResolver(async () => {
      calls += 1
      return null
    })
    const out = await r.resolve(ctx())
    expect(out).toBeNull()
    expect(calls).toBe(0)
  })

  it('defers when fetcher returns null doc', async () => {
    await expect(withDoc(null).resolve(ctx('12345'))).resolves.toBeNull()
  })

  it('claims a flat-players[] SourceTV doc', async () => {
    const doc = {
      match: { match_id: '12345' },
      players: [
        { accountid: 1001, heroid: 1 },
        { accountid: 1002, heroid: 2 },
      ],
    } as unknown as DelayedGames
    const out = await withDoc(doc).resolve(ctx('12345'))
    expect(out?.source).toBe('sourcetv')
    expect(out?.matchPlayers.length).toBe(2)
    expect(out?.matchPlayers[0].accountid).toBe(1001)
  })

  it('claims a teams[]-shape doc (2 teams × 5 players)', async () => {
    const doc = {
      match: { match_id: '12345' },
      teams: [
        {
          players: Array.from({ length: 5 }, (_, i) => ({
            accountid: 1000 + i,
            heroid: i + 1,
            playerid: i,
          })),
        },
        {
          players: Array.from({ length: 5 }, (_, i) => ({
            accountid: 2000 + i,
            heroid: 100 + i,
            playerid: i + 5,
          })),
        },
      ],
    } as unknown as DelayedGames
    const out = await withDoc(doc).resolve(ctx('12345'))
    expect(out?.source).toBe('sourcetv')
    expect(out?.matchPlayers.length).toBe(10)
  })

  it('defers on an empty doc (no teams, no players)', async () => {
    const doc = { match: { match_id: '12345' } } as unknown as DelayedGames
    await expect(withDoc(doc).resolve(ctx('12345'))).resolves.toBeNull()
  })
})
