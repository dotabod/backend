import type { UnresolvedMatch } from './unresolved-matches.ts'

export interface InGameSnapshot {
  matchId: string
  hero_name: string | null
  kills: number | null
  deaths: number | null
  assists: number | null
  duration: number | null
  radiant_score: number | null
  dire_score: number | null
}

interface ClosingScores {
  dire_score: number | null
  kda: { assists: number | null; deaths: number | null; kills: number | null }
  radiant_score: number | null
}

const EMPTY_IN_GAME_SNAPSHOT: InGameSnapshot = {
  assists: null,
  deaths: null,
  dire_score: null,
  duration: null,
  hero_name: null,
  kills: null,
  matchId: '',
  radiant_score: null,
}

interface LiveGsiLike {
  hero?: { name?: string | null } | null
  player?: {
    kills?: number | null
    deaths?: number | null
    assists?: number | null
  } | null
  map?: {
    matchid?: string | null
    game_time?: number | null
    radiant_score?: number | null
    dire_score?: number | null
  } | null
}

// Treats empty strings as missing — the disconnect GSI packet often returns
// `hero.name = ""` rather than dropping the key.
const liveString = (v: string | null | undefined): string | null => {
  if (v === null || v === undefined) {
    return null
  }
  return v.length > 0 ? v : null
}

// KDA, score, and game_time are monotonically non-decreasing during a match.
// Dota's GSI occasionally emits a "cleared" tick (player block reset to 0,
// game_time reset to 0) while state is still GAME_IN_PROGRESS — that's noise,
// not a real regression, and must not overwrite real values in the cache or
// in the DC merge. Taking the max preserves the last-good value in both
// directions: stale cache loses to a higher live value, cleared live loses
// to a real cached value.
const monotonic = (
  live: number | null | undefined,
  prev: number | null | undefined
): number | null => {
  const l = live ?? null
  const p = prev ?? null
  if (l === null) {
    return p
  }
  if (p === null) {
    return l
  }
  return Math.max(l, p)
}

// Per-tick cache update: called on every GSI packet while the streamer is in
// 'playing' state. Discards `prev` when the matchId changes (new game) and
// applies monotonic-max for numeric fields so a cleared tick can't regress
// the cache.
export const mergeInGameSnapshotTick = function mergeInGameSnapshotTick(args: {
  matchId: string
  gsi: LiveGsiLike | null | undefined
  prev: InGameSnapshot | null
}): InGameSnapshot {
  const { matchId, gsi, prev } = args
  const previous = prev?.matchId === matchId ? prev : EMPTY_IN_GAME_SNAPSHOT
  const liveHero = liveString(gsi?.hero?.name)
  const liveMap = gsi?.map ?? {}
  const livePlayer = gsi?.player ?? {}
  return {
    assists: monotonic(livePlayer.assists, previous.assists),
    deaths: monotonic(livePlayer.deaths, previous.deaths),
    dire_score: monotonic(liveMap.dire_score, previous.dire_score),
    duration: monotonic(liveMap.game_time, previous.duration),
    hero_name: liveHero ?? previous.hero_name,
    kills: monotonic(livePlayer.kills, previous.kills),
    matchId,
    radiant_score: monotonic(liveMap.radiant_score, previous.radiant_score),
  }
}

// Final-match scores merged from the Steam GC `MatchMinimalDetailsResponse`
// (authoritative once Steam has indexed the match) and the live GSI player
// block (authoritative until then). Both sources are monotonic during a
// match, so a stub response from either side that reports 0 must not regress
// the persisted KDA / score the way a naive `??` chain would.
export const buildClosingScores = function buildClosingScores(args: {
  gcPlayer:
    | { kills?: number | null; deaths?: number | null; assists?: number | null }
    | null
    | undefined
  gcMatch: { radiant_score?: number | null; dire_score?: number | null } | null | undefined
  gsi: LiveGsiLike | null | undefined
}): ClosingScores {
  const { gcPlayer, gcMatch, gsi } = args
  return {
    dire_score: monotonic(gcMatch?.dire_score, gsi?.map?.dire_score),
    kda: {
      assists: monotonic(gcPlayer?.assists, gsi?.player?.assists),
      deaths: monotonic(gcPlayer?.deaths, gsi?.player?.deaths),
      kills: monotonic(gcPlayer?.kills, gsi?.player?.kills),
    },
    radiant_score: monotonic(gcMatch?.radiant_score, gsi?.map?.radiant_score),
  }
}

// Build the snapshot we hand off at early-DC time. Hero name prefers cache
// (live blocks are shed on DC), numeric fields take the max of live and
// cache so a cleared live tick can't pair real KDA with a 0:00 duration.
// Caller is responsible for only passing `cached` when its matchId matches.
export const buildUnresolvedSnapshot = function buildUnresolvedSnapshot(args: {
  matchId: string
  gsi: LiveGsiLike | null | undefined
  cached: InGameSnapshot | null
  now: Date
}): UnresolvedMatch {
  const { matchId, gsi, cached, now } = args
  const stored = cached ?? EMPTY_IN_GAME_SNAPSHOT
  const liveMap = gsi?.map ?? {}
  const livePlayer = gsi?.player ?? {}
  const heroName = stored.hero_name ?? liveString(gsi?.hero?.name)
  const kills = monotonic(livePlayer.kills, stored.kills)
  const deaths = monotonic(livePlayer.deaths, stored.deaths)
  const assists = monotonic(livePlayer.assists, stored.assists)
  const radiantScore = monotonic(liveMap.radiant_score, stored.radiant_score)
  const direScore = monotonic(liveMap.dire_score, stored.dire_score)
  const duration = monotonic(liveMap.game_time, stored.duration)

  const iso = now.toISOString()
  return {
    created_at: iso,
    dire_score: direScore,
    hero_name: heroName,
    kda: { assists, deaths, duration, kills },
    matchId,
    radiant_score: radiantScore,
    updated_at: iso,
  }
}
