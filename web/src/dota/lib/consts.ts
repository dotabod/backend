import { SocketClient } from '../../types.js'

export const gsiClients: SocketClient[] = []

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
  // Removing because this state is checked manually
  // This state actually means all players are locked in and picked
  // It doesn't mean only the streamer is locked in like I thought
  // So since all are locked in, everyone can see heroes, and we should unblock
  // all blockers. Therefore removing this state from the list
  // { type: 'strategy', states: stratStates },
]
