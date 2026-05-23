import type { HeroesStatus, Packet, Players } from '../../../../types'
import type {
  MatchStage,
  ResolvedRoster,
  RosterCompleteness,
  RosterPlayer,
  RosterSource,
} from '../types'
import { coverage, emptyRoster } from './coverage'

// Pure transform: takes a resolver's typed output and produces the public `ResolvedRoster`.
// All the messy normalization rules (`accountid:0` sentinel collapse, NaN slot/hero rejection,
// ghost-row filter, spectator team derivation, completeness math, stage inference) live HERE in
// one place — every resolver gets identical downstream treatment.
export function normalize({
  source,
  matchPlayers,
  heroesStatus,
  gsi,
}: {
  source: RosterSource
  matchPlayers: Players
  heroesStatus?: HeroesStatus
  gsi: Packet | undefined
}): ResolvedRoster {
  // Drop ghost entries (no accountid, no heroid, no name — pure stubs).
  const cleaned = matchPlayers.filter((p) => {
    const validAcct =
      typeof p.accountid === 'number' && Number.isFinite(p.accountid) && p.accountid > 0
    const validHero = typeof p.heroid === 'number' && Number.isFinite(p.heroid) && p.heroid > 0
    const hasName = typeof p.player_name === 'string' && p.player_name.length > 0
    return validAcct || validHero || hasName
  })
  if (cleaned.length === 0) return emptyRoster()

  const players: RosterPlayer[] = cleaned.map((p) => {
    const rawSlot = (p as { playerid?: unknown }).playerid
    const slot = typeof rawSlot === 'number' && Number.isFinite(rawSlot) ? rawSlot : null
    const rawHero = (p as { heroid?: unknown }).heroid
    const heroId =
      typeof rawHero === 'number' && Number.isFinite(rawHero) && rawHero > 0 ? rawHero : null
    const rawSelected = (p as { selected?: unknown }).selected
    const selected =
      source === 'gsi-spectator' && typeof rawSelected === 'boolean' ? rawSelected : null
    return {
      slot,
      accountId: p.accountid && p.accountid > 0 ? p.accountid : null,
      heroId,
      team: null,
      playerName: p.player_name ?? null,
      rank: p.rank ?? null,
      selected,
    }
  })

  // Team is only safely derivable from spectator GSI (slot 0-4 = radiant from team2, 5-9 = dire
  // from team3). Other sources don't preserve team info today.
  if (source === 'gsi-spectator') {
    for (const p of players) {
      if (p.slot !== null) p.team = p.slot < 5 ? 'radiant' : 'dire'
    }
  }

  const completeness: RosterCompleteness = {
    accountIds: coverage(players, (p) => p.accountId !== null),
    heroIds: coverage(players, (p) => p.heroId !== null),
    teamAssignment: coverage(players, (p) => p.team !== null),
    playerNames: coverage(players, (p) => p.playerName !== null),
    ranks: coverage(players, (p) => p.rank !== null),
  }

  // gsi is only consulted if a future resolver needs additional context (currently unused).
  void gsi

  return {
    players,
    source,
    stage: inferStage(source, completeness, heroesStatus),
    completeness,
    heroesStatus,
    hasAllAccountIds: completeness.accountIds === 'all',
    hasAllHeroes: completeness.heroIds === 'all',
  }
}

function inferStage(
  source: RosterSource,
  completeness: RosterCompleteness,
  heroesStatus: HeroesStatus | undefined,
): MatchStage {
  if (source === 'none') return 'unknown'
  if (heroesStatus) return 'roster-draft'
  if (completeness.heroIds === 'all') return 'in-progress'
  return 'hero-draft'
}
