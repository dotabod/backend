import type { HeroesStatus } from '../../../types'

// --- Public types for the match-data API ---
//
// `RosterSource` says WHERE the data came from. `MatchStage` says WHEN in the match lifecycle we
// are. `RosterCompleteness` says WHAT is filled in across the 10 slots, per dimension. A consumer
// can branch deterministically on any of these — that's the "state machine" contract.

export type RosterSource =
  | 'gsi-spectator' // observer/spectator client — GSI has all 10 (team2/team3)
  | 'sourcetv' // delayedGames doc from SourceTV broadcast feed
  | 'vision-heroes' // Vision API returned heroes (any of detect_draft/detect/detect_in_game)
  | 'vision-draft' // Vision API returned only draft names, no heroes yet
  | 'gsi-self' // only the streamer's own hero/account (no other source available)
  | 'none' // no current match

export type MatchStage =
  | 'roster-draft' // CM / player-draft — lobby members known but teams not yet split
  | 'hero-draft' // teams split + heroes being picked
  | 'in-progress' // all heroes locked, game underway
  | 'unknown' // no signal

export type Coverage = 'all' | 'partial' | 'none'

export interface RosterCompleteness {
  accountIds: Coverage
  heroIds: Coverage
  teamAssignment: Coverage
  playerNames: Coverage
  ranks: Coverage
}

export interface RosterPlayer {
  slot: number | null
  accountId: number | null
  heroId: number | null
  team: 'radiant' | 'dire' | null
  playerName: string | null
  rank: number | null
  // True when this is the focused/selected unit in a spectator client — only set for
  // `gsi-spectator` sources (the underlying `getSpectatorPlayers` populates it); null elsewhere.
  selected: boolean | null
}

export interface ResolvedRoster {
  players: RosterPlayer[]
  source: RosterSource
  stage: MatchStage
  completeness: RosterCompleteness
  heroesStatus?: HeroesStatus
  // Convenience flags — sugar over `completeness` so callers don't dot-walk.
  hasAllAccountIds: boolean
  hasAllHeroes: boolean
}
