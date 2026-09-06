// Public surface for the match-data API. Consumers should import from this module ONLY:
//
//   import { MatchDataService, type RosterPlayer } from '../../dota/lib/matchData'
//
// The internal/ subfolder is implementation detail. Anything not re-exported here is not part of
// the API contract.

export { getStreamersInMatch } from './get-streamers-in-match'
export { lookupRosterByMatchId } from './lookup-roster-by-match-id'
export { MatchDataService } from './match-data-service'
export type { RosterPlayer, RosterSource } from './types'
