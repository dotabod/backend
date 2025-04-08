import type { SocketClient } from '../../../types.js'

export enum BetType {
  WIN_LOSS = 'win_loss',
  FIRST_TOWER = 'first_tower',
  STREAMER_TP_LOCATION = 'streamer_tp_location',
  DIE_BEFORE_MINUTE = 'die_before_minute',
  ROSH_DEATH_TIME = 'rosh_death_time',
  FIRST_ROSH_TEAM = 'first_rosh_team',
  FIRST_BLOOD = 'first_blood',
  ITEM_TIMING = 'item_timing',
  CS_BY_MINUTE = 'cs_by_minute',
  KDA_BY_MINUTE = 'kda_by_minute',
  BUILDING_DESTROYED_BY_MINUTE = 'building_destroyed_by_minute',
  GAME_DURATION = 'game_duration',
}

// Base class that all bet handlers will extend
export abstract class BaseBetHandler {
  abstract readonly type: BetType

  // Check if this bet can be opened based on current game state
  abstract canOpenBet(client: SocketClient): Promise<boolean>

  // Get the title and options for the bet
  abstract getBetOptions(client: SocketClient): Promise<{
    title: string
    outcomes: string[]
    autoLockAfter: number
  }>

  // Determine the winning outcome index (0 or 1) based on game state
  abstract determineWinner(client: SocketClient): Promise<number | null>

  // Check if bet should be closed based on game state
  abstract shouldCloseBet(client: SocketClient): Promise<boolean>

  // Get explanation for why bet was closed
  abstract getCloseReason(client: SocketClient, winningOutcomeIndex: number | null): Promise<string>
}
