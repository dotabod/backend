import type { Coverage, ResolvedRoster, RosterPlayer } from '../types'

// Coverage is denominated against the canonical 10-slot roster, NOT the array length, so
// 'all' always means "all 10 slots have this dimension." A 1-player gsi-self roster is therefore
// 'partial', not 'all', even though 1/1 of its entries is filled.
const ROSTER_SLOTS = 10

export function coverage(players: RosterPlayer[], pred: (p: RosterPlayer) => boolean): Coverage {
  const matches = players.filter(pred).length
  if (matches === 0) return 'none'
  if (matches >= ROSTER_SLOTS && players.length >= ROSTER_SLOTS) return 'all'
  return 'partial'
}

export function emptyRoster(): ResolvedRoster {
  return {
    players: [],
    source: 'none',
    stage: 'unknown',
    completeness: {
      accountIds: 'none',
      heroIds: 'none',
      teamAssignment: 'none',
      playerNames: 'none',
      ranks: 'none',
    },
    hasAllAccountIds: false,
    hasAllHeroes: false,
  }
}
