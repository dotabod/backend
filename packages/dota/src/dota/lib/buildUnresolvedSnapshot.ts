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

// Cache wins for fields the DC packet sheds (hero, KDA, score). Live wins for
// game_time — it tends to survive on the DC packet and is fresher than the
// last-cached tick. The caller is responsible for only passing `cached` when
// its `matchId` matches.
export function buildUnresolvedSnapshot(args: {
  matchId: string
  gsi: LiveGsiLike | null | undefined
  cached: InGameSnapshot | null
  now: Date
}): UnresolvedMatch {
  const { matchId, gsi, cached, now } = args

  const hero_name = cached?.hero_name ?? liveString(gsi?.hero?.name)
  const kills = cached?.kills ?? gsi?.player?.kills ?? null
  const deaths = cached?.deaths ?? gsi?.player?.deaths ?? null
  const assists = cached?.assists ?? gsi?.player?.assists ?? null
  const radiant_score = cached?.radiant_score ?? gsi?.map?.radiant_score ?? null
  const dire_score = cached?.dire_score ?? gsi?.map?.dire_score ?? null
  const duration = gsi?.map?.game_time ?? cached?.duration ?? null

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
