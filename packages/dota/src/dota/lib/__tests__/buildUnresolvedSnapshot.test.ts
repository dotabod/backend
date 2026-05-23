import { describe, expect, it } from 'vite-plus/test'
import { buildUnresolvedSnapshot } from '../buildUnresolvedSnapshot.ts'
import { formatUnresolvedMatch } from '../unresolvedMatches.ts'

// Regression: the user disconnected mid-match and the bot announced
// "8822096213 (Unknown, 0/0/0, 0-0, 3:43, ~0m ago)". The live GSI packet that
// fires the disconnect has shed hero/player fields and may zero the score,
// while the cached `lastInGameSnapshot` (which used to be captured only once
// at the start of a game) held stale start-of-game zeros.
//
// `buildUnresolvedSnapshot` is the pure helper that merges the live GSI packet
// with the cached snapshot to produce the row written to `matches` and the
// chat string. Cache wins for fields the DC packet sheds (hero, KDA, score);
// live wins for `game_time` because it tends to survive longer than the rest.

const now = new Date('2026-05-22T12:00:00.000Z')
const matchId = '8822096213'

describe('buildUnresolvedSnapshot', () => {
  it('uses cached values when the DC packet has shed hero/player and zeroed the score', () => {
    const snapshot = buildUnresolvedSnapshot({
      matchId,
      gsi: {
        hero: {},
        player: {},
        map: { matchid: matchId, game_time: 223, radiant_score: 0, dire_score: 0 },
      },
      cached: {
        matchId,
        hero_name: 'npc_dota_hero_dark_seer',
        kills: 7,
        deaths: 3,
        assists: 12,
        radiant_score: 21,
        dire_score: 18,
        duration: 220,
      },
      now,
    })

    expect(formatUnresolvedMatch(snapshot, now)).toBe(
      `${matchId} (Dark Seer, 7/3/12, 21-18, 3:43, ~0m ago)`,
    )
  })

  it('treats an empty hero name string as missing and falls back to the cache', () => {
    const snapshot = buildUnresolvedSnapshot({
      matchId,
      gsi: {
        hero: { name: '' },
        player: { kills: 4, deaths: 1, assists: 6 },
        map: { matchid: matchId, game_time: 600, radiant_score: 12, dire_score: 9 },
      },
      cached: {
        matchId,
        hero_name: 'npc_dota_hero_invoker',
        kills: 0,
        deaths: 0,
        assists: 0,
        radiant_score: 0,
        dire_score: 0,
        duration: 0,
      },
      now,
    })

    expect(snapshot.hero_name).toBe('npc_dota_hero_invoker')
  })

  it('uses live values directly when no cache is available', () => {
    const snapshot = buildUnresolvedSnapshot({
      matchId,
      gsi: {
        hero: { name: 'npc_dota_hero_juggernaut' },
        player: { kills: 9, deaths: 2, assists: 4 },
        map: { matchid: matchId, game_time: 1500, radiant_score: 28, dire_score: 22 },
      },
      cached: null,
      now,
    })

    expect(snapshot.hero_name).toBe('npc_dota_hero_juggernaut')
    expect(snapshot.kda).toEqual({ kills: 9, deaths: 2, assists: 4, duration: 1500 })
    expect(snapshot.radiant_score).toBe(28)
    expect(snapshot.dire_score).toBe(22)
  })

  it('renders gracefully when both live and cache are empty', () => {
    const snapshot = buildUnresolvedSnapshot({
      matchId,
      gsi: { hero: {}, player: {}, map: { matchid: matchId } },
      cached: null,
      now,
    })

    expect(formatUnresolvedMatch(snapshot, now)).toBe(`${matchId} (Unknown, ~0m ago)`)
  })

  it('prefers live game_time over cached duration', () => {
    const snapshot = buildUnresolvedSnapshot({
      matchId,
      gsi: {
        hero: {},
        player: {},
        map: { matchid: matchId, game_time: 999 },
      },
      cached: {
        matchId,
        hero_name: 'npc_dota_hero_dark_seer',
        kills: 1,
        deaths: 0,
        assists: 0,
        radiant_score: 1,
        dire_score: 0,
        duration: 100,
      },
      now,
    })

    expect(snapshot.kda?.duration).toBe(999)
  })
})
