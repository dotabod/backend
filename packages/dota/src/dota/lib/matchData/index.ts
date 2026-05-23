// Public surface for the match-data API. Consumers should import from this module ONLY:
//
//   import { MatchDataService, type RosterPlayer } from '../../dota/lib/matchData'
//
// The internal/ subfolder is implementation detail. Anything not re-exported here is not part of
// the API contract.

export { getStreamersInMatch } from './getStreamersInMatch'
export { MatchDataService } from './MatchDataService'
export type {
  Coverage,
  MatchStage,
  ResolvedRoster,
  RosterCompleteness,
  RosterPlayer,
  RosterSource,
} from './types'
