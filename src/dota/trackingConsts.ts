import { Dota2 } from 'dotagsi'
import EventEmitter from 'events'
import { GSIClient } from './lib/dota2-gsi'

export const gsiClients: GSIClient[] = []
export const socketClients: {
  gsi?: GSIClient
  name: string
  token: string
  sockets: string[]
}[] = []

export const minimapStates = [
  'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
  'DOTA_GAMERULES_STATE_PRE_GAME',
]

export const pickSates = [
  'DOTA_GAMERULES_STATE_HERO_SELECTION',
  'DOTA_GAMERULES_STATE_STRATEGY_TIME',
]
