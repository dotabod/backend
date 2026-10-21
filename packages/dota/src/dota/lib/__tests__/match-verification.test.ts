import { describe, expect, it } from 'vitest'

import {
  applyVerification,
  decideVerification,
  fetchValveMatch,
  getHeroIdByName,
  parseValveResponse,
} from '../match-verification.ts'
import type { OnlineEffects } from '../match-verification.ts'
import {
  createMemoryStore,
  createRequester,
  valveMatch,
  verifiableMatch,
} from './match-verification-fakes.ts'

const recordingEffects = function recordingEffects() {
  const calls: string[] = []
  const effects: OnlineEffects = {
    async adjustMmr(match, won, isCorrection) {
      calls.push(`mmr lobby=${match.lobby_type} won=${won} correction=${isCorrection}`)
      await Promise.resolve()
    },
    async closePrediction(_match, won) {
      calls.push(`prediction won=${won}`)
      await Promise.resolve()
    },
    refreshWinLoss() {
      calls.push('wl')
    },
  }
  return { calls, effects }
}

describe(decideVerification, () => {
  it('fills in a missing result, finding an anonymous streamer by their hero', () => {
    expect(getHeroIdByName('npc_dota_hero_lion')).toBe(26)
    expect(decideVerification(verifiableMatch(), valveMatch())).toStrictEqual({
      direScore: 41,
      gameMode: 22,
      lobbyType: 7,
      radiantScore: 30,
      verification: 'resolved',
      won: true,
    })
  })

  it('finds the streamer by account id when Valve shows it', () => {
    const valve = valveMatch({ players: [{ account_id: 433_314_623, hero_id: 1, team_number: 1 }] })
    expect(decideVerification(verifiableMatch({ hero_name: null }), valve)).toMatchObject({
      won: true,
    })
  })

  it('confirms a recorded result that matches Valve', () => {
    expect(decideVerification(verifiableMatch({ won: true }), valveMatch())).toStrictEqual({
      verification: 'confirmed',
    })
  })

  it('corrects a recorded result that disagrees with Valve', () => {
    expect(decideVerification(verifiableMatch({ won: false }), valveMatch())).toMatchObject({
      verification: 'corrected',
      won: true,
    })
  })

  it('leaves matches Valve did not score', () => {
    expect(decideVerification(verifiableMatch(), valveMatch({ match_outcome: 65 }))).toStrictEqual({
      verification: 'not_scored',
    })
  })

  it('refuses to guess when the streamer cannot be found', () => {
    expect(
      decideVerification(verifiableMatch({ hero_name: 'npc_dota_hero_axe' }), valveMatch())
    ).toStrictEqual({ verification: 'team_unknown' })
  })

  it('refuses to guess when account and hero point at different teams', () => {
    const valve = valveMatch({
      players: [
        { account_id: 433_314_623, hero_id: 1, team_number: 0 },
        { account_id: 0, hero_id: 26, team_number: 1 },
      ],
    })
    expect(decideVerification(verifiableMatch(), valve)).toStrictEqual({
      verification: 'team_unknown',
    })
  })

  it('flags a stored team that Valve disagrees with', () => {
    expect(decideVerification(verifiableMatch({ myTeam: 'radiant' }), valveMatch())).toStrictEqual({
      verification: 'team_mismatch',
    })
  })
})

describe(parseValveResponse, () => {
  it('reads the GC Long match id', () => {
    const response = { matches: [{ ...valveMatch(), match_id: { high: 2, low: 463_230_986 } }] }
    expect(parseValveResponse(response, '9053165578')).toMatchObject({ match_outcome: 3 })
  })

  it('ignores an answer for a different match', () => {
    expect(
      parseValveResponse({ matches: [valveMatch({ match_id: '1' })] }, '9053165578')
    ).toBeNull()
  })

  it('returns null when Valve has no such match or sends something else', () => {
    expect(parseValveResponse({ matches: [] }, '9053165578')).toBeNull()
    expect(parseValveResponse(null, '9053165578')).toBeNull()
  })
})

describe(fetchValveMatch, () => {
  it('reports a failed request so callers can back off', async () => {
    const { request } = createRequester(new Map([['1', new Error('Steam not connected')]]))
    await expect(fetchValveMatch(request, '1')).resolves.toBe('unavailable')
  })
})

describe(applyVerification, () => {
  it('fills in a missing result and runs the online effects', async () => {
    const { store, table } = createMemoryStore([verifiableMatch()])
    const { calls, effects } = recordingEffects()
    const row = verifiableMatch()

    await expect(
      applyVerification(row, decideVerification(row, valveMatch()), store, effects)
    ).resolves.toBeTruthy()

    expect(table.get('row-1')).toMatchObject({ lobby_type: 7, verification: 'resolved', won: true })
    expect(calls).toStrictEqual([
      'mmr lobby=7 won=true correction=false',
      'prediction won=true',
      'wl',
    ])
  })

  it('corrects a wrong result without touching the prediction', async () => {
    const row = verifiableMatch({ won: false })
    const { store, table } = createMemoryStore([row])
    const { calls, effects } = recordingEffects()

    await applyVerification(row, decideVerification(row, valveMatch()), store, effects)

    expect(table.get('row-1')).toMatchObject({ verification: 'corrected', won: true })
    expect(calls).toStrictEqual(['mmr lobby=7 won=true correction=true', 'wl'])
  })

  it('changes nothing when someone resolved the match first', async () => {
    const decidedFrom = verifiableMatch()
    const { store, table } = createMemoryStore([verifiableMatch({ won: false })])
    const { calls, effects } = recordingEffects()

    await expect(
      applyVerification(decidedFrom, decideVerification(decidedFrom, valveMatch()), store, effects)
    ).resolves.toBeFalsy()

    expect(table.get('row-1')).toMatchObject({ verification: null, won: false })
    expect(calls).toStrictEqual([])
  })

  it('only marks the row when there is no result to write', async () => {
    const row = verifiableMatch({ won: true })
    const { store, table } = createMemoryStore([row])
    const { calls, effects } = recordingEffects()

    await applyVerification(row, { verification: 'confirmed' }, store, effects)

    expect(table.get('row-1')).toMatchObject({ verification: 'confirmed', won: true })
    expect(calls).toStrictEqual([])
  })
})
