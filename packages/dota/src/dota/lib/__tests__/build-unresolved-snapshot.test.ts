import { describe, expect, it } from 'vitest'

import {
  buildClosingScores,
  buildUnresolvedSnapshot,
  mergeInGameSnapshotTick,
} from '../build-unresolved-snapshot.ts'
import { formatUnresolvedMatch } from '../unresolved-matches.ts'

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

describe(buildUnresolvedSnapshot, () => {
  it('uses cached values when the DC packet has shed hero/player and zeroed the score', () => {
    const snapshot = buildUnresolvedSnapshot({
      cached: {
        assists: 12,
        deaths: 3,
        dire_score: 18,
        duration: 220,
        hero_name: 'npc_dota_hero_dark_seer',
        kills: 7,
        matchId,
        radiant_score: 21,
      },
      gsi: {
        hero: {},
        map: { dire_score: 0, game_time: 223, matchid: matchId, radiant_score: 0 },
        player: {},
      },
      matchId,
      now,
    })

    expect(formatUnresolvedMatch(snapshot, now)).toBe(
      `${matchId} (Dark Seer, 7/3/12, 21-18, 3:43, ~0m ago)`
    )
  })

  it('treats an empty hero name string as missing and falls back to the cache', () => {
    const snapshot = buildUnresolvedSnapshot({
      cached: {
        assists: 0,
        deaths: 0,
        dire_score: 0,
        duration: 0,
        hero_name: 'npc_dota_hero_invoker',
        kills: 0,
        matchId,
        radiant_score: 0,
      },
      gsi: {
        hero: { name: '' },
        map: { dire_score: 9, game_time: 600, matchid: matchId, radiant_score: 12 },
        player: { assists: 6, deaths: 1, kills: 4 },
      },
      matchId,
      now,
    })

    expect(snapshot.hero_name).toBe('npc_dota_hero_invoker')
  })

  it('uses live values directly when no cache is available', () => {
    const snapshot = buildUnresolvedSnapshot({
      cached: null,
      gsi: {
        hero: { name: 'npc_dota_hero_juggernaut' },
        map: { dire_score: 22, game_time: 1500, matchid: matchId, radiant_score: 28 },
        player: { assists: 4, deaths: 2, kills: 9 },
      },
      matchId,
      now,
    })

    expect(snapshot.hero_name).toBe('npc_dota_hero_juggernaut')
    expect(snapshot.kda).toStrictEqual({ assists: 4, deaths: 2, duration: 1500, kills: 9 })
    expect(snapshot.radiant_score).toBe(28)
    expect(snapshot.dire_score).toBe(22)
  })

  it('renders gracefully when both live and cache are empty', () => {
    const snapshot = buildUnresolvedSnapshot({
      cached: null,
      gsi: { hero: {}, map: { matchid: matchId }, player: {} },
      matchId,
      now,
    })

    expect(formatUnresolvedMatch(snapshot, now)).toBe(`${matchId} (Unknown, ~0m ago)`)
  })

  it('prefers live game_time over cached duration when live is fresher', () => {
    const snapshot = buildUnresolvedSnapshot({
      cached: {
        assists: 0,
        deaths: 0,
        dire_score: 0,
        duration: 100,
        hero_name: 'npc_dota_hero_dark_seer',
        kills: 1,
        matchId,
        radiant_score: 1,
      },
      gsi: {
        hero: {},
        map: { game_time: 999, matchid: matchId },
        player: {},
      },
      matchId,
      now,
    })

    expect(snapshot.kda?.duration).toBe(999)
  })

  // Regression: monotonic fields (KDA, scores, duration) only ever increase
  // during a match. If the DC packet zeroes them (live=0) while the cache holds
  // the last good values, we must NOT regress — otherwise the chat message
  // pairs real cached KDA with a 0:00 duration ("Dark Seer, 7/3/12, 21-18,
  // 0:00") which is internally contradictory and visibly worse than the
  // all-zeros message this commit fixed.
  it('keeps cached duration and scores when the live packet zeroed them', () => {
    const snapshot = buildUnresolvedSnapshot({
      cached: {
        assists: 12,
        deaths: 3,
        dire_score: 18,
        duration: 720,
        hero_name: 'npc_dota_hero_dark_seer',
        kills: 7,
        matchId,
        radiant_score: 21,
      },
      gsi: {
        hero: {},
        map: { dire_score: 0, game_time: 0, matchid: matchId, radiant_score: 0 },
        player: {},
      },
      matchId,
      now,
    })

    expect(snapshot.kda?.duration).toBe(720)
    expect(snapshot.radiant_score).toBe(21)
    expect(snapshot.dire_score).toBe(18)
    expect(formatUnresolvedMatch(snapshot, now)).toBe(
      `${matchId} (Dark Seer, 7/3/12, 21-18, 12:00, ~0m ago)`
    )
  })
})

// `mergeInGameSnapshotTick` is the per-tick cache update that runs on every
// GSI packet during 'playing'. Same monotonic invariant: a tick where live
// values are lower than the cache (Dota's GSI occasionally emits a cleared
// player/map block while state stays GAME_IN_PROGRESS) must NOT overwrite
// real cached values with zeros.
describe(mergeInGameSnapshotTick, () => {
  it('captures the first tick when there is no prev snapshot', () => {
    const next = mergeInGameSnapshotTick({
      gsi: {
        hero: { name: 'npc_dota_hero_dark_seer' },
        map: { dire_score: 0, game_time: 5, matchid: matchId, radiant_score: 0 },
        player: { assists: 0, deaths: 0, kills: 0 },
      },
      matchId,
      prev: null,
    })

    expect(next).toStrictEqual({
      assists: 0,
      deaths: 0,
      dire_score: 0,
      duration: 5,
      hero_name: 'npc_dota_hero_dark_seer',
      kills: 0,
      matchId,
      radiant_score: 0,
    })
  })

  it('does not let a cleared tick (live=0) overwrite cached non-zero values', () => {
    const next = mergeInGameSnapshotTick({
      gsi: {
        hero: { name: 'npc_dota_hero_dark_seer' },
        map: { dire_score: 0, game_time: 0, matchid: matchId, radiant_score: 0 },
        player: { assists: 0, deaths: 0, kills: 0 },
      },
      matchId,
      prev: {
        assists: 12,
        deaths: 3,
        dire_score: 18,
        duration: 720,
        hero_name: 'npc_dota_hero_dark_seer',
        kills: 7,
        matchId,
        radiant_score: 21,
      },
    })

    expect(next.kills).toBe(7)
    expect(next.deaths).toBe(3)
    expect(next.assists).toBe(12)
    expect(next.duration).toBe(720)
    expect(next.radiant_score).toBe(21)
    expect(next.dire_score).toBe(18)
  })

  it('advances values when the live tick is greater than the cache', () => {
    const next = mergeInGameSnapshotTick({
      gsi: {
        hero: { name: 'npc_dota_hero_dark_seer' },
        map: { dire_score: 18, game_time: 800, matchid: matchId, radiant_score: 22 },
        player: { assists: 14, deaths: 3, kills: 8 },
      },
      matchId,
      prev: {
        assists: 12,
        deaths: 3,
        dire_score: 18,
        duration: 720,
        hero_name: 'npc_dota_hero_dark_seer',
        kills: 7,
        matchId,
        radiant_score: 21,
      },
    })

    expect(next.kills).toBe(8)
    expect(next.assists).toBe(14)
    expect(next.duration).toBe(800)
    expect(next.radiant_score).toBe(22)
  })

  it('discards prev when the matchId changes (new game)', () => {
    const next = mergeInGameSnapshotTick({
      gsi: { hero: {}, map: { matchid: '9999' }, player: {} },
      matchId: '9999',
      prev: {
        assists: 12,
        deaths: 3,
        dire_score: 18,
        duration: 720,
        hero_name: 'npc_dota_hero_dark_seer',
        kills: 7,
        matchId,
        radiant_score: 21,
      },
    })

    expect(next.kills).toBeNull()
    expect(next.hero_name).toBeNull()
    expect(next.duration).toBeNull()
  })
})

// `buildClosingScores` merges the Steam GC `MatchMinimalDetailsResponse`
// with live GSI when the match ends with a winner. Both are monotonic, so
// a stub from either side with kills=0 must not regress the other source's
// real value — otherwise the persisted `matches.kda` ends up as 0/0/0 and
// the W/L summary in chat is wrong.
describe(buildClosingScores, () => {
  it('prefers live GSI when the Steam GC stub reports 0 KDA but live is real', () => {
    const scores = buildClosingScores({
      gcMatch: { dire_score: 0, radiant_score: 0 },
      gcPlayer: { assists: 0, deaths: 0, kills: 0 },
      gsi: {
        map: { dire_score: 27, game_time: 2400, matchid: matchId, radiant_score: 38 },
        player: { assists: 9, deaths: 4, kills: 14 },
      },
    })

    expect(scores.kda).toStrictEqual({ assists: 9, deaths: 4, kills: 14 })
    expect(scores.radiant_score).toBe(38)
    expect(scores.dire_score).toBe(27)
  })

  it('prefers Steam GC when GC reports real values and live has cleared', () => {
    const scores = buildClosingScores({
      gcMatch: { dire_score: 27, radiant_score: 38 },
      gcPlayer: { assists: 9, deaths: 4, kills: 14 },
      gsi: {
        map: { dire_score: 0, game_time: 0, matchid: matchId, radiant_score: 0 },
        player: { assists: 0, deaths: 0, kills: 0 },
      },
    })

    expect(scores.kda).toStrictEqual({ assists: 9, deaths: 4, kills: 14 })
    expect(scores.radiant_score).toBe(38)
    expect(scores.dire_score).toBe(27)
  })

  it('uses live values when GC is absent (no MatchMinimalDetailsResponse)', () => {
    const scores = buildClosingScores({
      gcMatch: null,
      gcPlayer: null,
      gsi: {
        map: { dire_score: 25, game_time: 1800, matchid: matchId, radiant_score: 30 },
        player: { assists: 11, deaths: 2, kills: 7 },
      },
    })

    expect(scores.kda).toStrictEqual({ assists: 11, deaths: 2, kills: 7 })
    expect(scores.radiant_score).toBe(30)
    expect(scores.dire_score).toBe(25)
  })

  it('returns a legitimate 0 when both sources agree on 0 (support player, no kills)', () => {
    const scores = buildClosingScores({
      gcMatch: { dire_score: 30, radiant_score: 24 },
      gcPlayer: { assists: 18, deaths: 5, kills: 0 },
      gsi: {
        map: { dire_score: 30, game_time: 2700, matchid: matchId, radiant_score: 24 },
        player: { assists: 18, deaths: 5, kills: 0 },
      },
    })

    expect(scores.kda).toStrictEqual({ assists: 18, deaths: 5, kills: 0 })
  })
})
