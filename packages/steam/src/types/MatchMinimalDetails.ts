export interface MatchPlayer {
  account_id: number
  hero_id: number
  kills: number
  deaths: number
  assists: number
  items: number[]
  player_slot: number
  pro_name: string
  level: number
  team_number: number
}

export interface MatchMinimal {
  match_id: {
    low: number
    high: number
    unsigned: boolean
  }
  start_time: number
  duration: number
  game_mode: number
  match_outcome: number
  players: MatchPlayer[]
  tourney: any
  radiant_score: number
  dire_score: number
  lobby_type: number
}

export interface MatchMinimalDetailsResponse {
  matches: MatchMinimal[]
  last_match: any
}

export enum EMatchOutcome {
  k_EMatchOutcome_Unknown = 0,
  k_EMatchOutcome_RadVictory = 2,
  k_EMatchOutcome_DireVictory = 3,
  k_EMatchOutcome_NeutralVictory = 4,
  k_EMatchOutcome_NoTeamWinner = 5,
  k_EMatchOutcome_Custom1Victory = 6,
  k_EMatchOutcome_Custom2Victory = 7,
  k_EMatchOutcome_Custom3Victory = 8,
  k_EMatchOutcome_Custom4Victory = 9,
  k_EMatchOutcome_Custom5Victory = 10,
  k_EMatchOutcome_Custom6Victory = 11,
  k_EMatchOutcome_Custom7Victory = 12,
  k_EMatchOutcome_Custom8Victory = 13,
  k_EMatchOutcome_NotScored_PoorNetworkConditions = 64,
  k_EMatchOutcome_NotScored_Leaver = 65,
  k_EMatchOutcome_NotScored_ServerCrash = 66,
  k_EMatchOutcome_NotScored_NeverStarted = 67,
  k_EMatchOutcome_NotScored_Canceled = 68,
  k_EMatchOutcome_NotScored_Suspicious = 69,
}

export function eMatchOutcomeFromJSON(object: any): EMatchOutcome {
  switch (object) {
    case 0:
    case 'k_EMatchOutcome_Unknown':
      return EMatchOutcome.k_EMatchOutcome_Unknown
    case 2:
    case 'k_EMatchOutcome_RadVictory':
      return EMatchOutcome.k_EMatchOutcome_RadVictory
    case 3:
    case 'k_EMatchOutcome_DireVictory':
      return EMatchOutcome.k_EMatchOutcome_DireVictory
    case 4:
    case 'k_EMatchOutcome_NeutralVictory':
      return EMatchOutcome.k_EMatchOutcome_NeutralVictory
    case 5:
    case 'k_EMatchOutcome_NoTeamWinner':
      return EMatchOutcome.k_EMatchOutcome_NoTeamWinner
    case 6:
    case 'k_EMatchOutcome_Custom1Victory':
      return EMatchOutcome.k_EMatchOutcome_Custom1Victory
    case 7:
    case 'k_EMatchOutcome_Custom2Victory':
      return EMatchOutcome.k_EMatchOutcome_Custom2Victory
    case 8:
    case 'k_EMatchOutcome_Custom3Victory':
      return EMatchOutcome.k_EMatchOutcome_Custom3Victory
    case 9:
    case 'k_EMatchOutcome_Custom4Victory':
      return EMatchOutcome.k_EMatchOutcome_Custom4Victory
    case 10:
    case 'k_EMatchOutcome_Custom5Victory':
      return EMatchOutcome.k_EMatchOutcome_Custom5Victory
    case 11:
    case 'k_EMatchOutcome_Custom6Victory':
      return EMatchOutcome.k_EMatchOutcome_Custom6Victory
    case 12:
    case 'k_EMatchOutcome_Custom7Victory':
      return EMatchOutcome.k_EMatchOutcome_Custom7Victory
    case 13:
    case 'k_EMatchOutcome_Custom8Victory':
      return EMatchOutcome.k_EMatchOutcome_Custom8Victory
    case 64:
    case 'k_EMatchOutcome_NotScored_PoorNetworkConditions':
      return EMatchOutcome.k_EMatchOutcome_NotScored_PoorNetworkConditions
    case 65:
    case 'k_EMatchOutcome_NotScored_Leaver':
      return EMatchOutcome.k_EMatchOutcome_NotScored_Leaver
    case 66:
    case 'k_EMatchOutcome_NotScored_ServerCrash':
      return EMatchOutcome.k_EMatchOutcome_NotScored_ServerCrash
    case 67:
    case 'k_EMatchOutcome_NotScored_NeverStarted':
      return EMatchOutcome.k_EMatchOutcome_NotScored_NeverStarted
    case 68:
    case 'k_EMatchOutcome_NotScored_Canceled':
      return EMatchOutcome.k_EMatchOutcome_NotScored_Canceled
    case 69:
    case 'k_EMatchOutcome_NotScored_Suspicious':
      return EMatchOutcome.k_EMatchOutcome_NotScored_Suspicious
    default:
      throw new globalThis.Error(`Unrecognized enum value ${object} for enum EMatchOutcome`)
  }
}
