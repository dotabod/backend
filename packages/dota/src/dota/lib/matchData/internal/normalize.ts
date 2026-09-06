import type { HeroesStatus, Packet, Players } from '../../../../types'
import type {
  MatchStage,
  ResolvedRoster,
  RosterCompleteness,
  RosterPlayer,
  RosterSource,
} from '../types'
import { coverage, emptyRoster } from './coverage'

const inferStage = function inferStage(
  source: RosterSource,
  completeness: RosterCompleteness,
  heroesStatus: HeroesStatus | undefined
): MatchStage {
  if (source === 'none') {
    return 'unknown'
  }
  if (heroesStatus) {
    return 'roster-draft'
  }
  if (completeness.heroIds === 'all') {
    return 'in-progress'
  }
  return 'hero-draft'
}

// Pure transform: takes a resolver's typed output and produces the public `ResolvedRoster`.
// All the messy normalization rules (`accountid:0` sentinel collapse, NaN slot/hero rejection,
// ghost-row filter, spectator team derivation, completeness math, stage inference) live HERE in
// one place — every resolver gets identical downstream treatment.
export const normalize = function normalize({
  source,
  matchPlayers,
  heroesStatus,
  gsi,
}: {
  source: RosterSource
  matchPlayers: Players
  heroesStatus?: HeroesStatus
  gsi?: Packet
}): ResolvedRoster {
  // Drop ghost entries (no accountid, no heroid, no name — pure stubs).
  const cleaned = matchPlayers.filter((p) => {
    const validAcct = Number.isFinite(p.accountid) && p.accountid > 0
    const validHero = p.heroid !== undefined && Number.isFinite(p.heroid) && p.heroid > 0
    const hasName = p.player_name !== undefined && p.player_name.length > 0
    return validAcct || validHero || hasName
  })
  if (cleaned.length === 0) {
    return emptyRoster()
  }

  const players: RosterPlayer[] = cleaned.map((p) => {
    const slot = p.playerid !== null && Number.isFinite(p.playerid) ? p.playerid : null
    const heroId =
      p.heroid !== undefined && Number.isFinite(p.heroid) && p.heroid > 0 ? p.heroid : null
    const selected = source === 'gsi-spectator' ? (p.selected ?? null) : null
    return {
      accountId: p.accountid && p.accountid > 0 ? p.accountid : null,
      heroId,
      playerName: p.player_name ?? null,
      rank: p.rank ?? null,
      selected,
      slot,
      team: null,
    }
  })

  // Team is only safely derivable from spectator GSI (slot 0-4 = radiant from team2, 5-9 = dire
  // from team3). Other sources don't preserve team info today.
  if (source === 'gsi-spectator') {
    for (const p of players) {
      if (p.slot !== null) {
        p.team = p.slot < 5 ? 'radiant' : 'dire'
      }
    }
  }

  const completeness: RosterCompleteness = {
    accountIds: coverage(players, (p) => p.accountId !== null),
    heroIds: coverage(players, (p) => p.heroId !== null),
    playerNames: coverage(players, (p) => p.playerName !== null),
    ranks: coverage(players, (p) => p.rank !== null),
    teamAssignment: coverage(players, (p) => p.team !== null),
  }

  // gsi is only consulted if a future resolver needs additional context (currently unused).
  void gsi

  return {
    completeness,
    hasAllAccountIds: completeness.accountIds === 'all',
    hasAllHeroes: completeness.heroIds === 'all',
    heroesStatus,
    players,
    source,
    stage: inferStage(source, completeness, heroesStatus),
  }
}
