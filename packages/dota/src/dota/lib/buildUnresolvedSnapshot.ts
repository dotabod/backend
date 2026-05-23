import type { UnresolvedMatch } from './unresolvedMatches.ts'

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
  if (typeof v !== 'string') return null
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
  prev: number | null | undefined,
): number | null => {
  const l = typeof live === 'number' ? live : null
  const p = typeof prev === 'number' ? prev : null
  if (l == null) return p
  if (p == null) return l
  return Math.max(l, p)
}

// Per-tick cache update: called on every GSI packet while the streamer is in
// 'playing' state. Discards `prev` when the matchId changes (new game) and
// applies monotonic-max for numeric fields so a cleared tick can't regress
// the cache.
export function mergeInGameSnapshotTick(args: {
  matchId: string
  gsi: LiveGsiLike | null | undefined
  prev: InGameSnapshot | null
}): InGameSnapshot {
  const { matchId, gsi, prev } = args
  const samePrev = prev?.matchId === matchId ? prev : null
  const liveHero = liveString(gsi?.hero?.name)
  return {
    matchId,
    hero_name: liveHero ?? samePrev?.hero_name ?? null,
    kills: monotonic(gsi?.player?.kills, samePrev?.kills),
    deaths: monotonic(gsi?.player?.deaths, samePrev?.deaths),
    assists: monotonic(gsi?.player?.assists, samePrev?.assists),
    duration: monotonic(gsi?.map?.game_time, samePrev?.duration),
    radiant_score: monotonic(gsi?.map?.radiant_score, samePrev?.radiant_score),
    dire_score: monotonic(gsi?.map?.dire_score, samePrev?.dire_score),
  }
}

// Build the snapshot we hand off at early-DC time. Hero name prefers cache
// (live blocks are shed on DC), numeric fields take the max of live and
// cache so a cleared live tick can't pair real KDA with a 0:00 duration.
// Caller is responsible for only passing `cached` when its matchId matches.
export function buildUnresolvedSnapshot(args: {
  matchId: string
  gsi: LiveGsiLike | null | undefined
  cached: InGameSnapshot | null
  now: Date
}): UnresolvedMatch {
  const { matchId, gsi, cached, now } = args

  const hero_name = cached?.hero_name ?? liveString(gsi?.hero?.name)
  const kills = monotonic(gsi?.player?.kills, cached?.kills)
  const deaths = monotonic(gsi?.player?.deaths, cached?.deaths)
  const assists = monotonic(gsi?.player?.assists, cached?.assists)
  const radiant_score = monotonic(gsi?.map?.radiant_score, cached?.radiant_score)
  const dire_score = monotonic(gsi?.map?.dire_score, cached?.dire_score)
  const duration = monotonic(gsi?.map?.game_time, cached?.duration)

  const iso = now.toISOString()
  return {
    matchId,
    hero_name,
    kda: { kills, deaths, assists, duration },
    radiant_score,
    dire_score,
    created_at: iso,
    updated_at: iso,
  }
}
