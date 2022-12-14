import { GSIClient } from '../GSIClient.js'

export const gsiClients: GSIClient[] = []

export const playingStates = [
  'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
  'DOTA_GAMERULES_STATE_PRE_GAME',
]

export const pickSates = ['DOTA_GAMERULES_STATE_HERO_SELECTION']

// We handle the case of streamer locking in their hero,
// and this state being true in setupOBSBlockers()
export const stratStates = ['DOTA_GAMERULES_STATE_STRATEGY_TIME']

export const blockTypes = [
  { type: 'picks', states: pickSates },
  { type: 'playing', states: playingStates },
  { type: 'strategy', states: stratStates },
]
