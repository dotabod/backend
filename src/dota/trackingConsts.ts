import { SocketClient } from '../types'
import { GSIClient } from './lib/dota2-gsi'

export const gsiClients: GSIClient[] = []
export const socketClients: SocketClient[] = []

export const minimapStates = [
  'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
  'DOTA_GAMERULES_STATE_PRE_GAME',
]

export const pickSates = ['DOTA_GAMERULES_STATE_HERO_SELECTION']

export const stratStates = ['DOTA_GAMERULES_STATE_STRATEGY_TIME']

export const blockTypes = [
  { type: 'picks', states: pickSates },
  { type: 'minimap', states: minimapStates },
  // { type: 'strategy', states: stratStates },
]
